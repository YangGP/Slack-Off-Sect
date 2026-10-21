# 修真链重排与费用改造：问题摘要（2026-10-22）

> 当前状态：Codex 已按用户要求直接修正；下文一至五节保留修改前的问题材料，费用与结果以本节及末尾对照为准。未进行长时间平衡模拟。

本次修正包括：按产业进度拆分16个研究段，并让界面实际使用组内顺序；整理传递重复前置；按知识材料完整生产成本调整29项研究费用。其余记录型道札费用保持，不再按价格强制给心法等支线添加阵图。现有47项修真携带知识费用（原48项中，阵基装配已移除道札），末尾逐项对照。

来源审计已补固定外交、配方原料仓容、凝愿与仪轨条件，并限制扩仓至实际需求以保证收敛。实际运行结果为 **169/169 项可参悟，全部建筑可营造，exit 0**；仍有29条来源顺序提示，仅表示材料来源晚于研究前置满足，不代表实际界面提前显示或游戏死锁。秘银和灵晶的首个稳定来源分别是银溪谷与星崖观的固定交易。

保留7个直接研究境界条件，知识配方仍为筑基纸、金丹道札、元婴道论、化神阵图；秘银仍在炼虚自制，凝晶仍每份消耗0.01秘银。旧档已学标记与效果保留，不追缴、退款或批量补上游，本轮不新增存档迁移。

本次仅执行局部快速核对、来源审计及静态检查，均限制单次5秒；未运行全量测试、应用构建或长期平衡模拟。按用户后续要求，已移除本次新建的局部测试脚本及入口，不新增测试用例。

## 一、本轮已做的改动

1. **境界门禁收敛**：39 → 7
   - 保留：观星术（金丹例外）、灵子论（元婴）、灵能输配（炼虚）、仙灵初探（合体）、因果通感（合体）、仙灵聚合（大乘）、因果参同契（大乘）。
   - 其余 32 个修真项移除 `needs.realm`；金丹前改为链式前置。
2. **知识材料进入修真费用**：48 个灵机 ≥ 3000 的修真项
   - 3k～15k：道札 `ceil(灵机/1000)`；
   - 15k～45k：道论 `ceil(灵机/5000)`；
   - 45k～100k：阵图 `ceil(灵机/30000)`；
   - 100k+：阵图 `ceil(灵机/20000)`。
3. **灵机下调**：同 48 项灵机 ×80%，四舍五入到百位；知识材料数量不变。
4. **粗料与特殊材料裁剪**：粗料减半；再按研究主题只保留相关材料，无关联材料移除。
5. **补来源前置**：47 个修真项按知识材料补《抄纸法》《讲经法》《凝晶原理》《复合符文》《观星术》。
6. **知识载体前移**：新增「知识载体 · 纸与讲经」段，包含《抄纸法》《符文入门》《讲经法》；《讲经法》不再依赖《阵基装配》，改为《符文入门》＋《抄纸法》。

## 二、当前验证结果

- `node --check src/data/upgrades.js`：通过。
- 修真：85 项；境界门禁：7 个；无环。
- `npm run audit:sources`：**exit 1**。
  - 可参悟：116 / 169。
  - 警告：46 条（改造前首轮 80，修循环后 52）。
  - 剩余主要是灵晶、阵图、灵器、玄金、秘银等晚期产物“无来源”，以及 26 座晚期建筑死锁/露面层 null。
- `docs/TABLES.md` 已重新生成。
- 未运行功能测试或平衡模拟。

## 三、核心问题

### P1：页面分段顺序仍不是拓扑顺序

`CULTIVATION_STAGES` 只前移了「知识载体」，但大量节点仍留在更早的「灵气研究 Ⅱ/Ⅲ」等段：

- `liquidArt`、`qiPurify`、`crystalTheory` 在「灵气 Ⅱ 凝聚」，却已依赖《抄纸法》《讲经法》；
- `astrologyArt`、`hourArt`、`arrayBasics`、`arrayMastery` 在「灵气 Ⅲ 调控」，却依赖知识链/阵基；
- `paperWorks` 在「材料 · 草木」，却依赖《讲经法》；
- `mithrilArt`、`arcaneGoldArt`、`crystalSilverArt` 在「材料 · 金铁」，却依赖符文/阵基链。

结果：玩家会在页面早期看到一批“已经被知识材料卡住”的节点，实际顺序与阅读顺序不一致。

### P2：补来源前置造成依赖膨胀

47 个节点被补了 2～5 个上游研究前置。例如：

