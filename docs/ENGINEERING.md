# 工程约定与工具

更新：2026-10-11。游戏规则见 [DESIGN.md](DESIGN.md)，研究结构见 [RESEARCH.md](RESEARCH.md)，完整数值见 [TABLES.md](TABLES.md)。

v0.34：玩家与模拟脚本的手动制作通过`craft`即时结算；`craftBatch`按当前材料和仓容计算份数，再立即制作。不生成订单，不改变自动计时；自动加工仍受工位、供能、冷却、库存目标与材料保留量约束。`requestCraft`及订单管理只保留为旧版兼容与回归验证接口，旧存档的`craftOrders`继续加工，可暂停、恢复或取消，重修时清空。`processingBottleneck`复用加工计划和统一资源流量显示供料缓冲；`progression-diagnostics.mjs`输出破境缺料、仓容缺口、生产设施与未解锁扩仓前置。

推进模拟可用`npm run balance -- 72 0 12345`固定种子跑自然路线，或`npm run balance -- 72 0 12345 industry`隔离破境失败以验证产业链；后者不用于报告自然通关速度。`npm run check:industry`运行可控负荷对照，供料及大仓储为测试夹具，不是自然开局。

v0.32：`processingPlan`统一计算基础工位、供能和冷却分配，`runIndustrialCraft`按下一次出货或动力耗尽时刻推进。动力连续扣费不写入`expense`，只写入自动加工流量显示，避免tick重复收费；常规维护费仍由供给计算及tick支付。动力保留量另加可开工配方的一份同种原料。偏极阵在维护供给迭代中按两侧剩余仓容与下游耗料取最低负荷。`processingModes`设置通过专用动作验证与归一化，保存偏好但研究门槛每世重判。

## 分层与数据流

