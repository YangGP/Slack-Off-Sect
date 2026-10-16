# 工程约定与工具

可选模块由 `data/modules.js` 定义开关，`game/moduleRegistry.js` 接入初始化、存档、时间推进与停用清理，`modules/uiRegistry.js` 单独接入界面。目录项默认用 `module: '<id>'` 绑定单一模块；需要多个模块任一启用即生效时改用 `moduleAny: ['a', 'b']`，由 `isEntryEnabled` 统一判定（例如猎杀与外交共用的信符供给：执符使、猎杀营地与《山野猎法》）。猎杀数据与系统集中在 `modules/hunting/`，引擎不依赖 Vue 界面。停用模块读档时先验证并保留切片，再召回活动任务，保留历史和偏好；转世/飞升才重置本世切片。任务存档过滤异常结构与数值并重挂合法成员占用。

更新：2026-10-13。游戏规则见 [DESIGN.md](DESIGN.md)，研究结构见 [RESEARCH.md](RESEARCH.md)，完整数值见 [TABLES.md](TABLES.md)。

个人天赋配置在 `data/talents.js`，32条词条按修炼、岗位、突破类别互斥。`members[].talents`保存固定ID与Lv.1–Lv.3，`disciples.talentSeed`使用独立随机序列，`talentVersion:2`标记当前结构。旧档不补发、不自动升级，归一化保留合法身份与等级并清理异常；成功突破后先抽取新天赋、再按40%概率提升等级最低的原天赋。`cultivationRate`统一修炼天赋，`discipleBreakthroughPreview`统一个人百分点与每境10个百分点指导，真实成功后才抽取新天赋。岗位天赋只进入`discipleJobWeights`，口粮`discipleWeight`仍只含个人有效境界。管理页支持天赋与境界、灵根组合筛选，回归见`tools/talent-check.mjs`。完整规则见 [DISCIPLE-TALENTS.md](DISCIPLE-TALENTS.md)。手动培养见 `data/disciples.js` 的 `DISCIPLE_TRAINING`（传功）与 `DISCIPLE_AIDS`（个人护道），由研究节点 `mentorship` 解锁；传功开销按有效境界计入 `recompute` 的灵气出项、供给不足时整批暂停，个人护道在本次突破后清除，回归见 `tools/disciple-check.mjs`，规则见 [DISCIPLE-PROGRESSION.md](DISCIPLE-PROGRESSION.md) §2.1。

提示组件：所有tooltip统一使用`HoverTip`，不再使用`RuleTip`或原生`title`提示。组件负责正文外壳和标题：简单规则用`label`自动生成可聚焦的点状下划线入口；按钮与表格保留默认触发插槽，用`title`或`#heading`提供标题、`description`提供说明、`#tip`提供明细。所有内容共用`tip-desc`、`tip-section`、`tip-row`（左标签／右数值）及`tip-note`／`tip-flavor`（分隔线后的淡色左对齐备注），不在业务组件重复创建`tip-body`或`tip-title`。默认宽360px，复杂明细可指定宽度，均受视口约束；支持悬停、键盘聚焦、Escape关闭及触发器滚轮阅读，下拉框操作期间暂停提示。重复说明与开发信息从默认界面移除；实时数值、操作条件、缺料原因、身死总风险和读档覆盖提醒保留，重修确认流程不变。

弟子管理的五个原生下拉框通过`StableSelect`隔离父页高频刷新；筛选选项固定，人数在栏外显示。岗位选项仅在解锁集合改变时更新，集合未变则复用数组；子组件不使用原生`v-model`每帧同步值，避免操作期间被页面刷新重写。

建筑效果的资源条目由`describeEffects`和`describeJobEffects`携带`resource`标识，`BuildingButton`按`view.visibleResources`过滤每座效果；全局效果、职位开放和工位容量保留。过滤只影响展示，不改效果结算；合计仍按相同标签对应原始总效果。新增资源效果时沿用资源标识，避免按中文文案判断解锁。

