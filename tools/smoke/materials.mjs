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

export function industryBonusIsolation({ ok, close, section }) {
  section('产业增益隔离与加工链收益')
  {
    ok('所有建筑、技艺和法宝均使用专业生产加成', [...BUILDINGS, ...TECHNIQUES].every(x => !x.effects?.ratioAll))
    const ids = ['swordFlight', 'arrayRefine', 'mahayanaArt', 'spiritBanner', 'flyingSword', 'zhenyueSeal', 'spiritSaw', 'spiritSmelting', 'spiritCultivation']
    for (const id of ids) {
      const { state: s, derived: d } = newGame()
      s.realm = 9
      // 固定供料和生产来源；只有所测技艺变化。
      for (const b of BUILDINGS) s.buildings[b.id] = { count: 1, on: true }
      s.disciples.total = JOBS.length
      s.disciples.jobs = Object.fromEntries(JOBS.map(job => [job.id, 1]))
      for (const r of RESOURCES) s.resources[r.id] = 1e8
      E.recompute(s, d)
      const beforeRates = { ...d.rates }
      const beforeYields = Object.fromEntries(CRAFTS.map(c => [c.out, E.craftYield(d, c)]))
      const beforeGlobal = d.globalMult
      s.upgrades[id] = true
      E.recompute(s, d)
      const ef = UPGRADE_MAP[id].effects
      ok(`${UPGRADE_MAP[id].name}只增加目标资源生产`, RESOURCES.every(r => ef.ratio?.[r.id] ? d.rates[r.id] > beforeRates[r.id] : close(d.rates[r.id], beforeRates[r.id])), JSON.stringify(ef.ratio))
      ok(`${UPGRADE_MAP[id].name}专业加工不外溢且公共倍率不变`, close(d.globalMult, beforeGlobal) && CRAFTS.every(c => ef.craftBonusByResource?.[c.out] ? E.craftYield(d, c) > beforeYields[c.out] : close(E.craftYield(d, c), beforeYields[c.out])))
    }
    const { state: s, derived: d } = newGame()
    s.realm = 9
    s.resources.qi = 1e8
    s.resources.wood = 1e8
    s.resources.ore = 1e8
    s.buildings.heavenTower = { count: 2, on: true }
    E.recompute(s, d)
    ok('两座通天塔强化灵气与灵子，不强化木材和玄铁', close(d.ratio.qi, 0.6) && close(d.ratio.yangParticle, 0.3) && !d.ratio.wood && !d.ratio.ore)
    E.toggleBuilding(s, d, 'heavenTower')
    ok('停用通天塔后专业增益与维护费同时停止', !d.ratio.qi && !d.ratio.yangParticle && !d.maintenance.wood && !d.maintenance.ore)
    const tech = UPGRADE_MAP.spiritSmelting
    s.realm = 5
    for (const id of tech.needs.upgrades) s.upgrades[id] = true
    E.recompute(s, d)
    ok('灵火冶炼满足知识前置即可提前开放', E.isUpgradeUnlocked(s, tech))
    s.realm = 6
    E.recompute(s, d)
    ok('炼虚且专业前置齐备后开放灵火冶炼', E.isUpgradeUnlocked(s, tech))
  }
  {
    // 教训：炼铁炉曾定价矿石 300，而**早期**矿石上限只有 250（要靠库房才抬得上去），
    // 库房又卡在土木术 → 木作器械 → 炼铁炉 下游，于是 6 小时起整局停摆。
    //
    // 两条站得住的规则（写成"基础仓容"会误判后期建筑：它们的仓容本就该先涨上去）：
    //   ① 前中期门槛建筑（炼铁炉）的基础造价必须落在**基础上限**之内 —— 那时还没有库房；
    //   ② 任何门槛建筑的造价，都必须有**至少一种仓储建筑**能把对应资源的上限抬到它之上。
    const furnace = BUILDING_MAP.ironFurnace
    ok(
      '炼铁炉的首座矿石造价落在矿石基础上限之内（早期没有库房）',
      (furnace?.cost?.rock || 0) <= (RESOURCE_MAP.rock?.baseMax || 0),
      `造价 ${furnace?.cost?.rock} vs 基础上限 ${RESOURCE_MAP.rock?.baseMax}`,
    )

    const gating = new Set()
    for (const u of [...CULTIVATION, ...TECHNIQUES]) {
      if (u.needs?.building) gating.add(u.needs.building.id)
      for (const b of u.needs?.buildings || []) gating.add(b.id)
    }
    const unreachable = []
    for (const id of gating) {
      const meta = BUILDING_MAP[id]
      if (!meta) continue
      for (const [res, amount] of Object.entries(meta.cost || {})) {
        const base = RESOURCE_MAP[res]?.baseMax
        if (base == null) continue
        // 所有建筑里，能把该资源上限抬得最高的那一档
        let best = base
        for (const b of BUILDINGS) {
          const add = b.effects?.storage?.[res] || 0
          if (add > 0) best = Math.max(best, base + add * 8) // 按 8 座估一个现实可及的量级
        }
        if (amount > best) unreachable.push(`${meta.name} 要 ${RESOURCE_MAP[res].name} ${amount} > 可及仓容 ${best}`)
      }
    }
    ok('门槛建筑的造价都在"可及仓容"之内', unreachable.length === 0, unreachable.slice(0, 4).join('；'))
  }
  {
    const miner = JOBS.find((j) => j.id === 'miner')
    const rock = miner?.base || 0
    const ore = (miner?.additionalOutputs || []).find((o) => o.resource === 'ore')?.base || 0
    const stone = miner?.secondary?.base || 0
    ok('矿工三条产出成十倍阶梯', close(ore * 10, rock) && close(stone * 10, ore), `矿石 ${rock} / 玄铁 ${ore} / 灵石 ${stone}`)
    ok('矿石最多、灵石最少', rock > ore && ore > stone)
  }
  {
    const furnace = BUILDING_MAP.ironFurnace
    ok('炼铁炉以矿石与灵木烧玄铁（消耗与产出都在）',
      (furnace?.effects?.prod?.ore || 0) > 0 && (furnace?.upkeep?.rock || 0) > 0 && (furnace?.upkeep?.wood || 0) > 0,
      JSON.stringify({ prod: furnace?.effects?.prod, upkeep: furnace?.upkeep }))
    ok('炼铁炉是实物建筑（不吃灵气/硬通货）',
      !furnace?.cost?.qi && !furnace?.cost?.stone && !furnace?.cost?.insight && (furnace?.cost?.rock || 0) > 0,
      JSON.stringify(furnace?.cost))
    ok('玄铁不再有独立的矿场建筑',
      !BUILDINGS.some((b) => b.id === 'mine') && !BUILDINGS.some((b) => (b.effects?.prod?.ore || 0) > 0 && b.id !== 'ironFurnace'),
      BUILDINGS.filter((b) => (b.effects?.prod?.ore || 0) > 0).map((b) => b.id).join('、'))
    const miner = JOBS.find((j) => j.id === 'miner')
    const oreOut = (miner?.additionalOutputs || []).find((o) => o.resource === 'ore')
    ok('矿工的玄铁副产出挂在「探矿术」上（不再靠建筑）',
      !!oreOut && oreOut.upgrade === 'prospectStudy' && !oreOut.building,
      JSON.stringify(oreOut))
    ok('探矿术后移到《炼丹术》之后，并解锁炼铁炉',
      UPGRADE_MAP.prospectStudy?.needs?.upgrades?.includes('alchemyArt') &&
        UPGRADE_MAP.prospectStudy?.effects?.unlockBuildings?.includes('ironFurnace'),
      JSON.stringify(UPGRADE_MAP.prospectStudy?.needs))
  }
  {
    const farmer = JOBS.find((j) => j.resource === 'qi')
    const cutter = JOBS.find((j) => j.resource === 'wood')
    // 劳动平价：阵徒 0.6 灵气/秒 ÷ 樵夫 0.15 灵木/秒 = 4 灵气/灵木
    const parity = farmer.base / cutter.base
    const recipe = CRAFT_MAP.growWood
    const unit = recipe.cost.qi / recipe.amount
    const premium = unit / parity
    ok(
      '催生灵木的灵气单价不超过劳动平价的 1.5 倍',
      premium <= 1.5 + 1e-9,
      `单价 ${unit} / 平价 ${parity.toFixed(2)} = ${premium.toFixed(2)}×`,
    )
    ok('但也不低于平价（瞬发与不占弟子值一点溢价）', premium >= 1, `${premium.toFixed(2)}×`)
  }
}

