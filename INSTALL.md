# Install Unmuze

Download the installer for your platform from the GitHub releases page, or build one locally using [BUILD.md](BUILD.md).

## Windows

1. Download the `.exe` setup file or `.msi` installer from the latest release.
2. Run the installer.
3. If Windows SmartScreen appears, choose the option to run the app only if you trust the build source.

## macOS

1. Download the `.dmg` for your Mac architecture from the latest release.
2. Open the `.dmg`.
3. Drag Unmuze into Applications.
4. On first launch, macOS may ask you to confirm the app because it is not notarized yet.

## Linux

1. Download the `.AppImage`, `.deb`, or `.rpm` from the latest release.
2. Make the AppImage executable if needed.

## First Launch

Unmuze stores settings, history, and optional managed media tools in your local app data folder. It may ask for folder access when choosing an output location.

Open Settings and select **Install managed tools** if Unmuze reports missing media tools. The app downloads pinned copies of `yt-dlp` and FFmpeg, verifies their SHA-256 checksums, and uses them before system PATH tools.

Use **Check for updates** in Settings to install newer signed Unmuze releases from inside the app.

## Common Issues

- `yt-dlp is missing or unavailable`: open Settings and install managed tools, or install `yt-dlp` manually and restart the app.
- `FFmpeg is missing or unavailable`: open Settings and install managed tools, or install FFmpeg manually and confirm it is on `PATH`.
- `Managed tool failed verification`: the downloaded file did not match the pinned checksum. Try again later.
- `Update check failed`: confirm you can reach GitHub Releases and try again later.
- `Update install failed`: restart Unmuze and try again. On Windows, the installer may close the app while applying an update.
- No chapter files were created: the source must provide chapter markers, and **Split chapters** must be enabled before downloading.
- No subtitles were saved: subtitles must be available from the source, and **Save subtitles** applies to video downloads.
- `URL requires login or protected access`: Unmuze will not bypass protected access.
- Spotify cannot download: this is expected; Spotify does not expose downloadable files for this app.
