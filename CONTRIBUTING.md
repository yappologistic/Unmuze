# Contributing

## Development Standards

- Keep the app local-first.
- Do not add cloud accounts, analytics, or remote services.
- Keep legal safeguards in both UI and backend command validation.
- Do not add code that bypasses DRM, paywalls, login restrictions, encryption, region locks, or access controls.
- Prefer small, focused dependencies.

## Before Committing

Run:

```bash
npm test
npm run lint
npm run build
npm run check:versions
npm run check:updater
cd src-tauri
cargo test
```

## Code Style

- Use TypeScript for frontend code.
- Use Tauri commands for privileged local operations.
- Use fixed executables and explicit argument arrays for subprocesses.
- Sanitize filenames and validate output paths.
- Keep user-facing errors actionable and avoid raw stack traces.