export function industrialBreakthrough({ ok, section }) {
  section('金丹起步与末期产业破境')
  {
    const { state: s, derived: d } = newGame()
    s.realm = 4
    for (const id of ['woodworking', 'herbStudy', 'earthArt', 'forgeArt', 'steelWorking']) s.upgrades[id] = true
    s.buildings.warehouse = { count: 3, on: true }
    s.buildings.forge = { count: 1, on: true }
    Object.assign(s.resources, { insight: 4200, wood: 800, plank: 20, ore: 1220, qi: 500 })
    E.recompute(s, d)
    ok('备齐灵机费用后能研究增产与材料库', E.research(s, d, 'flowField') && E.research(s, d, 'earthEssence'))
    ok('首批玄钢即可建材料库，无需等到元婴', E.craft(s, d, 'refineSteel', { times: 4 }) === 4 && E.buyBuilding(s, d, 'depot', 1) === 1)

    const { state: late, derived: ld } = newGame()
    late.realm = 8
    for (const r of RESOURCES) late.resources[r.id] = 1e7
    late.resources.qiParticle = 0
    E.recompute(late, ld)
    ok('基础材料齐全也不能跳过分灵进入大乘', successfulBreakthrough(late, ld) === false && late.realm === 8)
    late.resources.qiParticle = E.realmCost(late, ld, 9).qiParticle
    ok('分灵产物备齐后能突破大乘', successfulBreakthrough(late, ld) === true && late.realm === 9)
    late.resources.ascensionSeal = 0
    E.recompute(late, ld)
    ok('渡劫不能绕过湮灭固结的飞升阵印', successfulBreakthrough(late, ld) === false && late.realm === 9)
    late.resources.ascensionSeal = E.realmCost(late, ld, 10).ascensionSeal
    ok('整条产业材料备齐后可渡劫飞升', successfulBreakthrough(late, ld) === true && E.canAscend(late))

    const { state: saving, derived: sd } = newGame()
    saving.realm = 4
    for (const id of ['woodworking', 'forgeArt', 'talismanArt', 'prospectStudy', 'qiGazing', 'herbStudy', 'earthArt', 'flowField', 'earthEssence', 'intuition', 'arrayAssembly', 'alchemyArt', 'homePlanning']) saving.upgrades[id] = true
    for (const id of ['forge', 'talismanHall', 'depot', 'ironFurnace', 'alchemyRoom']) saving.buildings[id] = { count: 1, on: true }
    saving.buildings.warehouse = { count: 3, on: true }
    saving.buildings.library = { count: 8, on: true }
    saving.buildings.granary = { count: 25, on: true }
    Object.assign(saving.resources, { qi: 1000, insight: 1000, wood: 1000, herb: 1000, rock: 1000, artifact: 2, stone: 1200, talisman: 80 })
    saving.autoCraft.assembleArrayBase = true
    saving.settings.autoCraftOn = true
    E.recompute(saving, sd)
    const bot = createBot(saving, sd, { breakthrough: successfulBreakthrough })
    bot.act()
    ok('攒元婴灵气时已开启的阵基自动制作会暂停', saving.autoCraft.assembleArrayBase === false)
    saving.resources.qi = 50000
    saving.resources.insight = 1000
    saving.resources.herb = 0
    saving.resources.pill = 0
    E.recompute(saving, sd)
    bot.act()
    ok('突破材料未齐但灵气富余时不会误停上游加工', saving.resources.pill < E.realmCost(saving, sd, 5).pill && saving.autoCraft.assembleArrayBase === true)
    // 研究与其它前置全部完成，资源足以研究和破境：下一次决策恢复普通自动配方。
    for (const u of ALL_UPGRADES) saving.upgrades[u.id] = true
    for (const r of RESOURCES) saving.resources[r.id] = 1e7
    E.recompute(saving, sd)
    bot.act()
    ok('退出攒料后普通自动制作恢复', saving.autoCraft.assembleArrayBase === true,
      JSON.stringify({ realm: saving.realm, deaths: saving.stats.breakthroughDeaths, order: saving.craftOrders.assembleArrayBase,
        resources: saving.resources, max: sd.max, prerequisites: [...bot.prerequisites().buildings] }))
  }
}

