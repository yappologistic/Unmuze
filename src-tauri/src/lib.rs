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
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use url::Url;

const YT_DLP_VERSION: &str = "2026.06.09";
const FFMPEG_VERSION: &str = "n8.0.1-1";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
struct DownloadRegistry(Mutex<HashMap<String, Arc<Mutex<DownloadProcess>>>>);

struct DownloadProcess {
    child: Child,
    cancelled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum Platform {
    YouTube,
    SoundCloud,
    TikTok,
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
    #[serde(default)]
    playlist_folder_name: Option<String>,
    #[serde(default)]
    selected_format_id: Option<String>,
    #[serde(default)]
    split_chapters: bool,
    #[serde(default)]
    save_subtitles: bool,
    #[serde(default = "default_subtitle_language")]
    subtitle_language: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    #[serde(default = "default_theme")]
    theme: String,
    #[serde(default = "default_output_folder")]
    default_output_folder: String,
    #[serde(default = "default_format")]
    default_format: String,
    #[serde(default = "default_quality")]
    default_quality: String,
    #[serde(default)]
    platform_defaults: Option<PlatformDefaults>,
    #[serde(default = "default_playlist_concurrency")]
    playlist_concurrency: u8,
    #[serde(default)]
    playlist_folder_mode: bool,
    #[serde(default = "default_keep_history")]
    keep_history: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PlatformDefault {
    #[serde(default = "default_format")]
    mode: String,
    #[serde(default = "default_quality")]
    quality: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PlatformDefaults {
    #[serde(default)]
    you_tube: Option<PlatformDefault>,
    #[serde(default)]
    sound_cloud: Option<PlatformDefault>,
    #[serde(default)]
    tik_tok: Option<PlatformDefault>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HistoryItem {
    id: String,
    url: Option<String>,
    title: String,
    creator: Option<String>,
    thumbnail: Option<String>,
    duration: Option<u64>,
    platform: Platform,
    path: String,
    mode: String,
    quality: Option<String>,
    file_name: Option<String>,
    output_dir: Option<String>,
    selected_format_id: Option<String>,
    playlist_title: Option<String>,
    playlist_index: Option<u64>,
    playlist_total: Option<u64>,
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
    format_details: Vec<FormatDetail>,
    limitation: Option<String>,
    suggested_file_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormatDetail {
    id: String,
    kind: String,
    label: String,
    ext: Option<String>,
    resolution: Option<String>,
    width: Option<u64>,
    height: Option<u64>,
    fps: Option<f64>,
    video_codec: Option<String>,
    audio_codec: Option<String>,
    audio_bitrate: Option<f64>,
    video_bitrate: Option<f64>,
    total_bitrate: Option<f64>,
    filesize: Option<u64>,
    note: Option<String>,
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

fn data_parse_error(label: &str, backup_path: Option<PathBuf>) -> CommandError {
    let suggestion = backup_path
        .map(|path| {
            format!(
                "A backup was saved to {}. Restore a valid file or remove the damaged one to start fresh.",
                path.display()
            )
        })
        .unwrap_or_else(|| {
            "Restore a valid file or remove the damaged one from the app data folder to start fresh."
                .to_string()
        });
    user_error(&format!("{label} could not be read."), &suggestion)
}

fn backup_invalid_file(path: &Path) -> Option<PathBuf> {
    let file_name = path.file_name()?.to_string_lossy();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis();
    let backup_path = path.with_file_name(format!("{file_name}.invalid-{timestamp}.bak"));
    fs::copy(path, &backup_path).ok()?;
    Some(backup_path)
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

fn managed_tool_ready_path(app: &AppHandle, tool: &str) -> AppResult<Option<PathBuf>> {
    let path = managed_tool_path(app, tool)?;
    Ok(path.filter(|path| command_version(&path.to_string_lossy()).is_some()))
}

fn active_tool_path(app: &AppHandle, tool: &str) -> String {
    managed_tool_ready_path(app, tool)
        .ok()
        .flatten()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("{tool}{}", executable_suffix()))
}

fn ffmpeg_location_arg(app: &AppHandle) -> Option<String> {
    managed_tool_ready_path(app, "ffmpeg")
        .ok()
        .flatten()
        .and_then(|path| {
            path.parent()
                .map(|parent| parent.to_string_lossy().to_string())
        })
}

fn command_version(command: &str) -> Option<String> {
    ["--version", "-version"].into_iter().find_map(|version_arg| {
        tool_command(command)
            .arg(version_arg)
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
    })
}

fn tool_detail(app: &AppHandle, tool: &str, label: &str) -> AppResult<ToolDetail> {
    let asset = tool_asset(tool).ok();
    let asset_version = asset
        .as_ref()
        .map(|asset| asset.version.to_string())
        .unwrap_or_else(|| "manual".to_string());
    let managed_path = managed_tool_path(app, tool).unwrap_or(None);
    let managed_version = managed_path
        .as_ref()
        .and_then(|path| command_version(&path.to_string_lossy()));
    let system_command = format!("{tool}{}", executable_suffix());
    let system_version = command_version(&system_command);
    let managed_installed = managed_version.is_some();
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
        "managed" => format!("Using managed {label} {asset_version}."),
        "system" => format!("Using {label} from your system PATH."),
        _ if asset.is_some() => format!("{label} is missing. Install managed tools from Settings."),
        _ => format!("Managed {label} is not available for this platform. Install it manually and make sure it is on your PATH."),
    };
    Ok(ToolDetail {
        name: label.to_string(),
        required_version: asset_version,
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
    if command_version(&executable_path.to_string_lossy()).is_none() {
        return Err(user_error(
            "The managed tool could not be started after installation.",
            "Try installing again, or install the tool manually and make sure it is on your PATH.",
        ));
    }
    Ok(())
}

fn detect_platform(url: &str) -> Platform {
    let host = Url::parse(url.trim())
        .ok()
        .and_then(|parsed| parsed.host_str().map(|host| host.to_ascii_lowercase()))
        .map(|host| host.strip_prefix("www.").unwrap_or(&host).to_string())
        .unwrap_or_default();
    if host == "youtube.com" || host.ends_with(".youtube.com") || host == "youtu.be" {
        Platform::YouTube
    } else if host == "soundcloud.com" || host.ends_with(".soundcloud.com") {
        Platform::SoundCloud
    } else if host == "tiktok.com" || host.ends_with(".tiktok.com") {
        Platform::TikTok
    } else if host == "spotify.com" || host.ends_with(".spotify.com") {
        Platform::Spotify
    } else {
        Platform::Unsupported
    }
}

fn is_tiktok_video_url(url: &str) -> bool {
    let Ok(parsed) = Url::parse(url.trim()) else {
        return false;
    };
    let raw_host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
    let host = raw_host.strip_prefix("www.").unwrap_or(&raw_host);
    if !(host == "tiktok.com" || host.ends_with(".tiktok.com")) {
        return false;
    }
    let path = parsed.path().trim_start_matches('/');
    if path.is_empty() {
        return false;
    }
    if host == "vm.tiktok.com" || host == "vt.tiktok.com" {
        return true;
    }
    path.contains("/video/") || path.starts_with("v/") || path.starts_with("t/")
}

fn is_download_platform(platform: &Platform) -> bool {
    matches!(
        platform,
        Platform::YouTube | Platform::SoundCloud | Platform::TikTok
    )
}

fn validate_public_url(url: &str) -> AppResult<()> {
    let parsed = Url::parse(url.trim()).map_err(|_| {
        user_error(
            "Enter a complete media URL.",
            "Paste a URL that starts with https:// or http://.",
        )
    })?;
    if !matches!(parsed.scheme(), "https" | "http") || parsed.host_str().is_none() {
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

fn safe_output_path(
    output_dir: &str,
    file_name: &str,
    playlist_folder_name: Option<&str>,
) -> AppResult<PathBuf> {
    let base_dir = PathBuf::from(output_dir);
    if !base_dir.is_dir() {
        return Err(user_error(
            "The selected output folder is not available.",
            "Choose an existing folder you can write to.",
        ));
    }
    let canonical_base = fs::canonicalize(&base_dir).map_err(|_| {
        user_error(
            "The output folder could not be checked.",
            "Choose a different folder and try again.",
        )
    })?;
    let target_dir = playlist_folder_name
        .map(sanitize_filename)
        .filter(|name| !name.is_empty())
        .map(|name| base_dir.join(name))
        .unwrap_or_else(|| base_dir.clone());
    if playlist_folder_name.is_some() {
        fs::create_dir_all(&target_dir).map_err(|_| {
            user_error(
                "The playlist folder could not be created.",
                "Choose a different output folder and try again.",
            )
        })?;
    }
    let canonical_target = fs::canonicalize(&target_dir).map_err(|_| {
        user_error(
            "The output folder could not be checked.",
            "Choose a different folder and try again.",
        )
    })?;
    if !canonical_target.starts_with(&canonical_base) {
        return Err(user_error(
            "The playlist folder would save outside the selected folder.",
            "Use a simple playlist title without path separators.",
        ));
    }
    let safe_name = sanitize_filename(file_name);
    let path = target_dir.join(safe_name);
    let parent = path.parent().unwrap_or(Path::new(""));
    let canonical_parent = fs::canonicalize(parent).unwrap_or(canonical_target.clone());
    if canonical_parent != canonical_target {
        return Err(user_error(
            "The file name would save outside the selected folder.",
            "Use a simple file name without path separators.",
        ));
    }
    Ok(path)
}

fn default_settings() -> Settings {
    Settings {
        theme: default_theme(),
        default_output_folder: default_output_folder(),
        default_format: default_format(),
        default_quality: default_quality(),
        platform_defaults: Some(default_platform_defaults(&default_format(), &default_quality())),
        playlist_concurrency: default_playlist_concurrency(),
        playlist_folder_mode: false,
        keep_history: default_keep_history(),
    }
}

fn default_theme() -> String {
    "system".to_string()
}

fn default_output_folder() -> String {
    dirs::download_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
        .to_string_lossy()
        .to_string()
}

fn default_format() -> String {
    "audio".to_string()
}

fn default_quality() -> String {
    "best".to_string()
}

fn default_playlist_concurrency() -> u8 {
    2
}

fn default_keep_history() -> bool {
    true
}

fn default_subtitle_language() -> String {
    "en".to_string()
}

fn normalize_mode(value: &str, force_audio: bool) -> String {
    if force_audio {
        return "audio".to_string();
    }
    match value {
        "video" => "video".to_string(),
        _ => "audio".to_string(),
    }
}

fn normalize_quality(value: &str, mode: &str) -> String {
    let allowed = if mode == "video" {
        matches!(
            value,
            "best" | "balanced" | "video-mp4-best" | "video-mp4-1080" | "video-mp4-720"
        )
    } else {
        matches!(
            value,
            "best" | "balanced" | "audio-mp3" | "audio-m4a" | "audio-opus" | "audio-wav"
        )
    };
    if allowed {
        value.to_string()
    } else {
        "best".to_string()
    }
}

fn default_platform_default(format: &str, quality: &str, force_audio: bool) -> PlatformDefault {
    let mode = normalize_mode(format, force_audio);
    PlatformDefault {
        quality: normalize_quality(quality, &mode),
        mode,
    }
}

fn normalize_platform_default(
    value: Option<PlatformDefault>,
    fallback_format: &str,
    fallback_quality: &str,
    force_audio: bool,
) -> PlatformDefault {
    let fallback = default_platform_default(fallback_format, fallback_quality, force_audio);
    let Some(value) = value else {
        return fallback;
    };
    let mode = normalize_mode(
        if value.mode.is_empty() {
            &fallback.mode
        } else {
            &value.mode
        },
        force_audio,
    );
    PlatformDefault {
        quality: normalize_quality(
            if value.quality.is_empty() {
                &fallback.quality
            } else {
                &value.quality
            },
            &mode,
        ),
        mode,
    }
}

fn default_platform_defaults(format: &str, quality: &str) -> PlatformDefaults {
    PlatformDefaults {
        you_tube: Some(default_platform_default(format, quality, false)),
        sound_cloud: Some(default_platform_default(format, quality, true)),
        tik_tok: Some(default_platform_default(format, quality, false)),
    }
}

fn normalize_platform_defaults(
    value: Option<PlatformDefaults>,
    fallback_format: &str,
    fallback_quality: &str,
) -> PlatformDefaults {
    let value = value.unwrap_or(PlatformDefaults {
        you_tube: None,
        sound_cloud: None,
        tik_tok: None,
    });
    PlatformDefaults {
        you_tube: Some(normalize_platform_default(
            value.you_tube,
            fallback_format,
            fallback_quality,
            false,
        )),
        sound_cloud: Some(normalize_platform_default(
            value.sound_cloud,
            fallback_format,
            fallback_quality,
            true,
        )),
        tik_tok: Some(normalize_platform_default(
            value.tik_tok,
            fallback_format,
            fallback_quality,
            false,
        )),
    }
}

fn normalize_settings(mut settings: Settings) -> Settings {
    settings.playlist_concurrency = settings.playlist_concurrency.clamp(1, 3);
    settings.default_format = normalize_mode(&settings.default_format, false);
    settings.default_quality = normalize_quality(&settings.default_quality, &settings.default_format);
    settings.platform_defaults = Some(normalize_platform_defaults(
        settings.platform_defaults,
        &settings.default_format,
        &settings.default_quality,
    ));
    settings
}

fn parse_settings_data(data: &str) -> AppResult<Settings> {
    serde_json::from_str(data)
        .map(normalize_settings)
        .map_err(|_| data_parse_error("Settings", None))
}

fn parse_history_data(data: &str) -> AppResult<Vec<HistoryItem>> {
    serde_json::from_str(data).map_err(|_| data_parse_error("Download history", None))
}

#[tauri::command]
fn load_settings(app: AppHandle) -> AppResult<Settings> {
    let path = app_dir(&app)?.join("settings.json");
    if !path.exists() {
        return Ok(default_settings());
    }
    let data = fs::read_to_string(&path).map_err(|_| {
        user_error(
            "Settings could not be read.",
            "The app will continue with safe defaults.",
        )
    })?;
    parse_settings_data(&data).map_err(|_| data_parse_error("Settings", backup_invalid_file(&path)))
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> AppResult<Settings> {
    let path = app_dir(&app)?.join("settings.json");
    let settings = normalize_settings(settings);
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
    let data = fs::read_to_string(&path).map_err(|_| {
        user_error(
            "Download history could not be read.",
            "You can clear history from Settings if it looks incorrect.",
        )
    })?;
    parse_history_data(&data)
        .map_err(|_| data_parse_error("Download history", backup_invalid_file(&path)))
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
fn check_paths(paths: Vec<String>) -> AppResult<HashMap<String, bool>> {
    Ok(paths
        .into_iter()
        .map(|path| {
            let exists = PathBuf::from(&path).exists();
            (path, exists)
        })
        .collect())
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
            format_details: vec![],
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
            format_details: vec![],
            limitation: Some("This app currently supports permitted public YouTube, SoundCloud, and TikTok URLs only.".to_string()),
            suggested_file_name: None,
        }),
        Platform::TikTok if !is_tiktok_video_url(&request.url) => Ok(Inspection {
            platform,
            downloadable: false,
            title: None,
            creator: None,
            duration: None,
            thumbnail: None,
            formats: vec![],
            format_details: vec![],
            limitation: Some("Paste an individual public TikTok video URL, not a profile or playlist.".to_string()),
            suggested_file_name: None,
        }),
        Platform::YouTube | Platform::SoundCloud | Platform::TikTok => {
            inspect_with_ytdlp(&app, &request.url, platform)
        }
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
        Platform::TikTok => Ok(PlaylistInspection {
            platform,
            downloadable: false,
            title: None,
            creator: None,
            entries: vec![],
            limitation: Some("TikTok playlist and profile downloads are not supported. Use Download mode with an individual public TikTok video URL.".to_string()),
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

fn json_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty() && *v != "none")
        .map(str::to_string)
}

fn json_u64(value: &serde_json::Value, key: &str) -> Option<u64> {
    value.get(key).and_then(|v| {
        v.as_u64()
            .or_else(|| v.as_f64().filter(|n| *n >= 0.0).map(|n| n.round() as u64))
    })
}

fn json_f64(value: &serde_json::Value, key: &str) -> Option<f64> {
    value
        .get(key)
        .and_then(|v| v.as_f64().or_else(|| v.as_u64().map(|n| n as f64)))
        .filter(|n| n.is_finite() && *n > 0.0)
}

fn raw_codec(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .map(str::to_string)
}

fn format_kind(video_codec: Option<&str>, audio_codec: Option<&str>) -> Option<&'static str> {
    let has_video = video_codec.is_some_and(|value| value != "none");
    let has_audio = audio_codec.is_some_and(|value| value != "none");
    match (has_video, has_audio) {
        (true, true) => Some("muxed"),
        (true, false) => Some("video"),
        (false, true) => Some("audio"),
        _ => None,
    }
}

fn build_format_label(format: &serde_json::Value, id: &str, kind: &str) -> String {
    if let Some(note) = json_string(format, "format_note") {
        return note;
    }
    if let Some(resolution) = json_string(format, "resolution") {
        if resolution != "audio only" {
            return resolution;
        }
    }
    if let Some(height) = json_u64(format, "height") {
        return format!("{height}p");
    }
    if kind == "audio" {
        return "Audio only".to_string();
    }
    id.to_string()
}

fn available_format_details(json: &serde_json::Value) -> Vec<FormatDetail> {
    let Some(formats) = json.get("formats").and_then(|v| v.as_array()) else {
        return vec![];
    };
    formats
        .iter()
        .filter_map(|format| {
            let id = json_string(format, "format_id")?;
            let video_codec = raw_codec(format, "vcodec");
            let audio_codec = raw_codec(format, "acodec");
            let kind = format_kind(video_codec.as_deref(), audio_codec.as_deref())?;
            let filesize =
                json_u64(format, "filesize").or_else(|| json_u64(format, "filesize_approx"));
            Some(FormatDetail {
                label: build_format_label(format, &id, kind),
                id,
                kind: kind.to_string(),
                ext: json_string(format, "ext"),
                resolution: json_string(format, "resolution").filter(|value| value != "audio only"),
                width: json_u64(format, "width"),
                height: json_u64(format, "height"),
                fps: json_f64(format, "fps"),
                video_codec,
                audio_codec,
                audio_bitrate: json_f64(format, "abr"),
                video_bitrate: json_f64(format, "vbr"),
                total_bitrate: json_f64(format, "tbr"),
                filesize,
                note: json_string(format, "format_note"),
            })
        })
        .take(120)
        .collect()
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
    let format_details = available_format_details(&json);
    Ok(Inspection {
        platform,
        downloadable: true,
        title,
        creator,
        duration,
        thumbnail,
        formats,
        format_details,
        limitation: None,
        suggested_file_name: suggested,
    })
}

fn audio_extension(preset: &str) -> &'static str {
    match preset {
        "balanced" | "audio-m4a" => "m4a",
        "audio-opus" => "opus",
        "audio-wav" => "wav",
        _ => "mp3",
    }
}

fn append_metadata_args(args: &mut Vec<String>) {
    args.extend([
        "--embed-metadata".to_string(),
        "--embed-thumbnail".to_string(),
        "--convert-thumbnails".to_string(),
        "jpg".to_string(),
        "--parse-metadata".to_string(),
        "%(uploader|)s:%(meta_artist)s".to_string(),
    ]);
}

fn append_audio_preset_args(
    args: &mut Vec<String>,
    preset: &str,
    selected_format_id: Option<&str>,
) {
    let (format, quality) = match preset {
        "balanced" => ("m4a", "5"),
        "audio-m4a" => ("m4a", "0"),
        "audio-opus" => ("opus", "0"),
        "audio-wav" => ("wav", "0"),
        _ => ("mp3", "0"),
    };
    args.extend([
        "-f".to_string(),
        selected_audio_selector(selected_format_id),
        "-x".to_string(),
        "--audio-format".to_string(),
        format.to_string(),
        "--audio-quality".to_string(),
        quality.to_string(),
    ]);
}

fn sanitize_format_id(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty()
        || trimmed.len() > 80
        || !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn selected_audio_selector(selected_format_id: Option<&str>) -> String {
    selected_format_id
        .and_then(sanitize_format_id)
        .map(|id| format!("{id}/bestaudio/best"))
        .unwrap_or_else(|| "bestaudio/best".to_string())
}

fn selected_video_selector(selected_format_id: Option<&str>, preset: &str) -> String {
    selected_format_id
        .and_then(sanitize_format_id)
        .map(|id| format!("{id}+bestaudio/{id}/best"))
        .unwrap_or_else(|| video_selector(preset).to_string())
}

fn video_selector(preset: &str) -> &'static str {
    match preset {
        "balanced" | "video-mp4-720" => {
            "bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4][height<=720]/bv*[height<=720]+ba/b[height<=720]"
        }
        "video-mp4-1080" => {
            "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4][height<=1080]/bv*[height<=1080]+ba/b[height<=1080]"
        }
        _ => "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
    }
}

fn append_video_preset_args(
    args: &mut Vec<String>,
    preset: &str,
    selected_format_id: Option<&str>,
) {
    args.extend([
        "-f".to_string(),
        selected_video_selector(selected_format_id, preset),
        "--merge-output-format".to_string(),
        "mp4".to_string(),
    ]);
}

fn chapter_template_for(output_path: &Path) -> String {
    let parent = output_path.parent().unwrap_or_else(|| Path::new(""));
    let stem = output_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("download");
    parent
        .join(format!(
            "{stem} - %(section_number)02d - %(section_title)s.%(ext)s"
        ))
        .to_string_lossy()
        .to_string()
}

fn append_chapter_args(args: &mut Vec<String>, output_path: &Path) {
    args.extend([
        "--split-chapters".to_string(),
        "-o".to_string(),
        format!("chapter:{}", chapter_template_for(output_path)),
    ]);
}

fn sanitize_subtitle_language(input: &str) -> String {
    let cleaned: String = input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ',' | '*'))
        .take(48)
        .collect();
    if cleaned.is_empty() {
        default_subtitle_language()
    } else {
        cleaned
    }
}

fn append_subtitle_args(args: &mut Vec<String>, language: &str) {
    args.extend([
        "--write-subs".to_string(),
        "--write-auto-subs".to_string(),
        "--sub-langs".to_string(),
        sanitize_subtitle_language(language),
        "--sub-format".to_string(),
        "srt/best".to_string(),
        "--convert-subs".to_string(),
        "srt".to_string(),
    ]);
}

#[tauri::command]
fn start_download(
    app: AppHandle,
    request: DownloadRequest,
    registry: State<DownloadRegistry>,
) -> AppResult<String> {
    validate_public_url(&request.url)?;
    let platform = detect_platform(&request.url);
    if !is_download_platform(&platform) {
        return Err(user_error(
            "This URL cannot be downloaded by this app.",
            "Use a permitted public YouTube, SoundCloud, or TikTok URL.",
        ));
    }
    if matches!(platform, Platform::TikTok) && !is_tiktok_video_url(&request.url) {
        return Err(user_error(
            "This TikTok URL cannot be downloaded by this app.",
            "Use an individual public TikTok video URL, not a profile or playlist.",
        ));
    }
    if matches!(platform, Platform::SoundCloud) && request.mode == "video" {
        return Err(user_error(
            "SoundCloud URLs can only be saved as audio.",
            "Choose an audio preset and try again.",
        ));
    }
    let mut output_path = safe_output_path(
        &request.output_dir,
        &request.file_name,
        request.playlist_folder_name.as_deref(),
    )?;
    let expected_extension = if request.mode == "audio" {
        audio_extension(&request.quality)
    } else {
        "mp4"
    };
    output_path.set_extension(expected_extension);
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
    append_metadata_args(&mut args);
    if request.split_chapters {
        append_chapter_args(&mut args, &output_path);
    }
    if request.save_subtitles && request.mode == "video" {
        append_subtitle_args(&mut args, &request.subtitle_language);
    }
    if request.mode == "audio" {
        append_audio_preset_args(
            &mut args,
            &request.quality,
            request.selected_format_id.as_deref(),
        );
    } else {
        append_video_preset_args(
            &mut args,
            &request.quality,
            request.selected_format_id.as_deref(),
        );
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
    let child_ref = Arc::new(Mutex::new(DownloadProcess {
        child,
        cancelled: false,
    }));
    {
        let mut downloads = registry.0.lock().map_err(|_| {
            user_error(
                "Download manager is unavailable.",
                "Restart the app and try again.",
            )
        })?;
        if downloads.contains_key(&request.id) {
            let _ = child_ref.lock().map(|mut process| process.child.kill());
            return Err(user_error(
                "This download is already running.",
                "Wait for the current download to finish or cancel it before trying again.",
            ));
        }
        downloads.insert(request.id.clone(), Arc::clone(&child_ref));
    }

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
        let (status, was_cancelled) = child_ref
            .lock()
            .ok()
            .map(|mut process| {
                let status = process.child.wait().ok();
                (status, process.cancelled)
            })
            .unwrap_or((None, false));
        let completed = status.map(|s| s.success()).unwrap_or(false);
        let final_status = if was_cancelled {
            "cancelled"
        } else if completed {
            "completed"
        } else {
            "failed"
        };
        let _ = wait_app.emit(
            "download-finished",
            serde_json::json!({
                "id": id,
                "status": final_status,
                "path": template
            }),
        );
        if let Some(state) = wait_app.try_state::<DownloadRegistry>() {
            let _ = state.0.lock().map(|mut map| {
                if map
                    .get(&registry_id)
                    .map(|process| Arc::ptr_eq(process, &child_ref))
                    .unwrap_or(false)
                {
                    map.remove(&registry_id);
                }
            });
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
        let _ = child.lock().map(|mut process| {
            process.cancelled = true;
            process.child.kill()
        });
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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(DownloadRegistry::default())
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            load_history,
            save_history,
            check_paths,
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
    use super::{
        append_audio_preset_args, append_chapter_args, append_metadata_args, append_subtitle_args,
        append_video_preset_args, audio_extension, detect_platform, is_download_platform,
        is_tiktok_video_url, normalize_settings, parse_history_data, parse_settings_data,
        safe_output_path, sanitize_format_id, sanitize_subtitle_language, selected_video_selector,
        tool_asset, validate_public_url, video_selector, Platform, Settings, FFMPEG_VERSION,
        YT_DLP_VERSION,
    };
    use std::{fs, path::Path};

    #[test]
    fn detects_soundcloud_hosts_for_ytdlp_path() {
        assert_eq!(
            detect_platform("https://soundcloud.com/artist/track"),
            Platform::SoundCloud
        );
        assert_eq!(
            detect_platform(" https://www.soundcloud.com:443/artist/track "),
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
    fn detects_tiktok_hosts_for_ytdlp_path() {
        assert_eq!(
            detect_platform("https://www.tiktok.com/@artist/video/1234567890"),
            Platform::TikTok
        );
        assert_eq!(
            detect_platform("HTTPS://www.tiktok.com:443/@artist/video/1234567890"),
            Platform::TikTok
        );
        assert_eq!(
            detect_platform("https://m.tiktok.com/v/1234567890.html"),
            Platform::TikTok
        );
        assert_eq!(
            detect_platform("https://vm.tiktok.com/ZMabc123/"),
            Platform::TikTok
        );
    }

    #[test]
    fn scopes_tiktok_support_to_individual_videos() {
        assert!(is_tiktok_video_url(
            "https://www.tiktok.com/@artist/video/1234567890"
        ));
        assert!(is_tiktok_video_url(
            "https://m.tiktok.com/v/1234567890.html"
        ));
        assert!(is_tiktok_video_url("https://vm.tiktok.com/ZMabc123/"));
        assert!(!is_tiktok_video_url("https://www.tiktok.com/@artist"));
        assert!(!is_tiktok_video_url("https://www.tiktok.com/"));
    }

    #[test]
    fn handles_url_parser_edge_cases() {
        assert_eq!(
            detect_platform("https://user:pass@www.youtube.com:443/watch?v=abc"),
            Platform::YouTube
        );
        assert_eq!(
            detect_platform("not a url youtube.com/watch"),
            Platform::Unsupported
        );
        assert!(validate_public_url(" https://www.youtube.com/watch?v=abc ").is_ok());
        assert!(validate_public_url("ftp://www.youtube.com/watch?v=abc").is_err());
        assert!(validate_public_url("https://").is_err());
    }

    #[test]
    fn allows_tiktok_in_download_platform_allowlist() {
        assert!(is_download_platform(&Platform::YouTube));
        assert!(is_download_platform(&Platform::SoundCloud));
        assert!(is_download_platform(&Platform::TikTok));
        assert!(!is_download_platform(&Platform::Spotify));
        assert!(!is_download_platform(&Platform::Unsupported));
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

    #[test]
    fn maps_audio_presets_to_expected_extensions_and_args() {
        assert_eq!(audio_extension("best"), "mp3");
        assert_eq!(audio_extension("balanced"), "m4a");
        assert_eq!(audio_extension("audio-opus"), "opus");
        assert_eq!(audio_extension("audio-wav"), "wav");

        let mut args = vec![];
        append_audio_preset_args(&mut args, "audio-opus", None);
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--audio-format" && pair[1] == "opus"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--audio-quality" && pair[1] == "0"));
    }

    #[test]
    fn maps_video_presets_to_mp4_selectors() {
        assert!(video_selector("video-mp4-best").contains("[ext=mp4]"));
        assert!(video_selector("video-mp4-1080").contains("height<=1080"));
        assert!(video_selector("balanced").contains("height<=720"));

        let mut args = vec![];
        append_video_preset_args(&mut args, "video-mp4-720", None);
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--merge-output-format" && pair[1] == "mp4"));
    }

    #[test]
    fn sanitizes_and_applies_selected_format_ids() {
        assert_eq!(sanitize_format_id("137"), Some("137".to_string()));
        assert_eq!(
            sanitize_format_id("ba-1.2_audio"),
            Some("ba-1.2_audio".to_string())
        );
        assert_eq!(sanitize_format_id("137+bestaudio"), None);

        let mut args = vec![];
        append_audio_preset_args(&mut args, "audio-mp3", Some("251"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "-f" && pair[1] == "251/bestaudio/best"));
        assert_eq!(
            selected_video_selector(Some("137"), "best"),
            "137+bestaudio/137/best"
        );
    }

    #[test]
    fn includes_metadata_and_artwork_embedding_args() {
        let mut args = vec![];
        append_metadata_args(&mut args);
        assert!(args.contains(&"--embed-metadata".to_string()));
        assert!(args.contains(&"--embed-thumbnail".to_string()));
        assert!(args.windows(2).any(
            |pair| pair[0] == "--parse-metadata" && pair[1] == "%(uploader|)s:%(meta_artist)s"
        ));
    }

    #[test]
    fn defaults_and_clamps_playlist_concurrency_settings() {
        let legacy = r#"{
            "theme": "system",
            "defaultOutputFolder": "",
            "defaultFormat": "audio",
            "defaultQuality": "best",
            "keepHistory": true
        }"#;
        let parsed: Settings = serde_json::from_str(legacy).expect("legacy settings");
        assert_eq!(parsed.playlist_concurrency, 2);
        assert!(!parsed.playlist_folder_mode);
        assert!(parsed.platform_defaults.is_none());

        let normalized = normalize_settings(Settings {
            theme: "system".to_string(),
            default_output_folder: String::new(),
            default_format: "video".to_string(),
            default_quality: "video-mp4-1080".to_string(),
            platform_defaults: None,
            playlist_concurrency: 9,
            playlist_folder_mode: true,
            keep_history: true,
        });
        assert_eq!(normalized.playlist_concurrency, 3);
        let platform_defaults = normalized.platform_defaults.expect("platform defaults");
        assert_eq!(platform_defaults.you_tube.unwrap().mode, "video");
        assert_eq!(platform_defaults.sound_cloud.unwrap().mode, "audio");
        assert_eq!(platform_defaults.tik_tok.unwrap().quality, "video-mp4-1080");
    }

    #[test]
    fn normalizes_partial_platform_defaults_settings() {
        let settings = r#"{
            "theme": "system",
            "defaultOutputFolder": "",
            "defaultFormat": "video",
            "defaultQuality": "video-mp4-best",
            "platformDefaults": {
                "youTube": { "mode": "video", "quality": "audio-wav" },
                "soundCloud": { "mode": "video", "quality": "audio-opus" }
            },
            "playlistConcurrency": 2,
            "keepHistory": true
        }"#;
        let normalized = normalize_settings(serde_json::from_str(settings).expect("partial defaults"));
        let platform_defaults = normalized.platform_defaults.expect("platform defaults");
        let you_tube = platform_defaults.you_tube.expect("youtube defaults");
        let sound_cloud = platform_defaults.sound_cloud.expect("soundcloud defaults");
        let tik_tok = platform_defaults.tik_tok.expect("tiktok defaults");

        assert_eq!(you_tube.mode, "video");
        assert_eq!(you_tube.quality, "best");
        assert_eq!(sound_cloud.mode, "audio");
        assert_eq!(sound_cloud.quality, "audio-opus");
        assert_eq!(tik_tok.mode, "video");
        assert_eq!(tik_tok.quality, "video-mp4-best");
    }

    #[test]
    fn rejects_damaged_settings_json() {
        let error = parse_settings_data("{ not valid json").expect_err("damaged settings fail");
        assert_eq!(error.message, "Settings could not be read.");
        assert!(error.suggestion.contains("Restore a valid file"));
    }

    #[test]
    fn rejects_damaged_history_json() {
        let error = parse_history_data("{ not valid json").expect_err("damaged history fail");
        assert_eq!(error.message, "Download history could not be read.");
        assert!(error.suggestion.contains("Restore a valid file"));
    }

    #[test]
    fn creates_safe_playlist_subfolder_output_paths() {
        let base = std::env::temp_dir().join(format!(
            "unmuze-playlist-folder-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("create base temp dir");

        let path = safe_output_path(
            base.to_str().expect("base path"),
            "../bad:item?.mp3",
            Some("../My/Playlist?"),
        )
        .expect("safe playlist path");
        assert!(path.starts_with(&base));
        assert_eq!(
            path.parent()
                .and_then(|parent| parent.file_name())
                .unwrap()
                .to_string_lossy(),
            "_My_Playlist_"
        );
        assert_eq!(path.file_name().unwrap().to_string_lossy(), "_bad_item_.mp3");
        assert!(path.parent().unwrap().is_dir());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn adds_chapter_split_output_template() {
        let mut args = vec![];
        append_chapter_args(&mut args, Path::new("C:/Downloads/Lecture.mp3"));
        assert!(args.contains(&"--split-chapters".to_string()));
        assert!(args
            .iter()
            .any(|value| value.starts_with("chapter:") && value.contains("%(section_title)s")));
    }

    #[test]
    fn adds_subtitle_sidecar_args_with_sanitized_language() {
        assert_eq!(sanitize_subtitle_language("en,fa.*; rm"), "en,fa.*rm");
        assert_eq!(sanitize_subtitle_language(""), "en");

        let mut args = vec![];
        append_subtitle_args(&mut args, "en.*");
        assert!(args.contains(&"--write-subs".to_string()));
        assert!(args.contains(&"--write-auto-subs".to_string()));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--sub-langs" && pair[1] == "en.*"));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--convert-subs" && pair[1] == "srt"));
    }
}
