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
import { particleReinvestment, immortalInvestment, createBot } from '../player-bot.mjs'

export function immortalInvestmentFlow({ ok, section }) {
  section('仙灵力量产投资：解锁后真实购买、供能与临近冲关边界')
  const { state: s, derived: d } = newGame()
  s.realm = 9
  s.upgrades.immortalDiscovery = s.upgrades.immortalIndustry = true
  s.buildings = Object.fromEntries(Object.entries({ hut: 1, quarry: 1, spiritField: 1000,
    scriptureArchive: 4000, warehouse: 100, arcaneVault: 40, grotto: 2,
    splitArray: 20, polarizeArray: 10, annihilationFurnace: 10, harvestPlatform: 1 })
    .map(([id, count]) => [id, { count, on: true }]))
  E.recompute(s, d)
  for (const r of RESOURCES) s.resources[r.id] = E.moneyMin(500000, d.max[r.id])
  s.resources.immortalForce = E.ZERO
  E.recompute(s, d)
  const need = { immortalForce: 18000 }, before = JSON.stringify(s)
  const quote = immortalInvestment(s, d, need)
  ok('已解锁量产时比较有效产量并选择聚仙阵', quote?.id === 'immortalArray' && quote.rateAfter > quote.rateBefore)
  ok('投资预测不修改真实状态或花费库存', JSON.stringify(s) === before)
  const insight = E.money(s.resources.insight), rate = E.money(d.net.immortalForce)
  let decision, built, buildDecision
  const bot = createBot(s, d, { immortalInvestments: true, onlyBreakthrough: true,
    realmCost: () => need, breakthrough: () => false, allowUpgrade: () => false,
    onDecision: value => { decision = value }, onBuildResult: value => { built = value },
    onBuildDecision: value => { buildDecision = value } })
  bot.act()
  ok('机器人突破预留期间仍实际支付材料建成可回本聚仙阵', E.countOf(s, 'immortalArray') === 1 &&
    E.moneyEq(s.resources.insight, insight.minus(quote.cost.insight)) && E.moneyGt(d.net.immortalForce, rate),
    JSON.stringify({ built, investment: decision?.investment, insight: s.resources.insight, count: E.countOf(s, 'immortalArray'),
      required: decision?.requiredBuildings, candidate: buildDecision?.candidates.filter(c => c.id === 'immortalArray') }))
  s.resources.immortalForce = E.money(18000).minus('0.001')
  ok('临近冲关不再扩建', immortalInvestment(s, d, need) === null)
  s.resources.immortalForce = E.ZERO
  delete s.buildings.annihilationFurnace
  E.recompute(s, d)
  ok('有灵能库存但无法持续供能时不增建聚仙阵', immortalInvestment(s, d, need)?.id !== 'immortalArray')
  delete s.buildings.splitArray
  E.recompute(s, d)
  ok('分子净额为负时不把库存支撑误当成可持续扩产', immortalInvestment(s, d, need) === null)
}

