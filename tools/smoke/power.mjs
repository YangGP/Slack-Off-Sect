import { normalizeState, resetForAscension, resetForReincarnation } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { RESOURCES, RESOURCE_MAP } from '../../src/data/resources.js'
import { BUILDING_MAP } from '../../src/data/buildings.js'
import { JOBS } from '../../src/data/jobs.js'
import { UPGRADE_MAP } from '../../src/data/upgrades.js'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { REALMS } from '../../src/data/realms.js'
import { CONFIG } from '../../src/data/config.js'
import { exportSave, parseImport } from '../../src/game/save.js'
import { newGame, successfulBreakthrough } from './fixtures.mjs'

export function particleChain({ ok, close, section }) {
  section('第二种驱动：灵子论 → 分灵 → 偏极 → 湮灭 → 灵能')
  {
    // 灵能会逸散：无产出时应当衰减到 0
    {
      const { state: s, derived: d } = newGame()
      s.resources.qiEnergy = 100
      E.recompute(s, d)
      // 注意：tick 内部把单步上限压到 60 秒，所以"6 小时"要自己循环推进
      for (let i = 0; i < 6 * 60; i++) E.tick(s, d, 60, { events: false })
      ok(
        '灵能会逸散（无产出时衰减到接近 0）',
        (s.resources.qiEnergy || 0) < 0.01,
        '6 小时后剩 ' + (s.resources.qiEnergy || 0).toFixed(6),
      )
    }

    // 稳态 ≈ 产出 ÷ 逸散率：一台湮灭炉 0.06/秒、逸散 0.005/秒 → 12 灵能
    {
      const { state: s, derived: d } = newGame()
      s.upgrades.annihilationArt = true
      s.buildings.annihilationFurnace = { count: 1, on: true }
      s.buildings.grotto = { count: 1, on: true } // 足够容纳整段稳态测量所需的粒子
      s.resources.yangParticle = 1e6 // 粒子管够，隔离掉分灵阵的变量
      s.resources.yinParticle = 1e6
      s.resources.qi = 1e6
      E.recompute(s, d)
      for (let i = 0; i < 4000; i++) {
        E.tick(s, d, 1, { events: false })
        if (i % 300 === 0) E.recompute(s, d)
      }
      const steady = s.resources.qiEnergy || 0
      const expect = (d.rates.qiEnergy || 0) / CONFIG.QI_ENERGY_DECAY
      ok(
        '灵能有稳态（≈ 产出 ÷ 逸散率）',
        Math.abs(steady - expect) / Math.max(expect, 1e-9) < 0.1,
        '实测 ' + steady.toFixed(2) + '，预期 ' + expect.toFixed(2),
      )
    }

    // 只加成基础物资：灵木吃、灵机不吃
    {
      const build = (energy) => {
        const { state: s, derived: d } = newGame()
        s.upgrades.prospectStudy = true
        s.buildings.lumberYard = { count: 10, on: true }
        s.buildings.library = { count: 2, on: true }
        s.disciples.total = 2
        s.disciples.jobs = { woodcutter: 1, scholar: 1 }
        s.resources.qiEnergy = energy
        E.recompute(s, d)
        return { wood: d.rates.wood || 0, insight: d.rates.insight || 0 }
      }
      const before = build(0)
      const after = build(250) // 250 灵能 → 满额 +500%
      ok(
        '囤积灵能不再免费提高基础物资产出',
        close(after.wood, before.wood),
        '灵木 ' + before.wood.toFixed(3) + '/秒 → ' + after.wood.toFixed(3) + '/秒',
      )
      ok(
        '灵能不加成灵机（只作用于基础物资）',
        Math.abs(after.insight - before.insight) < 1e-9,
        '灵机 ' + before.insight.toFixed(4) + ' → ' + after.insight.toFixed(4),
      )
    }

    // 《灵能应用》（主线第Ⅳ章）：灵能同时进入点石成灵、刨木成板的制作收益
    {
      const probe = (learned, energy) => {
        const { state: s, derived: d } = newGame()
        if (learned) s.upgrades.energyApplication = true
        s.resources.qiEnergy = energy
        E.recompute(s, d)
        return {
          stone: E.craftYield(d, CRAFT_MAP.infuseStone),
          infusedStone: E.craftYield(d, CRAFT_MAP.infuseStone),
          plank: E.craftYield(d, CRAFT_MAP.sawPlank),
          pill: E.craftYield(d, CRAFT_MAP.refinePill),
        }
      }
      const before = probe(false, 0)
      const stockOnly = probe(false, 250)
      const learned = probe(true, 250)
      ok(
        '未参悟《灵能应用》时，灵能不进入点石成灵/刨木成板的制作收益',
        Math.abs(stockOnly.stone - before.stone) < 1e-9 && Math.abs(stockOnly.plank - before.plank) < 1e-9,
        `灵石 ${before.stone.toFixed(3)} → ${stockOnly.stone.toFixed(3)}`,
      )
      ok(
        '灵能应用改为驱动工位，不再凭库存提高单份收益',
        close(learned.stone, stockOnly.stone) && close(learned.plank, stockOnly.plank),
        `灵石 ${stockOnly.stone.toFixed(3)} → ${learned.stone.toFixed(3)}`,
      )
      ok('灵能应用不外溢到名单之外的配方（采药制丹不变）', Math.abs(learned.pill - before.pill) < 1e-9)
      ok('点石成灵仍保持原始收益', close(learned.infusedStone, stockOnly.infusedStone))
    }

    // 灵气六阶阶梯（RESEARCH.md）：气 → 液 → 晶 → 灵气分子 → 正负灵子 → 灵能；灵石是含灵矿物，不在阶梯上
    {
      const liq = CRAFT_MAP.condenseLiquid
      const cry = CRAFT_MAP.condenseCrystal
      ok('凝气成液由凝气化液放行，150 灵气一瓶', liq.needs?.upgrades?.includes('qiLiquid') && liq.cost.qi === 150 && liq.out === 'spiritLiquid')
      ok('凝液法无境界门槛、只承接化液', E.UPGRADE_MAP.liquidArt.needs.realm == null && E.UPGRADE_MAP.liquidArt.needs.upgrades.length === 1 && E.UPGRADE_MAP.liquidArt.needs.upgrades[0] === 'qiLiquid')
      ok('凝晶原理承接灵气纯化并保留符文条件', E.UPGRADE_MAP.crystalTheory.needs.upgrades.includes('qiPurify') && E.UPGRADE_MAP.crystalTheory.needs.upgrades.includes('talismanArt'))
      ok('凝气结晶由固形纹直接加工灵液与灵气', cry.cost.spiritLiquid === 3 && !cry.cost.talisman && cry.cost.qi === 300)
      ok('培育仙草以灵液浇灌', CRAFT_MAP.growImmortalHerb.cost.spiritLiquid === 2 && !CRAFT_MAP.growImmortalHerb.cost.qi)
      ok('灵石是含灵矿物：矿工开采与点石成灵并存', JOBS.some(job => job.secondary?.resource === 'stone') && CRAFT_MAP.infuseStone.needs?.building?.id === 'quarry')
      const split = BUILDING_MAP.splitArray
      const polar = BUILDING_MAP.polarizeArray
      ok('灵子论在元婴开放分灵阵，产出灵气分子', E.UPGRADE_MAP.particleTheory.needs.realm == null && split.needs.realm === 5 && split.needs.upgrades.includes('particleTheory') && split.effects.prod.qiParticle > 0 && !split.effects.prod.yangParticle)
      ok('阴阳分灵在化神开偏极阵：吃灵气分子、出正负灵子', polar.needs.realm === 6 && polar.needs.upgrades.includes('yinyangSplit') && polar.upkeep.qiParticle > 0 && polar.effects.prod.yangParticle > 0 && polar.effects.prod.yinParticle > 0)
      ok('粒子链质量守恒：一分灵阵恰好喂一偏极阵、一偏极阵恰好喂一湮灭炉', close(split.effects.prod.qiParticle, polar.upkeep.qiParticle) && close(polar.effects.prod.yangParticle + polar.effects.prod.yinParticle, BUILDING_MAP.annihilationFurnace.upkeep.yangParticle + BUILDING_MAP.annihilationFurnace.upkeep.yinParticle))
      ok('阴阳分灵仍以灵子论为前置，湮灭链保持连通', E.UPGRADE_MAP.yinyangSplit.needs.upgrades.includes('particleTheory') && E.UPGRADE_MAP.annihilationArt.needs.upgrades.includes('yinyangSplit'))
    }

    // 分灵阵烧灵气：它是本作最大的灵气去处，且停用即停费
    {
      const wh = BUILDING_MAP.splitArray
      ok('阴阳分灵阵以灵气为维护费', (wh.upkeepQi || 0) > 0, JSON.stringify(wh.upkeepQi))
      const { state: s, derived: d } = newGame()
      s.upgrades.yinyangSplit = true
      s.buildings.splitArray = { count: 2, on: true }
      s.resources.qi = 100
      E.recompute(s, d)
      const on = d.expense?.qi || 0
      s.buildings.splitArray = { count: 2, on: false }
      E.recompute(s, d)
      const off = d.expense?.qi || 0
      ok('停用分灵阵后灵气开销归零', off > on && Math.abs(off) < Math.abs(on), on + ' → ' + off)
    }
  }
}