export function lateMaterials({ ok, section }) {
  section('后期建材：研究、加工与营造')
  {
    const ids = ['spiritMortar', 'ironMortar', 'mithril', 'arcaneGold', 'crystalSilver']
    ok('五种建材均为整数库存，且各有至少两个建筑用途', ids.every(id => RESOURCE_MAP[id].integer && BUILDINGS.filter(b => b.cost[id] > 0).length >= 2))
    ok('首座材料库和混灵土工艺不依赖新建材，避免自举循环', ids.every(id => !BUILDING_MAP.depot.cost[id] && !UPGRADE_MAP.spiritMortarArt.cost[id]))
    const { state: s, derived: d } = newGame()
    // masonryArt（土木工艺）会给混灵土/玄铁混灵土加工加成，影响本段对建材净耗的精确断言；此处不预学它。
    const research = ['spiritMortarArt', 'ironMortarArt', 'mithrilArt', 'arcaneGoldArt', 'crystalSilverArt', 'masonryArt']
    for (const u of ALL_UPGRADES) if (!research.includes(u.id)) s.upgrades[u.id] = true
    s.buildings.depot = { count: 1, on: true }
    s.buildings.logHouse = { count: 5, on: true }
    Object.assign(s.resources, { insight: 100000, qi: 100000, wood: 3000, stone: 20000, spiritLiquid: 2000, ore: 10000, rock: 10000, plank: 100, arrayBase: 100, herb: 1000, immortalHerb: 20, steel: 1000, crystal: 1000 })
    s.realm = 4
    E.recompute(s, d)
    ok('可提前研究混灵土，但配方仍需元婴', E.research(s, d, 'spiritMortarArt') && E.craft(s, d, 'mixSpiritMortar') === 0)
    s.realm = 5
    E.recompute(s, d)
    ok('元婴可应用已掌握的混灵土工艺', s.upgrades.spiritMortarArt && E.isCraftUnlocked(s, CRAFT_MAP.mixSpiritMortar))
    const before = { ...s.resources }
    ok('混灵土现场消耗灵石与灵液，不引入粉末库存', E.craft(s, d, 'mixSpiritMortar') === 1 && s.resources.spiritMortar === 1 && s.resources.stone === before.stone - 20 && s.resources.spiritLiquid === before.spiritLiquid - 2 && !RESOURCE_MAP.stonePowder)
    E.craft(s, d, 'mixSpiritMortar', { times: 40 })
    ok('第一座药藏实际消耗混灵土且扩充药材仓容', E.buyBuilding(s, d, 'medicineVault') === 1 && s.resources.spiritMortar === 33)
    ok('玄库基础建材可以在既有仓储内启动', Object.entries(BUILDING_MAP.mysticVault.cost).every(([id, amount]) => d.max[id] >= amount))
    ok('第一座玄库实际消耗新建材并提供后续材料仓位', E.buyBuilding(s, d, 'mysticVault') === 1 && s.resources.spiritMortar === 13 && ids.every(id => d.max[id] > RESOURCE_MAP[id].baseMax))
    ok('可提前研究玄铁骨架，但配方仍需化神', E.research(s, d, 'ironMortarArt') && !E.isCraftUnlocked(s, CRAFT_MAP.reinforceSpiritMortar))
    s.realm = 6
    E.recompute(s, d)
    ok('化神研究玄铁骨架并制作结构建材', s.upgrades.ironMortarArt && E.craft(s, d, 'reinforceSpiritMortar', { times: 4 }) === 4 && s.resources.ironMortar === 4 && s.resources.spiritMortar === 1)
    E.craft(s, d, 'mixSpiritMortar', { times: 16 })
    E.craft(s, d, 'reinforceSpiritMortar', { times: 4 })
    ok('精舍使用复合结构建材完成实际营造', E.buyBuilding(s, d, 'mansion') === 1 && s.resources.ironMortar === 0)
    s.realm = 7
    E.recompute(s, d)
    ok('炼虚提炼秘银，用矿石与灵气取得储灵金属', E.research(s, d, 'mithrilArt') && E.craft(s, d, 'refineMithril', { times: 20 }) === 20 && s.resources.mithril === 20)
    s.resources.insight = UPGRADE_MAP.arcaneGoldArt.cost.insight
    ok('可提前研究玄金，但熔炼仍需合体', E.research(s, d, 'arcaneGoldArt') && !E.isCraftUnlocked(s, CRAFT_MAP.smeltArcaneGold))
    s.realm = 8
    E.recompute(s, d)
    ok('合体研究玄金后实际消耗秘银制作合金', s.upgrades.arcaneGoldArt && E.craft(s, d, 'smeltArcaneGold', { times: 2 }) === 2 && s.resources.arcaneGold === 2 && s.resources.mithril === 8)
    s.resources.insight = UPGRADE_MAP.crystalSilverArt.cost.insight
    ok('可提前研究晶银，但制作仍需大乘', E.research(s, d, 'crystalSilverArt') && !E.isCraftUnlocked(s, CRAFT_MAP.fuseCrystalSilver))
    s.realm = 9
    E.recompute(s, d)
    E.craft(s, d, 'refineMithril', { times: 8 })
    ok('大乘稳定晶体金属界面后实际制作晶银', s.upgrades.crystalSilverArt && E.craft(s, d, 'fuseCrystalSilver') === 1 && s.resources.crystalSilver === 1 && s.resources.mithril === 7)
    ok('粒子设施的建材不会反向消耗其待生产的灵子或灵能', ['refineMithril', 'smeltArcaneGold', 'fuseCrystalSilver'].every(id => ['qiParticle', 'yangParticle', 'yinParticle', 'qiEnergy'].every(res => !CRAFT_MAP[id].cost[res])))
  }
  {
    const { state: s, derived: d } = newGame()
    s.realm = 5
    s.upgrades.spiritMortarArt = true
    s.upgrades.intuition = true
    s.settings.autoCraftOn = true
    s.autoCraft.mixSpiritMortar = true
    s.buildings.workshop = { count: 1, on: true }
    s.resources.stone = 100
    s.resources.spiritLiquid = 10
    E.recompute(s, d)
    E.setCraftTarget(s, d, 'mixSpiritMortar', 2)
    E.simulateOffline(s, d, 30)
    ok('混灵土自动制作遵守库存目标并按份扣料', s.resources.spiritMortar === 2 && s.resources.stone === 60 && s.resources.spiritLiquid === 6)
  }
}