export function midgameReinvestment({ ok, close, section }) {
  section('元婴首产、可选回投与单阵破境兼容')
  const { state: s, derived: d } = newGame()
  s.realm = 5
  s.disciples.total = 4
  s.disciples.jobs = { scholar: 4 }
  s.upgrades.particleTheory = true
  s.buildings = { spiritField: { count: 1000, on: true }, scriptureArchive: { count: 600, on: true },
    arcaneVault: { count: 40, on: true }, warehouse: { count: 40, on: true } }
  E.recompute(s, d)
  for (const r of RESOURCES) s.resources[r.id] = E.moneyMin(200000, d.max[r.id])
  s.resources.qiParticle = E.ZERO
  ok('没有分灵阵时不能提前学习回用', !E.isUpgradeUnlocked(s, UPGRADE_MAP.particleRecover))
  ok('首阵与灵子论无需自己的产物即可支付并实际建成', !BUILDING_MAP.splitArray.cost.qiParticle &&
    !UPGRADE_MAP.particleTheory.cost.qiParticle && E.buyBuilding(s, d, 'splitArray', 1) && E.moneyIsZero(s.resources.qiParticle))
  ok('首阵落地即可选学回用，不要求化神阴阳分灵', E.isUpgradeUnlocked(s, UPGRADE_MAP.particleRecover) && !s.upgrades.yinyangSplit)
  ok('回用仍须真实支付首批分子', !E.research(s, d, 'particleRecover'))
  s.resources.qiParticle = E.money(UPGRADE_MAP.particleRecover.cost.qiParticle)
  E.recompute(s, d)
  const rate = E.money(d.rates.qiParticle), upkeep = E.money(d.expense.qi)
  const insight = E.money(s.resources.insight), treatise = E.money(s.resources.daoTreatise)
  ok('回投实际扣除分子、灵机与道论', E.research(s, d, 'particleRecover') &&
    E.moneyIsZero(s.resources.qiParticle) && E.moneyEq(s.resources.insight, insight.minus(UPGRADE_MAP.particleRecover.cost.insight)) &&
    E.moneyEq(s.resources.daoTreatise, treatise.minus(UPGRADE_MAP.particleRecover.cost.daoTreatise)))
  ok('回用提高有效分子产量而不降低耗气', rate.gt(0) && close(d.rates.qiParticle, rate.times(1.3)) && E.moneyEq(d.expense.qi, upkeep))
  const need = E.realmCost(s, d, 6)
  const quote = particleReinvestment(s, d, need)
  ok('备料缺口大且供气充足时建议扩阵，并计入全部真实报价', quote?.id === 'splitArray' &&
    quote.count === 2 && quote.savedSeconds > 0 && E.moneyEq(quote.cost.insight, E.buildingCost(s, 'splitArray', 1).insight), JSON.stringify(quote))
  s.resources.qiParticle = E.money(need.qiParticle).minus(1)
  ok('临近破境时放弃已无回本机会的投资', particleReinvestment(s, d, need) === null)
  s.resources.qiParticle = E.ZERO
  s.upgrades.dipoleChest = true
  const noQi = { ...d, netQi: E.ZERO }
  ok('供气不足时不建议新增分灵阵', particleReinvestment(s, noQi, need) === null)
  s.upgrades.particleRecover = false
  s.buildings.splitArray.count = 2
  s.resources.qiParticle = E.money(UPGRADE_MAP.particleRecover.cost.qiParticle)
  E.recompute(s, d)
  ok('两阵之后仍可选择回用，研究不成为固定清单', particleReinvestment(s, d, need)?.id === 'particleRecover',
    JSON.stringify({ quote: particleReinvestment(s, d, need), available: d.availableUpgrades.includes('particleRecover') }))
  // 已学旧档不追缴新费用，也不依赖仍持有首阵；不做资源迁移。
  s.realm = 6
  s.upgrades.particleRecover = true
  delete s.buildings.splitArray
  s.resources.qiParticle = E.ZERO
  const normalized = normalizeState(s)
  E.recompute(normalized, d)
  ok('化神旧档保留境界、已学回用与转世入口', normalized.realm === 6 && normalized.upgrades.particleRecover && E.canReincarnate(normalized))
  s.realm = 5
  s.upgrades.particleRecover = false
  s.buildings.splitArray = { count: 1, on: true }
  E.recompute(s, d)
  for (const [id, amount] of Object.entries(E.realmCost(s, d, 6))) s.resources[id] = E.money(amount)
  ok('不研究回用、只建一阵仍能真实突破化神', successfulBreakthrough(s, d) && s.realm === 6 &&
    E.countOf(s, 'splitArray') === 1 && !s.upgrades.particleRecover)
}