export function powerCore({ ok, close, section }) {
  section('灵能枢供能与早期空间技艺移除')
  {
    const { state: s, derived: d } = newGame()
    s.upgrades.energyCore = true
    const draw = UPGRADE_MAP.energyCore.upkeep.qiEnergy
    E.recompute(s, d)
    ok('灵能枢炼成但无供能时停效，不虚构灵能消耗', d.upgradeSupply.energyCore === 0 && !(d.ratio.qi || 0) && !(d.ratio.insight || 0) && !(d.maintenance.qiEnergy || 0))
    s.resources.qiEnergy = 10
    E.recompute(s, d)
    ok('满供灵能枢兑现基础效果和每秒耗能', close(d.ratio.qi, 0.5) && close(d.ratio.insight, 0.25) && close(d.maintenance.qiEnergy, draw))
    ok('灵能消耗账目列出灵能枢', d.expenseSources.qiEnergy.some(x => x.id === 'energyCore' && close(x.value, -draw)))
    E.tick(s, d, 1, { events: false })
    ok('灵能枢实际扣费且继续计入逸散', close(s.resources.qiEnergy, (10 - draw) * (1 - CONFIG.QI_ENERGY_DECAY)))
    s.resources.qiEnergy = draw * 0.25
    E.recompute(s, d)
    ok('不足一秒供能按库存预算缩减效果和耗能', close(d.upgradeSupply.energyCore, 0.25) && close(d.ratio.qi, 0.125) && close(d.ratio.insight, 0.0625) && close(d.maintenance.qiEnergy, draw * 0.25))
    s.treasureLevels.energyCore = 2
    s.resources.qiEnergy = 10
    E.recompute(s, d)
    ok('祭炼同比增加灵能枢效果与持续消耗', close(d.ratio.qi, 0.8) && close(d.ratio.insight, 0.4) && close(d.maintenance.qiEnergy, draw * 1.6))
    s.resources.qiEnergy = 0
    s.buildings.annihilationFurnace = { count: 1, on: true }
    s.resources.yangParticle = 10
    s.resources.yinParticle = 10
    E.recompute(s, d)
    ok('空库存时可使用湮灭炉的实时供能，效果受供料约束', d.upgradeSupply.energyCore > 0 && d.upgradeSupply.energyCore < 1 && close(d.maintenance.qiEnergy, d.rates.qiEnergy))
    s.buildings.annihilationFurnace.on = false
    E.recompute(s, d)
    ok('断料或停炉且无库存时灵能枢停效', d.upgradeSupply.energyCore === 0 && !(d.ratio.qi || 0))
    s.resources.qiEnergy = draw * 0.5
    E.tick(s, d, 10, { events: false })
    ok('长时间结算不会透支灵能，耗尽后停效', s.resources.qiEnergy === 0 && d.upgradeSupply.energyCore === 0)
    ok('删除的空间技艺不再出现在研究表，叠匣术随符箓线开放', !UPGRADE_MAP.storageBag && !UPGRADE_MAP.voidPouch && UPGRADE_MAP.caseStackArt.needs.upgrades.includes('talismanArt') && UPGRADE_MAP.caseStackArt.needs.building.id === 'warehouse')
    const old = normalizeState({ upgrades: { storageBag: true, voidPouch: true, caseStackArt: true } })
    ok('旧档移除废弃空间记录，保留已学普通仓储技艺', !old.upgrades.storageBag && !old.upgrades.voidPouch && old.upgrades.caseStackArt)
  }
}

