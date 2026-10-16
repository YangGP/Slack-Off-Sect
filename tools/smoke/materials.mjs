import { normalizeState, resetForReincarnation } from '../../src/game/state.js'
import { createBot } from '../player-bot.mjs'
import * as E from '../engine-fixture.mjs'
import { RESOURCES, RESOURCE_MAP } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { JOBS } from '../../src/data/jobs.js'
import { CULTIVATION, ALL_UPGRADES, UPGRADE_MAP } from '../../src/data/upgrades.js'
import { TECHNIQUES } from '../../src/data/techniques.js'
import { CRAFTS, CRAFT_MAP, craftCost } from '../../src/data/crafts.js'
import { exportSave, parseImport } from '../../src/game/save.js'
import { unlockGroups } from '../../src/game/unlockText.js'
import { newGame, successfulBreakthrough } from './fixtures.mjs'

export function goldenCoreProduction({ ok, close, section }) {
  section('金丹：修真、工艺、材料与建设闭环')
  {
    const { state: s, derived: d } = newGame()
    s.realm = 3
    for (const id of ['qiOrigin', 'qiGazing', 'qiMeasure', 'qiLiquid', 'condenseArt', 'liquidArt', 'earthArt', 'woodworking', 'herbStudy', 'talismanArt', 'forgeArt', 'qiRune', 'shapeRune', 'conductionRune']) s.upgrades[id] = true
    s.buildings.talismanHall = { count: 1, on: true }
    s.buildings.forge = { count: 1, on: true }
    Object.assign(s.resources, { insight: 50000, qi: 8000, spiritLiquid: 300, talisman: 1900, ore: 2000, plank: 640, artifact: 10, stone: 1000, wood: 2000 })
    E.recompute(s, d)
    ok('已掌握凝液仍须先纯化才能参悟凝晶', !E.isUpgradeUnlocked(s, UPGRADE_MAP.crystalTheory))
    ok('筑基参悟纯化后可继续凝晶，淬玄仍等待土木精要', E.research(s, d, 'qiPurify') && E.isUpgradeUnlocked(s, UPGRADE_MAP.crystalTheory) && !E.isUpgradeUnlocked(s, UPGRADE_MAP.steelWorking))
    s.realm = 4
    E.recompute(s, d)
    ok('金丹档先开放阵基装配、土木精要与灵流要诀', ['arrayAssembly', 'earthEssence', 'flowField'].every(id => E.isUpgradeUnlocked(s, UPGRADE_MAP[id])))
    ok('凝晶工艺与御剑术仍需各自研究前置', E.isUpgradeUnlocked(s, UPGRADE_MAP.crystalTheory) && !E.isUpgradeUnlocked(s, UPGRADE_MAP.crystalCraft) && !E.isUpgradeUnlocked(s, UPGRADE_MAP.swordFlight))
    ok('工艺条目显示它实际开放的配方', unlockGroups('arrayAssembly').crafts.includes('组装阵基'))
    // 采药人需要药圃才开工；灵草已有药圃10%加成，灵流要诀的30%与其相加。
    s.buildings.herbGarden = { count: 1, on: true }
    s.disciples.jobs.woodcutter = 1
    s.disciples.jobs.herbalist = 1
    s.disciples.total = 2
    E.recompute(s, d)
    const baseRates = { wood: d.rates.wood, herb: d.rates.herb }
    ok('增产前两条产线已在运转', baseRates.wood > 0 && baseRates.herb > 0)
    E.research(s, d, 'flowField')
    E.recompute(s, d)
    ok('灵流要诀给灵木与灵草各三成加成，与药圃加成相加，玄铁写在效果表内', close(d.rates.wood / baseRates.wood, 1.3) && close(d.rates.herb / baseRates.herb, 1.4 / 1.1) && UPGRADE_MAP.flowField.effects.ratio.ore === 0.3)
    s.buildings.warehouse = { count: 5, on: true }
    ok('阵基装配与材料库在金丹参悟', E.research(s, d, 'arrayAssembly') && E.research(s, d, 'earthEssence') && UPGRADE_MAP.earthEssence.needs.realm == null)
    ok('未见过玄钢前材料库不露面（渐进露出）', !d.unlockedBuildings.includes('depot'))
    ok('淬出几份玄钢后材料库露面', E.research(s, d, 'steelWorking') && E.craft(s, d, 'refineSteel', { times: 3 }) === 3 && d.unlockedBuildings.includes('depot'))
    ok('点修真不能直接制作灵晶或建成晶核阵', E.craft(s, d, 'condenseCrystal') === 0 && E.buyBuilding(s, d, 'crystalArray', 1) === 0)
    s.realm = 5
    E.recompute(s, d)
    ok('元婴研究凝晶原理后仍需掌握造价来源才露出晶核阵', E.research(s, d, 'crystalTheory') && !d.unlockedBuildings.includes('crystalArray'))
    ok('凝晶工艺在元婴用旧材料起步并露出晶核阵', E.research(s, d, 'crystalCraft') && d.unlockedBuildings.includes('crystalArray'))
    const qiBefore = s.resources.qi
    const liquidBefore = s.resources.spiritLiquid
    const talismanBefore = s.resources.talisman
    const stoneBefore = s.resources.stone
    const crystalNeed = BUILDING_MAP.crystalArray.cost.crystal
    const arrayNeed = BUILDING_MAP.crystalArray.cost.arrayBase
    const crystalMade = E.craft(s, d, 'condenseCrystal', { times: crystalNeed })
    ok('灵晶确实由灵液与灵气加工，不消耗符箓与灵石', crystalMade === crystalNeed && s.resources.spiritLiquid === liquidBefore - CRAFT_MAP.condenseCrystal.cost.spiritLiquid * crystalNeed && s.resources.talisman === talismanBefore && s.resources.qi === qiBefore - CRAFT_MAP.condenseCrystal.cost.qi * crystalNeed && s.resources.stone === stoneBefore)
    ok('学工艺后能加工阵基并完成第一座晶核阵', E.craft(s, d, 'assembleArrayBase', { times: arrayNeed }) === arrayNeed && E.buyBuilding(s, d, 'crystalArray', 1) === 1)
    ok('晶核阵消费成品并扩充灵晶仓储', s.resources.crystal === 0 && s.resources.arrayBase === 0 && d.max.crystal === 45)
    const recipe = CRAFT_MAP.condenseCrystal
    const beforeRate = E.eventResourceRate(s, d, 'crystal')
    const beforeYield = E.craftYield(d, recipe)
    s.upgrades.crystalPolishing = true
    E.recompute(s, d)
    ok('凝晶精修减少每份耗料并提高加工效率，单份收益不变', close(E.craftYield(d, recipe), beforeYield) && craftCost(d, recipe).qi === 240 && d.craftSpeedByRecipe.condenseCrystal === 0.25)
    d.rates = { qi: 600, wood: 80, ore: 40 }
    const crystalRate = E.eventResourceRate(s, d, 'crystal')
    d.craftBonusByResource.crystal += 0.5
    ok('工艺奖励计价使用同一专业加成', E.eventResourceRate(s, d, 'crystal') > crystalRate && beforeRate >= 0)
    s.upgrades.intuition = true
    Object.assign(s.resources, { qi: 3000, talisman: 900, crystal: 0 })
    s.autoCraft.condenseCrystal = true
    s.settings.autoCraftOn = true
    E.recompute(s, d)
    E.setCraftTarget(s, d, 'condenseCrystal', 2)
    E.simulateOffline(s, d, 30)
    ok('灵晶离线自动制作遵守目标并结转已有小数收益', s.resources.crystal === 2 && s.resources.talisman === 900 && s.craftTargets.condenseCrystal === 2)
    const saved = parseImport(exportSave(s))
    ok('灵晶工艺与库存目标可以存读档', saved.resources.crystal === 2 && saved.upgrades.crystalCraft && saved.craftTargets.condenseCrystal === 2)
    const old = normalizeState({ resources: { stone: 17 }, buildings: { observatory: { count: 1, on: true } } })
    ok('旧档保留库存与建筑，新增灵晶补零', old.resources.stone === 17 && old.resources.crystal === 0 && E.isBuildingUnlocked(old, 'observatory'))
    resetForReincarnation(s, 0)
    ok('重修清空灵晶和本世工艺', s.resources.crystal === 0 && !s.upgrades.crystalCraft)
  }
}
