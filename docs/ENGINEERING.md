# 工程约定与工具

可选模块由 `data/modules.js` 定义开关，`game/moduleRegistry.js` 接入初始化、存档、时间推进与停用清理，`modules/uiRegistry.js` 单独接入界面。目录项默认用 `module: '<id>'` 绑定单一模块；需要多个模块任一启用即生效时改用 `moduleAny: ['a', 'b']`，由 `isEntryEnabled` 统一判定（例如猎杀与外交共用的信符供给：执符使、执符堂与《山野猎法》）。猎杀数据与系统集中在 `modules/hunting/`，引擎不依赖 Vue 界面。停用模块读档时先验证并保留切片，再召回活动任务，保留历史和偏好；转世/飞升才重置本世切片。任务存档过滤异常结构与数值并重挂合法成员占用。

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

所有增益、事务期限与事件随机抽取使用实例上下文。在线与**不超过60秒**的离线共用逐秒时间推进，通常最多一秒步长，并在增益到期或事务期限处切步；该窗口内没有弟子、居所、维护、加工和灵能逸散的稳定生产可用最多10秒步长，在节气边界切回逐秒采样的换季点。历法将接近整数日的浮点误差归整，避免延迟换季。离线从实际保存时间起算，保留不足一秒的尾段，不产生新随机事件。现实期限和生产收益上限分开处理，超过离线收益上限后仍按现实时间判断期限。

界面实例为 `createGame` 提供 `snapshotState`，读档离线和后台恢复时调用 `simulateOfflineAsync`／`advanceAsync`，在普通数据副本上推演，成功后一次同步响应式状态与派生数据，避免逐步反复访问 Vue 代理。副本沿用实例时钟、随机源和成就计时，不改变收益规则；推演失败不写回部分结果。纯引擎仍保留同步接口供审计和短步推进使用。

### 离线结算

超过60秒的长离线不再逐秒结算，而是走**有界近似**：把整段时长等分为至多 `CONFIG.OFFLINE_MAX_SEGMENTS`（64）段，另按**初始存档里已有的增益到期时刻**切分；不为过程中生成的加工、节气或任务追加边界，所以总步数只与「基础段数 + 初始增益数」有关，与离线秒数无关。分段规划是纯函数（`src/game/systems/offlinePlan.js`），同步 `simulateOffline` 与异步 `simulateOfflineAsync` 共用同一个推进器，异步批次只决定让出主线程的时机，不改变段边界与运算顺序。

每段按段首状态与该段时长求解一次生产、口粮与维护供给，再按速率乘 dt 一次结算；段内供给变化、加工停线与重启按段估算。据此的近似口径为：

- **材料只减实际可用量**：维护与加工共用同一份库存预算，任一资源不出现负数，也不超过仓储（扩仓下调后遗留的超额旧库存仍可消费、不能继续增加）。
- **历法直接推进完整 dt**，不穷举节气；跨季节的长段按覆盖时长加权（完整年份用全年平均，不足一年的两端按完整的季节区间累加），避免等距采样总命中同一季节，也不逐年循环。
- **凝灵诀按跨过的节气数批量估算**：份数由节气触发次数与「现有灵气 + 段内净产能支撑几次满仓凝液」共同封顶，实际扣料与出货仍走 `settleCraftCopies`，遵守解锁、总开关、保留量与库存目标。
- **自动加工批量化**：非工业配方复用按节拍算出份数的批量路径；工业配方每段只做 `CONFIG.OFFLINE_INDUSTRY_ROUNDS`（2）轮「冻结工位分配 → 按剩余真实时间算出份数」，不按成品份数循环；多轮只是重分配**同一段**真实时间（每轮从剩余预算里取并扣掉实际用掉的时间），所以任一条线累计加工不超过「工位速度 × 段长」。原料与这一份自己的加工动力算作**同一份完整代价**，按配方固定顺序从同一份库存里贪心分配，并额外为留下的小数进度预留一份动力；动力另受「至少留住一批」的保留量约束。因此不会先发货后截零，自动保留量也不会被后置动力穿透；缺料与满仓时小数进度最多保留一份待完成量，恢复在线后不会倾泻整段欠账。
- **灵能用闭式解**：段内按 `dE/dt = 产出 − 逸散` 的解析解结算（稳态 ≈ 产出 ÷ 逸散率）并受仓储限制，不先把整段产出入库再整体衰减。
- **弟子与人口**：修炼、停留、调息按段累计；口粮按段内有效口粮与供给比例折算；断粮与拥挤流失按 `次数 × 概率` 一次估出人数（拥挤用一次抽签的批量期望），既不让长段只走一人，也不逐 25/60 秒抽签。
- **猎杀走模块离线钩子**（`advanceOffline`）：已有已付费任务按剩余时长推进并在真实归队时刻结算一次；自动重复按「整趟数」批量估算，趟数受任务时长与信符存量共同封顶，后续批次用当段快照的成功率期望代替逐趟抽签，不足一趟的尾段保留为一次已扣费任务。

