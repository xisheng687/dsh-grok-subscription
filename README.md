# DSH Grok Subscription

> Bring your Grok subscription into DeepSeek Harness.

Paying for Grok but having it confined to the Grok Build CLI makes multi-agent
work awkward: tasks, context, and generated media have to be moved by hand.
This unofficial DSH plugin suite connects the officially logged-in Grok Build
CLI to DSH as an ACP subagent. The official CLI keeps ownership of
OAuth credentials; the plugin neither reads nor copies them.

DSH 0.1.0-rc.8 now owns image paste/drop, durable storage, and history preview.
This plugin no longer duplicates that image UI. It focuses on the remaining
gaps: subscription-backed Grok subagents, Imagine tools, persistent audio/video
cards, speech tools, and an original-file-first long-video workflow.

What it provides:

- A Grok subscription-backed subagent inside DSH through the official Grok
  Build ACP process.
- Grok task execution and Imagine image/video tools.
- Native DSH rc.8 image attachments without a second image UI or store.
- Native audio/video cards with seeking and restart persistence.
- TTS, STT, and video analysis via a user-provided `XAI_API_KEY`.
- MP4/MOV files up to 50 MB can be analyzed with the complete original file
  and soundtrack; larger/unsupported inputs fall back to sampled frames plus
  timestamped, speaker-aware transcription.
- Explicit consent before either an original file or derived media leaves the machine.

Install the release tarball:

```bash
npx @deepseek-ai/dsh@0.1.0-rc.8 plugin --profile web add https://github.com/xisheng687/dsh-grok-subscription/releases/download/v0.3.0/dsh-subscription-media-suite-0.3.0.tgz
NODE_USE_ENV_PROXY=1 npx @deepseek-ai/dsh@0.1.0-rc.8 web
```

Requirements: DSH 0.1.0-rc.8+, Node 22.19+, ffmpeg/ffprobe, and an officially
logged-in `grok` CLI for subscription-backed ACP. TTS, STT, and original-file
video analysis are separate xAI API features and require your own `XAI_API_KEY`;
they are not included in subscription OAuth.

Composer images remain in the selected DSH model's conversation and are not
implicitly inherited by a separate ACP subprocess. To ask Grok to inspect a
workspace image, include its local path in the delegated task. Audio and video
are not DSH rc.8 core attachment types, which is why the media tools remain.

The public API documents file attachments but does not promise an internal
"video token" representation. This project therefore calls the feature
original-file analysis, not native video tokens.

The implementation and release audit were developed primarily with Codex.
See [README.zh.md](README.zh.md) for tested behavior, limits, and full credits.

Unofficial community software; not endorsed by xAI or DeepSeek.
