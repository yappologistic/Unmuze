use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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

const YT_DLP_VERSION: &str = "2026.06.09";
const FFMPEG_VERSION: &str = "n8.0.1-1";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
struct PlaylistEntry {
    id: String,
    url: String,
    title: String,
    creator: Option<String>,
    duration: Option<u64>,
    thumbnail: Option<String>,
    index: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistInspection {
    platform: Platform,
    downloadable: bool,
    title: Option<String>,
    creator: Option<String>,
    entries: Vec<PlaylistEntry>,
    limitation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ToolDetail {
    name: String,
    required_version: String,
    managed_installed: bool,
    managed_version: Option<String>,
    managed_path: Option<String>,
    system_installed: bool,
    system_version: Option<String>,
    active_source: String,
    ready: bool,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolStatus {
    yt_dlp: ToolDetail,
    ffmpeg: ToolDetail,
    ready: bool,
}

#[derive(Debug, Clone, Copy)]
struct ToolAsset {
    tool: &'static str,
    version: &'static str,
    file_name: &'static str,
    url: &'static str,
    sha256: &'static str,
    executable_name: &'static str,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandError {
    message: String,
    suggestion: String,
}

type AppResult<T> = Result<T, CommandError>;

fn app_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_data_dir().map_err(|_| {
        user_error(
            "Local storage is unavailable.",
            "Check app permissions and try again.",
        )
    })?;
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

fn executable_suffix() -> &'static str {
    if cfg!(windows) {
        ".exe"
    } else {
        ""
    }
}

fn tool_command(command: &str) -> Command {
    let mut command = Command::new(command);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn tool_asset(tool: &str) -> AppResult<ToolAsset> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    match (tool, os, arch) {
        ("yt-dlp", "windows", "x86_64") => Ok(ToolAsset {
            tool: "yt-dlp",
            version: YT_DLP_VERSION,
            file_name: "yt-dlp.exe",
            url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.06.09/yt-dlp.exe",
            sha256: "3a48cb955d55c8821b60ccbdbbc6f61bc958f2f3d3b7ad5eaf3d83a543293a27",
            executable_name: "yt-dlp.exe",
        }),
        ("yt-dlp", "windows", "aarch64") => Ok(ToolAsset {
            tool: "yt-dlp",
            version: YT_DLP_VERSION,
            file_name: "yt-dlp_arm64.exe",
            url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.06.09/yt-dlp_arm64.exe",
            sha256: "847583f91bb6d26479c1dc9643c2f4b8857a90b40d619da97b0cfabccb9138d0",
            executable_name: "yt-dlp.exe",
        }),
        ("yt-dlp", "macos", _) => Ok(ToolAsset {
            tool: "yt-dlp",
            version: YT_DLP_VERSION,
            file_name: "yt-dlp_macos",
            url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.06.09/yt-dlp_macos",
            sha256: "b82c3626952e6c14eaf654cc565866775ffd0b9ffb7021628ac59b42c2f4f244",
            executable_name: "yt-dlp",
        }),
        ("yt-dlp", "linux", "x86_64") => Ok(ToolAsset {
            tool: "yt-dlp",
            version: YT_DLP_VERSION,
            file_name: "yt-dlp_linux",
            url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.06.09/yt-dlp_linux",
            sha256: "bf8aac79b72287a6d2043074415132558b43743a8f9461a22b0141e90f16ce66",
            executable_name: "yt-dlp",
        }),
        ("yt-dlp", "linux", "aarch64") => Ok(ToolAsset {
            tool: "yt-dlp",
            version: YT_DLP_VERSION,
            file_name: "yt-dlp_linux_aarch64",
            url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.06.09/yt-dlp_linux_aarch64",
            sha256: "cabd246445bdfde0eda0dfe68bbe90354be83f3fdbbf077df11a2ea55f41cdbd",
            executable_name: "yt-dlp",
        }),
        ("ffmpeg", "windows", "x86_64") => Ok(ToolAsset {
            tool: "ffmpeg",
            version: FFMPEG_VERSION,
            file_name: "ffmpeg-win-x64.exe",
            url: "https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/n8.0.1-1/ffmpeg-win-x64.exe",
            sha256: "73d555001653d97d3bb328e68e3eb36cf0dca395babd3714d4e51c42da9b16ba",
            executable_name: "ffmpeg.exe",
        }),
        ("ffmpeg", "macos", "aarch64") => Ok(ToolAsset {
            tool: "ffmpeg",
            version: FFMPEG_VERSION,
            file_name: "ffmpeg-osx-arm64",
            url: "https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/n8.0.1-1/ffmpeg-osx-arm64",
            sha256: "c334b7f418e10201dc6c8e42407f5198c3270524cc77d40606e746be3c49159a",
            executable_name: "ffmpeg",
        }),
        ("ffmpeg", "macos", "x86_64") => Ok(ToolAsset {
            tool: "ffmpeg",
            version: FFMPEG_VERSION,
            file_name: "ffmpeg-osx-x64",
            url: "https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/n8.0.1-1/ffmpeg-osx-x64",
            sha256: "5b12ece6e1cdecff3a2af544dc85f6c91c0085b1098adc34fd3f09560b7b3c62",
            executable_name: "ffmpeg",
        }),
        ("ffmpeg", "linux", "x86_64") => Ok(ToolAsset {
            tool: "ffmpeg",
            version: FFMPEG_VERSION,
            file_name: "ffmpeg-linux-x64",
            url: "https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/n8.0.1-1/ffmpeg-linux-x64",
            sha256: "b66cc32cd45584ff5f65b8957be4fa93b43d002c502808248f6de3fc5cbc1c31",
            executable_name: "ffmpeg",
        }),
        ("ffmpeg", "linux", "aarch64") => Ok(ToolAsset {
            tool: "ffmpeg",
            version: FFMPEG_VERSION,
            file_name: "ffmpeg-linux-arm64",
            url: "https://github.com/shaka-project/static-ffmpeg-binaries/releases/download/n8.0.1-1/ffmpeg-linux-arm64",
            sha256: "ff183f17f37a6a704ec0a4f5dbdc42519a1564366470ddd7e4d0474d07c8a3c8",
            executable_name: "ffmpeg",
        }),
        _ => Err(user_error(
            "Managed media tools are not available for this platform.",
            "Install yt-dlp and FFmpeg manually, then make sure they are on your PATH.",
        )),
    }
}

fn tool_dir(app: &AppHandle, asset: &ToolAsset) -> AppResult<PathBuf> {
    Ok(app_dir(app)?
        .join("tools")
        .join(asset.tool)
        .join(asset.version))
}

fn managed_tool_path(app: &AppHandle, tool: &str) -> AppResult<Option<PathBuf>> {
    let asset = tool_asset(tool)?;
    let path = tool_dir(app, &asset)?.join(asset.executable_name);
    Ok(path.exists().then_some(path))
}

fn active_tool_path(app: &AppHandle, tool: &str) -> String {
    managed_tool_path(app, tool)
        .ok()
        .flatten()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("{tool}{}", executable_suffix()))
}

fn ffmpeg_location_arg(app: &AppHandle) -> Option<String> {
    managed_tool_path(app, "ffmpeg")
        .ok()
        .flatten()
        .and_then(|path| {
            path.parent()
                .map(|parent| parent.to_string_lossy().to_string())
        })
}

fn command_version(command: &str) -> Option<String> {
    tool_command(command)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .to_string()
        })
        .filter(|line| !line.is_empty())
}

