# DSH Subscription Media Suite v0.1.0

AI 工具生成了音频或视频，聊天里却只剩下一串路径——这是这个小插件最想解决的问题。

首个公开版本提供：

- 通过官方 Grok Build ACP 进程使用订阅账号，OAuth 始终由官方 CLI 保管。
- 可播放、可拖动、重启后仍有效的 DSH 原生音频/视频消息卡。
- 使用自有 `XAI_API_KEY` 的 TTS、STT 与“抽帧 + 分段转写 + 汇总”长视频理解。
- 上传派生帧或音频前逐次询问；原长视频不会整体上传。

这不是官方产品，也没有试图包装成一个万能方案。长视频使用工程化采样，短暂细节可能漏掉；API 音频和视频综合需要用户自己的 API key。

项目主要由 Codex 协助研究、编写、测试与发布审计。它基于 DeepSeek Harness、官方 Grok Build CLI / ACP、xAI 公共 API、ffmpeg，并参考了 `lsjspl/dsh-plugin-grok2api-media-tool` 的 DSH 同源媒体路由与 toolview 思路；完整致谢和独立优化见仓库 README 与第三方声明。

发布包已在全新 DSH profile 中安装、启动、重启并回归媒体 Range；Gitleaks 和 TruffleHog 对最终解包产物均为 0 发现。详细记录见 `RELEASE_AUDIT.md`。

SHA-256: `575ca07dd8ac11d3f9c3e9d343b62a5d1e2177134990b61f41af2bbe69a9f101`
