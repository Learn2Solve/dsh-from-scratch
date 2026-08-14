# DeepSeek Harness from Scratch

在浏览器里从零手搓一个 agent harness。九章 + 一个横向对照附录，每章一个能跑的 demo。

**在线阅读：** https://learn2solve.github.io/dsh-from-scratch/

2026 年 8 月 13 日 DeepSeek 开源了 [dsh](https://github.com/deepseek-ai/deepseek-harness)。
与其读它的两百个包，不如把它重造一遍。这本书对照的版本是 `0.1.0-rc.6`，提交 `47f943859b`。

## 内容

| | 章节 | 造出什么 |
|---|---|---|
| 01 | 最小的 agent loop | `miniLoop()` |
| 02 | Context 与 Service | Proxy 服务反射 + inject |
| 03 | Fiber 与 effect | 生命周期 + 反序回收 |
| 04 | 事件的五种模式 | waterfall dispatcher |
| 05 | 会话日志与表面投影 | `SessionLog` / `deriveMessages()` |
| 06 | 工具流水线与能力接缝 | `ctx.tools` + provider 热切换 |
| 07 | YAML 组合 | 分层补丁 + preset |
| 08 | Code Mode | `run_code` + 生成 SDK |
| 09 | 自我改造 | `cordis_define` / `cordis_run` |
| 附录 | 横向对照 | Pi、omp、Claude Code、Codex、OpenCode、dsh 逐机制对照 |

## 本地运行

纯静态，无构建、无依赖。直接打开 `index.html` 即可，或起个本地服务：

```sh
python3 -m http.server 4173
```

## 关于内容

书里的架构结论来自读源码，舆论与安全部分来自公开一手材料（HN 主线程、GitHub Discussions
上的两份第三方安全审计、各平台公开发言），社交媒体观点一律点名出处、按引述处理。

这本书比的是架构，不是效果。没有人做过同模型同 prompt 的 harness 横向评测，本书也没有。

第三方学习材料，与 DeepSeek AI 无关。