`UpgradeTable`中已炼成法宝与可参悟技艺同用名称、花费、操作三列，等级和供能状态显示在名称旁；法宝不再重复出现在已参悟折叠里。tooltip当前效果按实际祭炼倍率与供能比例计算，下一等级预览按满供倍率计算，均使用`describeEffects`的结构化行，不拼成一段文案。`unlockRows`按每栋建筑、每个配方和每项参悟分行；列表摘要`unlockText`仍按分类合并。

tooltip条件使用独立`tip-section`和逐条`tip-condition`，正文左对齐、自然换行，不放在`tip-row .v`数值列里；建筑与参悟使用相同样式。`describeNeeds`返回的各前置保留为单独条目，其中“建成其一”仍是一组任选条件。效果补充说明和所属阶段使用`tip-note`，避免长说明挤压左侧标签。

弟子`residenceSeconds`记录在线／离线停留，`totalQiConsumed`记录个人口粮与个人突破实际支付的灵气；旧档缺失或非法值补零。`cultivateDisciple`在修满后继续累计时间，`tick`在资源结算前按个人有效境界权重分配口粮，并按灵气可用量与总持续支出的供给比例折算实际消耗。`discipleDismissalCost`以历法全年秒数计算已满年数，逐人向上取整；`discipleDismissalPreview`去重身份并合计，`dismissDisciples`原子支付、移除记录、同步岗位和人口，保留递增身份。store负责精确费用确认与立即存档，执行时重新校验费用、人数和支付能力，预览变化时拒绝执行；管理页限定筛选内选择并清除已逐出身份。

灵根与培养审计：`SPIRITUAL_ROOTS`定义权重、修炼速度与个人突破加成（`breakthrough`，三灵根 0），`cultivationRate`是修为增长与界面预计时间的统一入口，`rootBreakthroughBonus`折入`discipleBreakthroughPreview`的统一概率入口。个体保存`spiritualRoot`，缺失或无效值补`triple`；旧人数档补建的个体也用三灵根。`disciples.rootSeed`保存独立LCG序列，避免收徒改变事件及突破的随机序列；归一化不抽取。新增`sortDisciples`按本境比例或实际速度稳定排序，不改存档数组。管理栏组合筛选，筛选变更清选择，排序保留身份选择。`npm run audit:disciples -- 72 12345 protected`运行无事件、0仙缘／道果、5秒经营、60秒培养（每次最多20人）的真实引擎审计；`greedy`不留宗门材料，`off`不培养，末尾`triple`固定三灵根对照；第5参为培养策略`off|mentor|aid|both`（默认`off`），第3参支持逗号种子列表，便于多种子×多策略对照。`tools/disciple-training.mjs`仅供模拟调用，未加入游戏自动化。

弟子状态与成长：`disciples.members`保存独立身份、姓名、岗位、境界、本境修为及调息剩余秒数；`nextId`分配身份。`data/disciples.js`统一配置修炼、个人倍率与宗门基础突破概率。`syncDisciples`兼容人数接口并同步个体，个体调岗动作反向汇总人数；岗位按`discipleJobWeights`汇总个人有效倍率，口粮按`discipleWeight`汇总。`tick`先推进已有弟子修炼，到来时只计入门后时间；事件招入补建个体，流失移除实际人选。旧档归一化补凡体记录，随机状态不参与姓名生成；重修清空个体。首版材料按目标基础费用1%逐项取整，失败只损失本境修为与调息。`tools/disciple-check.mjs`接入smoke验证保存、上限、失败、批量支付及离线。

