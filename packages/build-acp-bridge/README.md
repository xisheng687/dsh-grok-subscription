# dsh-build-acp-bridge

An unofficial DeepSeek Harness bridge for the official Grok Build CLI. Your
subscription login stays inside the vendor CLI: this package launches
`grok agent stdio` over ACP and never reads or copies `~/.grok/auth.json`.

It provides two subagent providers:

- `build-native`: read-mostly general work; ACP permission prompts are denied.
- `build-media`: only the official image/image-edit/image-to-video tools are
  exposed and auto-approved. Shell and arbitrary file mutation are absent.

Requirements: DeepSeek Harness 0.1.0-rc.7+, the official `grok` command on
`PATH`, and an account already signed in with that CLI.

This project is independent and is not endorsed by xAI or DeepSeek. “Grok” is
used only to identify the compatible official service.
