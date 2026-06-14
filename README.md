# Unmuze

<p align="center">
  <img src="docs/assets/unmuze-icon.png" alt="Unmuze app icon" width="220" />
</p>

Unmuze is a lightweight local desktop app for Windows, macOS, and Linux that lets a user paste a supported media URL, inspect it, and save permitted audio or video content locally.

The app is local-first. It does not require an account, does not use a cloud backend, and stores only local preferences and download history on the user device.

## What It Does

- Accepts public YouTube and SoundCloud URLs.
- Detects the platform automatically.
- Shows available metadata when local tooling can inspect the URL.
- Saves audio or video through local `yt-dlp` and FFmpeg tooling when the content is legally permitted and technically available.
- Shows progress, cancellation, completed downloads, and local history.
- Supports light, dark, and system theme settings.

## What It Does Not Do

- Does not bypass DRM, paywalls, login restrictions, private links, encryption, region locks, or other access controls.
- Does not download Spotify tracks, albums, or playlists. Spotify does not expose downloadable audio files for this kind of app without protected access.
- Does not create accounts, collect analytics, or upload media URLs to an Unmuze service.

## Supported URL Types

| Platform | Inspect | Download |
| --- | --- | --- |
| YouTube public URLs | Yes, when `yt-dlp` can access metadata | Yes, only when legally permitted |
| SoundCloud public URLs | Yes, when `yt-dlp` can access metadata | Yes, only when legally permitted |
| Spotify | Protected-platform explanation only | No |
| Other sites | Unsupported message | No |

## Legal-Use Notice

You are responsible for having the rights to download any content you save. Use Unmuze only when the source, your rights, and the platform terms permit downloading.

## Basic Usage

1. Install Unmuze for your operating system.
2. Install `yt-dlp` and FFmpeg if you want inspection and conversion support.
3. Open Unmuze.
4. Paste a supported public URL.
5. Select audio or video, choose an output folder, and save locally.

See [INSTALL.md](INSTALL.md) and [BUILD.md](BUILD.md) for setup and packaging instructions.