- `liquidArt` 现在需要 `qiLiquid + paperArt + preachArt`；
- `towerPlan` 现在需要 `arrayMastery + buildingCode + compositeRune + paperArt + preachArt + crystalTheory + astrologyArt`。

需要判断：这是“知识材料应有的上游”，还是把中段节点推得过深。更合理的方向可能是**把知识载体整体前移**，而不是给每个节点补一长串来源。

### P3：晚期产物仍无来源

审计剩余 46 条里，大多数是：

- `灵晶`：配方需要秘银催化剂，秘银/灵晶又依赖外交或更晚的提炼；
- `阵图`、`灵器`、`玄金`、`秘银`：晚期配方境界门槛＋深层前置；
- 26 座晚期建筑（晶核阵、洞府、通天塔、因果池等）因此被判死锁。

`audit:sources` **不模拟外交交易/机缘**，所以秘银、灵晶的 `∞` 有一部分是审计盲区，不一定是真实死锁；需要区分“审计不建模”和“确实无来源”。

### P4：费用规则是首版，未做平衡验证

- 知识材料数量、灵机 ×0.8、粗料减半、按主题裁剪，都是语义规则，不是实测校准；
- 部分节点现在只剩“灵机＋知识材料”（如凝液法、试炼法、大乘心经），可能过轻或过重；
- 尚未跑前期/中期节奏、破境可达性、研究总成本对照。

### P5：旧档与可见性

- 移除境界门禁不会回锁已研究项；
- 新增上游前置会让未研究节点出现得更晚；
- 已研究但新前置未满足的旧档，需要确认 UI/购买逻辑是否仍正常；
- 目前没有迁移处理。

### P6：早期链路被改硬

- `paperArt` 补了“药圃 ≥ 1”，否则灵草来源晚于研究可见；
- `preachArt` 改挂《抄纸法》后，道札来源提前，但知识链仍受符文入门/炼器链影响；
- 需要确认前期手动步骤是否过长。

## 四、建议 Codex 重点看

1. **是否采用“阶段整体重排”而不是“逐节点补前置”**：
   建议顺序：灵气 I → 材料基础 → 知识载体（纸/符/讲经）→ 凝液/凝晶 → 符文/阵基 → 观星/阵法 → 高阶。
2. **47 个补来源前置是否都必要**：能否把来源链前移、删掉重复前置。
3. **费用规则是否合理**：知识材料档位、灵机 ×0.8、粗料减半、按主题裁剪。
4. **晚期来源**：灵晶/阵图/灵器/秘银是补研究前置、改配方境界、还是承认外交来源并让审计排除。
5. **旧档兼容**：新增前置对已研究节点的影响。
6. **审计口径**：`audit:sources` 不模拟外交，是否需要在工具里标注/排除，否则会持续 fail。

## 五、涉及文件

- `src/data/upgrades.js`：境界、费用、前置、分段。
- `src/data/crafts.js`：`paperArt` 药圃前置、知识配方。
- `src/data/techniques.js`、`src/modules/hunting/data.js`：前一轮境界/前置调整。
- `docs/TABLES.md`：重新生成。
- `docs/REALM-GATE-TECH-CHAIN-REVIEW-2026-10-22.md`：设计/执行记录。

## 六、当前费用对照

HEAD 为 v0.424 提交 `5cbc056`；“修正前”为本次接手的未提交工作区，不等同于 HEAD。折算仅统计直接灵机与知识材料内含灵机，未计其他实验材料、灵纸原料、增产、节料或加工耗时。道札/道论/阵图按每份100/3500/41000灵机展开。

本轮直接指定每项费用，以研究用途分配知识种类和数量。多数保留已有灵机尾款，湮灭、灵能与仙灵工程则扣除阵图内含灵机后重分配尾款；不使用运行时自动改价公式。折算是预算核对，实际节奏仍待后续测量。