fn tool_detail(app: &AppHandle, tool: &str, label: &str) -> AppResult<ToolDetail> {
    let asset = tool_asset(tool)?;
    let managed_path = managed_tool_path(app, tool)?;
    let managed_version = managed_path
        .as_ref()
        .and_then(|path| command_version(&path.to_string_lossy()));
    let system_command = format!("{tool}{}", executable_suffix());
    let system_version = command_version(&system_command);
    let managed_installed = managed_path.is_some();
    let system_installed = system_version.is_some();
    let ready = managed_installed || system_installed;
    let active_source = if managed_installed {
        "managed"
    } else if system_installed {
        "system"
    } else {
        "missing"
    };
    let message = match active_source {
        "managed" => format!("Using managed {label} {}.", asset.version),
        "system" => format!("Using {label} from your system PATH."),
        _ => format!("{label} is missing. Install managed tools from Settings."),
    };
    Ok(ToolDetail {
        name: label.to_string(),
        required_version: asset.version.to_string(),
        managed_installed,
        managed_version,
        managed_path: managed_path.map(|path| path.to_string_lossy().to_string()),
        system_installed,
        system_version,
        active_source: active_source.to_string(),
        ready,
        message,
    })
}

fn tool_status_for_app(app: &AppHandle) -> AppResult<ToolStatus> {
    let yt_dlp = tool_detail(app, "yt-dlp", "yt-dlp")?;
    let ffmpeg = tool_detail(app, "ffmpeg", "FFmpeg")?;
    Ok(ToolStatus {
        ready: yt_dlp.ready && ffmpeg.ready,
        yt_dlp,
        ffmpeg,
    })
}

