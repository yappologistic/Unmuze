# Install Unmuze

Download the installer for your platform from the GitHub releases page, or build one locally using [BUILD.md](BUILD.md).

## Windows

1. Download the `.exe` setup file or `.msi` installer from the latest release.
2. Run the installer.
3. If Windows SmartScreen appears, choose the option to run the app only if you trust the build source.
4. Install `yt-dlp` and FFmpeg, then make sure both are available on your `PATH`.

## macOS

1. Download the `.dmg` for your Mac architecture from the latest release.
2. Open the `.dmg`.
3. Drag Unmuze into Applications.
4. On first launch, macOS may ask you to confirm the app because it is not notarized yet.
5. Install `yt-dlp` and FFmpeg with Homebrew or another trusted package manager.

## Linux

1. Download the `.AppImage`, `.deb`, or `.rpm` from the latest release.
2. Make the AppImage executable if needed.
3. Install `yt-dlp` and FFmpeg through your distribution package manager.

## First Launch

Unmuze stores settings and history in your local app data folder. It may ask for folder access when choosing an output location.

## Common Issues

- `yt-dlp is missing or unavailable`: install `yt-dlp` and restart the app.
- `FFmpeg is missing or unavailable`: install FFmpeg and confirm it is on `PATH`.
- `URL requires login or protected access`: Unmuze will not bypass protected access.
- Spotify cannot download: this is expected; Spotify does not expose downloadable files for this app.