| 研究 | HEAD 费用 | 修正前费用 | 当前费用 | 当前折算灵机 |
| --- | --- | --- | --- | ---: |
| 凝液法 `liquidArt` | `{ insight: 6000, wood: 300, stone: 40 }` | `{ insight: 4800, daoNote: 6 }` | `{ insight: 4800, daoNote: 6 }` | 5400 |
| 灵气纯化 `qiPurify` | `{ insight: 3000, stone: 300, plank: 20 }` | `{ insight: 2400, daoNote: 3 }` | `{ insight: 2400, daoNote: 3 }` | 2700 |
| 凝晶原理 `crystalTheory` | `{ insight: 8000 }` | `{ insight: 6400, daoNote: 8 }` | `{ insight: 6400, daoNote: 8 }` | 7200 |
| 观星术 `astrologyArt` | `{ insight: 9000, talisman: 6, daoNote: 12 }` | `{ insight: 7200, talisman: 6, daoNote: 12 }` | `{ insight: 7200, talisman: 6, daoNote: 12 }` | 8400 |
| 候时法 `hourArt` | `{ insight: 24000, stone: 1200, talisman: 5 }` | `{ insight: 19200, daoTreatise: 5 }` | `{ insight: 19200, daoTreatise: 1 }` | 22700 |
| 阵法初解 `arrayBasics` | `{ insight: 30000, talisman: 12, artifact: 3 }` | `{ insight: 24000, talisman: 12, artifact: 3, daoTreatise: 6 }` | `{ insight: 24000, talisman: 12, artifact: 3, daoTreatise: 1 }` | 27500 |
| 阵道精通 `arrayMastery` | `{ insight: 60000, talisman: 25, spiritTalisman: 4 }` | `{ insight: 48000, talisman: 25, spiritTalisman: 4, arrayDiagram: 2 }` | `{ insight: 48000, talisman: 25, spiritTalisman: 4, daoTreatise: 3 }` | 58500 |
| 灵子论 `particleTheory` | `{ insight: 18000, crystal: 40, spiritTalisman: 6, daoTreatise: 4 }` | `{ insight: 14400, crystal: 40, daoTreatise: 4 }` | `{ insight: 14400, crystal: 40, daoTreatise: 1 }` | 17900 |
| 阴阳分灵 `yinyangSplit` | `{ insight: 36000, stone: 12000, spiritArtifact: 6, daoTreatise: 8 }` | `{ insight: 28800, spiritArtifact: 6, daoTreatise: 8 }` | `{ insight: 28800, spiritArtifact: 6, daoTreatise: 2 }` | 35800 |
| 湮灭法 `annihilationArt` | `{ insight: 90000, nineTurnPill: 30, spiritTalisman: 30, arrayDiagram: 3 }` | `{ insight: 72000, nineTurnPill: 30, spiritTalisman: 30, arrayDiagram: 3 }` | `{ insight: 49000, nineTurnPill: 30, spiritTalisman: 30, arrayDiagram: 1 }` | 90000 |
| 灵能输配 `energyApplication` | `{ insight: 135000, crystal: 60, spiritArtifact: 12, arrayDiagram: 6 }` | `{ insight: 108000, crystal: 60, spiritArtifact: 12, arrayDiagram: 7 }` | `{ insight: 94000, crystal: 60, spiritArtifact: 12, arrayDiagram: 1 }` | 135000 |
| 仙灵初探 `immortalDiscovery` | `{ insight: 180000, crystal: 100, spiritArtifact: 16, arrayDiagram: 8 }` | `{ insight: 144000, crystal: 100, spiritArtifact: 16, arrayDiagram: 9 }` | `{ insight: 139000, crystal: 100, spiritArtifact: 16, arrayDiagram: 1 }` | 180000 |
| 仙灵聚合 `immortalIndustry` | `{ insight: 300000, nineTurnPill: 40, spiritArtifact: 24, arcaneGold: 8, arrayDiagram: 12 }` | `{ insight: 240000, spiritArtifact: 24, arcaneGold: 8, arrayDiagram: 15 }` | `{ insight: 218000, spiritArtifact: 24, arcaneGold: 8, arrayDiagram: 2 }` | 300000 |
| 因果通感 `karmaSense` | `{ insight: 160000, stone: 40000, pill: 100 }` | `{ insight: 128000, pill: 100, arrayDiagram: 8 }` | `{ insight: 128000, pill: 100, daoTreatise: 9 }` | 159500 |
| 塔院图 `towerPlan` | `{ insight: 180000, stone: 80000, artifact: 30, plank: 60, steel: 15 }` | `{ insight: 144000, stone: 40000, artifact: 30, plank: 30, steel: 8, arrayDiagram: 9 }` | `{ insight: 139000, stone: 40000, artifact: 30, plank: 30, steel: 8, arrayDiagram: 1 }` | 180000 |
| 因果参同契 `karmaConcord` | `{ insight: 280000, talisman: 200, pill: 300, faith: 20000, nineTurnPill: 40, spiritTalisman: 25, spiritTreasure: 2 }` | `{ insight: 224000, faith: 20000, spiritTreasure: 2, arrayDiagram: 14 }` | `{ insight: 224000, faith: 20000, spiritTreasure: 2, daoTreatise: 16 }` | 280000 |
| 心印法 `mindSeal` | `{ insight: 70000, pill: 120, herb: 6000 }` | `{ insight: 56000, pill: 120, arrayDiagram: 3 }` | `{ insight: 56000, pill: 120, daoTreatise: 4 }` | 70000 |
| 大乘心印 `greatVehicleSeal` | `{ insight: 140000, artifact: 60, talisman: 120, plank: 40, spiritTreasure: 1 }` | `{ insight: 112000, artifact: 60, spiritTreasure: 1, arrayDiagram: 7 }` | `{ insight: 112000, artifact: 60, spiritTreasure: 1, daoTreatise: 8 }` | 140000 |
| 大乘心经 `mahayanaArt` | `{ insight: 160000, artifact: 60, talisman: 60, pill: 60 }` | `{ insight: 128000, arrayDiagram: 8 }` | `{ insight: 128000, daoTreatise: 9 }` | 159500 |
| 纸坊规制 `paperWorks` | `新增` | `{ insight: 2400, wood: 450, herb: 150, daoNote: 3 }` | `{ insight: 2400, wood: 450, herb: 150, daoNote: 3 }` | 2700 |
| 器道精微 `artifactLore` | `{ insight: 40000, artifact: 25, ore: 4000, plank: 20 }` | `{ insight: 32000, artifact: 25, daoTreatise: 8 }` | `{ insight: 32000, artifact: 25, daoTreatise: 2 }` | 39000 |
| 镇守纹 `guardRune` | `{ insight: 12000, stone: 200, qi: 1200 }` | `{ insight: 9600, stone: 100, qi: 1200, daoNote: 12 }` | `{ insight: 9600, stone: 100, qi: 1200, daoNote: 12 }` | 10800 |
| 纳灵纹 `capacityRune` | `{ insight: 14000, wood: 250, spiritLiquid: 2 }` | `{ insight: 11200, spiritLiquid: 1, daoNote: 14 }` | `{ insight: 11200, spiritLiquid: 1, daoNote: 14 }` | 12600 |
| 复合符文 `compositeRune` | `{ insight: 24000, crystal: 10, steel: 5 }` | `{ insight: 19200, crystal: 10, steel: 3, daoTreatise: 5 }` | `{ insight: 19200, crystal: 10, steel: 3, daoTreatise: 1 }` | 22700 |
| 凝晶工艺 `crystalCraft` | `{ insight: 10000, talisman: 6, ore: 80 }` | `{ insight: 8000, talisman: 6, ore: 40, daoNote: 10 }` | `{ insight: 8000, talisman: 6, ore: 40, daoNote: 10 }` | 9000 |
| 晶纹精修 `crystalPolishing` | `{ insight: 16000, crystal: 8, talisman: 20 }` | `{ insight: 12800, crystal: 8, talisman: 20, daoTreatise: 4 }` | `{ insight: 12800, crystal: 8, talisman: 20, daoNote: 16 }` | 14400 |
| 符法精微 `talismanLore` | `{ insight: 45000, talisman: 120, wood: 6000 }` | `{ insight: 36000, talisman: 120, arrayDiagram: 2 }` | `{ insight: 36000, talisman: 120, daoTreatise: 2 }` | 43000 |
| 丹道精微 `alchemyEssence` | `{ insight: 3600, herb: 2400, pill: 40, immortalHerb: 10 }` | `{ insight: 2900, herb: 1200, pill: 40, immortalHerb: 10, daoNote: 4 }` | `{ insight: 2900, herb: 1200, pill: 40, immortalHerb: 10, daoNote: 4 }` | 3300 |
| 营造法式 `buildingCode` | `{ insight: 20000, plank: 20, steel: 4 }` | `{ insight: 16000, plank: 10, steel: 2, daoTreatise: 4 }` | `{ insight: 16000, plank: 10, steel: 2, daoTreatise: 1 }` | 19500 |
| 静心诀 `calmMind` | `{ insight: 6000, herb: 200 }` | `{ insight: 4800, herb: 100, daoNote: 6 }` | `{ insight: 4800, herb: 100, daoNote: 6 }` | 5400 |
| 因材施教 `adaptiveTeaching` | `{ insight: 4800, faith: 600 }` | `{ insight: 3800, daoNote: 5 }` | `{ insight: 3800, daoNote: 5 }` | 4300 |
| 祖师遗泽 `ancestorArt` | `{ insight: 30000, stone: 900, talisman: 8 }` | `{ insight: 24000, stone: 450, talisman: 8, daoTreatise: 6 }` | `{ insight: 24000, stone: 450, talisman: 8, daoTreatise: 1 }` | 27500 |
| 洞天福地 `grottoArt` | `{ insight: 60000, stone: 3500, artifact: 12 }` | `{ insight: 48000, stone: 1750, artifact: 12, arrayDiagram: 2 }` | `{ insight: 48000, stone: 1750, artifact: 12, daoTreatise: 3 }` | 58500 |
| 龟息功 `longBreath` | `{ insight: 6000, stone: 5000, pill: 40 }` | `{ insight: 4800, pill: 40, daoNote: 6 }` | `{ insight: 4800, pill: 40, daoNote: 6 }` | 5400 |
| 定息法 `breathArt` | `{ insight: 18000, pill: 40, plank: 20 }` | `{ insight: 14400, pill: 40, daoTreatise: 4 }` | `{ insight: 14400, pill: 40, daoNote: 18 }` | 16200 |
| 试炼法 `trialArt` | `{ insight: 18000, pill: 60, herb: 2000 }` | `{ insight: 14400, daoTreatise: 4 }` | `{ insight: 14400, daoTreatise: 1 }` | 17900 |
| 山门志 `gateRecord` | `{ insight: 30000, faith: 4000, artifact: 10 }` | `{ insight: 24000, faith: 4000, daoTreatise: 6 }` | `{ insight: 24000, faith: 4000, daoNote: 30 }` | 27000 |
| 混灵土工艺 `spiritMortarArt` | `{ insight: 10000, stone: 100, spiritLiquid: 2 }` | `{ insight: 8000, stone: 50, spiritLiquid: 1, daoNote: 10 }` | `{ insight: 8000, stone: 50, spiritLiquid: 1, daoNote: 10 }` | 9000 |
| 玄铁骨架 `ironMortarArt` | `{ insight: 18000, spiritMortar: 4, ore: 100 }` | `{ insight: 14400, spiritMortar: 4, ore: 50, daoTreatise: 4 }` | `{ insight: 14400, spiritMortar: 4, ore: 50, daoTreatise: 1 }` | 17900 |
| 秘银提炼 `mithrilArt` | `{ insight: 30000, rock: 1000, qi: 1000 }` | `{ insight: 24000, rock: 500, qi: 1000, daoTreatise: 6 }` | `{ insight: 24000, rock: 500, qi: 1000, daoTreatise: 1 }` | 27500 |
| 玄金熔炼 `arcaneGoldArt` | `{ insight: 60000, mithril: 4, spiritLiquid: 8 }` | `{ insight: 48000, mithril: 4, spiritLiquid: 4, arrayDiagram: 2 }` | `{ insight: 48000, mithril: 4, spiritLiquid: 4, daoTreatise: 3 }` | 58500 |
| 晶银复合 `crystalSilverArt` | `{ insight: 100000, crystal: 10, mithril: 5 }` | `{ insight: 80000, crystal: 10, mithril: 5, arrayDiagram: 5 }` | `{ insight: 80000, crystal: 10, mithril: 5, daoTreatise: 5 }` | 97500 |
| 石作规制 `stoneWorks` | `新增` | `{ insight: 2400, rock: 450, ore: 150, daoNote: 3 }` | `{ insight: 2400, rock: 450, ore: 150, daoNote: 3 }` | 2700 |
| 蚀刻原理 `etchTheory` | `{ insight: 8000, wood: 400, ore: 100 }` | `{ insight: 6400, ore: 50, daoNote: 8 }` | `{ insight: 6400, ore: 50, daoNote: 8 }` | 7200 |
| 注灵原理 `infuseTheory` | `{ insight: 10000, stone: 500, qi: 800 }` | `{ insight: 8000, stone: 250, qi: 800, daoNote: 10 }` | `{ insight: 8000, stone: 250, qi: 800, daoNote: 10 }` | 9000 |
| 凝析原理 `precipitateTheory` | `{ insight: 12000, crystal: 6, spiritLiquid: 6 }` | `{ insight: 9600, crystal: 6, spiritLiquid: 3, daoNote: 12 }` | `{ insight: 9600, crystal: 6, spiritLiquid: 3, daoNote: 12 }` | 10800 |
| 回火原理 `temperTheory` | `{ insight: 14000, steel: 6, artifact: 8 }` | `{ insight: 11200, steel: 3, artifact: 8, daoNote: 14 }` | `{ insight: 11200, steel: 3, artifact: 8, daoNote: 14 }` | 12600 |
