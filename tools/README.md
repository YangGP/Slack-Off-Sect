# 工具维护说明

日常使用 `package.json` 中的 npm 命令。`node tools/run.mjs --list` 列出需要 Vite SSR 构建的入口；运行器统一构建、转发参数和退出码，并用独立进程隔离临时数值修改。不要复制新的 `vite build && node` 命令。

## 检查

| 命令 | 职责 |
| --- | --- |
| `npm run check` | 编码、工具、引擎、SSR、真实启动、DOM 完整检查 |
| `npm run smoke` | 引擎检查；入口保持简短，用例按功能位于 [smoke/](smoke/README.md) |
| `npm run check:render` | SSR 模板及控制台警告 |
| `npm run check:startup` | 真实 main 入口、初始化、热更新与循环生命周期 |
| `npm run check:dom` | 浏览器环境中的交互；用例位于 [dom/](dom/README.md) |
| `npm run check:tools` | 审计输入、数据还原、重复运行、报价和风险模型回归 |
| `npm run check:industry` | 工业供料、共享冷却和粒子配对负载实验 |
| `npm run check:encoding` | 项目文本 BOM / 换行检查；跳过产物、外部参考项目及目录链接 |

`architecture-check`、`industry-check`、`disciple-check`、`talent-check`、`auto-talent-check`、`power-check`、`offline-check`、`offline-async-check` 是被 smoke 调用的专项检查，导入时不自行执行。不要为同一组断言另开一份副本。

离线相关的分工：`offline-check` 管「同输入可复现、分段数与离线时长无关、库存与加工不越界、短窗口仍与逐秒参考一致」；`offline-async-check` 管「同步/异步一致、批次预算不改变结果、取消与异常不写回」；长离线的**收益不必与逐秒参考相同**（有界近似的既定口径），只断言上界与不变量。

## 审计与基准

| 命令示例 | 用途 |
| --- | --- |
| `npm run balance -- 24 0` | 参照玩家资源快照；小时数、仙缘，可继续指定种子和工业策略 |
| `npm run audit -- stone 8 --cap=250` | 单资源流量、门槛与临时数值实验；实现复用 `audit-lib.mjs` |
| `npm run audit:economy -- 6400` | 整件资源去向与假设仓容 |
| `npm run audit:save -- "存档路径.txt"` | 只读重算存档：仓容、产出、超限、库房报价与破境需求 |
| `npm run audit:crafts -- 24 0` | 加工链与指定研究的边际收益 |
| `npm run audit:disciples -- 24` | 不同弟子培养策略对照 |
| `npm run audit:buildings -- 5` | 指定境界内的建筑来源及仓容闭包；省略参数检查全境界 |
| `npm run audit:sources` | 研究露出层次与材料来源层次；用于发现前后置循环 |
| `npm run audit:power` | 固定阶段的电力供需和完整供应链 |
| `npm run audit:pacing -- 72 0 0 1` | 小时数、仙缘、祭炼等级、事件种子；后续参数见 ENGINEERING |
| `npm run audit:breakthrough -- power 12345 72` | 固定策略下的真实准备成本和强制突破结果实验 |
| `npm run audit:breakthrough-risk` | 固定概率的有限状态模型，含倒退、死亡重置和护道减免 |
| `npm run audit:review -- 72 12345 natural on` | 综合进度报告；小时数、种子、guaranteed/natural、自动分工 on/off |
| `npm run balance:events -- 24 0` | 事件种子与应对策略对照 |
| `npm run balance:visits -- 24` | 固定开局及随机流，不同上线频率对照 |
| `npm run bench:craft` | Vue 响应式状态下批量制作性能及扣料一致性 |
| `npm run bench:offline -- "存档路径.txt" 28800 .smoke-offline-benchmark/result.json async` | 离线基准；首个参数可换成 `--fixture` 使用长离线专项夹具（72 名弟子、多配方工业、凝灵诀与自动猎杀，刻意让工业与自动重复在每个分段都有活干）。模式 optimized/reference/async，输出快照可选，禁止覆盖输入存档 |
| `npm run docs:tables` | 从数据源码重新生成 TABLES |
| `npm run clean` | 清理已知构建目录，检查项目边界并拒绝目录链接 |

`bench:offline` 的 async 模式一批只跑一段，因此输出里的 `longestSegmentMs` 就是最长连续计算段；`segments`／`baseSegments`／`industryRounds`／`huntBatches` 证明计算量落在有界分段与有限轮数里，而不是移到了内部循环。没有真实存档时用 `--fixture` 即可复测同机耗时。

可达性闭包不估计耗时；独立加工能力不代表共享材料下的并发产量；固定概率风险模型不包含生产时间及转世增长。综合报告、资源审计和专项报告保留各自口径，不合并成一个混杂的模拟器。

## 公共实现

- `lib/checks.mjs`：smoke、SSR、DOM 共用断言统计和控制台捕获。
- `lib/browser-env.mjs`：DOM 和启动检查共用全局量安装／恢复，退出时释放环境。
- `lib/audit-context.mjs`：资源、加工链、上线频率审计使用固定开局、随机流和模拟时钟。
- `lib/save-report.mjs`、`lib/breakthrough-risk.mjs`：可直接回归验证的报告计算，CLI 只处理输入输出。
- `lib/offline-fixture.mjs`：长离线专项夹具，供离线检查与基准复用，不代表自然通关进度。
- `engine-fixture.mjs`：兼容人数式审计夹具；`player-bot.mjs` 共用采购策略；`disciple-training.mjs` 共用培养策略。
- `progression-reachability.mjs`、`progression-diagnostics.mjs`、`power-scenarios.mjs`：可达性、瓶颈与供能场景，供多个报告或检查复用。
- `dom-entry.js` / `vite.domcheck.config.js`、`startup-entry.js`：分别提供客户端 DOM 与真实 main 启动夹具，保留不同构建方式。

新增脚本应先明确属于检查、报告还是基准，优先扩展现有入口。SSR 入口在 `run.mjs` 白名单登记，再添加 npm 命令。构建不清空报告目录，避免重跑时丢失旧测量；产物由 `clean` 显式统一清除。历史审计文档中的旧命令仅记录当时的测量方式。