| 位置 | 职责 |
| --- | --- |
| src/data/*.js | 数据定义、配置与相关纯辅助函数 |
| src/game/engine.js | 重算、生产、购买、制作、研究、事件、离线与重置 |
| src/game/state.js、save.js | 初始状态、归一化、序列化与存档 |
| src/game/store.js | Vue单例、主循环、actions和临时UI状态 |
| src/game/format.js、pricing.js、effectsText.js | 数量、价格与效果的统一展示 |
| src/components/*.vue、App.vue | 展示与交互，通过actions改变状态 |
| src/styles/main.css | 平面文字表格与响应式布局 |

组件调用actions，由引擎修改state并重算derived，Vue更新展示。规则计算集中在引擎和数据辅助函数；derived不保存。引擎不依赖Vue或DOM，测试通过Vite SSR解析@别名后在Node运行。

| 派生字段 | 含义 |
| --- | --- |
| max、maxDisciples | 资源与居所容量 |
| rates、net、expense、sources、expenseSources | 实际结算的每秒速率与来源 |
| habitability、habitabilityBonus、housingHabitability | 宜居度及定额、入住来源 |
| habitabilityMult、discipleMult、leaveChance | 全局增减产、岗位拥挤倍率与离开概率 |
| globalMult、realmMult、karmaMult、ratio、jobRatio、bonus | 倍率与来源拆分 |
| buildingSupply | 带维护费设施的运行比例 |
| craftBonus、craftBonusByResource、craftSpeed | 制作收益及自动节拍 |
| industrial、processingCapacity、craftSpeedByRecipe、craftCostReduction | 金丹工业模式、设备容量、加工效率与节料 |
| disasterGuard、disasterGuardByResource | 通用与指定资源防灾 |
| autoCraftUnlocked、autoCondenseUnlocked、craftTargetsUnlocked、daoAutomation | 自动加工、凝石、库存目标与道果统筹 |

口粮和维护按expense结算，自动加工逐份扣料。展示收支统一调用resourceFlow计入当前自动耗料，不能将它重复并入expense。来源明细相加应与对应速率一致。

工业工位与配方映射在data/industry.js维护。processingPlan只读取状态，按可运行配方及分配权重分配设备容量；runIndustrialCraft推进至下一份完成时刻后重分配。craftCost是所有实际制作支付及展示费用的统一入口。craftTimers.t在工业模式记录基础加工秒数；industryVersion=1避免旧高速计时重复迁移。settings.craftWeights随偏好保留，normalizeState过滤未知配方、非整数及范围外权重。

## 展示与交互

白底、细灰线、唯一一层主内容边框；左列资源与快捷炼制，中列标签面板，右列天象、历法、累计和纪事。窄屏进入内部滚动。数字使用tabular-nums，不用卡片、渐变、阴影或装饰图标。

- 建筑按BUILDING_DISPLAY_ORDER固定排列，筛选不改变相对顺序；核心入口是吸气与催生灵木。
- 顶栏显示弟子、宜居度点数、灵气收支和全局倍率；宜居度不是百分比。
- HoverTip统一悬停展示；内容按标题、描述、价格、效果、维护等分节，一种资源一行。按实际视口限制尺寸和位置，长内容可滚动。
- 价格由pricing.costLabel统一格式化：足够时只列需求，不足时列现有、需要和等待时间。买不起或条件未达时禁用，购买项悬停高亮左栏材料。
- 连续资源存量用fmtResource两位小数；整件存量取整。需求用fmtCost向上，持有量用fmtStock向下，累计或事件数值用fmtAmount；每秒速率和每份收益保留必要精度。
- 带维护费建筑才可停用；仓储和人口效果按已建数量保留，运行效果按有效供给计算。
- 完整炼制和左栏快捷共用CraftPanel，自动选择、库存与制作动作同步；快捷数量不限，偏好随存档及重置保留。
- 存档通过下载和选择本地文件导入。危险操作按现有交互确认，普通操作写纪事与状态提示。

玩家更新日志由src/data/changelog.js维护，在数组开头追加版本、日期、标题和变化，CURRENT_VERSION取首条，同时更新README。界面迭代号、包SemVer和存档结构版本分别维护；不因修改玩家日志而自动改锁文件。

## 验证命令

| 命令 | 覆盖 |
| --- | --- |
| npm run check:encoding | BOM与文本换行 |
| npm run smoke | 数据、前置、供料、产出、实际操作、存档与离线 |
| npm run check:render | Vue SSR模板与警告 |
| npm run check:dom | jsdom真实挂载、主循环、更新日志与交互 |
| npm run check:tools | 审计参数、临时修改还原与多路线统计 |
| npm run check | 上述检查 |
| npm run build | 生产构建 |
| npm run docs:tables | 重新生成全量数据表 |
| npm run clean | 清除构建、测试与审计目录 |

断言数量以当次输出为准。jsdom不能替代真实浏览器布局、触控与视觉验证。测试和审计源码保留，运行产物可随时删除再生成。

## 分析工具及口径

| 命令 | 用途与参数 |
| --- | --- |
| npm run balance -- 24 0 | 固定小时数、初始仙缘；无事件、每5秒决策，资源快照 |
| npm run audit -- stone 8 | 单资源流量、贴顶时间、门槛与去向；关闭随机事件 |
| npm run audit:economy -- 6400 | 整件资源需求与去向；可选假设通用仓储，默认0；不含专属容量及仙缘倍率 |
| npm run audit:crafts -- 24 0 | 加工链及指定研究边际提升；小时数、初始仙缘 |
| npm run audit:buildings | 真实前置、材料来源和仓储自举；不估算耗时 |
| npm run audit:pacing -- 72 0 0 0 | 小时数、仙缘、祭炼等级、事件种子；0关闭事件，非0可复现 |
| npm run audit:pacing -- 72 0 0 1 rush 0 labor | 后续参数为优先破境、道果数、主动分工 |
| npm run balance:events -- 24 0 | 小时数、仙缘；无事件及固定种子对照 |
| npm run balance:visits -- 24 | 持续操作、15分钟／1小时／每天三次上线 |

资源审计临时参数：--craft=50改点石成灵的灵气用量，--cap=250改目标基础容量，--prod=spiritField:qi:0.1覆盖聚灵阵每座灵气产出，--realm=0.5改目标资源破境成本，--upcost=2改目标资源研究成本，--job=0.6改目标资源岗位基础产出（含矿工附产），--autocraft临时开放自动加工。修改只影响本次模拟，异常时也应还原，不写源码。

累计持续产能按速率积分，包含满仓被截断的部分，排除制作、点击和事件入库；制作产量另列实际整件入库。独立加工产能是单条配方供料上界，不能视为共享材料下所有配方的并发收入。参照玩家用于比较与找瓶颈，结果不代表真人最优路线。

## 扩展与维护

1. 新资源加入RESOURCES，设置基础容量、整数规则与storageWeight，并提供来源和去向。
2. 新建筑加入BUILDINGS和分组、显示顺序；成本与needs共同生效。需要模拟采购时同步player-bot的优先表。
3. 原理、配方与专业精研加入CULTIVATION；通用技艺和kind:treasure法宝加入TECHNIQUES。法宝应有明确研究前置与祭炼成本。
4. 配方加入CRAFTS，声明产物、用料、节拍与完整前置。成就写check纯函数，当前奖励为0。境界费用需能由上游产业与仓容承接。
5. 新效果同时接入引擎累加／缩放、derived与effectsText的描述和合计缩放；必要时同步生成表。仓储按已建数，宜居度等运行效果按有效供给，入住配套按实际覆盖人口。
6. 新事件显式填写level，EVENT_LEVELS与自身境界取交集；事件预览与实扣共用规则，固定支付不应误用灾损减免。纪事保留eventId、eventLevel。

改数值后生成TABLES，改规则后更新DESIGN及相关专题；平衡测量在BALANCE记录版本、仙缘／道果、事件、决策频率和策略；未决定内容放ROADMAP。避免在多个手写表维护同一份完整造价。

## 清理与部署

clean脚本只处理项目根目录的dist、dist-ssr、.smoke*、.early与.vite，删除前确认实际路径仍在项目内，拒绝目录链接。node_modules、源码、正式文档和用户存档不作为产物清理。旧网络驱动器shim命令已移除，日常运行使用npm脚本。

GitHub Pages流程在.github/workflows/deploy-pages.yml：main推送后先检查，再构建发布。vite.config.js使用相对base，新增资源避免绝对路径与location.pathname依赖，支持子目录部署。