export function particleChain({ ok, close, section }) {
  section('第二种驱动：灵子论 → 分灵 → 偏极 → 湮灭 → 灵能')
  {
    // 灵能会逸散：无产出时应当衰减到 0
    {
      const { state: s, derived: d } = newGame()
      s.resources.qiEnergy = E.money(100)
      E.recompute(s, d)
      // 注意：tick 内部把单步上限压到 60 秒，所以"6 小时"要自己循环推进
      for (let i = 0; i < 6 * 60; i++) E.tick(s, d, 60, { events: false })
      ok(
        '灵能会逸散（无产出时衰减到接近 0）',
        E.moneyLt(s.resources.qiEnergy, 0.01),
        '6 小时后剩 ' + E.moneyToNumber(s.resources.qiEnergy).toFixed(6),
      )
    }

    // 稳态 ≈ 产出 ÷ 逸散率：一台湮灭炉 0.06/秒、逸散 0.005/秒 → 12 灵能
    {
      const { state: s, derived: d } = newGame()
      s.upgrades.annihilationArt = true
      s.buildings.annihilationFurnace = { count: 1, on: true }
      s.buildings.grotto = { count: 1, on: true } // 足够容纳整段稳态测量所需的粒子
      s.resources.yangParticle = E.money(1e6) // 粒子管够，隔离掉分灵阵的变量
      s.resources.yinParticle = E.money(1e6)
      s.resources.qi = E.money(1e6)
      E.recompute(s, d)
      for (let i = 0; i < 4000; i++) {
        E.tick(s, d, 1, { events: false })
        if (i % 300 === 0) E.recompute(s, d)
      }
      const steady = E.money(s.resources.qiEnergy)
      const expect = E.money(d.rates.qiEnergy).div(CONFIG.QI_ENERGY_DECAY)
      const steadyNum = E.moneyToNumber(steady)
      const expectNum = E.moneyToNumber(expect)
      ok(
        '灵能有稳态（≈ 产出 ÷ 逸散率）',
        Math.abs(steadyNum - expectNum) / Math.max(expectNum, 1e-9) < 0.1,
        '实测 ' + steadyNum.toFixed(2) + '，预期 ' + expectNum.toFixed(2),
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
        s.resources.qiEnergy = E.money(energy)
        E.recompute(s, d)
        return { wood: E.money(d.rates.wood), insight: E.money(d.rates.insight) }
      }
      const before = build(0)
      const after = build(250) // 250 灵能 → 满额 +500%
      ok(
        '囤积灵能不再免费提高基础物资产出',
        close(after.wood, before.wood),
        '灵木 ' + E.moneyToNumber(before.wood).toFixed(3) + '/秒 → ' + E.moneyToNumber(after.wood).toFixed(3) + '/秒',
      )
      ok(
        '灵能不加成灵机（只作用于基础物资）',
        after.insight.minus(before.insight).abs().lt(1e-9),
        '灵机 ' + E.moneyToNumber(before.insight).toFixed(4) + ' → ' + E.moneyToNumber(after.insight).toFixed(4),
      )
    }

    // 《灵能应用》（主线第Ⅳ章）：灵能同时进入点石成灵、刨木成板的制作收益
    {
      const probe = (learned, energy) => {
        const { state: s, derived: d } = newGame()
        if (learned) s.upgrades.energyApplication = true
        s.resources.qiEnergy = E.money(energy)
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
        stockOnly.stone.minus(before.stone).abs().lt(1e-9) && stockOnly.plank.minus(before.plank).abs().lt(1e-9),
        `灵石 ${E.moneyToNumber(before.stone).toFixed(3)} → ${E.moneyToNumber(stockOnly.stone).toFixed(3)}`,
      )
      ok(
        '灵能应用改为驱动工位，不再凭库存提高单份收益',
        close(learned.stone, stockOnly.stone) && close(learned.plank, stockOnly.plank),
        `灵石 ${E.moneyToNumber(stockOnly.stone).toFixed(3)} → ${E.moneyToNumber(learned.stone).toFixed(3)}`,
      )
      ok('灵能应用不外溢到名单之外的配方（采药制丹不变）', learned.pill.minus(before.pill).abs().lt(1e-9))
      ok('点石成灵仍保持原始收益', close(learned.infusedStone, stockOnly.infusedStone))
    }

    // 灵气六阶阶梯（CRAFT-PROGRESSION.md#研究与解锁）：气 → 液 → 晶 → 灵气分子 → 正负灵子 → 灵能；灵石是含灵矿物，不在阶梯上
    {
      const liq = CRAFT_MAP.condenseLiquid
      const cry = CRAFT_MAP.condenseCrystal
      ok('凝气成液由凝气化液放行，150 灵气一瓶', liq.needs?.upgrades?.includes('qiLiquid') && liq.cost.qi === 150 && liq.out === 'spiritLiquid')
      ok('凝液法无境界门槛、只承接化液', E.UPGRADE_MAP.liquidArt.needs.realm == null && E.UPGRADE_MAP.liquidArt.needs.upgrades.length === 1 && E.UPGRADE_MAP.liquidArt.needs.upgrades[0] === 'qiLiquid')
      ok('凝晶原理承接灵气纯化，符文条件下移由凝晶工艺承接',
        E.UPGRADE_MAP.crystalTheory.needs.upgrades.includes('qiPurify') &&
        E.UPGRADE_MAP.crystalCraft.needs.upgrades.includes('shapeRune') &&
        E.UPGRADE_MAP.crystalCraft.needs.building?.id === 'talismanHall')
      ok('凝气结晶由固形纹直接加工灵液与灵气', cry.cost.spiritLiquid === 3 && !cry.cost.talisman && cry.cost.qi === 300)
      ok('培育仙草以灵液浇灌', CRAFT_MAP.growImmortalHerb.cost.spiritLiquid === 2 && !CRAFT_MAP.growImmortalHerb.cost.qi)
      ok('灵石是含灵矿物：矿工开采与点石成灵并存', JOBS.some(job => job.secondary?.resource === 'stone') && CRAFT_MAP.infuseStone.needs?.building?.id === 'quarry')
      const split = BUILDING_MAP.splitArray
      const polar = BUILDING_MAP.polarizeArray
      ok('灵子论承接元婴道论并开放分灵阵，产出灵气分子', E.UPGRADE_MAP.particleTheory.needs.realm === 5 && E.UPGRADE_MAP.particleTheory.cost.daoTreatise > 0 && split.needs.realm === 5 && split.needs.upgrades.includes('particleTheory') && split.effects.prod.qiParticle > 0 && !split.effects.prod.yangParticle)
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
      s.resources.qi = E.money(100)
      E.recompute(s, d)
      const on = E.money(d.expense?.qi)
      s.buildings.splitArray = { count: 2, on: false }
      E.recompute(s, d)
      const off = E.money(d.expense?.qi)
      ok('停用分灵阵后灵气开销归零', E.moneyGt(off, on) && off.abs().lt(on.abs()),
        E.moneyToNumber(on) + ' → ' + E.moneyToNumber(off))
    }
  }
}
