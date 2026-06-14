# Security Policy

## Supported Scope

Unmuze is a local desktop app. Security issues of interest include:

- Path traversal or unsafe file writes.
- Unsafe subprocess execution.
- Attempts to bypass access controls.
- Storage of sensitive data.
- UI behavior that misrepresents legal or protected-platform limitations.

## Reporting

This repository is local-only right now. If it is later pushed to a hosted repository, use that repository's private vulnerability reporting channel.

## Design Notes

- Downloads are allowlisted to supported public YouTube and SoundCloud URLs.
- Spotify and unsupported platforms are rejected by the backend, even if UI controls are bypassed.
- Subprocesses are launched without shell interpolation.
- Settings and history are stored locally and do not contain credentials.
- Secrets and signing keys must not be committed.