近似带来的**收益差异是设计接受的**：长离线的结果可能与在线挂机、也可能与逐秒参考不同，离线报告因此标注「收益为估算」。不允许的只是负数与 NaN 库存、超仓储增收、加工欠账和与离线时长同阶的计算量。离线中间步骤不生成 tooltip 来源和解锁列表，结束时统一补齐。`tools/offline-check.mjs` 验证同输入可复现、分段数与库存边界；`tools/offline-async-check.mjs` 验证同步/异步一致、批次预算不影响结果与取消原子性；`tools/offline-benchmark.mjs` 可用真实导出存档或 `--fixture` 专项夹具测量耗时、最长连续计算段与分段/轮数，且不修改输入文件。

读档离线和超过三秒的循环补算先展示进度条，等待一次绘制机会后，按约8ms计算预算与最多256步分批执行，每批之间通过定时器让出主线程。同步与异步共用同一套段边界与运算顺序，批次不改变增益到期、加工结算或任务归队的结果；进度由实际完成的模拟秒数计算。加载期间界面使用 `inert` 暂停交互，不写入未完成的存档；初始离线结束后才启动在线循环。运行实例在等待期间拒绝重复推进，读档、重开、重置时钟或停止循环会取消旧任务，取消或异常均不写回部分结果。进度和加载状态仅用于界面，不写入存档。

读档结算收尾与超过收益上限的循环补算使用同一套语义：超出上限的现实时间不产出，但现实到期的增益与超时威胁仍会清理；结算完成后对齐真实恢复时刻的运行时钟，已消费的离线窗口随即落盘，避免重复领取或立刻形成第二次长补算。

### 数值与存档

经济数值域使用 **decimal.js**（唯一数值库，生产依赖），精度与舍入只在 `src/game/decimal.js` 配置：**40 位有效数字、ROUND_HALF_UP**；业务文件不得修改全局配置，一律通过该模块的构造器与助手处理金额。

| 数据域 | 运行时类型 | 说明 |
| --- | --- | --- |
| resources、peak、karma、dao | Decimal | 永久货币顶层字段为权威来源，`resources` 中的镜像同步为同值；dao 仍为整数 |
| 成本、产量、每秒速率、净额、经济仓容上限、材料保留量、来源与出项明细 | Decimal | 含 `sources`、`expenseSources`、`autoCraftDrain`、离线差额报告 |
| stats.totalQi/totalInsight/totalFaith/lifeInsight/offlineGains、stats.crafted | Decimal | 产出总额不与事件次数混用 |
| 弟子 `totalQiConsumed` | Decimal | 初始化、归一化、在线/离线累计与显示统一迁移，**取消** MAX_SAFE_INTEGER 截断 |
| craftTargets、craftProgress | Decimal | craftProgress 保留原有「小数余量」含义 |
| 建筑数、等级、人数、realm、订单数量、计时器、ID、随机种子、次数统计 | Number | 循环次数使用有界安全整数 |
| 时间戳、dt、totalDays、计时器 t、冷却、任务时长与进度 | Number | 保留时间域容差；离线分段算法仍用 Number |
| 有界概率、折扣、比例、岗位权重与有限倍率 | Number | 在独立有界计算中保留；进入金额运算时构造为 Decimal，不能先用 Number 算出金额 |
| 无界倍率（仙缘、道果派生倍率与综合产出倍率） | Decimal | 不能先把永久货币转 Number 再乘 |

约定与边界：

