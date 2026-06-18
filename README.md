# Unmuze

<p align="center">
  <img src="docs/assets/unmuze-icon.png" alt="Unmuze app icon" width="220" />
</p>

Unmuze is a lightweight local desktop app for Windows, macOS, and Linux that lets a user paste a supported media URL, inspect it, and save permitted audio or video content locally.

The app is local-first. It does not require an account, does not use a cloud backend, and stores only local preferences and Library records on the user device.

## What It Does

- Accepts public YouTube, SoundCloud, TikTok, Instagram, Twitter/X, and Pinterest media URLs, including YouTube playlists and SoundCloud sets in Playlist mode.
- Detects the platform automatically.
- Shows available metadata when local tooling can inspect the URL.
- Installs checksum-verified managed copies of `yt-dlp` and FFmpeg into the local app data folder.
- Saves audio or video through managed or system media tooling when the content is legally permitted and technically available.
- Runs playlist downloads concurrently with a configurable limit of 1, 2, or 3 items at a time.
- Provides simple **Best** and **Balanced** presets plus explicit MP3, M4A, Opus, WAV, MP4 best, MP4 1080p, and MP4 720p choices.
- Includes an advanced source format picker that can show available resolution, container, codecs, bitrate, fps, and size details after inspection.
- Embeds title, uploader/artist metadata, source URL, and thumbnail artwork when the selected output format supports it.
- Can split chaptered videos, podcasts, lectures, or albums into separate files by chapter.
- Can save manual subtitles or auto-generated captions as SRT sidecar files for video downloads.
- Shows progress, cancellation, completed downloads, and a searchable local Library with thumbnails, source metadata, format details, path status, and playlist grouping.
- Supports platform-specific default format and preset choices for YouTube, SoundCloud, TikTok, Instagram, Twitter/X, and Pinterest.
- Can place playlist downloads in a sanitized playlist-named folder.
- Provides completed-download actions to open saved files or reveal their containing folder.
- Supports light, dark, and system theme settings.
- Checks for Tauri signature-verified app updates from inside Settings.

## What It Does Not Do

- Does not bypass DRM, paywalls, login restrictions, private links, encryption, region locks, or other access controls.
- Does not download profiles, timelines, boards, collections, hashtags, stories, searches, likes, lists, DMs, or bulk social media sources.
- Does not download Spotify tracks, albums, or playlists. Spotify does not expose downloadable audio files for this kind of app without protected access.
- Does not create accounts, collect analytics, or upload media URLs to an Unmuze service.

## Supported URL Types

| Platform | Inspect | Download |
| --- | --- | --- |
| YouTube public URLs | Yes, when local tools can access metadata | Yes, only when legally permitted |
| YouTube public playlists | Yes, with per-item selection | Yes, selected public items only when legally permitted |
| SoundCloud public URLs | Yes, when local tools can access metadata | Yes, only when legally permitted |
| SoundCloud public sets | Yes, with per-item selection | Yes, selected public audio items only when legally permitted |
| TikTok public video URLs | Yes, when local tools can access metadata | Yes, individual public videos only when legally permitted |
| TikTok profiles/playlists | Unsupported message | No |
| Instagram public post, reel, reels, and TV URLs | Yes, when local tools can access metadata | Yes, individual public video/media items only when legally permitted |
| Instagram profiles, stories, hashtags, searches, collections | Unsupported message | No |
| Twitter/X public status URLs | Yes, when local tools can access metadata | Yes, individual public posts only when legally permitted |
| Twitter/X profiles, timelines, searches, lists, communities | Unsupported message | No |
| Pinterest public Pin URLs under `pinterest.com/pin/{id}` | Yes, when local tools can access metadata | Yes, individual public video pins only when legally permitted |
| Pinterest boards, profiles, searches, and `pin.it` short links | Unsupported message | No |
| Spotify | Protected-platform explanation only | No |
| Other sites | Unsupported message | No |

## Legal-Use Notice

You are responsible for having the rights to download any content you save. Use Unmuze only when the source, your rights, and the platform terms permit downloading.

## Basic Usage

1. Install Unmuze for your operating system.
2. Open Unmuze.
3. In Settings, choose **Install managed tools** if the app reports missing media tools.
4. Use **Check for updates** in Settings when you want to install the latest verified release without visiting GitHub.
5. Paste a supported public URL in Download mode, or open Playlist mode for a YouTube playlist or SoundCloud set.
6. Select audio or video, choose a preset or an advanced source format, choose an output folder, and save locally.
7. Open advanced options when you want chapter splitting or subtitles for sources that provide them.

See [INSTALL.md](INSTALL.md) and [BUILD.md](BUILD.md) for setup and packaging instructions.
