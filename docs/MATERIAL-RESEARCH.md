# 材料研究线：丹道、香火与土木

整理：2026-10-15。**三条线已于 v0.38 落库（已实施）；id、费用、用料与时间以源码为准，本文保留设计过程与待校准项。** 当前实现见 [DESIGN.md](DESIGN.md)、[CRAFT-PROGRESSION.md](CRAFT-PROGRESSION.md) 与生成表 [TABLES.md](TABLES.md)；研究结构与原则见 [RESEARCH.md](RESEARCH.md)；世界观见 [SPIRIT-ENERGY.md](SPIRIT-ENERGY.md)。对应 [ROADMAP.md](ROADMAP.md) §1「待完善的材料研究」。

## 0. 共有框架

材料研究按族分「原理 → 工艺 → 精研」三层，族定义见 `CULTIVATION_STAGES`（[upgrades.js](../src/data/upgrades.js#L900-L940)）。三条线的共同问题与统一处理原则如下。

| 族 | 现状三层 | 主要缺口 |
| --- | --- | --- |
| 丹道 `matAlchemy` | 原理 only（`alchemyArt`） | 缺承接新能力的工艺/精研节点，丹药层级断层 |
| 香火 `matIncense` | 原理（`incenseVow`／`incenseStudy`） | 缺承接新能力的工艺/精研节点，链终点跨组，产出途径单一 |
| 土木 `matEarth` | 原理 + 精研（`earthArt`…`buildingCode`） | 缺自有工艺节点，链终点跨组，建材来源未进前置 |

**本轮已定法则**：

1. **节点归属按「是否承接新能力」判定**（沿用 [RESEARCH.md](RESEARCH.md) 原则）：开放新配方／设施／系统的「工艺／精研」节点放在**修真材料族**内——先例是草木族的《木作器械》，本在技艺页、后[迁回修真族](../src/data/upgrades.js#L320-L331)以承接「刨木成板」；**纯数值**的增产／容量／效率／节料／仓储则作为「应用升级」留**技艺页**（如《丹火纯青》）。故族 `hint` 仍为「原理 → 工艺 → 精研」，族内只列承接新能力的节点，纯数值工艺在技艺页保留、必要时交叉引用。**不把工艺统一压到某一页。**
2. **一条链不跨组断裂**。同一材料线的原理/工艺/精研落在同一族分组；确需跨组的（如终局建筑、跨线前置），在族内保留可见入口或交叉引用，避免玩家在族内看不到链终点。
3. **解锁口径一致**。同层配方只卡建筑、不带研究前置，只要与「建成该建筑所需研究」传递等价即可（例：`refinePill` 卡 `alchemyRoom`，而 `alchemyRoom` 已需《炼丹术》），**不为统一而重复补研究前置**。
4. **首启自举与防循环**。首座产业/首个研究不消耗只能由自身提供的产物；扩仓研究费用必须由前级仓容承接，杜绝「扩仓 ↔ 造价」循环。
5. 分组只是导航，不要求依次学满章节（[RESEARCH.md](RESEARCH.md)）。

本文给出方向与待校准项，不代表数值定案；未完成工作统一登记在 [ROADMAP.md](ROADMAP.md)。

## 1. 丹道研究线

### 现状

- 原理：`alchemyArt` 炼丹术（[upgrades.js](../src/data/upgrades.js#L488-L497)），解锁炼丹房与「采药制丹」。
- 工艺：`alchemyFire` 丹火纯青（技艺页，[techniques.js](../src/data/techniques.js#L78-L85)），为**纯数值**应用升级（丹药制作 +5%），按 §0 法则 1 归技艺页；前置含炼器术 `forgeArt`，属跨线依赖。
- 精研：无。
- 丹药仅两级：`pill` 丹药（采药制丹，tier1）→ `nineTurnPill` 九转丹（九转炼丹，前置法宝九转丹炉）。
- 设施：炼丹房 `alchemyRoom`（无境界门槛）；唯一名为「九转丹炉」的高阶实体是法宝而非建筑。

### 缺口

- 三层不齐：族内缺**承接新能力**的工艺/精研节点（《丹火纯青》是纯数值，留技艺页不构成缺口）。
- 丹药层级断层：pill 与 nineTurnPill 之间无中间层级（**是否真需补层级待先论证**，见 §1.2）。
- 解锁链路：九转炼丹跳过研究、直挂法宝。
- 跨线耦合：丹道工艺 ← 炼器术 ← 炼丹术，双向绑定。
- 设施：缺丹道高阶设施，高阶丹只依赖一件法宝。

### 完整设计（已实施 · v0.38）

存档兼容：丹道迁移由 `alchemyProgressionVersion: 1` 标记，仅对无标记且已有九转丹炉的旧档补发《丹道精微》，并记录 `legacyNineTurnPill`，保留本世九转炼丹的手动与自动解锁资格，不要求补建丹鼎或先升化神。配方用料仍按当前版本结算。新档及已迁移档不因后来炼成九转丹炉而补发研究或资格；转世、飞升与身死重开清空旧资格，按新版条件重新解锁。

以下为丹道线的完整设计，**已于 v0.38 落入源码**；id、费用、用料与时间以源码为准，标注「待校准」者仍待实测后定案。

#### 1.1 三层归位

| 层 | 载体 | 位置 | 变动 |
| --- | --- | --- | --- |
| 原理 | `alchemyArt` 炼丹术 | 修真页 · 丹道族 | 保留 |
| 工艺 | `alchemyEssence` 丹道精微 | 修真页 · 丹道族 | **新增**（承接新能力：开放「凝元炼丹」与丹鼎） |
| 精研 | 待后续 | — | 本轮不设 |
| 纯数值 · 应用升级 | `alchemyFire` 丹火纯青 | 技艺页 | 保留；解耦 `forgeArt` 前置 |

- 分组 `matAlchemy`：`ids` 由 `['alchemyArt']` 改为 `['alchemyArt','alchemyEssence']`；`hint` 由「原理 → 工艺」恢复为标准「原理 → 工艺 → 精研」（与草木/金铁/符文一致）。
- 归属判据见 §0 法则 1：承接新能力的节点进族，纯数值留技艺页。

#### 1.2 丹药递进（三级 · 已采纳）

| 品阶 | 产物 | id | 来源配方 | 阶段用途（建议，待校准） |
| --- | --- | --- | --- | --- |
| 一品 | 丹药 | `pill` | 采药制丹（现有） | 筑基～金丹护道、低阶研究/技艺 |
| 二品 | 凝元丹 | `condensePill`（新增） | 凝元炼丹（新增） | 元婴～化神护道、中阶研究 |
| 三品 | 九转丹 | `nineTurnPill` | 九转炼丹（改前置与用料） | 炼虚～渡劫护道、高阶研究/灵宝 |

- **已采纳（2026-10-15）**：保留二级丹 `condensePill`。其牵动**新资源 + 仓储 + 护道表**（[realms.js](../src/data/realms.js#L124-L174)）+ 多处研究费用重排，属较大改动；`refineNineTurnPill` 的境界门槛须与护道表迁移一并对齐，避免打断现有化神护道。
- 落实：新增资源 `condensePill` 凝元丹，`integer: true`、`baseMax`（建议 30，待校准）、`storageWeight`（建议 0.03，待校准），归「丹符器物」组，排在 `pill` 与 `nineTurnPill` 之间；并同步为 `medicineVault` 等仓储建筑补该仓容。

#### 1.3 研究节点

**新增 `alchemyEssence` 丹道精微**（修真页 丹道族，工艺层）：

- `needs`：`{ upgrades: ['alchemyArt', 'alchemyFire'], building: { id: 'alchemyRoom', count: 2 } }`
- `cost`（建议，待校准）：`{ insight: 3600, herb: 2400, pill: 40, immortalHerb: 10 }`
- `effects`：`{ unlockBuildings: ['pillFurnace'] }`（仅注释；建筑解锁实际看其 `needs`，见 §1.5）
- 文案：炼丹成术、火候纯青之后，参透君臣佐使的丹性，方能炼二级灵丹、开丹鼎。

#### 1.4 配方

| 配方 | 变动 | 建议前置 / 用料（待校准） |
| --- | --- | --- |
| `refinePill` 采药制丹 | **不改**（评审修正） | 其 `building: alchemyRoom` 已传递依赖《炼丹术》（[buildings.js](../src/data/buildings.js#L437)），补研究前置是冗余 |
| `condensePill` 凝元炼丹 | **新增**（依赖 §1.2 是否采纳） | out `condensePill`×1，tier 2，primary `['pill']`；`cost { pill: 20, immortalHerb: 2, qi: 300 }`，`time 4`；`needs { realm: 5, upgrades: ['alchemyEssence'], building: { id: 'alchemyRoom', count: 1 } }` |
| `refineNineTurnPill` 九转炼丹 | **修改**：解锁改挂研究、用料改用二级丹 | out `nineTurnPill`×1；`cost { condensePill: 20, immortalHerb: 5, qi: 500 }`，`time 6`；`needs { realm: 6, upgrades: ['alchemyEssence'], building: { id: 'pillFurnace', count: 1 } }`（去掉 `upgrade: alchemyCauldron`；realm 实取 6=化神，与「护道材料生产境界 ≤ 冲关前境界」一致） |

工位映射不变：三者均归 `alchemy` 工位（`src/data/industry.js`）。

#### 1.5 建筑与技艺

**新增建筑 `pillFurnace` 丹鼎**（group `craft`）：

- `needs`：`{ upgrades: ['alchemyEssence'], building: { id: 'alchemyRoom', count: 1 } }`
- `cost`（建议，待校准）：`{ ironMortar: 6, plank: 12, ore: 500, insight: 2000 }`，`priceRatio: 1.28`
- `effects`（建议）：`{ craftBonusByResource: { condensePill: 0.12, nineTurnPill: 0.12 }, storage: { condensePill: 80, nineTurnPill: 20 } }`
- `upkeep`（建议）：`{ wood: 0.5 }`
- 承接二级/三级丹的产能与仓容，使高阶丹不再只依赖一件法宝。

**修改技艺 `alchemyFire` 丹火纯青**：`needs` 由 `{ upgrades: ['alchemyArt', 'forgeArt'] }` 改为 `{ upgrades: ['alchemyArt'], building: { id: 'alchemyRoom', count: 1 } }`（解耦炼器术）。

**保留法宝 `alchemyCauldron` 九转丹炉**：效果与祭炼不变，仅从「九转丹解锁门槛」改为纯增产法宝。

（可选）**新增丹道专属技艺**：如《灵丹妙手》提高 `condensePill`/`nineTurnPill` 制作产出，替换或补充现由 `spiritCultivation` 承担的丹类加成。待定。

#### 1.6 跨线与解锁口径

- 保留 `alchemyArt → prospectStudy`／`forgeArt` 单向枢纽（金铁族入口）。
- 解除 `alchemyFire ← forgeArt`，丹道工艺可独立推进。
- `refinePill` 的解锁口径经核实无问题（见 §1.4），不再改动。

#### 1.7 旧档兼容

- 新资源 `condensePill`：旧档缺字段按 0 补齐。
- `refineNineTurnPill` 前置由法宝改为研究 + 建筑：为避免回锁，迁移时对**已炼成 `alchemyCauldron`** 的旧档补发 `alchemyEssence`（若其前置已满足）；否则保留原有解锁标记。不重复收费。
- 护道表与研究费用由 `pill` 迁移到 `condensePill` 时，旧档已存 `pill` 仍可正常使用，不回退、不补偿。

#### 1.8 数据改动清单（落库时）

| 文件 | 改动 |
| --- | --- |
| `src/data/resources.js` | （若采纳二级丹）新增 `condensePill`；插入「丹符器物」组 |
| `src/data/upgrades.js` | 新增 `alchemyEssence`；`matAlchemy.ids` 调整、`hint` 恢复标准写法 |
| `src/data/techniques.js` | `alchemyFire.needs` 去 `forgeArt` |
| `src/data/buildings.js` | 新增 `pillFurnace`；`medicineVault`／`storeVoidArt` 等补 `condensePill` 仓容（若采纳二级丹） |
| `src/data/crafts.js` | 新增 `condensePill` 配方；`refineNineTurnPill` 前置与用料调整（`refinePill` 不改） |
| `src/data/industry.js` | `condensePill` 配方映射到 `alchemy` 工位 |
| `src/data/realms.js` | 护道表：元婴／化神档由 `nineTurnPill` 迁移到 `condensePill`（待校准） |
| 其它研究费用 | `pill`／`nineTurnPill` 费用按新层级重排（待校准） |
| 界面/文本 | 资源分组显示、`effectsText.js`／`unlockText.js` 覆盖新节点 |
| 生成表/文档 | 重新生成 [TABLES.md](TABLES.md)，同步 DESIGN／RESEARCH／CRAFT-PROGRESSION／changelog |

#### 1.9 待校准数值

工艺节点费用与前置、二级丹 `condensePill` 的产物/用料/仓容、丹鼎造价与效果、`refineNineTurnPill` 的境界门槛与用料、护道表与研究费用的迁移范围、丹火纯青解耦后的前置。

## 2. 香火研究线

### 现状

- 香火 `faith` 唯一常规产出是香使职位 `incenseKeeper`（0.02/秒，需山门 ≥ 1）；无香火产出建筑或配方。
- 研究链：香火愿 `incenseVow`（原理，解锁山门）→ 香火志 `incenseStudy`（解锁香火鼎）；祖师遗泽 `ancestorArt` 归「宗门经营」组，解锁祖师殿。
- 技艺页：香火愿力／祖师香火／迎香礼（增幅）；法宝聚愿鼎。
- 末期出口：祖师殿、因果池（香火 +50%）。
- 「愿力」无独立实现，仅作文案/天赋名。
- 香火志需香火 200，但基础上限仅 100、扩容建筑（香火鼎）又由它自己解锁 → 隐含未声明的「山门 ≥ 2」。

### 缺口

- 三层不齐；研究链跨组，UI 上「香火愿→香火志→祖师遗泽」不连成可见链。
- 香火产出单一、无独立扩产手段（完全依赖人力分配）。
- 隐含前置未声明。
- 祖师殿之后无香火专属高阶出口，用途几乎全在消耗端。
- 命名漂移：文档「祖师堂」与数据「祖师殿」（`ancestorHall`）不一致。

### 完整设计（已实施 · v0.38）

以下为香火线的完整设计，**已于 v0.38 落入源码**；id、费用与字段以源码为准，标注「待校准」者仍待实测后定案。

#### 2.1 三层归位（含链终点）

| 层 | 载体 | 位置 | 变动 |
| --- | --- | --- | --- |
| 原理 | `incenseVow` 香火愿 | 修真页 · 香火族 | 保留 |
| 精研 | `incenseStudy` 香火志、`ancestorArt` 祖师遗泽 | 修真页 · 香火族 | `ancestorArt` **归位**（由「宗门经营」移入） |
| 工艺 | 愿力研究（承接渡劫护道机制，见 §2.3） | 修真页 · 香火族 | **新增**（id 待定） |
| 纯数值 · 应用升级 | `incensePower`／`ancestorIncense`／`incenseRite` | 技艺页 | 保留 |

- 分组 `matIncense`：`ids` 由 `['incenseVow','incenseStudy']` 改为 `['incenseVow','incenseStudy','ancestorArt']`（并入愿力研究）；`hint` 采用标准「原理 → 工艺 → 精研」。
- 链路「香火愿 → 香火志 → 祖师遗泽 → 祖师殿」在香火族内连成一条可见链。

#### 2.2 香火获取（人力扩产）

- 既定：**香火 = 人力产出**（香使 `incenseKeeper`，base 0.02）；不新增自带 `prod.faith` 的建筑或配方。
- 扩产手段（人力侧）：全局 `ratio.faith`（香火鼎 +30%、祖师殿 +50%、因果池 +50%、法宝聚愿鼎 +40%）、香使 `jobRatio`（迎香礼 +35%）、弟子数与岗位拥挤。
- **建议补充**：新增中后期香使技艺（暂名《香火绵延》，id 待定），`effects: { jobRatio: { incenseKeeper: 0.3 } }`，`needs: { upgrades: ['incensePower'], building: { id: 'incenseCauldron', count: 1 } }`，弥补中期香火增速。待校准；可选。

#### 2.3 愿力与渡劫（核心机制）

- 定位：香火线能力递进的最高层，落在**渡劫 / 成道准备**；**可选投入**，不强制。
- **投入项**：把渡劫护道现有的「香火祈愿」**升级**为「立愿应劫（愿力）」，投入香火 `faith`（大额，建议 20000 起，待校准），可另附仙灵力 `immortalForce`（与[炼虚后变更文档](炼虚后变更文档.md) §5.3 呼应）；前 9 境的「香火祈愿」不变。
- **双重作用**：其一提高渡劫成功率（与现有护道并列）；其二**降低身死道消几率**——新增护道字段 `deathReduce`，引擎在身死概率上扣减（下限 0）。
- **配套技艺**：新增香火线后期技艺《愿力护道》`vowGuard`，提供**小额被动**减免 `tribulationSafety`（研究型保险），作用于**所有身死道消境界**（金丹起），与「立愿应劫」投入叠加但设上限。
- **引擎落点**：在 [progression.js](../src/game/systems/progression.js#L66-L71) 计算 `deathOnFailure` 处叠加 `deathReduce`；`BREAKTHROUGH_AIDS[10]` 条目扩展该可选字段（[realms.js](../src/data/realms.js#L170-L174)）。
- **边界**：「立愿应劫」投入只出现在渡劫；配套技艺《愿力护道》的被动减免则作用于**所有身死道消境界**（金丹起）；沿用「失败不退回投料」的现行规则。
- **实现须知**：`deathReduce` 是新引擎轴，需贯通 [progression.js](../src/game/systems/progression.js#L66-L71) 的 `deathOnFailure` 计算**与预览/UI**（`RealmPanel` 的 `deathRisk` 显示）及文案（`effectsText.js`）。它与「香火祈愿」的功能重叠，已由下条「分工」解决。
- **供需风险**：渡劫同时要香火 10000（祈愿）+ 愿力大额，而香火被定为**纯人力产出**，可能吃紧；须数值验证，避免渡劫变成香火黑洞。
- **分工（④，已定 2026-10-15）**：渡劫的「香火祈愿」升级为「立愿应劫（愿力）」，作为渡劫**唯一**的香火护道——既提高成功率、又给 `deathReduce`；前 9 境「香火祈愿」不变。同一资源不再出现两条功能重叠的护道，「愿力」成为渡劫的性能天花板，也缓解上条供需压力。

#### 2.4 隐含前置修正

- `incenseStudy` 现需香火 200，但基础上限仅 100、扩容建筑（香火鼎）又由它自己解锁 → 显式补 `needs.building: { id: 'gate', count: 2 }`（100 + 80×2 = 260 ≥ 200）；或上调香火基础上限，二选一。建议显式补 `gate ≥ 2`。

#### 2.5 高阶出口

- 愿力机制即香火线的最高出口；若祖师殿之后仍需实体出口，可另设香火类奇观/法宝（参见 [MIDGAME-EVENTS.md](MIDGAME-EVENTS.md)、[SPIRIT-ENERGY.md](SPIRIT-ENERGY.md)），避免香火只消耗不深化。可选。

#### 2.6 命名统一

- 文档「祖师堂」统一为「祖师殿」（`ancestorHall`）；ROADMAP 中的「道观」「信仰」在数据中不存在，文档不再使用。

#### 2.7 旧档兼容

- `ancestorArt` 归组不改 id，不影响已学记录与展示。
- `incenseStudy` 补 `gate ≥ 2`：已学者不回锁，未学者按新前置。
- 新增愿力护道与配套技艺：旧档缺字段按默认（无额外加成）处理，不补赠。

#### 2.8 数据改动清单（落库时）

| 文件 | 改动 |
| --- | --- |
| `src/data/upgrades.js` | `ancestorArt` 由 `sectOps` 移入 `matIncense`（**同步删 `sectOps.ids` 中该项，避免节点「消失」**）；`matIncense.ids` 补 `ancestorArt` 与愿力研究；新增愿力研究节点；`incenseStudy.needs` 补 `gate ≥ 2` |
| `src/data/techniques.js` | 新增《愿力护道》；（可选）新增《香火绵延》 |
| `src/data/realms.js` | `BREAKTHROUGH_AIDS[10]` 新增「立愿应劫」方案，扩展 `deathReduce` 字段 |
| `src/game/systems/progression.js` | `deathOnFailure` 叠加 `deathReduce`（护道 + 技艺） |
| `src/game/effectsText.js`／`unlockText.js` | 覆盖 `deathReduce`/新节点文案 |
| 生成表/文档 | 重新生成 [TABLES.md](TABLES.md)，同步 DESIGN／SPIRIT-ENERGY／changelog |

#### 2.9 待校准数值

愿力投入的香火/仙灵力数额与成功率/`deathReduce` 幅度、配套技艺的数值与前置、香使扩产技艺数值、`gate ≥ 2` 修法取舍。

## 3. 土木研究线

### 现状

- 原理/精研：土木术 `earthArt`（解锁库房）、土木精要 `earthEssence`（解锁材料库）、营造法式 `buildingCode`（解锁精舍）、混灵土工艺、玄铁骨架，均在土木族 `matEarth`。
- 土木族无自有工艺节点，hint 说明「工艺与草木族共用木作器械」。
- 营造节点（居所营造 `homePlanning`、引泉净水、园林营造）在「修真应用 · 营造」组 `appBuild`。
- 洞天福地 `grottoArt` 在「宗门经营」组 `sectOps`，解锁洞天与洞府。
- 复合建材（秘银／玄金／晶银）研究与产物归金铁族，但用于洞府／洞天／通天塔结构与储灵部件。
- 仓储技艺：叠匣术有 `warehouse ≥ 1` 前置；加固仓架／叠石固本／须弥纳芥仅境界前置。
- 造价：洞府／洞天造价含玄金（来源 `arcaneGoldArt`，realm 8），研究前置未约束来源。
- 历史补丁：库房门槛曾因「炼铁炉造价 > 矿石上限」的死锁被压低（[upgrades.js](../src/data/upgrades.js#L534-L537)）。

### 缺口

- 链跨三组（`matEarth`／`appBuild`／`sectOps`），终点不可见于土木族。
- 土木族无自有工艺节点。
- 「居所营造」三层分工不清：研究／技艺／建筑边界在数据上未划清。
- 建材来源未进前置。
- 仓储技艺前置口径不统一。
- 扩仓-造价循环风险仅靠历史补丁规避，仍集中在金丹（材料库）与炼虚（玄库→洞天）两处。

### 完整设计（已实施 · v0.38）

以下为土木线的完整设计，**已于 v0.38 落入源码**；id、费用与字段以源码为准，标注「待校准」者仍待实测后定案。

#### 3.1 三层归位（含链终点）

| 层 | 载体 | 位置 | 变动 |
| --- | --- | --- | --- |
| 原理 | `earthArt` 土木术 | 修真页 · 土木族 | 保留 |
| 工艺 | 新增《营造技艺》`masonryArt` | 修真页 · 土木族 | **新增**（暂时仅保留专业制作增益） |
| 精研 | `earthEssence` 土木精要、`buildingCode` 营造法式 | 修真页 · 土木族 | 保留 |

- **新增 `masonryArt`《营造技艺》**（修真族，工艺层）：2026-10-15 调整为暂时移除降低建筑造价的效果，仅保留专业加成 `craftBonusByResource { spiritMortar: 0.1, ironMortar: 0.1 }`。研究分组、前置 `{ upgrades: ['earthArt','woodworking'], building: { id: 'warehouse', count: 1 } }` 与费用 `{ insight: 1500, plank: 20, ore: 400 }` 保留；已学旧档也按原价建造。
- 分组 `matEarth`：`hint` 由「原理 → 精研（工艺与草木族共用木作器械）」改为标准「原理 → 工艺 → 精研」（族内含 `masonryArt`）；可给 `buildingCode` 增加 `masonryArt` 前置以串起工艺→精研（待校准）。
- **链终点归位**：`grottoArt`（洞天福地）由 `sectOps` 移入 `matEarth`，`matEarth.ids` 追加 `grottoArt`，使「土木术 → 土木精要 → 营造法式 → 洞天福地」在族内可见。

#### 3.2 三层分工边界

- 研究（修真页）= 知识解锁与结构能力；技艺（技艺页）= 容量/效率/节料/仓容比例；建筑 = 落地与宜居/仓储产出。
- 「居所营造」`homePlanning`、`waterSanitation`、`gardenDesign` **维持研究节点**（知识型，属「修真应用 · 营造」组），不迁入技艺页；文档需说明它们是土木线在宜居方向的应用延伸，并与 `masonryArt` 工艺分工划清（工艺=营造技艺增益，应用=具体宜居/营造条目）。

#### 3.3 建材来源前置与中后期仓储（已定）

- **现存矛盾**：[grotto](../src/data/buildings.js#L334)／`caveDwelling` 造价含 `arcaneGold`（来源 [smeltArcaneGold](../src/data/crafts.js#L239) = realm 8），但 [炼虚后变更文档](炼虚后变更文档.md#L176) 写「洞天（**化神—炼虚可达**）」。二者本就打架。
- **处置（2026-10-15）**：承认洞天／洞府为**合体档**，补 `realm: 8`，并改文档「化神—炼虚可达」表述；同时**新增一座中后期仓储建筑**承接化神—炼虚的扩仓需求，使洞天不再充当该阶段的仓储依赖。
- **新增仓储建筑**（暂名《广储库》，id 待定）：`realm: 7`（炼虚）；造价只用炼虚可得建材（玄铁混灵土／秘银等），**不含玄金**；`effects` 承接大宗原料与粒子／仙灵力定额（建议 `storageAll` + 关键资源定额，待校准）。填补「玄库 → 洞天」之间的扩仓空档。
- `heavenTower`（通天塔）已含 `realm: 9 + towerPlan`，保持。

#### 3.4 仓储技艺口径统一

- **已定（2026-10-15）**：起点 `storeFrameArt`（加固仓架）补 `building: { id: 'warehouse', count: 1 }`，与 `caseStackArt`（叠匣术）口径统一；`storeStoneArt`／`storeVoidArt` 沿链经 `storeFrameArt` 继承，不重复声明。

#### 3.5 防循环

- 把「扩仓研究费用由前级仓容承接」列为**硬检查项**；复核库房（`rock 200 + ore 60`，逼近矿石上限 250）、材料库（`needs warehouse ≥ 3`）、玄库 → 洞天 的造价 vs 前置仓容，避免重演 [upgrades.js](../src/data/upgrades.js#L534-L537) 的死锁。

#### 3.6 旧档兼容

- `grottoArt` 归组不改 id，不影响已学记录。
- `caveDwelling`／`grotto` 补 `realm` 门槛：已建者不回退，未建者按新门槛。
- 仓储技艺补建筑前置：已学者不回锁。

#### 3.7 数据改动清单（落库时）

| 文件 | 改动 |
| --- | --- |
| `src/data/upgrades.js` | `grottoArt` 由 `sectOps` 移入 `matEarth`（**同步删 `sectOps.ids` 中该项**）；`matEarth.hint`/`ids` 调整；新增 `masonryArt`；`buildingCode` 视需要加其前置 |
| `src/data/techniques.js` | `storeFrameArt.needs` 补 `warehouse ≥ 1`（`masonryArt` 改放修真族 `upgrades.js`） |
| `src/data/buildings.js` | 新增中后期仓储建筑《广储库》；`caveDwelling`／`grotto` 补 `realm: 8` 与建材来源说明 |
| 生成表/文档 | 重新生成 [TABLES.md](TABLES.md)，同步 DESIGN／HABITABILITY／CRAFT-PROGRESSION／changelog |

#### 3.8 待校准数值

`masonryArt` 费用/前置与专业制作增益数值、`buildingCode` 是否加其前置、新增仓储建筑《广储库》的门槛/造价/仓容、`caveDwelling`/`grotto` 的 `realm: 8`、库房/材料库/玄库造价与仓容的循环复核。建筑造价折扣暂时移除。

## 4. 跨线约束与验证

- 解锁口径、首启自举、防循环见 §0。
- 旧档：不换 id、不清已学、不补赠前置、防重复收费；新增节点按惯例补 `normalizeState` 与迁移。
- 三条线重排后需重跑来源/仓容可达性与节奏模拟；验证命令见 [ENGINEERING.md](ENGINEERING.md)：`npm run check`、`npm run docs:tables`、可达性审计与 `balance`。

## 5. 与 ROADMAP 的对应

| ROADMAP 条目 | 本文对应节 |
| --- | --- |
| 丹道研究 | §1 |
| 香火研究 | §2 |
| 土木研究 | §3 |

本文只给方向；具体节点、费用、效果与排期待定。

## 6. 评审结论（2026-10-15）

对本草案做过一轮核对，结论与处置如下。

| 项 | 结论 | 处置位置 |
| --- | --- | --- |
| 框架：工艺放技艺页还是修真页 | 两者都不对；应按**「是否承接新能力」**判定——承接新能力的工艺/精研进**修真材料族**，纯数值留**技艺页**（先例：木作器械自技艺迁回修真） | §0 法则 1 已重写；§1.1／§2.1／§3.1 已按此归位 |
| 丹道 `refinePill` 补研究前置 | **冗余**：`alchemyRoom` 已传递依赖《炼丹术》；原「口径不一」表述也不准 | §1.4 改为「不改」，§1.6 备注 |
| 丹道三级丹药 | 改动面大（新资源/仓储/护道表/研究费用）；**经评估采纳** | §1.2 已采纳 |
| 洞天补 `realm: 8` | 与文档「化神—炼虚可达」**冲突**；**定为合体档 + 新增中后期仓储建筑** | §3.3 已定 |
| 愿力 `deathReduce` | 新引擎轴，需贯通预览/UI/文案；与「香火祈愿」功能重叠 → **渡劫祈愿升级为「立愿应劫」，前 9 境不变** | §2.3 已定 |
| 土木 `masonryArt` | 暂时只保留混灵土／玄铁混灵土制作增益 | §3.1 已调整，建筑造价折扣移除 |
| 遗漏项：新资源仓容、移组同步 `ids` | 已补 | §1.2／§1.8、§2.8（`sectOps` 删项）、§3.7 |

**四项已于 v0.38 落库，2026-10-15 调整营造技艺效果**：① 二级丹 `condensePill` 采纳；② 洞天/洞府取合体档 + 新增中后期仓储建筑《广储库》；③ `masonryArt` 暂时移除建筑造价折扣，保留专业制作增益；④ 渡劫「香火祈愿」升级为「立愿应劫（愿力）」，前 9 境不变。
