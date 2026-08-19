# DSH Subscription Media Suite

很多 AI 工具“能生成文件”，但最后只在对话里丢下一串路径：音频不能直接听，视频不能拖进度，长视频更要手工拆开处理。这套 DSH 插件想解决的就是这点——不改 DeepSeek Harness 核心，也能让音视频在消息里真正可用。

它做的事情不花哨：

- 用官方 Grok Build CLI 的 ACP 接口，把订阅账号作为 DSH 子代理使用；插件不读取、不复制 OAuth 文件。
- 把本地 MP3、WAV、MP4、MOV、MKV、WebM 显示成可播放、可拖动、重启后仍能恢复的消息卡。
- 提供 TTS、STT，以及“抽帧 + 15 分钟分段转写 + 多模态汇总”的长视频理解流程。
- 上传音频或视频派生内容前明确询问；原长视频不会整段上传，临时帧和音频分析完成后删除。

## 已经实际跑过的测试

- 官方 Grok Build ACP 普通子代理与图片理解。
- Imagine 图片生成、视频生成链路。
- DSH 原生 `<audio>` / `<video>` 卡，页面刷新和 DSH 进程重启后仍可恢复。
- HTTP Range：正常分段 `206`、坏签名 `404`、越界请求 `416`。
- 96 秒视频：23 帧，正确识别红 → 绿 → 蓝和循环测试语音。
- 910 秒视频：成功跨过 15 分钟边界，生成 `[0:00]`、`[15:00]` 两段转写。
- 订阅开发环境中的 xAI TTS / STT 往返测试。

公开版对音频 API 和长视频综合使用用户自己的 `XAI_API_KEY`；订阅账号只走官方 `grok agent stdio`。这样做少一点“黑魔法”，但更适合公开分发，也不会冒充其他获得官方授权的客户端。

## 安装

要求：DeepSeek Harness `0.1.0-rc.7+`、Node.js `22.19+`、ffmpeg/ffprobe。订阅子代理还需要官方 `grok` CLI 已登录。

```bash
dsh plugin --profile web add https://github.com/xisheng687/dsh-subscription-media-suite/releases/download/v0.1.0/dsh-subscription-media-suite-0.1.0.tgz
NODE_USE_ENV_PROXY=1 dsh web
```

需要 TTS、STT 或长视频 API 综合时，在启动 DSH 前设置 `XAI_API_KEY`。仅播放本地音视频、或使用官方 CLI 订阅子代理，不需要 API key。

## 能力与边界

- `build-native`：官方 CLI 的只读优先子代理，默认拒绝 ACP 权限请求。
- `build-media`：只开放图片生成、编辑、图片转视频等媒体工具。
- `present_local_media`：本地音视频消息卡，不上传文件。
- `media_text_to_speech` / `media_speech_to_text`：xAI API 音频能力。
- `analyze_long_video`：30 分钟以内最多 24 帧，更长视频最多 48 帧；上限 12 小时 / 12 GiB。

长视频理解不是“把整个视频原样塞给模型”，而是工程化降采样。它适合会议、课程、演示和事件概要，不保证捕捉只出现几秒的细节。

## 开发与致谢

这个项目主要由 Codex 协助研究、编写、测试和发布审计，并由项目维护者做最终取舍。

它建立在以下技术之上：

- DeepSeek Harness 的 bundle、tool、client slot、user question 和 ACP subagent 接口。
- xAI 官方 Grok Build CLI / ACP，以及 xAI 公共 API。
- ffmpeg / ffprobe。
- `lsjspl/dsh-plugin-grok2api-media-tool`（MIT）提供的 DSH 同源媒体路由和 toolview 思路。

在此基础上独立完成并优化了：持久 HMAC capability URL、HTTP Range、原生音频卡、长视频分段流水线、上传授权、大小限制、符号链接防护、临时文件清理、重启持久化和发布版合规分层。

本项目是非官方社区项目，不受 xAI 或 DeepSeek 背书。“Grok”仅用于准确说明兼容的官方服务。
