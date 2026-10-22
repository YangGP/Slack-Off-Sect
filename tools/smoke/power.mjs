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
