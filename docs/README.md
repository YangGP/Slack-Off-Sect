# 文档导航

整理：2026-10-16。先读当前规则，再按系统查专题；未完成方案单独列出。

## 当前规则与开发

| 文档 | 维护范围 |
| --- | --- |
| [DESIGN](DESIGN.md) | 游戏总览、跨系统规则、结算与存档 |
| [ENGINEERING](ENGINEERING.md) | 工程分层、接口、交互约定、验证与审计命令 |
| [TABLES](TABLES.md) | 源码生成的完整条目、费用、前置与效果；用 `npm run docs:tables` 更新 |
| [RESEARCH](RESEARCH.md) | 研究分组、依赖原则、能力递进与评估边界 |
| [CRAFT-PROGRESSION](CRAFT-PROGRESSION.md) | 制作、自动工业、符文载体、防护及后期建材 |
| [KNOWLEDGE-CRAFTS](KNOWLEDGE-CRAFTS.md) | 已实现的道札→道论→阵图加工、仓储、科研及工程消费 |
| [HABITABILITY](HABITABILITY.md) | 宜居度公式、人口风险与供给 |
| [DISCIPLE-PROGRESSION](DISCIPLE-PROGRESSION.md) | 已实现的个体成长、突破、管理、传功与护道，以及待完善问题 |
| [DISCIPLE-TALENTS](DISCIPLE-TALENTS.md) | 已实现的天赋获取、效果、等级成长与存档契约 |

## 设定与工作方案

这些文档同时包含设定、已实施部分和未实施方案，以各节状态为准。

| 文档 | 维护范围与状态 |
| --- | --- |
| [ROADMAP](ROADMAP.md) | 待实施项总览，区分已策划、讨论稿、待校准及暂缓项；已完成内容不再作为待办 |
| [PACING-AUDIT](PACING-AUDIT.md) | 2026-10-17突破优先实测；严格节省、产能投资及护道路线的逐境时间与瓶颈 |
| [BUILDING-PRICE-COMPARISON](BUILDING-PRICE-COMPARISON.md) | 猫国建筑基础价格、涨价率与扩建回报对照；科研、高档住宅与仓储的待测价格建议 |
| [RESEARCH-CRAFT-PRICE-COMPARISON](RESEARCH-CRAFT-PRICE-COMPARISON.md) | 科研与合成基线对照；第6节为已实施的建材、灵机与科研预算试调及验证 |
| [MATERIAL-RESEARCH](MATERIAL-RESEARCH.md) | 丹道／香火／土木研究已实施，保留设计依据与待校准事项 |
| [SPIRIT-ENERGY](SPIRIT-ENERGY.md) | 灵子、灵能与香火因果的世界观；仙灵力与粒子供能已实施 |
| [BEAST-SYSTEM](BEAST-SYSTEM.md) | 山麓猎杀已实现；深山、禁地与来袭关联等仍待扩展 |
| [MIDGAME-EVENTS](MIDGAME-EVENTS.md) | 药圃防务已实现；散修、邻宗与长期准备能力仍为草案 |
| [炼虚后变更文档](炼虚后变更文档.md) | 后期供能与仙灵力的待测与校准清单（变更 5、6 已实施） |

## 维护原则

- 源码与生成表维护完整数值；规则专题只保留必要示例，不另建完整手写数据表。
- 跨系统行为写入 DESIGN；系统细节写入对应专题，其他文档通过链接引用。
- ROADMAP 记录未完成工作；已实施部分转为专题背景，不继续列作待开发项。
- 过时规则、已完成实施清单与旧测量报告直接删除，不保留归档或备份；同步修复引用。TABLES 从源码生成。