- **金额一律用 Decimal 方法运算**（`plus/minus/times/div/pow/sqrt/cmp/gte/floor/ceil/negated`）。金额域禁止原生 `+ - * / **`、`Math.*`、`Number.isFinite`、`value || 0`、`!value`、`=== 0`、`=== Infinity`：Decimal 对象恒为真，这类写法会得到错误结果。
- **够用判断与扣减同源**：`atLeast`/`gte` 是 Decimal 精确比较，扣减用 `moneyAvailable`；移除了 Number.EPSILON × 数值规模的宽松支付逻辑，`nearlyEqual` 不再作为支付授权（时间域容差保留）。整枚资源入库向下取整、费用向上取整（`ceilMoney`/`floorMoney`）；批量建筑仍逐座取整后求和。
- **无仓容上限**用金额域的 `MONEY_INFINITY` 哨兵（只有派生容量允许出现），时间域的等待值继续用 Number `Infinity`，两者不跨域套用。
- **非有限金额明确报错**（`requireFiniteMoney`）而不是把库存静默归零；读档损坏字段另行清洗。
- **精度边界**：40 位有效数字下 `1e30 + 1` 可保留并扣回，`1e40 + 1` 会舍回 `1e40`；`1e400` 可存取、比较与参与一次有效比例结算，但不承诺该量级的逐枚增减仍可表示。需要任意规模整数逐枚精确时另行设计，不宣称有限精度无限精确。
- **运行时快照**统一用 `cloneRuntime`（`src/game/clone.js`）：递归复制可变对象/数组，Decimal 按不可变值共享引用。**不能**用 `structuredClone`（丢失 Decimal 原型）或 `JSON.parse(JSON.stringify(...))`（金额变成字符串）作为运行时副本；存档路径的 JSON 往返仍然有效，因为写档自带金额编码。

D7 起采用新代存档：键名为 slack-off-sect.save.d7.v1，ruleset 固定 d7.1；旧键 slack-off-sect.save.v1 只作为原始备份读取，永不覆盖。启动与导入都先校验 ruleset，异代存档在 normalizeState／离线结算之前拒绝，不走「继承仙缘／道果并重开」的旧恢复分支。新代状态新增 faithProgression（本世仪轨、永久道心修持、累计道心），愿力与道心作为 resources 金额；转世／飞升／身死保留道心与永久修持，清空愿力、仪轨与一次性专属研究。同代结构冲突进入读档失败保护，不再静默重开并覆盖原档；旧结构兼容恢复只保留为显式工具入口。

DEBUG 页的全局产出×10开关使用独立乘区，追加于现有全局倍率，吞吐产线按既有规则同步扩张进料；不改变口粮、仓容或单份制作收益。开关使用运行时字段 `__debugProductionBoost`，不进保存白名单，关闭调试、读档或刷新后取消；运行时离线快照保留本次会话的开关，资源来源明细单独列出该倍率。

存档结构版本为 **3**，当前代使用 slack-off-sect.save.d7.v1；旧键 slack-off-sect.save.v1 只读备份，永不被覆盖。金额字段按 `src/game/moneyFields.js` 的**显式白名单**序列化为十进制字符串（允许科学计数法），控制域继续保存 JSON number；不依赖任意对象的 `toJSON`。`serialize` 返回独立的普通数据（深拷贝，不暴露状态的嵌套引用）。读档顺序固定：解析 → 结构检查 → **按字段解码/清洗金额** → 执行涉及金额算术的历史迁移 → 目标状态校验；v1/v2/无版本的有限非负 number 金额迁入 Decimal，旧值已丢失的精度不做补偿。v2 起 `disciples.members` 就是权威个体数据，版本升到 3 不会重建弟子，历史补偿也不会重复发放。同代有效档支持文本与 JSON 导入；异代或结构冲突拒绝加载／导入，加载失败暂停写档、导入失败保留当前进度；无法解析的文件保留原档并阻止自动覆盖。宽容恢复（仅继承仙缘与道果）只作为显式工具入口，不是浏览器默认行为。金额字符串限制 256 字符，拒绝空串、布尔、数组、对象与十进制以外的语法（`0x10` 之类不算存档格式）。上线前用现有导出功能保留 v2 备份；回退旧客户端需恢复该备份，v3 字符串存档不承诺由旧客户端读取。

存档里另有 `analytics` 元数据（`src/game/analyticsState.js`）：本世 `run_id`、`save_id`、`run_index`、`cohort`（fresh/legacy/imported）、`data_quality`（clean/partial/debug）、四项时钟累计、首次到达表、按目标境界的尝试次数与上一世摘要。它只服务 GA4 平衡采集，不参与任何数值计算；读档由 `validateState` 归一化，旧档缺失时补默认值并由采集侧标为 partial。采集分两层：`src/analytics/collector.js` 管世生命周期、计时器、可见性与卡点采样，`src/analytics/ga.js` 按需加载，只做 gtag 注入与发送；引擎不依赖 window/gtag。

采集默认关闭，首次进入用弹窗询问，作出选择后启动游戏；授权单独保存在浏览器的 `slack-off-sect.analytics.consent.v1` 中，导入存档不会替代授权。设置入口为「允许游玩数据采集」。`VITE_GA_MEASUREMENT_ID` 缺失、开发环境未通过 `VITE_GA_DEBUG=1` 显式开启、自动化环境或玩家关闭开关时停用。模块或标签加载失败时弹窗提示、取消勾选并记住关闭选择，刷新后不自动重试。标签加载成功只表示浏览器采集端就绪，不代表 GA4 服务端已收到事件；发送是尽力而为，关闭或失败时丢弃队列，不补发。

