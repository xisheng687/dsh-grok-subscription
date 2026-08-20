# Changelog

## 0.3.0 - 2026-08-20

### DSH rc.8 integration

- Require DeepSeek Harness 0.1.0-rc.8 and use its native durable image attachment UI.
- Reduce the client dependency edge to the official `dsh-client-ui-tool` surface.
- Keep audio/video cards and long-video analysis because rc.8 core attachments remain image-only.
- Remove unused nested bundle manifests and the duplicate ACP wrapper package from the release artifact.

### Compatibility

- Keep the public npm package id and Cordis instance ids unchanged so existing installations upgrade in place.
- Document that composer images are not implicitly inherited by the separate Grok ACP subprocess.

## 0.2.0 - 2026-08-19

### Features

- Add original-file-first MP4/MOV analysis with the complete soundtrack.
- Delete uploaded source files after analysis and set a one-hour server expiry.
- Add `auto`, strict `original`, and bandwidth-saving `sampled` strategies.
- Preserve word timestamps, filler words, and speaker diarization in sampled fallback.
- Send eligible MP4/MKV containers directly to STT; replace 48 kbps MP3 chunks with FLAC otherwise.

### Tests

- Add a local API simulator covering multipart field ordering, `input_file`, cleanup, and fallback.

## 0.1.0 - 2026-08-19

### Features

- Add official-CLI ACP providers for subscription-backed general and media work.
- Add persistent native audio/video cards with signed same-origin Range serving.
- Add xAI API TTS, STT, and consent-gated sampled long-video analysis.

### Security

- Keep subscription OAuth inside the official CLI.
- Use API-key-only public authentication for audio and long-video API calls.
- Add upload consent, bounded I/O, symlink rejection, and temporary-file cleanup.
