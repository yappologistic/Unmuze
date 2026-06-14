# Build Unmuze

## Requirements

- Node.js 20.19 or newer, or Node.js 22.13 or newer.
- npm 10 or newer.
- Rust stable.
- Platform build tools required by Tauri.
- Optional runtime tools: `yt-dlp` and FFmpeg.

## Development

```bash
npm install
npm run desktop:dev
```

For frontend-only development:

```bash
npm run dev
```

## Tests

```bash
npm test
npm run build
cd src-tauri
cargo test
```

## Build Installers

```bash
npm run desktop:build
```

Tauri writes platform-specific installers under `src-tauri/target/release/bundle`.

## Release Builds

GitHub Actions builds release bundles for Windows, macOS, and Linux when a version tag is pushed or when the release workflow is run manually.

## Platform Notes

- Windows builds create MSI/NSIS-style artifacts depending on installed tooling.
- macOS builds create app bundles and DMG artifacts on macOS.
- Linux builds can create AppImage, DEB, and RPM artifacts when required system packages are installed.

Cross-compiling desktop installers is not always practical. Build each installer on its target operating system for the most reliable result.

## Troubleshooting Packaging

- If Rust compilation fails, update Rust with `rustup update`.
- If WebView dependencies are missing on Linux, install the Tauri prerequisites for your distribution.
- If signing/notarization is required, configure Tauri signing outside this repository and do not commit secrets.
- If `npm run build` reports Node engine warnings, switch to an LTS Node version supported by the current toolchain.