主动招募：`data/disciples.js` 的 `RECRUIT_TIERS` 定义三档礼聘（灵气×宗门境界倍率，高档叠加香火／灵机）与各自的 `realmWeights`／`tierWeights`／`countWeights`；`recruitCost` 折算花费，`recruitRealmRange` 给界面展示起点境界区间，`rollRecruitRealm` 用独立的 `recruitSeed` 序列按偏移权重抽取起点境界（宗门越高、档位越高则起点越高）；`data/talents.js` 的 `birthTalents`／`rollTalent` 增加可选 `{ tierWeights, countWeights }` 覆盖品级与条数分布，`newDisciple` 增加可选 `realm`／`quality`（缺省仍为凡体、基础分布）。系统层 `systems/disciples.js` 提供 `recruitPreview`／`recruitDisciple`，满员、离开风险、未解锁或付不起即拒绝且不扣料；`recruitArrivals` 与 `core.nextArrivalIn` 在 `derived.recruitModeUnlocked && settings.recruitMode === 'manual'` 时停止自动来人（按解锁判定，避免转世清空研究后被动锁死）。解锁标记由 `effects.recruitMode` 折入 `derived.recruitModeUnlocked`；`settings.recruitMode` 归一化只接受 `auto`／`manual`，`recruitSeed` 缺失时从 `rootSeed` 派生。规则见 [DISCIPLE-PROGRESSION.md](DISCIPLE-PROGRESSION.md) §2.5。

手动合成：玩家与模拟脚本的手动制作通过`craft`即时结算；`craftBatch`按当前材料和仓容计算份数，再立即制作。不生成订单，不改变自动计时；自动加工仍受工位、供能、冷却、库存目标与材料保留量约束。`requestCraft`及订单管理只保留为旧版兼容与回归验证接口，旧存档的`craftOrders`继续加工，可暂停、恢复或取消，重修时清空。`processingBottleneck`复用加工计划和统一资源流量显示供料缓冲；`progression-diagnostics.mjs`输出破境缺料、仓容缺口、生产设施与未解锁扩仓前置。

推进模拟可用`npm run balance -- 72 0 12345`固定种子跑自然路线，或`npm run balance -- 72 0 12345 industry`隔离破境失败以验证产业链；后者不用于报告自然通关速度。`npm run check:industry`运行可控负荷对照，供料及大仓储为测试夹具，不是自然开局。

动力与冷却：`processingPlan`统一计算基础工位、供能和冷却分配，`runIndustrialCraft`按下一次出货或动力耗尽时刻推进。动力连续扣费不写入`expense`，只写入自动加工流量显示，避免tick重复收费；常规维护费仍由供给计算及tick支付。动力保留量另加可开工配方的一份同种原料。偏极阵在维护供给迭代中按两侧剩余仓容与下游耗料取最低负荷。`processingModes`设置通过专用动作验证与归一化，保存偏好但研究门槛每世重判。

## 分层与数据流

