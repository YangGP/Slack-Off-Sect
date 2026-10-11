# 摸鱼宗门 · Slack Off Sect

用 Vue 3 + Vite（纯 JavaScript）实现的修仙宗门挂机放置游戏，参考猫国的资源池、劳动力、叠加建筑与研究加工体系。

**在线试玩**：[摸鱼宗门](https://YangGP.github.io/Slack-Off-Sect/)。当前版本 **v0.3 · 渡劫突破大更新**；页面右下角可查看更新日志，版本记录由 src/data/changelog.js 维护。

## 开发与检查

~~~bash
npm install
npm run dev          # 开发预览 http://127.0.0.1:5273
npm run check        # 编码、引擎、SSR、DOM检查
npm run build        # 生产构建到 dist/
npm run preview      # 预览构建结果
npm run docs:tables  # 从数据文件重新生成全量表
npm run clean        # 删除构建、测试与审计产物
~~~

## 玩法

开局吸取天地灵气，建设聚灵阵，再以80灵气建首间茅屋。弟子有空房时自动前来，分配到阵徒、樵夫、矿工、采药人、悟道者和香使，取得原料与灵机，再推进研究、加工、营造扩仓和破境。首屋之后需要灵木；采矿场开放矿石供给，点石成灵以矿石和灵气制作灵石。

宜居度管理人口负担：负值全局减产，富余增产，最高增减50%；拥挤时弟子岗位减半，严重拥挤可能流失并暂停收徒。居所营造补足已入住配套，生活建筑、工艺和法宝提供富余宜居度，前期以10%～20%增产为目标，中后期可达到50%。

修真研究灵气、材料与经营，技艺和法宝提供增益。符文是技术，灵木和金属是载体；金丹发展阵基与玄钢，元婴发展灵液、灵晶与混灵土，后续以玄铁混灵土、秘银、玄金和晶银营造高阶设施。炼制页管理批量制作、自动加工及库存目标，左栏可自选快捷配方。

破境按概率结算，各目标境界可选不同的护道材料与香火祈愿，失败投料不退回。炼虚起冲关失败可能退境或身死重开；渡劫基础成功率10%，满配60%。身死保留已有永久积累，本次仙缘收益减半。

带维护费的设施可以停用，缺料时收益按实际供给缩放；分灵、偏极与湮灭的进料和出料随全局倍率同步提速。建筑成本指数增长，可拆除返还一半材料；法宝可重复祭炼。心有灵犀开放自动加工、优先配方与逐项材料保留。突破主材料分四档：筑基至元婴用丹药，化神至合体用灵液与灵晶，大乘用灵气分子，渡劫用飞升阵印。化神起可转世取得永久仙缘，大乘通过湮灭产线固结稳定的飞升阵印，渡劫可飞升并取得道果；首颗道果永久开放重修自动加工与按仓储比例保留。成就保留行为记录，当前不提供产出奖励。

主循环与离线补算共用引擎。设置页支持下载和导入存档文件；存档位于浏览器 localStorage，按同源隔离。

## 文档

| 文档 | 用途 |
| --- | --- |
| [DESIGN](docs/DESIGN.md) | 当前系统规则、结算公式与存档 |
| [ENGINEERING](docs/ENGINEERING.md) | 工程分层、交互约定、扩展与工具命令 |
| [TABLES](docs/TABLES.md) | 从源码生成的全部条目、造价、前置与效果 |
| [RESEARCH](docs/RESEARCH.md) | 研究结构、依赖原则与评估边界 |
| [CRAFT-PROGRESSION](docs/CRAFT-PROGRESSION.md) | 符文载体、晶核阵、防护分工与后期建材 |
| [HABITABILITY](docs/HABITABILITY.md) | 宜居度公式、风险与供给 |
| [BALANCE](docs/BALANCE.md) | 平衡改动及历史审计结果 |
| [BREAKTHROUGH-PACING](docs/BREAKTHROUGH-PACING.md) | 渡劫突破对重试、重修与游戏时间的影响 |
| [ROADMAP](docs/ROADMAP.md) | 尚未实施、待评估的方向 |
| [SPIRIT-ENERGY](docs/SPIRIT-ENERGY.md) | 灵子与灵能场世界观，区分设定和实现 |
| [MIDGAME-EVENTS](docs/MIDGAME-EVENTS.md) | 已实现药圃防务与后续事务草案 |
| [DISCIPLE-PROGRESSION](docs/DISCIPLE-PROGRESSION.md) | 尚未实施的个体养成草案 |

现行数值只在源码和生成表维护，历史结果集中在平衡账本；规则文档不复制完整条目表。

## 目录与分析工具

src/data/ 定义资源、建筑、研究与配方；src/game/ 负责规则、状态、存档和格式化；src/components/ 与 src/styles/ 负责界面。tools/ 包含引擎、渲染与DOM检查，及共用 player-bot 的节奏和资源审计。

~~~bash
npm run audit -- stone 8                   # 资源流量与容量
npm run audit -- stone 8 --craft=50        # 临时改变点石成灵成本
npm run audit -- qi 8 --prod=spiritField:qi:0.1
npm run audit:economy                      # 成品容量、基础需求与去向
npm run audit:crafts -- 24 0               # 加工链与边际增益
npm run audit:buildings                    # 前置、来源与容量可达性
npm run audit:pacing -- 72 0 0 0           # 首次生产、建设与各境耗时
npm run audit:breakthrough -- aided 2 72   # 满配护道的真实引擎节奏样本
npm run audit:breakthrough-risk           # 退境、身死与重试次数的数学模型
npm run balance -- 24 0                    # 固定时长的资源快照
npm run balance:events -- 24               # 固定种子事件对照
npm run balance:visits -- 24               # 持续操作与间歇上线
~~~

模拟结果依赖策略、操作频率和初始永久加成，不能当成真实玩家的通关时间。工具参数与统计口径见工程文档。

## 控制台作弊

在游戏页面按 F12 打开浏览器开发者工具的 Console，使用以下命令：

```js
CHEAT.add('灵石', 100000)       // 增加资源，支持中文名称或资源 id
CHEAT.add('qi', 100000)         // 增加灵气
CHEAT.set('灵机', 50000)        // 直接设置库存（可以设为 0）
CHEAT.all(1000000)             // 每种资源增加一百万
CHEAT.clear('灵石')            // 清空单种资源，也支持资源 id
CHEAT.clear()                  // 清空普通库存，保留仙缘与道果
CHEAT.restore()                // 恢复最近一次清空前的完整存档
console.table(CHEAT.list())    // 查看所有资源 id、名称、库存和仓储
CHEAT.help()                  // 查看帮助
```

作弊允许库存超过仓储，立即更新显示与历史峰值并保存；正常生产仍受仓储限制。数量接受非负有限数字，整件资源向下取整。执行资源命令也会开启本次页面的调试入口；刷新后调试入口恢复隐藏，已修改的资源保留。

清空命令会先将完整存档备份到独立存储槽，自动存档不会覆盖它，刷新后仍可用 `CHEAT.restore()` 回退到清空前。清空本身保留境界、建筑、修真、弟子、历史峰值与永久进度；灵气清零后继续运行仍可能导致断粮。旧版清空没有这份备份，无法用新命令恢复旧操作。

本地存档读取失败时，游戏推进和保存会暂停，页面显示持续错误提示，避免新开局覆盖原数据；成功导入有效备份后恢复运行。

## 部署与产物

推送 main 后，GitHub Actions 先检查，再构建发布到 Pages。首次在仓库 Settings → Pages 中选择 GitHub Actions；流程见 .github/workflows/deploy-pages.yml。Vite使用相对路径，可在子目录部署。

npm run clean 清理 dist/、dist-ssr/、.smoke*/、.early/ 和 .vite/。本地依赖 node_modules/、源码和正式数据表保留。导出的存档由用户选择保管，清理脚本不扫描存档文件。

## 许可

[MIT](LICENSE) © 2026 YangGP。数据与文案为本项目原创；参考 [Kittens Game](https://github.com/nuclear-unicorn/kittensgame) 的玩法，未使用其代码或素材。