GitHub Pages 部署需在仓库 **Settings → Secrets and variables → Actions → Variables** 新增仓库变量 `VITE_GA_MEASUREMENT_ID`，值为 GA4 网页数据流的 `G-…` 衡量 ID（不是 API secret）。工作流在构建步骤将该仓库变量注入 Vite；本地未跟踪的 `.env` 不会进入 Actions，仅在 `github-pages` 部署环境中配置变量也不会传给当前独立的 build job。变量在构建时写入页面产物，新增或修改后须重新运行部署工作流，刷新旧页面不会更新配置。正式版使用该 ID；`/dev/` 预览版仍按渠道策略停用采集。缺少变量时开启采集会显示“当前页面尚未配置数据采集”，不会抛出控制台异常。

页面访问沿用手动 `page_view`：关闭默认自动页面事件，仅在已授权、采集开启且标签就绪时，每次完整页面加载向目标ID发送一次。游戏切页、读档或同页关闭再开启采集不会重复记访问；加载中关闭采集不发，之后重新授权可发送本页尚未记录的首次访问。访问URL仅保留origin与pathname，不携带查询参数或hash。排查时先核对GA4网页数据流ID，再看实时报告与浏览器Network中的 `g/collect` 请求及其 `tid`／事件名；页面访问与 `bottleneck_sample`、`realm_reached` 等业务事件分开检查。采样每5分钟汇总，读档不补开局事件；常规报表存在处理延迟。标签就绪或请求发出均不能替代GA4后台收件确认，排查无需清除站点存档。

`tools/offline-benchmark.mjs` 可在同一夹具上比较迁移前后的 8/24 小时耗时、最长连续计算段与分段数（见「分析工具及口径」）。2026-10 迁移到 Decimal 的实测（Windows / Node 24，同一 `--fixture`，各取 2~3 次的中位）：

| 场景 | 迁移前 | 迁移后 | 说明 |
| --- | --- | --- | --- |
| 8 小时 async | 916 ms | 962 ms | +5%，在测量噪声内 |
| 24 小时 async | 950 ms | 923 ms | −3%，在测量噪声内 |
| 24 小时 sync（optimized） | 42 ms | 107 ms | 2.6×，纯 Decimal 运算开销 |
| 最长连续计算段（8h / 24h） | 4.3 / 4.4 ms | 7.7 / 7.6 ms | 仍远低于 16 ms 帧预算 |
| 段数 / 工业轮数 / 猎杀批次 | 64 / 64 / 64 | 64 / 64 / 64 | 有界路径的规模未变 |

浏览器实际走的是异步路径（同步路径只在测试与基准里用），因此玩家可见的读档耗时基本不变。同步路径的 2.6× 已定位为 Decimal 运算本身：profile 里 `decimal.js` 与重算循环占自耗时的多数，热点中没有字符串解析、深拷贝或调试信息（静态数据的金额常量按效果对象缓存在 WeakMap 里，运行时快照用 `cloneRuntime`，比 `structuredClone` 更快）。若后续需要进一步压缩，方向是继续减少每次重算的 Decimal 运算次数，而不是降低精度。

生产构建体积（同一构建配置）：项目从 498.0 kB（gzip 177.1 kB）增至 538.7 kB（gzip 194.9 kB），增量来自 decimal.js 与新数值层模块。

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
- 随机事件先形成会话内提示，只有可信用户交互完成后才尝试打开：前台可见且有焦点、pointerup／click／keyup／wheel 且非输入框组合输入；后台、挂机、仅可见或聚焦、鼠标移动不触发。普通提示保留真实时间60秒；弹窗显示60秒只关提示，不自动选项、不重复结算、不清除待决；版本阻断、读档失败、离线汇总、采集授权与更新日志优先，导入／重开／转世／身死后清空旧提示。

玩家更新日志由src/data/changelog.js维护。同一轮功能开发、小修复、文案精简和数值微调追加到当前版本，集中发布或开启新的主要功能批次时再新增版本；不为每次修改单独升号。CURRENT_VERSION取首条，同时更新README与DESIGN。界面迭代号、包SemVer和存档结构版本分别维护；不因修改玩家日志而自动改锁文件。

## 验证命令

下表为工具用途索引，不代表当前任务已获执行授权。运行范围服从项目AGENTS.md、`.ds/RULES.md`及用户最新指令；未明确授权时不主动运行测试，不为文档整理新增测试文件。

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
