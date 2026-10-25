# 工具维护说明

完整资源流水、检查点恢复与报告重建见 [资源测定记录](RESOURCE-RECORDING.md)。

v0.425首飞测量复核：现有 `balance:track` 可复用推进、记录和报告框架，但尚未适配新的道果结算、年度培养及世界经营策略，不能直接把其结果作为现版首飞耗时。待适配项与测量口径见[完整飞升测定](BALANCE-TRACKING.md#v0425首飞测量复核)。

日常使用 `package.json` 中的 npm 命令。`node tools/run.mjs --list` 列出需要 Vite SSR 构建的入口；运行器统一构建、转发参数和退出码，并用独立进程隔离临时数值修改。不要复制新的 `vite build && node` 命令。

## 检查

| 命令 | 职责 |
| --- | --- |
| `npm run check` | 日常：编码、8组核心引擎动作、SSR |
| `npm run check:full` | 按需完整：编码、审计、完整引擎、SSR、真实启动、DOM |
| `npm run smoke` | 核心动作检查，执行进程限时5秒；用例位于 [smoke/](smoke/README.md) |
| `npm run smoke -- --group=名称` | 只跑一个功能组，--list 查看名称 |
| `npm run smoke:full` | 完整引擎清单和架构回归，包含长模拟和专项矩阵 |
| `npm run check:render` | SSR 模板及控制台警告 |
| `npm run check:startup` | 真实 main 入口、初始化、热更新与循环生命周期 |
| `npm run check:dom` | 浏览器环境中的交互；用例位于 [dom/](dom/README.md) |
| `npm run check:tools` | 审计输入、数据还原、重复运行、报价和风险模型回归 |
| `npm run check:industry` | 一分钟固定供料、共享冷却和粒子配对负载；-- --full 保留十分钟测量 |
| `npm run check:encoding` | 项目文本 BOM / 换行检查；跳过产物、外部参考项目及目录链接 |

`architecture-check`、`industry-check`、`disciple-check`、`talent-check`、`auto-talent-check`、`power-check`、`offline-check`、`offline-async-check` 由完整引擎清单或指定功能组调用，导入时不自行执行。不要为同一组断言另开一份副本。局部改动只跑相关组；记录恢复和小数专项同样只选择相关单例，不作为每次提交的附加必跑项。产业循环逐秒检查库存边界，但按场景汇总统计，断言计数不再随模拟秒数膨胀。

离线相关的分工：`offline-check` 管「同输入可复现、分段数与离线时长无关、库存与加工不越界、短窗口仍与逐秒参考一致」；`offline-async-check` 管「同步/异步一致、批次预算不改变结果、取消与异常不写回」；长离线的**收益不必与逐秒参考相同**（有界近似的既定口径），只断言上界与不变量。

## 审计与基准

| 命令示例 | 用途 |
| --- | --- |
| `npm run balance -- 24 0` | 参照玩家资源快照；小时数、仙缘，可继续指定种子和工业策略 |
| `npm run audit:economy -- 6400` | 整件资源去向与假设仓容 |
| `npm run audit:save -- "存档路径.txt"` | 只读重算存档：仓容、产出、超限、库房报价与破境需求 |
| `npm run audit:crafts -- 24 0` | 加工链与指定研究的边际收益 |
| `npm run audit:crafts -- --specialization 600` | 六项效率专精的富料单配方对照；真实购买、手动扣费与自动出货分别列出，非自然回本 |
| `npm run audit:disciples -- 24` | 不同弟子培养策略对照 |
| `npm run audit:buildings -- 5` | 指定境界内的建筑来源及仓容闭包；省略参数检查全境界 |
| `npm run audit:sources` | 研究露出层次与材料来源层次；用于发现前后置循环 |
| `npm run audit:breakthrough -- power 12345 72` | 固定策略下的真实准备成本和强制突破结果实验 |
| `npm run audit:breakthrough -- --paired --hours=1008 --seed=1 --outcomes=natural --aids=full --faith=growth --visits=three --lives=2` | P1同策略成对测量；记录真实飞升结算、身死、香火投资、决策与经济边际报价 |
| `npm run audit:breakthrough -- --paired --hours=168 --seed=1 --faith=growth --visits=waking --decision-seconds=150 --batch-actions=12 --reserve=ready --wall-seconds=900` | 未主动转世的直飞基线：每日16小时在线、8小时睡眠离线，每150秒集中操作，观察最多7天 |
| `npm run balance:events -- 24 0` | 事件种子与应对策略对照 |
| `npm run balance:visits -- 24` | 固定开局及随机流，不同上线频率对照 |
| `npm run balance:track -- 0 12345` | 完整飞升测定：复用P1模拟器和资源记录器，实际飞升后输出阶段收支、阻塞、损失、节奏与检查点，见[说明](BALANCE-TRACKING.md) |
| `npm run balance:kittens -- --wall-seconds=1800` | 本地猫国从零发展到71只猫后真实重置，记录在线等效耗时与36只猫业力节点，支持暂停/续跑；专用脚本见 [kittens/](kittens/README.md)，与宗门首转的[比较](kittens/COMPARISON.md) |
| `npm run check:kittens` | 猫国适配层及冬储/加工预算快速验证；不作为自然发展耗时样本 |
| `npm run bench:craft` | Vue 响应式状态下批量制作性能及扣料一致性 |
| `npm run bench:offline -- "存档路径.txt" 28800 .smoke-offline-benchmark/result.json async` | 离线基准；首个参数可换成 `--fixture` 使用长离线专项夹具（72 名弟子、多配方工业、凝灵诀与自动猎杀，刻意让工业与自动重复在每个分段都有活干）。模式 optimized/reference/async，输出快照可选，禁止覆盖输入存档 |
| `npm run docs:tables` | 从数据源码重新生成 TABLES |
| `npm run clean` | 清理已知构建目录，检查项目边界并拒绝目录链接 |

`bench:offline` 的 async 模式一批只跑一段，因此输出里的 `longestSegmentMs` 就是最长连续计算段；`segments`／`baseSegments`／`industryRounds`／`huntBatches` 证明计算量落在有界分段与有限轮数里，而不是移到了内部循环。没有真实存档时用 `--fixture` 即可复测同机耗时。

可达性闭包不估计耗时；独立加工能力不代表共享材料下的并发产量；固定概率风险模型不包含生产时间及转世增长。综合报告、资源审计和专项报告保留各自口径，不合并成一个混杂的模拟器。

P1成对模式参数：`--hours`为总观察时长（大于0且不超过8760小时；`balance:track`的0参数映射到8760），`--seed`为1～uint32上限，`--outcomes=natural|guaranteed`，`--aids=full|none`，`--faith=off|growth`，`--visits=active|quarter|hourly|three|waking`，`--lives=1..5`为目标飞升次数，`--events=0|1`，`--labor=reference|active`，`--projects=stage|none`，`--specialization=on|off`，`--reserve=legacy|ready`。预留默认legacy保留旧策略；ready只在已有首屋且非凡体、其余破境材料齐备而仅缺灵气时保护该费用，避免日常制作反复花掉早期破境灵气。比较时只切换要研究的变量。阶段项目共用同一设施及产出门槛；与旧power／aided分别保留口径。

共同开局15分钟，之后先离线再各次上线2分钟、每5秒行动；active持续在线。在线由真实tick内部逐秒推进，显式复用同一tick内满足条件的经济数据并省略中途提示明细，最终恢复完整派生；默认游戏在线路径不变，在线事件／缺供边界与默认逐秒结果由既有专项对照。离线使用游戏有界近似与实际上限，期间不研究／建造／凝愿／突破；事件与突破分离随机流。growth为有限投资策略：明确研究《凝愿法》，聚香5级／收愿1级及迎香礼，后期大乘愿典；预留近期破境和加工香火后凝愿，完整道心优先万民归心／应劫正愿，再考虑其他永久修持。不代表最优路线。

v4另支持`--visits=waking`：从开局起每日前16小时在线、后8小时离线，无额外15分钟开局；未模拟工作等其他离开。`--decision-seconds=5..3600`控制集中操作间隔（默认5秒），`--batch-actions=1..24`控制每次至多运行的参照机器人步骤数（默认1）。每步可能含备料、研究、建造与破境，并非一次点击；12步表示有限批量处理，不能当作真人已验证的操作负担。等待期间照常逐秒生产，不运行玩家决策；醒来立即操作。v3历史报告保留原口径，不与新增作息样本直接混算。

v5增加主动转世路线：`--reincarnations=0..3`为全程主动转世次数上限（默认0），`--reincarnate-realm=6..9`为转世境界（默认6，即化神）。到达后通过真实转世动作结算仙缘，不给道果；作息、累计时钟与随机流不重启，每次转世保留结算前后状态和仙缘乘区。`--reincarnate-preparation=none|faith`默认none立即转世；faith在同一操作内先执行一次既有有限香火策略，兑现能当场证得的道心及永久修持，不赠资源或等待额外积累。之后从零重建并飞升；`--lives`仍指实际飞升次数，不把主动转世计作飞升。

例：在上述waking命令追加`--events=1 --reincarnations=1 --reincarnate-preparation=faith`，测一次化神转世后的累计首飞。直接路线用`--reincarnations=0`。比较必须计入转世前耗时与重建，不能只比最后一世；同种子不是保证同一突破结果，重走境界会消耗更多随机抽样。

v6增加`--stop-realm=1..10`（默认0关闭）用于先校准化神等阶段，不能与主动转世或多次飞升目标混用。到境界后报告`realm-target`，`completed`仍为false，不把它当作实际飞升。正式在线批次保持5秒，实际决策仍按`--decision-seconds`间隔；不通过放大tick批次改变对照。报告源码摘要现覆盖境界费用、配置、仙缘结算及经济实现，价格试算不得与旧规则报告混算。

v7可指定`--details=decisions`，仅在5秒等待批次中省略悬停来源和解锁列表的明细计算，仍逐秒推进生产与事件；每次玩家决策前、离线返回及最终恢复完整派生，默认full保留原路径。状态、事件随机序列和最终派生由默认路径对照，不使用放大tick的探索结果替代该对照。

`--wall-seconds`限制单次调用的墙钟预算（默认600秒，上限7200秒）；`--total-wall-seconds`限制全程累计预算，默认等于初次单次预算，上限604800秒。`wall-budget`与`total-wall-budget`分别表示单次／累计截止，均不代表不可达或完成。恢复保留已用时间，显式提高累计额度记录在`wallBudgetChanges`，不手改检查点。预算不改变游戏时钟、资源或随机流。`--trace-limit`控制保留的开局及末尾决策条数（默认1000，上限10000），聚合计数不随截断丢失。每次输出到`.smoke-breakthrough-time/p1-时间-进程号/result.json`，不覆盖旧样本，附提交与工具源码摘要。`.smoke*`仍是可清理产物；需要长期引用的结果应摘录至正式测量文档并保存必要数据。

经济边际报价只读副本，区分已学研究贡献和下一座设施增量。各资源分别列回收自身投入的秒数，null代表没有该资源直接净增产；不相加异种资源，也不把瞬发手动加工解释为效率专精收益。净额包含当前自动加工耗料，仍受当前人口、库存、供给和季节限制，不能替代实际长期回本测量。

完整飞升测定（`balance:track`）统一复用 `pacing-scenario.mjs` 与 `resource-recorder.mjs`，默认自然突破概率、满配可用护道、持续在线、关闭事件及香火投资；真实飞升后核对仙缘、贡献道果、镜像、计数和重置状态才算完成。兼容位置参数 `[hours] [seed]`，省略hours默认3024，0映射8760小时；单次计算默认7200秒，累计额度可显式设置。资源记录强制开启，按世次与境界访问导出阶段收支、支出去向、加工产量、截断／逸散／重置损失、缺料／仓容／加工状态时长、关键快照及节奏；金额保留十进制字符串。数据与检查点同存 `.resource-records/<runId>/`，支持原bundle恢复与只读重建。`--mode=reincarnate` 可在实际炼虚转世后结束。全部参数、新版DS命令和边界见[完整飞升测定](BALANCE-TRACKING.md#v13修复后的ds复测)。

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

完整测定以已落盘资源变动和独立期初／期末对账为基础；连续生产与维护的毛收支仍是模型，阻塞与满仓时长仍按观察区间采样，不能仅凭低库存认定破境卡点。详见 [资源记录](RESOURCE-RECORDING.md)。

### P1 无上限加工基线（2026-10-18）

当前策略为 `p1-reincarnation-v13`：保留元婴回投，并在大乘备料时比较采仙台／聚仙阵扩产，记录`decisionSummary.immortalInvestments`。2026-10-25 DS新样本 `12b68d55-784a-4525-880d-333791690a64` 在486.3958持续在线小时实际飞升，含1次死亡，新增贡献道果4.79098；计算6812秒，在单次与累计7200秒内完成。采仙台扩至5座，最终聚仙阵0座；结算、对账与164份指纹一致。流程单样本通过，半年平衡、真实作息与其他自然投资路线仍未验收，见 [测定说明](BALANCE-TRACKING.md#v13修复后的ds复测)。

v12历史样本：2026-10-25 DS第五次复跑实际首转143.6625小时、元婴70.715小时、0死亡，三项回投均成交；目录 `.resource-records/80a29929-d779-4196-a5b5-403b3f77aaea/`。136人仅1名香使的末段分工仍待优化，时长达标不代表最终费用已验收；v13没有调整这一境界的费用或香火分工。

v11历史基线：银溪谷互市随玩法数据提前至元婴，金丹仍由星崖观补灵晶，元婴起通过少量秘银启动本地凝晶，后续用自制灵晶建设晶核凝炼阵。阵基装配加成和晶纹精修费用沿用原值。DeepSeek在 `35933d9` 完成第四次复跑：97.900小时首次化神实际转世、0死亡、仙缘64.6256、对账一致；开局到元婴与124.304小时的v10基线一致，提速集中在元婴。报告目录 `.resource-records/73e11fa5-7d91-467c-8413-4670e5b838ba/`，比较见 [kittens/COMPARISON.md](kittens/COMPARISON.md)。不同源码与策略的检查点不混用。以下v10、v9描述保留历史口径。

2026-10-24 v10基线：金丹、元婴缺少本境可行凝晶供料时，优先通过星崖观换取近期破境所需灵晶；化神以少量秘银互市启动凝晶，炼虚转向本地提炼。前置计划包含外交研究、执符堂与换料费，全员已分工时可调出一名执符使；需要进口时暂停天赋自动分工，由机器人手动维持岗位，活跃分工也保留执符使。每步最多互市一次，使用真实信符与费用，不授予资源。旧 v9 在金丹停滞的样本保留，不能与新策略当作同口径续跑；须从新 runId 开始测量。以下 v9 描述为历史基线。

v10 同时把伐木场→藏经阁→谷仓→采矿场的开局顺序纳入前置计划，避免为后续建筑预留灵气时锁住当前环节；攒灵气期间允许在剩余等待内回本的聚灵阵投资。满仓检查已拆为 `npm run smoke -- --group=botEarlyStorage` 单组，固定时钟与随机输入，仍要求前30分钟灵木贴顶低于5%；不随电脑当前时间更换弟子天赋。

参照机器人 `p1-reincarnation-v9` 为23项稳定加工品设置近期库存目标；0仍代表主动不限量。百分比保留仅用于有限容量，加工品使用定额保留。报告的 `capacity` 对无上限仍写JSON null，同时由 `unlimitedCapacity` 明确列出资源，不能按0解释。可达性只检查有限前置所需容量，不求无限扩仓的不动点。当前费用以源码和生成表为准，历史测量及边界见[平衡评估](../docs/BALANCE.md)。
