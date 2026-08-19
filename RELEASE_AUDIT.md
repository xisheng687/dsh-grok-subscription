# v0.2.0 release audit

Date: 2026-08-19

## Exact release artifact

- File: `dsh-subscription-media-suite-0.2.0.tgz`
- SHA-256: `f8e4b92e06182660e3011fb5a68700a18f37831fcf49f7cc9eefa2aae5777e05`
- Package: 24 files, 18.5 kB compressed, 57.0 kB unpacked

## Functional verification

- Original MP4 multipart upload with `expires_after` before `file`: passed
- Responses request contains the returned `input_file.file_id`: passed
- Remote file deletion after successful analysis: passed
- `auto` fallback on original-file HTTP 415: passed
- Fallback sends an eligible original MP4 container directly to STT: passed
- Word timestamps and speaker changes render into the transcript: passed
- 910-second MOV sample: 23 frames, two FLAC STT chunks, `[0:00]` and `[15:00]`: passed
- Exact tarball installed into a clean DSH 0.1.0-rc.7 profile: passed
- Clean DSH startup and HTTP response: passed
- JavaScript syntax and Node test suite: passed
- `npm audit`: 0 known vulnerabilities

The xAI network calls in v0.2.0 tests use a local protocol simulator. No maintainer
API key is present, so this audit does not claim a billable live original-video call.
Official Grok web documentation confirms MP4/MOV audio/video handling; the API docs
confirm Files upload and Responses `input_file`, but do not document an internal
"video token" representation.

## Privacy and secret scan

- Manual high-risk pattern review: 0 findings
- Gitleaks 8.30.1 on the exact unpacked tarball: 0 findings
- TruffleHog 3.97.0 on the exact unpacked tarball: 0 verified or unverified findings