export function crystalCooling({ ok, close, section }) {
  section('晶核加工与炼虚防护分工')
  {
    const { state: s, derived: d } = newGame()
    s.realm = 5
    s.upgrades.qiMeasure = true
    s.upgrades.qiLiquid = true
    s.upgrades.liquidArt = true
    s.upgrades.crystalCraft = true
    s.buildings.talismanHall = { count: 1, on: true }
    Object.assign(s.resources, { qi: 10000, spiritLiquid: 10 })
    E.recompute(s, d)
    const liquidBase = E.craftYield(d, CRAFT_MAP.condenseLiquid)
    const crystalBase = E.craftYield(d, CRAFT_MAP.condenseCrystal)
    s.buildings.crystalArray = { count: 1, on: true }
    E.recompute(s, d)
    ok('晶核阵只增幅灵液与灵晶制作，不提高灵气原料产出', close(E.craftYield(d, CRAFT_MAP.condenseLiquid) - liquidBase, 0.15) && close(E.craftYield(d, CRAFT_MAP.condenseCrystal) - crystalBase, 0.15) && !BUILDING_MAP.crystalArray.effects.ratio)
    s.resources.spiritLiquid = 0
    ok('凝液的实际整件产出应用晶核阵增幅并结转小数', E.craft(s, d, 'condenseLiquid', { times: 7 }) === 8 && close(s.craftProgress.condenseLiquid, 0.05))
    s.buildings.crystalArray.count = 2
    E.recompute(s, d)
    ok('两座晶核阵的专业加成相加', close(E.craftYield(d, CRAFT_MAP.condenseCrystal) - crystalBase, 0.3))
    E.toggleBuilding(s, d, 'crystalArray')
    ok('关闭晶核阵停止增产及维护，保留已建仓储', close(E.craftYield(d, CRAFT_MAP.condenseLiquid), liquidBase) && !d.expense.qi && d.max.crystal === 60)
    s.buildings.crystalArray.on = true
    s.resources.qi = 0
    E.tick(s, d, 1, { events: false })
    ok('缺少维护灵气时晶核阵加工加成停止', close(E.craftYield(d, CRAFT_MAP.condenseLiquid), liquidBase))
  }
  {
    const { state: s, derived: d } = newGame()
    s.realm = 7
    s.buildings.mountainArray = { count: 1, on: true }
    s.upgrades.wardTalisman = true
    Object.assign(s.resources, { wood: 1000, herb: 1000, ore: 1000, qi: 10000, insight: 10000 })
    E.recompute(s, d)
    const disaster = { disaster: { resources: ['wood', 'herb', 'ore'], lossPercent: [0.2, 0.2] } }
    const rows = E.eventOutcome(s, d, disaster).rows
    ok('大阵通用防御与镇岳符重点物资保护分别生效', close(d.disasterGuard, 0.15) && rows.filter(r => r.res !== 'ore').every(r => close(r.lost, 140)) && close(rows.find(r => r.res === 'ore').lost, 170))
    const bounded = E.eventOutcome(s, d, { boundedLoss: { wood: 100, ore: 100 } }).rows
    ok('有界灾损与比例灾损共享防护规则', close(bounded.find(r => r.res === 'wood').lost, 70) && close(bounded.find(r => r.res === 'ore').lost, 85))
    ok('符阵不能减免主动固定支出', E.eventOutcome(s, d, { cost: { wood: 20 } }).rows[0].lost === 20)
    Object.assign(s.resources, { wood: 2000, talisman: 12, stone: 500 })
    const prior = d.disasterGuardByResource.wood
    ok('镇岳符祭炼强化专项防护', E.refineTreasure(s, d, 'wardTalisman') && close(d.disasterGuardByResource.wood, prior * 1.3))
    s.resources.wood = 1000
    s.buildings.mountainArray.count = 10
    E.recompute(s, d)
    ok('全宗防护与重点资源防护合计上限保持80%', E.eventOutcome(s, d, disaster).rows.every(r => close(r.lost, 40)))
    E.toggleBuilding(s, d, 'mountainArray')
    ok('关闭大阵后专项法宝保留，普通物资不再获得防护', d.disasterGuard === 0 && d.disasterGuardByResource.wood > 0 && close(E.eventOutcome(s, d, disaster).rows.find(r => r.res === 'ore').lost, 200))
    const before = { ...d.craftBonusByResource }
    s.upgrades.mountainPlate = true
    E.recompute(s, d)
    ok('护山阵盘转为阵基与灵符专业增产，不叠加防御', close(d.craftBonusByResource.arrayBase - (before.arrayBase || 0), 0.2) && close(d.craftBonusByResource.spiritTalisman - (before.spiritTalisman || 0), 0.15) && d.disasterGuard === 0)
    ok('移除两项重复的全资源防灾技艺', !UPGRADE_MAP.arrayPatterns && !UPGRADE_MAP.arrayCompendium)
  }
}

