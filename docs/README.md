# 文档导航

更新：2026-10-17，对照v0.384。了解当前游戏先读DESIGN，查待开发项读ROADMAP，查完整参数读TABLES。研究、工艺、弟子等专题分别维护细节，避免同一状态或费用多处漂移。

## 当前规则与工程

| 文档 | 维护范围 |
| --- | --- |
| [DESIGN](DESIGN.md) | 游戏总览、跨系统规则、结算和存档 |
| [ENGINEERING](ENGINEERING.md) | 工程分层、数值类型、交互约定、工具与部署 |
| [TABLES](TABLES.md) | 源码生成的完整条目、费用、前置和效果；数据变化时用 `npm run docs:tables` 更新 |
| [RESEARCH](RESEARCH.md) | 研究分组、依赖与能力递进原则 |
| [CRAFT-PROGRESSION](CRAFT-PROGRESSION.md) | 手动／自动加工、动力冷却、符文、防护、建材，以及道札→道论→阵图知识链 |
| [MATERIAL-RESEARCH](MATERIAL-RESEARCH.md) | 已实现的丹道、香火与土木研究，兼容边界和待校准项 |
| [HABITABILITY](HABITABILITY.md) | 宜居度、人口风险与供给 |
| [DISCIPLE-PROGRESSION](DISCIPLE-PROGRESSION.md) | 个体成长、传功、护道、招募与尚未实现的自动培养方案 |
| [DISCIPLE-TALENTS](DISCIPLE-TALENTS.md) | 天赋获取、效果、等级与存档契约 |

## 开发方向与系统扩展

| 文档 | 状态与范围 |
| --- | --- |
| [ROADMAP](ROADMAP.md) | 待办与优先级的统一入口；D2待校准，D7香火长期成长已实现、长期平衡待验证，D5＋D9／D8待设计或实施，D3暂缓 |
| [SPIRIT-ENERGY](SPIRIT-ENERGY.md) | 世界观、已实现的粒子／仙灵力供能及后续校准和用途；设定示例不自动等于游戏机制 |
| [BEAST-SYSTEM](BEAST-SYSTEM.md) | 山麓闭环已实现，深山、禁地与生态来袭联动待扩展 |
| [MIDGAME-EVENTS](MIDGAME-EVENTS.md) | 药圃防务已实现，散修、邻宗和长期准备仍为草案 |

## 测量与对照参考

| 文档 | 阅读边界 |
| --- | --- |
| [PACING-AUDIT](PACING-AUDIT.md) | 2026-10-17修正备料策略后的逐境测量，截至化神；当前完整首飞尚未重测 |
| [BUILDING-PRICE-COMPARISON](BUILDING-PRICE-COMPARISON.md) | 建筑报价与扩张回报分析；候选涨价不等于现价 |
| [RESEARCH-CRAFT-PRICE-COMPARISON](RESEARCH-CRAFT-PRICE-COMPARISON.md) | 科研、材料与专精分析；早期试调值已部分由知识费用替换 |
| [KITTENS-BALANCE-COMPARISON](KITTENS-BALANCE-COMPARISON.md) | 早期猫国结构对照与D编号依据，旧数值和诊断以当前规则及路线图修正为准 |
| [KITTENS-RESEARCH-REFERENCE](KITTENS-RESEARCH-REFERENCE.md) | 猫国研究设计参考，不是本作现行规则 |

## 维护原则

- 完整数值以源码和生成表为准，专题只保留必要示例与约束；数据或生成说明变化时同步更新TABLES。
- 跨系统规则写入DESIGN，专题维护系统细节，未完成状态和处理顺序统一放在ROADMAP。
- 明确区分已实现、待校准、未定案和暂缓，不把已完成方案继续列为开发任务。
- 现行规则纠错直接更新；已完成实施清单与旧测量报告按 .ds 归档约定保留并注明基线，不删除正式任务记录；合并时同步修复引用，保留仍有效的兼容契约。
- 测量需注明版本、策略、种子和在线／离线口径，原有通过记录不代表本轮重新执行。验证命令是否运行服从项目协作约定与用户授权。
