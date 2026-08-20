# DSH Grok Subscription v0.3.0

DSH 自己把图片附件做好了，这个插件就应该少做一点。

v0.3.0 对齐 DeepSeek Harness `0.1.0-rc.8`：图片粘贴、拖放、持久存储和历史预览全部交给 DSH 原生能力，插件不再携带重复的图片界面或存储层。它继续专注两件事：通过官方 Grok Build CLI / ACP 使用已经登录的 Grok 订阅，以及补上 DSH 尚未原生支持的音频、视频和长视频工作流。

主要变化：

- 最低版本升级到 DSH `0.1.0-rc.8`。
- 浏览器依赖从 runtime、conversation、slots 三条边简化为官方 `ui-tool` 表面。
- 删除没有参与实际加载的嵌套 ACP 包装包和重复 bundle manifest。
- 保留音视频播放器、TTS/STT、原文件优先长视频理解，因为 rc.8 的核心附件目前仍只支持 PNG/JPEG/WebP/GIF。
- 保留两个 Grok ACP 通道：默认拒绝权限的通用子代理，以及只开放 Imagine 媒体工具的通道。

需要说明：DSH 输入框中的图片属于当前主会话，不会自动跨进程继承给 Grok ACP 子代理。要让 Grok 处理工作区中的图片，请在委派任务中给出本地文件路径。订阅认证仍完全由官方 `grok` CLI 保管；TTS、STT 和原文件视频分析仍需要用户自己的 `XAI_API_KEY`。

本项目主要由 Codex 协助研究、实现、测试和发布审计，是非官方社区项目，不受 xAI 或 DeepSeek 背书。
