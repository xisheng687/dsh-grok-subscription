# DSH Grok Subscription

> 把 Grok 订阅接进 DeepSeek Harness。

已经付了 Grok 订阅费，却只能在 Grok Build CLI 里使用；想让它和 DeepSeek Harness 一起工作，还要来回切窗口、复制内容，生成的音视频也只剩下一串文件路径——这就是本项目想解决的问题。

这是一套非官方 DSH 插件：它通过 xAI 官方 Grok Build CLI 的 ACP 接口，把已经登录的 Grok 订阅账号接成 DeepSeek Harness 里的子代理。OAuth 仍由官方 CLI 保管，插件不读取、不复制登录凭据。在此基础上，它补上图片生成、音视频消息卡、语音能力和长视频理解，让 Grok 的多模态结果尽量留在同一个 DSH 工作流里。

## 它能做什么

- 用官方 Grok Build CLI 的 ACP 接口，把订阅账号作为 DSH 子代理使用；插件不读取、不复制 OAuth 文件。
- 在 DSH 中调用 Grok 子代理处理任务、理解图片，并使用 Imagine 图片/视频工具。
- 把本地 MP3、WAV、MP4、MOV、MKV、WebM 显示成可播放、可拖动、重启后仍能恢复的消息卡。
- 提供 TTS、STT，以及“原始视频文件优先、采样时间线回退”的长视频理解流程。
- 支持把不超过 50 MB 的 MP4/MOV 连同原声音轨整体交给 xAI；不满足条件时再使用抽帧和带时间戳、说话人区分的转写。
- 上传原文件或派生内容前明确询问；远端原文件处理后主动删除并设置 1 小时自动过期，临时帧和音频在本地分析结束后删除。

## 已经实际跑过的测试

- 官方 Grok Build ACP 普通子代理与图片理解。
- Imagine 图片生成、视频生成链路。
- DSH 原生 `<audio>` / `<video>` 卡，页面刷新和 DSH 进程重启后仍可恢复。
- HTTP Range：正常分段 `206`、坏签名 `404`、越界请求 `416`。
- 96 秒视频：23 帧，正确识别红 → 绿 → 蓝和循环测试语音。
- 910 秒视频：成功跨过 15 分钟边界，生成 `[0:00]`、`[15:00]` 两段转写。
- 订阅开发环境中的 xAI TTS / STT 往返测试。
- 原始视频 Files API 上传、`input_file` 引用、完成后删除的协议级模拟测试。
- 原始视频接口返回不支持时，自动回退到画面采样和原始 MP4 音轨转写的模拟测试。

Grok 订阅接入只走官方 `grok agent stdio`。公开版中的 TTS、STT 和原始文件长视频理解属于 xAI API 能力，需要用户另外提供自己的 `XAI_API_KEY`；它们不是订阅 OAuth 权限的一部分。这样边界更清楚，也不会冒充其他获得官方授权的客户端。

## 安装

要求：DeepSeek Harness `0.1.0-rc.7+`、Node.js `22.19+`、ffmpeg/ffprobe。订阅子代理还需要官方 `grok` CLI 已登录。

```bash
dsh plugin --profile web add https://github.com/xisheng687/dsh-grok-subscription/releases/download/v0.2.0/dsh-subscription-media-suite-0.2.0.tgz
NODE_USE_ENV_PROXY=1 dsh web
```

需要 TTS、STT 或长视频 API 综合时，在启动 DSH 前设置 `XAI_API_KEY`。仅播放本地音视频、或使用官方 CLI 订阅子代理，不需要 API key。

## 能力与边界

- `build-native`：官方 CLI 的只读优先子代理，默认拒绝 ACP 权限请求。
- `build-media`：只开放图片生成、编辑、图片转视频等媒体工具。
- `present_local_media`：本地音视频消息卡，不上传文件。
- `media_text_to_speech` / `media_speech_to_text`：xAI API 音频能力。
- `analyze_long_video`：默认 `auto`。MP4/MOV ≤ 50 MB 时优先上传完整原文件和原声音轨；也可选择 `original` 禁止回退，或选择 `sampled` 减少上传量。
- 采样回退：30 分钟以内最多 24 帧，更长视频最多 48 帧；MP4/MKV ≤ 200 MiB 时直接把原容器交给 STT，其他情况使用无 48 kbps 有损压缩的 FLAC 分段。上限 12 小时 / 12 GiB。

“原始文件模式”确实上传完整文件，但 xAI 没有公开承诺其内部一定按所谓 video token 计费或处理；准确说法是服务端原生文件理解。超过 Files API 限制后的采样模式仍可能漏掉只出现几秒的画面细节。

## 开发与致谢

这个项目主要由 Codex 协助研究、编写、测试和发布审计，并由项目维护者做最终取舍。

它建立在以下技术之上：

- DeepSeek Harness 的 bundle、tool、client slot、user question 和 ACP subagent 接口。
- xAI 官方 Grok Build CLI / ACP，以及 xAI 公共 API。
- ffmpeg / ffprobe。
- `lsjspl/dsh-plugin-grok2api-media-tool`（MIT）提供的 DSH 同源媒体路由和 toolview 思路。

在此基础上独立完成并优化了：原始视频文件模式、原声音轨优先、带时间戳和说话人的 STT 回退、持久 HMAC capability URL、HTTP Range、原生音频卡、长视频分段流水线、上传授权、大小限制、符号链接防护、远端/本地临时文件清理、重启持久化和发布版合规分层。

本项目是非官方社区项目，不受 xAI 或 DeepSeek 背书。“Grok”仅用于准确说明兼容的官方服务。