export function industrialThroughput({ ok, close, section }) {
  section('分阶段产业、工业吞吐与首飞准备')
  {
    const { state: s, derived: d } = newGame()
    s.upgrades.energyCore = true
    s.resources.qiEnergy = 100
    E.recompute(s, d)
    ok('耗能法宝可以暂停且同时停止收益和费用', E.toggleUpkeepUpgrade(s, d, 'energyCore') && d.upgradeSupply.energyCore === 0 && !d.maintenance.qiEnergy && !(d.ratio.qi || 0))
    const restored = parseImport(exportSave(s))
    ok('法宝启停偏好随本世存档保存', restored.upgradeEnabled.energyCore === false && restored.upgrades.energyCore)
    ok('重新启用耗能法宝恢复收益与费用', E.toggleUpkeepUpgrade(s, d, 'energyCore') && close(d.maintenance.qiEnergy, UPGRADE_MAP.energyCore.upkeep.qiEnergy) && close(d.ratio.qi, 0.5))
    ok('不能停用没有维护费的研究', !E.toggleUpkeepUpgrade(s, d, 'qiOrigin'))
    resetForReincarnation(s, 0)
    ok('转世清空本世法宝启停状态', Object.keys(s.upgradeEnabled).length === 0)
  }
  {
    const { state: s, derived: d } = newGame()
    s.realm = 9
    s.buildings.spiritField = { count: 1000, on: true }
    for (const id of ['splitArray', 'polarizeArray', 'annihilationFurnace']) s.buildings[id] = { count: 1, on: true }
    E.recompute(s, d)
    ok('高境界一对一粒子产线仍按同速进料出料（湮灭炉增产不作用于粒子链）', close(d.rates.qiParticle, d.maintenance.qiParticle) && close(d.rates.yangParticle, d.maintenance.yangParticle) && close(d.rates.yinParticle, d.maintenance.yinParticle))
    ok('吞吐提速确实扩大分灵的供气需求', close(d.maintenance.qi, (BUILDING_MAP.splitArray.upkeepQi + BUILDING_MAP.polarizeArray.upkeepQi) * d.globalMult))
    s.buildings.annihilationFurnace.count = 2
    E.recompute(s, d)
    ok('一座偏极不能免费供给两座满速湮灭炉', close(d.buildingSupply.annihilationFurnace, 0.5))
    E.simulateOffline(s, d, 10)
    ok('工业离线结算不透支粒子', s.resources.qiParticle >= 0 && s.resources.yangParticle >= 0 && s.resources.yinParticle >= 0 && s.resources.qiEnergy > 0)

    for (const [realm, material] of [[2, 'pill'], [5, 'crystal'], [6, 'crystal'], [7, 'crystal'], [8, 'qiParticle'], [9, 'ascensionSeal'], [2, 'stone'], [5, 'arrayBase'], [8, 'arcaneGold'], [9, 'crystalSilver']]) {
      s.realm = realm
      for (const r of RESOURCES) s.resources[r.id] = 1e7
      // 未列入本境费用的工程原料不必另外囤积。
      for (const id of ['ore', 'artifact', 'steel', 'spiritArtifact', 'mithril']) {
        if (!REALMS[realm + 1].cost[id]) s.resources[id] = 0
      }
      s.resources[material] = 0
      E.recompute(s, d)
      ok(`${REALMS[realm].name}突破不能缺少${RESOURCE_MAP[material].name}`, !successfulBreakthrough(s, d))
      s.resources[material] = E.realmCost(s, d, realm + 1)[material]
      ok(`${material}备齐后可以正常破境`, successfulBreakthrough(s, d))
    }

    s.realm = 9
    s.upgrades.annihilationArt = true
    s.upgrades.intuition = true
    s.resources.ascensionSeal = 0
    s.resources.qiEnergy = 200
    s.resources.mithril = 4
    s.resources.spiritTalisman = 2
    E.recompute(s, d)
    const seal = CRAFT_MAP.condenseAscensionSeal
    const richer = { ...d, craftBonus: 100, craftBonusByResource: { ascensionSeal: 100 } }
    ok('飞升阵印不能被普通制作增产瞬间放大', E.craftYield(richer, seal) === 1)
    ok('手动固印实际消耗能量与两种材料', E.craft(s, d, seal.id) === 1 && s.resources.qiEnergy === 120 && s.resources.mithril === 2 && s.resources.spiritTalisman === 1)
    s.autoCraft[seal.id] = true
    E.setCraftTarget(s, d, seal.id, 2)
    E.simulateOffline(s, d, 180)
    ok('阵印离线自动积累并遵守库存目标', s.resources.ascensionSeal === 2)
    s.resources.qiEnergy = 0
    E.simulateOffline(s, d, 5)
    ok('稳定阵印不随灵能逸散', s.resources.ascensionSeal === 2)
    resetForAscension(s, 0)
    ok('飞升重置本世阵印', s.resources.ascensionSeal === 0)
  }
  {
    const { state: s, derived: d } = newGame()
    s.upgrades.intuition = true
    s.buildings.quarry = { count: 1, on: true }
    Object.assign(s.resources, { qi: 100, rock: 100 })
    s.settings.craftReserves = { qi: 90 }
    s.autoCraft.infuseStone = true
    E.recompute(s, d)
    E.runAutoCraft(s, d, 3)
    ok('首飞前自动加工遵守逐项保留', s.dao === 0 && s.resources.stone === 0 && E.autoCraftStatus(s, d, 'infuseStone').reason.includes('保留材料'))
    s.buildings.granary = { count: 20, on: true }
    E.recompute(s, d)
    ok('扩仓不会改变绝对保留量', s.settings.craftReserves.qi === 90)
    E.craft(s, d, 'infuseStone')
    ok('首飞前手动制作仍可动用保留材料', s.resources.stone === 1 && s.resources.qi === 85)
    const restored = parseImport(exportSave(s))
    ok('逐项保留读档后保留且旧档默认为空', restored.settings.craftReserves.qi === 90 && Object.keys(normalizeState({ resources: {} }).settings.craftReserves).length === 0)
    const invalid = normalizeState({ settings: { craftReserves: { qi: -1, wood: Infinity, unknown: 100 } } })
    ok('导入忽略非法保留值与未知资源', Object.keys(invalid.settings.craftReserves).length === 0)
    s.settings.craftReserves = {}
    s.settings.autoCraftPriority = 'refinePill'
    s.buildings.alchemyRoom = { count: 1, on: true }
    Object.assign(s.resources, { qi: 60, herb: 100, wood: 100 })
    s.autoCraft.refinePill = true
    E.recompute(s, d)
    E.runAutoCraft(s, d, 3)
    ok('首飞前优先配方先取得竞争用料', s.resources.pill > 0 && s.resources.stone === 1)
  }
}
