# Build Unmuze

## Requirements

- Node.js 20.19 or newer, or Node.js 22.13 or newer.
- npm 10 or newer.
- Rust stable.
- Platform build tools required by Tauri.
- Optional runtime tools: `yt-dlp` and FFmpeg. The app can also install managed copies into its local app data folder.

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
npm run lint
npm run build
npm run check:versions
npm run check:updater
cd src-tauri
cargo test
```

`npm run check:release` runs linting, frontend tests, the production frontend build, version alignment, and updater configuration checks together. Run `cargo test` separately from `src-tauri` before release work.

## Build Installers

```bash
npm run desktop:build
```

Tauri writes platform-specific installers under `src-tauri/target/release/bundle`.

## Release Builds

GitHub Actions builds release bundles for Windows, macOS, and Linux when a version tag is pushed or when the release workflow is run manually.

Before the platform bundle matrix starts, CI verifies:

- release tag alignment with the app version;
- version-specific release notes in `.github/release-notes/vX.Y.Z.md`;
- linting with `npm run lint`;
- frontend tests with `npm test`;
- production frontend build with `npm run build`;
- Rust tests with `cargo test`;
- version alignment across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`;
- updater artifact readiness, including `createUpdaterArtifacts`, updater endpoint configuration, and signing-key wiring in the release workflow.

After each release bundle build, CI checks that Tauri generated updater signature files. After all platform builds finish, the publish job verifies Windows, macOS, Linux, and `latest.json` release assets, applies the matching release notes file, and then publishes the draft release.

The release workflow also builds signed updater artifacts and uploads `latest.json` for in-app updates. The repository must have these Actions secrets configured:

- `TAURI_SIGNING_PRIVATE_KEY`: private updater signing key content.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: optional password if the signing key was generated with one.

The public updater key is stored in `src-tauri/tauri.conf.json`; do not commit the private key.

Before tagging a release, add a user-facing notes file at `.github/release-notes/vX.Y.Z.md`. The workflow keeps the GitHub release as a draft until those notes are applied and the cross-platform assets are present.

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