fn set_executable_permissions(path: &Path) -> AppResult<()> {
    #[cfg(not(unix))]
    let _ = path;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(path)
            .map_err(|_| {
                user_error(
                    "Managed tool permissions could not be read.",
                    "Try installing the tools again.",
                )
            })?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).map_err(|_| {
            user_error(
                "Managed tool permissions could not be updated.",
                "Check app data folder permissions and try again.",
            )
        })?;
    }
    Ok(())
}

fn install_asset(app: &AppHandle, asset: ToolAsset) -> AppResult<()> {
    let dir = tool_dir(app, &asset)?;
    fs::create_dir_all(&dir).map_err(|_| {
        user_error(
            "Managed tools could not be installed.",
            "Check app data folder permissions and try again.",
        )
    })?;
    let response = reqwest::blocking::get(asset.url).map_err(|_| {
        user_error(
            "The managed tool could not be downloaded.",
            "Check your internet connection and try again.",
        )
    })?;
    if !response.status().is_success() {
        return Err(user_error(
            "The managed tool download was unavailable.",
            "Try again later or install the tools manually.",
        ));
    }
    let bytes = response.bytes().map_err(|_| {
        user_error(
            "The managed tool download could not be read.",
            "Try again later.",
        )
    })?;
    let digest = hex::encode(Sha256::digest(&bytes));
    if digest != asset.sha256 {
        return Err(user_error(
            "The managed tool failed verification.",
            "The downloaded file did not match the pinned checksum, so it was not installed.",
        ));
    }
    let downloaded_path = dir.join(asset.file_name);
    fs::write(&downloaded_path, &bytes).map_err(|_| {
        user_error(
            "The managed tool could not be saved.",
            "Check app data folder permissions and try again.",
        )
    })?;
    let executable_path = dir.join(asset.executable_name);
    if downloaded_path != executable_path {
        fs::copy(&downloaded_path, &executable_path).map_err(|_| {
            user_error(
                "The managed tool could not be prepared.",
                "Check app data folder permissions and try again.",
            )
        })?;
    }
    set_executable_permissions(&executable_path)?;
    Ok(())
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
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if reserved
        .iter()
        .any(|name| cleaned.eq_ignore_ascii_case(name))
    {
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
fn get_tool_status(app: AppHandle) -> AppResult<ToolStatus> {
    tool_status_for_app(&app)
}

#[tauri::command]
fn install_managed_tools(app: AppHandle) -> AppResult<ToolStatus> {
    install_asset(&app, tool_asset("yt-dlp")?)?;
    install_asset(&app, tool_asset("ffmpeg")?)?;
    tool_status_for_app(&app)
}

#[tauri::command]
fn inspect_media(app: AppHandle, request: InspectRequest) -> AppResult<Inspection> {
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
        Platform::YouTube | Platform::SoundCloud => inspect_with_ytdlp(&app, &request.url, platform),
    }
}

#[tauri::command]
fn inspect_playlist(app: AppHandle, request: InspectRequest) -> AppResult<PlaylistInspection> {
    validate_public_url(&request.url)?;
    let platform = detect_platform(&request.url);
    match platform {
        Platform::Spotify => Ok(PlaylistInspection {
            platform,
            downloadable: false,
            title: None,
            creator: None,
            entries: vec![],
            limitation: Some("Spotify playlists cannot be downloaded because Spotify does not expose downloadable audio files without protected access.".to_string()),
        }),
        Platform::Unsupported => Ok(PlaylistInspection {
            platform,
            downloadable: false,
            title: None,
            creator: None,
            entries: vec![],
            limitation: Some("Playlist mode currently supports permitted public YouTube and SoundCloud playlists only.".to_string()),
        }),
        Platform::YouTube | Platform::SoundCloud => inspect_playlist_with_ytdlp(&app, &request.url, platform),
    }
}

fn inspect_playlist_with_ytdlp(
    app: &AppHandle,
    url: &str,
    platform: Platform,
) -> AppResult<PlaylistInspection> {
    let ytdlp = active_tool_path(app, "yt-dlp");
    let mut command = tool_command(&ytdlp);
    command.args([
        "--dump-single-json",
        "--flat-playlist",
        "--skip-download",
        "--no-warnings",
        url,
    ]);
    if let Some(ffmpeg_location) = ffmpeg_location_arg(app) {
        command.args(["--ffmpeg-location", &ffmpeg_location]);
    }
    let output = command
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|_| {
            user_error(
                "yt-dlp is missing or unavailable.",
                "Install managed tools from Settings, or install yt-dlp manually and make sure it is on your PATH.",
            )
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
        let message = if stderr.contains("login")
            || stderr.contains("private")
            || stderr.contains("forbidden")
        {
            "This playlist requires login or protected access, so it cannot be downloaded by this app."
        } else {
            "The playlist could not be inspected."
        };
        return Err(user_error(
            message,
            "Check that the playlist is public, permitted for download, and technically available.",
        ));
    }
    let json: serde_json::Value = serde_json::from_slice(&output.stdout).map_err(|_| {
        user_error(
            "The playlist metadata could not be understood.",
            "Update yt-dlp and try again.",
        )
    })?;
    let entries = json
        .get("entries")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .enumerate()
                .filter_map(|(position, entry)| {
                    playlist_entry_from_json(entry, &platform, position + 1)
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if entries.is_empty() {
        return Ok(PlaylistInspection {
            platform,
            downloadable: false,
            title: json
                .get("title")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            creator: json
                .get("uploader")
                .or_else(|| json.get("channel"))
                .and_then(|v| v.as_str())
                .map(str::to_string),
            entries,
            limitation: Some(
                "No downloadable public items were found in this playlist.".to_string(),
            ),
        });
    }
    Ok(PlaylistInspection {
        platform,
        downloadable: true,
        title: json
            .get("title")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        creator: json
            .get("uploader")
            .or_else(|| json.get("channel"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        entries,
        limitation: None,
    })
}

fn playlist_entry_from_json(
    entry: &serde_json::Value,
    platform: &Platform,
    index: usize,
) -> Option<PlaylistEntry> {
    let id = entry
        .get("id")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| index.to_string());
    let url = entry
        .get("webpage_url")
        .or_else(|| entry.get("url"))
        .or_else(|| entry.get("permalink_url"))
        .and_then(|value| value.as_str())
        .and_then(|value| {
            if value.starts_with("http://") || value.starts_with("https://") {
                Some(value.to_string())
            } else if matches!(platform, Platform::YouTube) {
                Some(format!("https://www.youtube.com/watch?v={value}"))
            } else {
                None
            }
        })?;
    let title = entry
        .get("title")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| format!("Playlist item {index}"));
    let thumbnail = entry
        .get("thumbnail")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .or_else(|| {
            entry
                .get("thumbnails")
                .and_then(|value| value.as_array())
                .and_then(|items| items.last())
                .and_then(|item| item.get("url"))
                .and_then(|value| value.as_str())
                .map(str::to_string)
        });
    Some(PlaylistEntry {
        id,
        url,
        title,
        creator: entry
            .get("uploader")
            .or_else(|| entry.get("channel"))
            .or_else(|| entry.get("artist"))
            .and_then(|value| value.as_str())
            .map(str::to_string),
        duration: entry.get("duration").and_then(|value| value.as_u64()),
        thumbnail,
        index,
    })
}

fn inspect_with_ytdlp(app: &AppHandle, url: &str, platform: Platform) -> AppResult<Inspection> {
    let ytdlp = active_tool_path(app, "yt-dlp");
    let mut command = tool_command(&ytdlp);
    command.args([
        "--dump-single-json",
        "--skip-download",
        "--no-warnings",
        "--no-playlist",
        url,
    ]);
    if let Some(ffmpeg_location) = ffmpeg_location_arg(app) {
        command.args(["--ffmpeg-location", &ffmpeg_location]);
    }
    let output = command
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|_| {
            user_error(
                "yt-dlp is missing or unavailable.",
                "Install managed tools from Settings, or install yt-dlp manually and make sure it is on your PATH.",
            )
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
        let message = if stderr.contains("login")
            || stderr.contains("private")
            || stderr.contains("forbidden")
        {
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
    let title = json
        .get("title")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let creator = json
        .get("uploader")
        .or_else(|| json.get("artist"))
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let duration = json.get("duration").and_then(|v| v.as_u64());
    let thumbnail = json
        .get("thumbnail")
        .and_then(|v| v.as_str())
        .map(str::to_string);
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
        output_path.set_extension(if request.mode == "audio" {
            "mp3"
        } else {
            "mp4"
        });
    }
    let template = output_path.to_string_lossy().to_string();
    let mut args = vec![
        "--newline".to_string(),
        "--no-playlist".to_string(),
        "-o".to_string(),
        template.clone(),
    ];
    if let Some(ffmpeg_location) = ffmpeg_location_arg(&app) {
        args.extend(["--ffmpeg-location".to_string(), ffmpeg_location]);
    }
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
        args.extend([
            "-f".to_string(),
            selector.to_string(),
            "--merge-output-format".to_string(),
            "mp4".to_string(),
        ]);
    }
    args.push(request.url.clone());
    let ytdlp = active_tool_path(&app, "yt-dlp");
    let mut child = tool_command(&ytdlp)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| {
            user_error(
                "yt-dlp is missing or unavailable.",
                "Install managed tools from Settings, or install yt-dlp and FFmpeg manually.",
            )
        })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let child_ref = Arc::new(Mutex::new(child));
    registry
        .0
        .lock()
        .map_err(|_| {
            user_error(
                "Download manager is unavailable.",
                "Restart the app and try again.",
            )
        })?
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
        let status = child_ref
            .lock()
            .ok()
            .and_then(|mut child| child.wait().ok());
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
        .map_err(|_| {
            user_error(
                "Download manager is unavailable.",
                "Restart the app and try again.",
            )
        })?
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
            get_tool_status,
            install_managed_tools,
            inspect_media,
            inspect_playlist,
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
    use super::{detect_platform, tool_asset, Platform, FFMPEG_VERSION, YT_DLP_VERSION};

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

    #[test]
    fn selects_pinned_tool_assets_for_current_platform() {
        let ytdlp = tool_asset("yt-dlp").expect("yt-dlp asset");
        let ffmpeg = tool_asset("ffmpeg").expect("ffmpeg asset");
        assert_eq!(ytdlp.version, YT_DLP_VERSION);
        assert_eq!(ffmpeg.version, FFMPEG_VERSION);
        assert_eq!(ytdlp.sha256.len(), 64);
        assert_eq!(ffmpeg.sha256.len(), 64);
        assert!(ytdlp.url.starts_with("https://github.com/"));
        assert!(ffmpeg.url.starts_with("https://github.com/"));
    }
}
