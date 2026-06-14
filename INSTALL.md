# Install Unmuze

Installers are produced locally with Tauri. Download the installer for your platform when a release is provided, or build one using [BUILD.md](BUILD.md).

## Windows

1. Run the `.msi` or `.exe` installer.
2. If Windows SmartScreen appears, choose the option to run the app only if you trust the build source.
3. Install `yt-dlp` and FFmpeg, then make sure both are available on your `PATH`.

## macOS

1. Open the `.dmg`.
2. Drag Unmuze into Applications.
3. On first launch, macOS may ask you to confirm the app because it was built locally.
4. Install `yt-dlp` and FFmpeg with Homebrew or another trusted package manager.

## Linux

1. Use the `.AppImage`, `.deb`, or `.rpm` produced by the build.
2. Make the AppImage executable if needed.
3. Install `yt-dlp` and FFmpeg through your distribution package manager.

## First Launch

Unmuze stores settings and history in your local app data folder. It may ask for folder access when choosing an output location.

## Common Issues

- `yt-dlp is missing or unavailable`: install `yt-dlp` and restart the app.
- `FFmpeg is missing or unavailable`: install FFmpeg and confirm it is on `PATH`.
- `URL requires login or protected access`: Unmuze will not bypass protected access.
- Spotify cannot download: this is expected; Spotify does not expose downloadable files for this app.
