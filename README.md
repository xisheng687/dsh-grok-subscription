# DSH Subscription Media Suite

AI tools often produce a file and leave chat with an awkward path. This DSH
plugin suite turns local audio/video into persistent playable cards and adds an
original-file-first video workflow—without patching DeepSeek Harness core.

Highlights:

- Subscription-backed work through the official Grok Build ACP process. OAuth
  remains owned by the official CLI.
- Native audio/video cards with seeking and restart persistence.
- TTS, STT, and video analysis via a user-provided `XAI_API_KEY`.
- MP4/MOV files up to 50 MB can be analyzed with the complete original file
  and soundtrack; larger/unsupported inputs fall back to sampled frames plus
  timestamped, speaker-aware transcription.
- Explicit consent before either an original file or derived media leaves the machine.

Install the release tarball:

```bash
dsh plugin --profile web add https://github.com/xisheng687/dsh-subscription-media-suite/releases/download/v0.2.0/dsh-subscription-media-suite-0.2.0.tgz
NODE_USE_ENV_PROXY=1 dsh web
```

Requirements: DSH 0.1.0-rc.7+, Node 22.19+, ffmpeg/ffprobe, and the official
`grok` CLI for subscription-backed ACP. Set `XAI_API_KEY` only for API audio
and long-video synthesis.

The public API documents file attachments but does not promise an internal
"video token" representation. This project therefore calls the feature
original-file analysis, not native video tokens.

The implementation and release audit were developed primarily with Codex.
See [README.zh.md](README.zh.md) for tested behavior, limits, and full credits.

Unofficial community software; not endorsed by xAI or DeepSeek.
