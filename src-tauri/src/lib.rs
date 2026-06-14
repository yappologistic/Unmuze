use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
struct DownloadRegistry(Mutex<HashMap<String, Arc<Mutex<Child>>>>);

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum Platform {
    YouTube,
    SoundCloud,
    Spotify,
    Unsupported,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InspectRequest {
    url: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadRequest {
    id: String,
    url: String,
    mode: String,
    quality: String,
    output_dir: String,
    file_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    theme: String,
    default_output_folder: String,
    default_format: String,
    default_quality: String,
    keep_history: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HistoryItem {
    id: String,
    title: String,
    platform: Platform,
    path: String,
    mode: String,
    completed_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Inspection {
    platform: Platform,
    downloadable: bool,
    title: Option<String>,
    creator: Option<String>,
    duration: Option<u64>,
    thumbnail: Option<String>,
    formats: Vec<String>,
    limitation: Option<String>,
    suggested_file_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandError {
    message: String,
    suggestion: String,
}

type AppResult<T> = Result<T, CommandError>;

fn app_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| user_error("Local storage is unavailable.", "Check app permissions and try again."))?;
    fs::create_dir_all(&dir).map_err(|_| {
        user_error(
            "The app could not create its local settings folder.",
            "Choose a writable user profile location and restart the app.",
        )
    })?;
    Ok(dir)
}

fn user_error(message: &str, suggestion: &str) -> CommandError {
    CommandError {
        message: message.to_string(),
        suggestion: suggestion.to_string(),
    }
}

fn detect_platform(url: &str) -> Platform {
    let lower = url.trim().to_ascii_lowercase();
    let host = lower
        .split("://")
        .nth(1)
        .and_then(|rest| rest.split('/').next())
        .unwrap_or("")
        .strip_prefix("www.")
        .unwrap_or_else(|| {
            lower
                .split("://")
                .nth(1)
                .and_then(|rest| rest.split('/').next())
                .unwrap_or("")
        });
    if host == "youtube.com" || host.ends_with(".youtube.com") || host == "youtu.be" {
        Platform::YouTube
    } else if host == "soundcloud.com" || host.ends_with(".soundcloud.com") {
        Platform::SoundCloud
    } else if host == "spotify.com" || host.ends_with(".spotify.com") {
        Platform::Spotify
    } else {
        Platform::Unsupported
    }
}

fn validate_public_url(url: &str) -> AppResult<()> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(user_error(
            "Enter a complete media URL.",
            "Paste a URL that starts with https:// or http://.",
        ));
    }
    Ok(())
}

fn sanitize_filename(input: &str) -> String {
    let invalid = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let mut cleaned: String = input
        .chars()
        .map(|c| {
            if invalid.contains(&c) || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect();
    cleaned = cleaned.trim_matches([' ', '.']).trim().to_string();
    if cleaned.is_empty() {
        cleaned = "download".to_string();
    }
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
        "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8",
        "LPT9",
    ];
    if reserved.iter().any(|name| cleaned.eq_ignore_ascii_case(name)) {
        cleaned.push_str("_file");
    }
    cleaned.chars().take(120).collect()
}

fn safe_output_path(output_dir: &str, file_name: &str) -> AppResult<PathBuf> {
    let dir = PathBuf::from(output_dir);
    if !dir.is_dir() {
        return Err(user_error(
            "The selected output folder is not available.",
            "Choose an existing folder you can write to.",
        ));
    }
    let safe_name = sanitize_filename(file_name);
    let path = dir.join(safe_name);
    let canonical_dir = fs::canonicalize(&dir).map_err(|_| {
        user_error(
            "The output folder could not be checked.",
            "Choose a different folder and try again.",
        )
    })?;
    let parent = path.parent().unwrap_or(Path::new(""));
    let canonical_parent = fs::canonicalize(parent).unwrap_or(canonical_dir.clone());
    if canonical_parent != canonical_dir {
        return Err(user_error(
            "The file name would save outside the selected folder.",
            "Use a simple file name without path separators.",
        ));
    }
    Ok(path)
}

fn default_settings() -> Settings {
    let default_output_folder = dirs::download_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
        .to_string_lossy()
        .to_string();
    Settings {
        theme: "system".to_string(),
        default_output_folder,
        default_format: "audio".to_string(),
        default_quality: "best".to_string(),
        keep_history: true,
    }
}

#[tauri::command]
fn load_settings(app: AppHandle) -> AppResult<Settings> {
    let path = app_dir(&app)?.join("settings.json");
    if !path.exists() {
        return Ok(default_settings());
    }
    let data = fs::read_to_string(path).map_err(|_| {
        user_error(
            "Settings could not be read.",
            "The app will continue with safe defaults.",
        )
    })?;
    Ok(serde_json::from_str(&data).unwrap_or_else(|_| default_settings()))
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> AppResult<Settings> {
    let path = app_dir(&app)?.join("settings.json");
    let data = serde_json::to_string_pretty(&settings).map_err(|_| {
        user_error(
            "Settings could not be saved.",
            "Check that your app data folder is writable.",
        )
    })?;
    fs::write(path, data).map_err(|_| {
        user_error(
            "Settings could not be saved.",
            "Check that your app data folder is writable.",
        )
    })?;
    Ok(settings)
}

#[tauri::command]
fn load_history(app: AppHandle) -> AppResult<Vec<HistoryItem>> {
    let path = app_dir(&app)?.join("history.json");
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = fs::read_to_string(path).map_err(|_| {
        user_error(
            "Download history could not be read.",
            "You can clear history from Settings if it looks incorrect.",
        )
    })?;
    Ok(serde_json::from_str(&data).unwrap_or_default())
}

#[tauri::command]
fn save_history(app: AppHandle, history: Vec<HistoryItem>) -> AppResult<Vec<HistoryItem>> {
    let path = app_dir(&app)?.join("history.json");
    let data = serde_json::to_string_pretty(&history).map_err(|_| {
        user_error(
            "Download history could not be saved.",
            "Check that your app data folder is writable.",
        )
    })?;
    fs::write(path, data).map_err(|_| {
        user_error(
            "Download history could not be saved.",
            "Check that your app data folder is writable.",
        )
    })?;
    Ok(history)
}

#[tauri::command]
fn inspect_media(request: InspectRequest) -> AppResult<Inspection> {
    validate_public_url(&request.url)?;
    let platform = detect_platform(&request.url);
    match platform {
        Platform::Spotify => Ok(Inspection {
            platform,
            downloadable: false,
            title: None,
            creator: None,
            duration: None,
            thumbnail: None,
            formats: vec![],
            limitation: Some("This Spotify URL cannot be downloaded because Spotify does not expose downloadable audio files for tracks, albums, or playlists without protected access.".to_string()),
            suggested_file_name: None,
        }),
        Platform::Unsupported => Ok(Inspection {
            platform,
            downloadable: false,
            title: None,
            creator: None,
            duration: None,
            thumbnail: None,
            formats: vec![],
            limitation: Some("This app currently supports permitted public YouTube and SoundCloud URLs only.".to_string()),
            suggested_file_name: None,
        }),
        Platform::YouTube | Platform::SoundCloud => inspect_with_ytdlp(&request.url, platform),
    }
}

fn inspect_with_ytdlp(url: &str, platform: Platform) -> AppResult<Inspection> {
    let output = Command::new("yt-dlp")
        .args(["--dump-single-json", "--skip-download", "--no-warnings", "--no-playlist", url])
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|_| {
            user_error(
                "yt-dlp is missing or unavailable.",
                "Install yt-dlp and make sure it is on your PATH, then try again.",
            )
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
        let message = if stderr.contains("login") || stderr.contains("private") || stderr.contains("forbidden") {
            "This URL requires login or protected access, so it cannot be downloaded by this app."
        } else {
            "The media could not be inspected."
        };
        return Err(user_error(
            message,
            "Check that the URL is public, permitted for download, and technically available.",
        ));
    }
    let json: serde_json::Value = serde_json::from_slice(&output.stdout).map_err(|_| {
        user_error(
            "The media metadata could not be understood.",
            "Update yt-dlp and try again.",
        )
    })?;
    let title = json.get("title").and_then(|v| v.as_str()).map(str::to_string);
    let creator = json
        .get("uploader")
        .or_else(|| json.get("artist"))
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let duration = json.get("duration").and_then(|v| v.as_u64());
    let thumbnail = json.get("thumbnail").and_then(|v| v.as_str()).map(str::to_string);
    let suggested = title
        .as_ref()
        .map(|value| sanitize_filename(value))
        .or_else(|| Some("download".to_string()));
    let formats = if matches!(platform, Platform::SoundCloud) {
        vec!["audio".to_string()]
    } else {
        vec!["audio".to_string(), "video".to_string()]
    };
    Ok(Inspection {
        platform,
        downloadable: true,
        title,
        creator,
        duration,
        thumbnail,
        formats,
        limitation: None,
        suggested_file_name: suggested,
    })
}

#[tauri::command]
fn start_download(
    app: AppHandle,
    request: DownloadRequest,
    registry: State<DownloadRegistry>,
) -> AppResult<String> {
    validate_public_url(&request.url)?;
    let platform = detect_platform(&request.url);
    if !matches!(platform, Platform::YouTube | Platform::SoundCloud) {
        return Err(user_error(
            "This URL cannot be downloaded by this app.",
            "Use a permitted public YouTube or SoundCloud URL.",
        ));
    }
    let mut output_path = safe_output_path(&request.output_dir, &request.file_name)?;
    if output_path.extension().is_none() {
        output_path.set_extension(if request.mode == "audio" { "mp3" } else { "mp4" });
    }
    let template = output_path.to_string_lossy().to_string();
    let mut args = vec![
        "--newline".to_string(),
        "--no-playlist".to_string(),
        "-o".to_string(),
        template.clone(),
    ];
    if request.mode == "audio" {
        args.extend([
            "-f".to_string(),
            "bestaudio/best".to_string(),
            "-x".to_string(),
            "--audio-format".to_string(),
            "mp3".to_string(),
            "--audio-quality".to_string(),
            "0".to_string(),
        ]);
    } else {
        let selector = if request.quality == "best" {
            "bv*+ba/b"
        } else {
            "bv*[height<=720]+ba/b[height<=720]"
        };
        args.extend(["-f".to_string(), selector.to_string(), "--merge-output-format".to_string(), "mp4".to_string()]);
    }
    args.push(request.url.clone());
    let mut child = Command::new("yt-dlp")
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| {
            user_error(
                "yt-dlp is missing or unavailable.",
                "Install yt-dlp and FFmpeg, then make sure both are on your PATH.",
            )
        })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let child_ref = Arc::new(Mutex::new(child));
    registry
        .0
        .lock()
        .map_err(|_| user_error("Download manager is unavailable.", "Restart the app and try again."))?
        .insert(request.id.clone(), Arc::clone(&child_ref));

    let id = request.id.clone();
    let event_app = app.clone();
    thread::spawn(move || {
        if let Some(out) = stdout {
            let reader = BufReader::new(out);
            for line in reader.lines().map_while(Result::ok) {
                let _ = event_app.emit(
                    "download-progress",
                    serde_json::json!({ "id": id, "line": line }),
                );
            }
        }
    });

    let id = request.id.clone();
    let wait_app = app.clone();
    let registry_id = request.id.clone();
    thread::spawn(move || {
        if let Some(err) = stderr {
            let reader = BufReader::new(err);
            for line in reader.lines().map_while(Result::ok) {
                let _ = wait_app.emit(
                    "download-progress",
                    serde_json::json!({ "id": id, "line": line }),
                );
            }
        }
        let status = child_ref.lock().ok().and_then(|mut child| child.wait().ok());
        let completed = status.map(|s| s.success()).unwrap_or(false);
        let _ = wait_app.emit(
            "download-finished",
            serde_json::json!({
                "id": id,
                "status": if completed { "completed" } else { "failed" },
                "path": template
            }),
        );
        if let Some(state) = wait_app.try_state::<DownloadRegistry>() {
            let _ = state.0.lock().map(|mut map| map.remove(&registry_id));
        }
    });
    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
fn cancel_download(id: String, registry: State<DownloadRegistry>) -> AppResult<()> {
    let child = registry
        .0
        .lock()
        .map_err(|_| user_error("Download manager is unavailable.", "Restart the app and try again."))?
        .remove(&id);
    if let Some(child) = child {
        let _ = child.lock().map(|mut process| process.kill());
    }
    Ok(())
}

#[tauri::command]
fn reveal_path(path: String) -> AppResult<()> {
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|_| {
        user_error(
            "The file or folder could not be opened.",
            "Check that it still exists on disk.",
        )
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(DownloadRegistry::default())
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            load_history,
            save_history,
            inspect_media,
            start_download,
            cancel_download,
            reveal_path
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{detect_platform, Platform};

    #[test]
    fn detects_soundcloud_hosts_for_ytdlp_path() {
        assert_eq!(
            detect_platform("https://soundcloud.com/artist/track"),
            Platform::SoundCloud
        );
        assert_eq!(
            detect_platform("https://m.soundcloud.com/artist/track"),
            Platform::SoundCloud
        );
        assert_eq!(
            detect_platform("https://on.soundcloud.com/abc123"),
            Platform::SoundCloud
        );
    }
}
