# v0.3.0 release audit

Date: 2026-08-20

## Exact release artifact

- File: `dsh-subscription-media-suite-0.3.0.tgz`
- SHA-256: `e75d49d875e98d5fea77186f5c5388b3cd5db38f9e73274a81056e8d342076fc`
- Package: 14 files, 18.0 kB compressed, 51.5 kB unpacked

## Compatibility and functional verification

- Official DSH runtime dependencies resolve to `0.1.0-rc.8`: passed
- Bundle entry imports against the rc.8 ACP and tool packages: passed
- Image UI ownership is delegated to DSH; only the official `ui-tool` client edge remains: passed
- Audio/video signed route byte ranges, `HEAD`, and tamper rejection: passed
- Original MP4 upload and remote Responses file lifecycle: passed
- Sampled long-video fallback with timestamped transcript: passed
- Official Grok Build CLI 1.0.5 subscription-authenticated single turn: passed
- JavaScript syntax and Node test suite (4 tests): passed
- `npm audit`: 0 known vulnerabilities

The isolated DSH CLI installer was also exercised, but its first-time npm dependency
resolution did not finish within the release check window and produced no plugin
error. The bundle itself was therefore verified directly against the installed rc.8
runtime packages rather than claiming a completed clean-profile CLI install.

The xAI API calls in the protocol tests use a local simulator. The live check covers
the official subscription-backed Grok Build CLI/ACP path; it does not claim a
billable live TTS, STT, or original-video API call.

## Privacy and secret scan

- Manual high-risk pattern review: 0 findings
- Gitleaks 8.30.1 on Git history, working tree, and exact unpacked tarball: 0 findings
- TruffleHog 3.97.0 on Git history and exact unpacked tarball: 0 verified or unverified findings
