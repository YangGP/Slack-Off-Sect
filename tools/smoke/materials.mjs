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
  section('知识加工链：来源、消费、自动与旧档')
  {
    const { state: s, derived: d } = newGame()
    const recipes = ['recordDaoNote', 'compileDaoTreatise', 'drawArrayDiagram'].map(id => CRAFT_MAP[id])
    for (const id of ['preachArt', 'crystalTheory', 'compositeRune', 'astrologyArt', 'intuition']) s.upgrades[id] = true
    for (const [id, count] of Object.entries({ scriptureArchive: 20, academy: 5, observatory: 5, warehouse: 10, talismanHall: 4 })) s.buildings[id] = { count, on: true }
    for (const [realm, expected] of [[3, 0], [4, 1], [5, 2], [6, 3]]) {
      s.realm = realm
      E.recompute(s, d)
      ok(`知识链在境界${realm}只开放前${expected}层`, recipes.filter(c => E.isCraftUnlocked(s, c)).length === expected)
    }
    s.resources.insight = 20000
    s.resources.wood = 10000
    ok('道札可手动批量制作，扣除灵机和书写材料', E.craft(s, d, 'recordDaoNote', { times: 200 }) === 200 && s.resources.daoNote === 200 && s.resources.insight === 0 && s.resources.wood === 0)
    s.resources.insight = 15000
    ok('道札汇为道论，确实消耗上游知识', E.craft(s, d, 'compileDaoTreatise', { times: 10 }) === 10 && s.resources.daoNote === 0 && s.resources.daoTreatise === 10 && s.resources.insight === 0)
    Object.assign(s.resources, { insight: 6000, talisman: 5 })
    ok('道论与符箓绘为阵图', E.craft(s, d, 'drawArrayDiagram') === 1 && s.resources.daoTreatise === 0 && s.resources.arrayDiagram === 1 && s.resources.insight === 0 && s.resources.talisman === 0)
    Object.assign(s.resources, UPGRADE_MAP.particleTheory.cost)
    s.upgrades.particleTheory = false
    const theoryNeed = s.resources.daoTreatise
    ok('灵子论研究实际消耗道论', E.research(s, d, 'particleTheory') && theoryNeed > 0 && s.resources.daoTreatise === 0)
    Object.assign(s.resources, E.buildingCost(s, 'observatory', 1))
    const notes = s.resources.daoNote
    ok('观星台扩建实际消耗道札', E.buyBuilding(s, d, 'observatory', 1) === 1 && notes > 0 && s.resources.daoNote === 0)
    s.buildings.workshop = { count: 1, on: true }
    E.recompute(s, d)
    Object.assign(s.resources, { insight: 1700, wood: 850, daoNote: 0 })
    ok('知识材料沿用制作增产和小数累计', E.craft(s, d, 'recordDaoNote', { times: 17 }) === 18 && close(s.craftProgress.recordDaoNote, 0.02))
    Object.assign(s.resources, { insight: 750, wood: 2000, daoNote: 0, daoTreatise: 0, arrayDiagram: 0 })
    s.settings.autoCraftOn = true
    s.autoCraft.recordDaoNote = true
    E.setCraftTarget(s, d, 'recordDaoNote', 2)
    s.settings.craftReserves = { insight: 500 }
    E.simulateOffline(s, d, 120)
    ok('知识自动加工遵守目标和灵机保留量', s.resources.daoNote === 2 && s.resources.insight >= 500 && s.resources.insight < 750)
    const restored = parseImport(exportSave(s))
    ok('知识库存、进度与自动设置可以存读档', restored.resources.daoNote === 2 && close(restored.craftProgress.recordDaoNote, s.craftProgress.recordDaoNote) && restored.autoCraft.recordDaoNote && restored.settings.craftReserves.insight === 500)
    const legacy = normalizeState({ realm: 6, upgrades: { particleTheory: true }, buildings: { observatory: { count: 1, on: true } }, resources: { insight: 100 } })
    ok('旧档知识补零、不追缴已有研究建筑', recipes.every(c => legacy.resources[c.out] === 0) && legacy.upgrades.particleTheory && legacy.buildings.observatory.count === 1 && legacy.resources.insight === 100)
    resetForReincarnation(s, 0)
    ok('重修清空本世知识库存', recipes.every(c => s.resources[c.out] === 0))
  }
  section('悟道专精：门槛、扣料与实际岗位产出')
  {
    const { state: s, derived: d } = newGame()
    s.realm = 4
    s.upgrades.zuowangArt = true
    s.buildings.library = { count: 5, on: true }
    s.buildings.academy = { count: 2, on: true }
    s.buildings.scriptureArchive = { count: 30, on: true }
    s.disciples.total = 1
    s.disciples.jobs.scholar = 1
    E.recompute(s, d)
    ok('经义互证不能在金丹提前购买', !E.isUpgradeUnlocked(s, UPGRADE_MAP.scriptureDebate) && !E.research(s, d, 'scriptureDebate'))
    s.realm = 5
    E.recompute(s, d)
    const baseInsight = d.rates.insight
    const baseQi = d.rates.qi
    Object.assign(s.resources, UPGRADE_MAP.scriptureDebate.cost)
    ok('元婴买入经义互证并扣除完整材料', E.research(s, d, 'scriptureDebate') && Object.keys(UPGRADE_MAP.scriptureDebate.cost).every(id => s.resources[id] === 0))
    ok('经义互证使岗位倍率1.35到1.60且不增加灵气', close(d.rates.insight / baseInsight, 1.6 / 1.35) && close(d.rates.qi, baseQi))
    s.buildings.observatory = { count: 4, on: true }
    s.upgrades.astrologyArt = true
    E.recompute(s, d)
    ok('观象参同仍须达到化神', !E.isUpgradeUnlocked(s, UPGRADE_MAP.celestialDeduction))
    s.realm = 6
    s.upgrades.scriptureDebate = false
    E.recompute(s, d)
    ok('化神也不能跳过经义互证', !E.isUpgradeUnlocked(s, UPGRADE_MAP.celestialDeduction))
    s.upgrades.scriptureDebate = true
    E.recompute(s, d)
    const before = d.rates.insight
    Object.assign(s.resources, UPGRADE_MAP.celestialDeduction.cost)
    ok('上游仓储可容纳专精费用并能实际参悟', Object.entries(UPGRADE_MAP.celestialDeduction.cost).every(([id, amount]) => d.max[id] >= amount) && E.research(s, d, 'celestialDeduction'))
    ok('两段专精相加使岗位倍率1.60到1.95', close(d.jobRatio.scholar, 0.95) && close(d.rates.insight / before, 1.95 / 1.6))
    const restored = parseImport(exportSave(s))
    ok('两项专精随存档保留', restored.upgrades.scriptureDebate && restored.upgrades.celestialDeduction)
  }
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