| 位置 | 职责 |
| --- | --- |
| src/data/*.js | 数据定义、配置与相关纯辅助函数 |
| src/game/engine.js | 保持现有 API 的公共出口，业务系统不反向依赖此文件 |
| src/game/systems/*.js | 经济供给、建筑、弟子、炼制规则与动作、突破、事件和时间推进 |
| src/game/state.js、migrations.js、saveSchema.js | 初始状态、历史迁移与当前结构校验 |
| src/game/save.js | 序列化、导入及可注入存储的独立 repository |
| src/game/runtime.js、context.js | 无 Vue/DOM 的游戏实例、循环、时钟、随机源及实例计时器 |
| src/game/store.js | Vue绑定、actions、临时UI状态和浏览器生命周期适配 |
| src/game/format.js、pricing.js、effectsText.js | 数量、价格与效果的统一展示 |
| src/components/*.vue、App.vue | 展示与交互，通过actions改变状态 |
| src/styles/main.css | 平面文字表格与响应式布局 |

组件调用actions，由引擎修改state并重算derived，Vue更新展示。规则计算集中在引擎和数据辅助函数；derived不保存。引擎不依赖Vue或DOM，测试通过Vite SSR解析@别名后在Node运行。

`initializeGame`在应用启动时显式读档和结算离线；单独导入store不会读取存储、推进离线或注册浏览器事件。`createGame`支持注入`now`、`random`及状态对象，`createRuntime`支持独立存储和定时器适配器，自动保存与成就计时不跨实例共享。读档和清档后重置循环计时，避免将旧进度的一段时间结算到新档。

开发时游戏模块的热更新由store接收：先保存已初始化的进度、清理旧循环，再请求完整页面重载，由main重新读档、挂载和启动。否则Vue组件热更新可能挂到新store，而新store没有启动循环。`npm run check:startup`执行真实main入口并验证更新前后的时间、资源、进度保存和循环重启。

`recompute`只修改derived，不创建弟子、记录资源峰值或向state写入仓储缓存。资源增加与扣费入口维护峰值；`addResource`显式接收容量。弟子个体是运行时权威状态，人数和岗位数量在收徒、调岗、逐出和流失动作中汇总；旧人数档由迁移阶段补建个体。测试和审计的手写人数夹具通过`tools/engine-fixture.mjs`显式同步后再计算。

供给迭代在普通对象上进行，结束时一次提交derived；解锁集合、加工消耗与来源排序仅在收敛后计算。tick保留结算阶段必要的重算，store不再追加重复重算。系统依赖方向由`tools/architecture-check.mjs`验证，禁止系统依赖Vue或引擎公共出口，并检查循环依赖。

所有增益、事务期限与事件随机抽取使用实例上下文。在线与离线共用时间推进，通常最多一秒步长，并在增益到期或事务期限处切步；超过60秒且没有弟子、居所、维护、加工和灵能逸散的稳定生产可用最多10秒步长，在节气边界切回逐秒采样的换季点。历法将接近整数日的浮点误差归整，避免延迟换季。离线从实际保存时间起算，保留不足一秒的尾段，不产生新随机事件。现实期限和生产收益上限分开处理，超过离线收益上限后仍按现实时间判断期限。

界面实例为 `createGame` 提供 `snapshotState`，读档离线和后台恢复时调用 `simulateOfflineAsync`／`advanceAsync`，在普通数据副本上逐秒推演，成功后一次同步响应式状态与派生数据，避免每秒反复访问 Vue 代理。副本沿用实例时钟、随机源和成就计时，不改变收益规则；推演失败不写回部分结果。纯引擎仍保留同步接口供审计和短步推进使用。

离线中间步骤不生成 tooltip 来源和解锁列表，结束时统一补齐；偏极阵供给求解独立使用实际流量。相邻步骤和自动加工后，仅当维护供给、偏极阵仓容及传功状态仍一致时复用经济数据；人口、岗位、历法、增益与模块变化继续触发重算，部分供给场景回退完整求解。离线仍逐秒结算口粮、修炼、加工和灵能逸散，不以扩大步长换取速度。`tools/offline-check.mjs` 对比优化路径与完整重算路径的全部存档、派生数据及随机序列；`tools/offline-benchmark.mjs` 可用真实导出存档测量耗时，且不修改输入文件。

读档离线和超过三秒的循环补算先展示进度条，等待一次绘制机会后，按约8ms计算预算与最多256步分批执行，每批之间通过定时器让出主线程。同步与异步共用一条时间轴，批次不改变步长、增益到期、加工或任务归队边界；进度由实际完成的模拟秒数计算。加载期间界面使用 `inert` 暂停交互，不写入未完成的存档；初始离线结束后才启动在线循环。运行实例在等待期间拒绝重复推进，读档、重开、重置时钟或停止循环会取消旧任务，取消或异常均不写回部分结果。进度和加载状态仅用于界面，不写入存档。

存档结构版本为2，沿用原有localStorage键以便发现旧档。读档流程为解析、版本检查、迁移和字段校验；旧档正常兼容时保留完整进度，未知版本或结构冲突时只继承有效的仙缘和道果并显示恢复说明。无法解析的文件继续保留原档并阻止自动覆盖。序列化使用持久字段白名单，派生数据、运行上下文与恢复提示不写入存档。

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

玩家更新日志由src/data/changelog.js维护。同一轮功能开发、小修复、文案精简和数值微调追加到当前版本，集中发布或开启新的主要功能批次时再新增版本；不为每次修改单独升号。CURRENT_VERSION取首条，同时更新README与DESIGN。界面迭代号、包SemVer和存档结构版本分别维护；不因修改玩家日志而自动改锁文件。

## 验证命令

`tools/smoke.mjs` 只负责运行测试清单、架构检查和结果汇总。功能用例位于 `tools/smoke/`，由 `checks.mjs` 显式保持执行顺序，`tools/lib/checks.mjs` 统一断言统计，`fixtures.mjs` 提供公共存档夹具；已有专项检查继续复用。新增用例的放置与登记方式见 [smoke 维护说明](../tools/smoke/README.md)。

| 命令 | 覆盖 |
| --- | --- |
| npm run check:encoding | BOM与文本换行 |
| npm run smoke | 数据、前置、供料、产出、实际操作、存档与离线 |
| npm run check:render | Vue SSR模板与警告 |
| npm run check:startup | 真实main入口、浏览器定时器接收对象、热更新保存与重启 |
| npm run check:dom | jsdom真实挂载、主循环、更新日志与存档交互 |
| npm run check:tools | 审计参数、临时修改还原与多路线统计 |
| npm run check | 上述检查 |
| npm run build | 生产构建 |
| npm run docs:tables | 重新生成全量数据表 |
| npm run clean | 清除构建、测试与审计目录 |

断言数量以当次输出为准。jsdom不能替代真实浏览器布局、触控与视觉验证。测试和审计源码保留，运行产物可随时删除再生成。

## 分析工具及口径

完整入口、公共库和维护约定见 [工具说明](../tools/README.md)。SSR 工具由 `tools/run.mjs` 统一构建及参数转发；DOM 场景位于 `tools/dom/`，与 smoke、SSR 共用断言统计。

| 命令 | 用途与参数 |
| --- | --- |
| npm run balance -- 24 0 | 固定小时数、初始仙缘；无事件、每5秒决策，资源快照 |
| npm run audit -- stone 8 | 单资源流量、贴顶时间、门槛与去向；关闭随机事件 |
| npm run audit:economy -- 6400 | 整件资源需求与去向；可选假设通用仓储，默认0；不含专属容量及仙缘倍率 |
| npm run audit:save -- "存档路径.txt" | 只读存档仓容、自然产出、库房造价和下一境需求 |
| npm run audit:crafts -- 24 0 | 加工链及指定研究边际提升；小时数、初始仙缘 |
| npm run audit:buildings | 真实前置、材料来源和仓储自举；不估算耗时 |
| npm run audit:buildings -- 5 | 在元婴境界上限内完成来源与仓容闭包；未建的后期建筑不视为失败 |
| npm run audit:power | 元婴／化神／合体固定阶段可达性，以及从零粒子、零灵能起步的完整产线供能对照 |
| npm run audit:breakthrough -- power 12345 72 | 主动投资各阶段粒子设施、逐秒生产及真实扣料；仅突破结果强制成功，记录首次建造与首次产出，不代表自然平均通关时间 |
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

改数值后生成TABLES，改规则后更新DESIGN及相关专题；平衡测量注明代码版本、仙缘／道果、事件、决策频率和策略；未决定内容放ROADMAP。避免在多个手写表维护同一份完整造价。

## 清理与部署

clean脚本只处理项目根目录的dist、dist-ssr、.smoke*、.early与.vite，删除前确认实际路径仍在项目内，拒绝目录链接。node_modules、源码、正式文档和用户存档不作为产物清理。日常运行使用npm脚本。

GitHub Pages流程在.github/workflows/deploy-pages.yml：main推送后先检查，再构建发布。vite.config.js使用相对base，新增资源避免绝对路径与location.pathname依赖，支持子目录部署。
