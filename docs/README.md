# 文档导航

整理：2026-10-14。先读当前规则，再按系统查专题；未完成方案单独列出。

## 当前规则与开发

| 文档 | 维护范围 |
| --- | --- |
| [DESIGN](DESIGN.md) | 游戏总览、跨系统规则、结算与存档 |
| [ENGINEERING](ENGINEERING.md) | 工程分层、接口、交互约定、验证与审计命令 |
| [TABLES](TABLES.md) | 源码生成的完整条目、费用、前置与效果；用 `npm run docs:tables` 更新 |
| [RESEARCH](RESEARCH.md) | 研究分组、依赖原则、能力递进与评估边界 |
| [CRAFT-PROGRESSION](CRAFT-PROGRESSION.md) | 制作、自动工业、符文载体、防护及后期建材 |
| [HABITABILITY](HABITABILITY.md) | 宜居度公式、人口风险与供给 |
| [DISCIPLE-PROGRESSION](DISCIPLE-PROGRESSION.md) | 已实现的个体成长、突破、管理、传功与护道，以及待完善问题 |
| [DISCIPLE-TALENTS](DISCIPLE-TALENTS.md) | 已实现的天赋获取、效果、等级成长与存档契约 |

## 设定与工作方案

这些文档同时包含设定、已实施部分和未实施方案，以各节状态为准。

| 文档 | 维护范围与状态 |
| --- | --- |
| [ROADMAP](ROADMAP.md) | 后续工作入口；具体方案与参数引用专题，避免重复维护 |
| [SPIRIT-ENERGY](SPIRIT-ENERGY.md) | 灵子、灵能与香火因果的世界观；仙灵力发现与基础材料定位已定，尚未实施 |
| [BEAST-SYSTEM](BEAST-SYSTEM.md) | 山麓猎杀已实现；深山、禁地与来袭关联等仍待扩展 |
| [MIDGAME-EVENTS](MIDGAME-EVENTS.md) | 药圃防务已实现；散修、邻宗与长期准备能力仍为草案 |
| [炼虚后变更文档](炼虚后变更文档.md) | 修真应用与供能待测清单；仙灵力、灵能反应堆未实施 |

## 维护原则

- 源码与生成表维护完整数值；规则专题只保留必要示例，不另建完整手写数据表。
- 跨系统行为写入 DESIGN；系统细节写入对应专题，其他文档通过链接引用。
- ROADMAP 记录未完成工作；已实施部分转为专题背景，不继续列作待开发项。
- 过时规则、已完成实施清单与旧测量报告直接删除，不保留归档或备份；同步修复引用。TABLES 从源码生成。
