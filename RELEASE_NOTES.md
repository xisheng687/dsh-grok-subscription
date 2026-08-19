# DSH Grok Subscription v0.2.0

这是一套把已登录的 Grok 订阅通过官方 Grok Build CLI / ACP 接进 DeepSeek Harness 的非官方社区插件。它让 Grok 可以在 DSH 中作为子代理处理任务、理解图片和调用 Imagine 工具，同时补上音视频消息卡和长视频工作流。OAuth 凭据仍由官方 CLI 保管，插件不读取、不复制。

v0.2.0 主要修正一件事：能交原视频时，就不应该先把它削成几张图和一段纯文字。

- `analyze_long_video` 现在默认使用 `auto`：MP4/MOV 不超过 50 MB 时，优先把完整原文件和原声音轨作为 xAI `input_file` 处理。
- 可选择 `original`，只接受完整原文件模式，不允许静默降级。
- 可选择 `sampled`，主动减少上传量。
- 原文件完成后立即请求删除，同时上传时设置 1 小时自动过期。
- 采样回退也升级了：小型 MP4/MKV 直接用原容器做 STT；其他输入使用 FLAC 分段，不再压成 48 kbps MP3。
- STT 结果现在保留词级时间戳、填充词和说话人编号，更适合会议、访谈和课程。
- 视频消息卡会明确显示本次使用的是“原始文件 + 原声音轨”还是采样回退。

需要讲清楚：Grok 订阅子代理通过官方 Grok Build CLI/ACP 使用。TTS、STT 和原始文件长视频理解是独立的 xAI API 能力，需要用户自己的 `XAI_API_KEY`，不属于订阅 OAuth 权限。xAI 开发者文档也没有承诺内部一定使用所谓“原生 video token”，因此本项目只把它叫作“原始视频文件模式”。

测试包括：完整文件 multipart 顺序、`input_file` 引用、远端删除、HTTP 415 自动回退、原 MP4 音轨直传 STT，以及 910 秒样本的两段 FLAC 原声转写时间轴。所有协议调用使用本地模拟 API；维护者机器没有打包或使用任何用户 API key。

项目主要由 Codex 协助研究、实现、测试和发布审计。完整第三方技术来源及自主优化说明见 README 与 `THIRD_PARTY_NOTICES.md`。

SHA-256: `f8e4b92e06182660e3011fb5a68700a18f37831fcf49f7cc9eefa2aae5777e05`
