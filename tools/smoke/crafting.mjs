import { createInitialState, normalizeState } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { RESOURCES, RESOURCE_MAP } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { JOBS } from '../../src/data/jobs.js'
import { ALL_UPGRADES, UPGRADE_MAP } from '../../src/data/upgrades.js'
import { CRAFTS, CRAFT_MAP } from '../../src/data/crafts.js'
import { describeEffects } from '../../src/game/effectsText.js'
import { newGame } from './fixtures.mjs'

export function manualCrafting({ ok, close, section }) {
  section('制作')
  {
    const { state, derived } = newGame()
    state.buildings.quarry = { count: 1, on: true }
    E.recompute(state, derived)
    state.resources.qi = 1000
    state.resources.rock = 3
    const made = E.craft(state, derived, 'infuseStone')
    ok('点石成灵产出 1 枚', made === 1 && state.resources.stone === 1, `实际 ${made}/${state.resources.stone}`)
    ok('扣除了 15 灵气', close(state.resources.qi, 985, 1e-6), `实际 ${state.resources.qi}`)
    ok('凝石同时消耗一块石材', state.resources.rock === 0)
    ok('统计已记录', state.stats.crafted.stone === 1)

    // 制作加成：小数累积机制
    derived.craftBonus = 0.5
    state.resources.qi = 10000
    state.resources.rock = 6
    state.craftProgress.infuseStone = 0
    const before = state.resources.stone
    E.craft(state, derived, 'infuseStone', { times: 2 })
    ok('50% 加成下两次制作得到 3 枚', state.resources.stone - before === 3, `实际 ${state.resources.stone - before}`)

    const { state: s2, derived: d2 } = newGame()
    ok('未解锁的配方不能制作', E.craft(s2, d2, 'refinePill') === 0)
  }
}

export function workshopBonuses({ ok, close, section }) {
  section('百工坊：提前到手 + 制作加成')
  {
    const wh = BUILDING_MAP.workshop
    const gates = (wh.needs?.buildings || []).map((b) => b.id)
    ok(
      '百工坊在采木采矿阶段开放，无需炼丹房与炼器坊',
      gates.length === 2 && gates.includes('lumberYard') && gates.includes('quarry'),
      gates.join('、') || '（无门槛）',
    )
    ok('百工坊给制作加成', (wh.effects?.craftBonus || 0) > 0, String(wh.effects?.craftBonus))

    // 百工坊是**纯加成**建筑：任何东西都不该"因为缺它而做不出来"
    {
      const lockers = []
      const scan = (kind, list, needsOf) => {
        for (const item of list) {
          const n = needsOf(item) || {}
          const ids = [
            ...(n.buildings || []).map((x) => x.id),
            n.building?.id,
          ].filter(Boolean)
          if (ids.includes('workshop')) lockers.push(kind + ':' + (item.name || item.id))
        }
      }
      scan('建筑', BUILDINGS, (b2) => b2.needs)
      scan('配方', CRAFTS, (c) => c.needs)
      scan('学术', ALL_UPGRADES, (u) => u.needs)
      ok('百工坊不锁任何东西（没有一条 needs 指向它）', lockers.length === 0, lockers.join('、') || '干净')

      const keys = Object.keys(wh.effects || {})
      ok(
        '百工坊的效果只与制作有关（制作加成 / 木板上限）',
        keys.every((k) => k === 'craftBonus' || k === 'storage') && !keys.includes('ratioAll'),
        keys.join('、'),
      )
    }

    // 百工坊用基础原料启动；木板工艺独立解锁。
    ok(
      '百工坊仅使用普通灵木与矿石，不需加工材料',
      wh.cost.wood === 100 && wh.cost.rock === 150 && Object.keys(wh.cost).length === 2,
      JSON.stringify(wh.cost),
    )
    ok(
      '木作器械不再需要百工坊，也不吃木板',
      CRAFT_MAP.sawPlank.needs?.upgrades?.includes('woodworking') &&
        UPGRADE_MAP.woodworking?.needs?.buildings?.some(b => b.id === 'lumberYard') &&
        !UPGRADE_MAP.woodworking?.needs?.buildings?.some(b => b.id === 'workshop') &&
        !(UPGRADE_MAP.woodworking?.cost?.plank > 0),
      JSON.stringify(UPGRADE_MAP.woodworking?.cost),
    )
    ok('木料链无环（刨木成板不再由百工坊解锁）', CRAFT_MAP.sawPlank.needs?.building?.id !== 'workshop')
    {
      const { state: s, derived: d } = newGame()
      s.buildings.lumberYard = { count: 1, on: true }
      Object.assign(s.resources, wh.cost)
      E.recompute(s, d)
      ok('未建立采矿场时不能跳过百工坊前置', E.buyBuilding(s, d, 'workshop') === 0)
      s.buildings.quarry = { count: 1, on: true }
      E.recompute(s, d)
      ok('基础仓容装得下首座百工坊全部用料', Object.entries(wh.cost).every(([r, v]) => d.max[r] >= v))
      ok('未学木作器械或炼丹术也能实际建成百工坊', E.buyBuilding(s, d, 'workshop') === 1 && s.resources.wood === 0 && s.resources.rock === 0)
      ok('木材耗尽后早期百工坊仍提供6%制作增益', close(d.craftBonus, 0.06))
    }

    // 加成随启用数量叠加（用增量比较：craftBonus 另有技艺来源，别写死绝对值）
    const bonusWith = (count) => {
      const { state: s, derived: d } = newGame()
      s.resources.wood = 100
      s.upgrades.alchemyArt = true
      s.buildings.alchemyRoom = { count: 1, on: true }
      if (count > 0) s.buildings.workshop = { count, on: true }
      E.recompute(s, d)
      return d.craftBonus
    }
    const one = bonusWith(1)
    const two = bonusWith(2)
    ok(
      `每座百工坊 +6%（一座 ${(one * 100).toFixed(0)}% → 两座 ${(two * 100).toFixed(0)}%）`,
      Math.abs(two - one - (wh.effects.craftBonus || 0)) < 1e-9,
      `${one} → ${two}`,
    )

    // 同一配方，有工坊时产出更多（点石成灵：qi → stone，craftBonus 直接乘在产量上，不取整）
    const run = (withWorkshop) => {
      const { state: s2, derived: d2 } = newGame()
      s2.resources.wood = 100
      s2.upgrades.earthArt = true
      s2.upgrades.alchemyArt = true
      s2.buildings.warehouse = { count: 2, on: true }
      s2.buildings.alchemyRoom = { count: 1, on: true }
      if (withWorkshop) s2.buildings.workshop = { count: 1, on: true }
      s2.resources.qi = 1e6
      s2.buildings.quarry = { count: 1, on: true }
      s2.resources.rock = 60
      s2.resources.stone = 0 // 成品上限不高，先清空免得被上限挡住
      E.recompute(s2, d2)
      E.craft(s2, d2, 'infuseStone', { times: 20, silent: true })
      return s2.resources.stone || 0
    }
    const plain = run(false)
    const boosted = run(true)
    ok(
      '制作产出按 craftBonus 放大（不取整丢弃）',
      plain > 0 && boosted > plain,
      `无工坊 ${plain.toFixed(2)} → 有工坊 ${boosted.toFixed(2)} 石`,
    )
    ok(
      `放大比例约等于 craftBonus（实测 ×${(boosted / plain).toFixed(3)}）`,
      Math.abs(boosted / plain - (1 + (wh.effects.craftBonus || 0))) < 0.02,
      `${plain.toFixed(2)} → ${boosted.toFixed(2)}`,
    )
  }
}

export function craftChainMigration({ ok, close, section }) {
  section('新增加工链与旧存档兼容')
  {
    const legacy = createInitialState()
    delete legacy.qiLiquidVersion
    delete legacy.resources.qiParticle
    delete legacy.resources.spiritLiquid
    legacy.buildings.splitArray = { count: 2, on: false }
    legacy.upgrades.yinyangSplit = true
    legacy.upgrades.crystalTheory = true
    legacy.autoCraft.condenseCrystal = true
    legacy.stats.crafted.immortalHerb = 5
    const restored = normalizeState(legacy)
    ok('旧分灵阵迁移补齐偏极阵并保留数量与停用状态', restored.buildings.polarizeArray?.count === 2 && restored.buildings.polarizeArray.on === false && restored.upgrades.particleTheory)
    ok('旧凝晶产线补齐测定、化液、凝液、纯化与自动上游', restored.upgrades.qiMeasure && restored.upgrades.qiLiquid && restored.upgrades.liquidArt && restored.upgrades.qiPurify && restored.autoCraft.condenseLiquid)
    ok('迁移不改写原始存档对象', !legacy.buildings.polarizeArray && !legacy.upgrades.liquidArt && !legacy.autoCraft.condenseLiquid)
    const twice = normalizeState(restored)
    ok('重复读档不重复发放设施', twice.buildings.polarizeArray.count === 2)
    const current = createInitialState()
    current.buildings.splitArray = { count: 1, on: true }
    current.upgrades.crystalTheory = true
    const unchanged = normalizeState(current)
    ok('新版存档遵守新产线，不自动补设施或研究', !unchanged.buildings.polarizeArray && !unchanged.upgrades.liquidArt && !unchanged.upgrades.qiLiquid)
    const herbLegacy = { resources: {}, stats: { crafted: { immortalHerb: 1 } } }
    ok('旧育仙草记录也能补齐凝液法', normalizeState(herbLegacy).upgrades.liquidArt)
    const { state: s, derived: d } = newGame()
    s.buildings.quarry = { count: 1, on: true }
    E.recompute(s, d)
    d.net = { qi: 1, rock: 1, stone: 0.01 }
    ok('等待时间比较采集与两条凝石配方，选择最快路线', close(E.timeToAfford(s, d, 'stone', 1), 15))
    d.craftBonus = 1
    ok('等待时间计入制作收益，避免高估原料需求', close(E.timeToAfford(s, d, 'stone', 2), 15))
    d.rates = { qi: 3, rock: 3 }
    const rateWithQuarry = E.eventResourceRate(s, d, 'stone')
    delete s.buildings.quarry
    const rateWithoutQuarry = E.eventResourceRate(s, d, 'stone')
    ok('事件产能选可用配方的最佳供料路线，不计入未解锁路线', rateWithQuarry > rateWithoutQuarry && rateWithoutQuarry === 0)
    s.realm = 10
    for (const b of BUILDINGS) s.buildings[b.id] = { count: 10, on: true }
    for (const u of ALL_UPGRADES) s.upgrades[u.id] = true
    E.recompute(s, d)
    d.net = Object.fromEntries(RESOURCES.map(r => [r.id, 0]))
    Object.assign(d.net, { qi: 150, rock: 100, herb: 100, ore: 100, wood: 100, faith: 500 })
    ok('灵宝的多级加工等待可沿九转丹、仙草、灵液追溯到灵气', Number.isFinite(E.timeToAfford(s, d, 'spiritTreasure', 1)))
  }
}

export function oreAndSpiritStone({ ok, close, section }) {
  section('矿石与点石成灵：凡石砌基，硬通货归灵石')
  {
    const rock = RESOURCE_MAP.rock
    const q = BUILDING_MAP.quarry
    // 矿石已去掉整数限制：采掘与炉料都按小数结算（炼铁炉每座耗 0.3/秒，整枚计数反而别扭）
    ok('矿石资源已定义且不按整枚计数', !!rock && !rock.integer, rock ? JSON.stringify({ id: rock.id, baseMax: rock.baseMax, integer: !!rock.integer }) : '（缺）')
    ok(
      '采矿场由伐木场与谷仓解锁、木料计价：不吃灵气、不吃自己的产出',
      ['lumberYard', 'granary'].every(id => q.needs?.buildings?.some(b => b.id === id)) && (q.cost?.wood || 0) > 0 && !q.cost?.qi && !q.cost?.rock,
      JSON.stringify({ cost: q.cost, needs: q.needs }),
    )
    ok(
      '采矿场开放矿工，自身不产矿石',
      !q.effects?.prod?.rock &&
        JOBS.some(
          (job) =>
            job.resource === 'rock' &&
            (job.needs?.building?.id === q.id || job.needs?.anyBuildings?.some((b) => b.id === q.id)),
        ),
      JSON.stringify(q.effects),
    )
    ok('灵石矿造价改吃矿石，不再用硬通货当砌石', (BUILDING_MAP.spiritQuarry.cost?.rock || 0) > 0 && !BUILDING_MAP.spiritQuarry.cost?.stone, JSON.stringify(BUILDING_MAP.spiritQuarry.cost))
    ok('聚灵大阵灵石需求减少，矿石承接砌筑', BUILDING_MAP.gatheringArray.cost.stone === 150 && BUILDING_MAP.gatheringArray.cost.rock === 400, JSON.stringify(BUILDING_MAP.gatheringArray.cost))
    ok('库房以矿石砌基并为矿石扩容', (BUILDING_MAP.warehouse.cost?.rock || 0) > 0 && (BUILDING_MAP.warehouse.effects?.storage?.rock || 0) > 0)
    const r = CRAFT_MAP.infuseStone
    ok('点石成灵：矿石3+灵气15凝一枚灵石，需采矿场', r.cost.rock === 3 && r.cost.qi === 15 && r.out === 'stone' && r.needs?.building?.id === 'quarry', JSON.stringify(r))
    {
      const { state: s, derived: d } = newGame()
      Object.assign(s.resources, { rock: 30, qi: 100 })
      E.recompute(s, d)
      ok('没有采矿场点不了石', E.craft(s, d, 'infuseStone') === 0)
      s.buildings.quarry = { count: 1, on: true }
      E.recompute(s, d)
      const made = E.craft(s, d, 'infuseStone', { times: 2 })
      ok('点石成灵按配方产出并扣料', made === 2 && s.resources.stone === 2 && close(s.resources.rock, 24) && close(s.resources.qi, 70), `产 ${made}，余 rock ${(s.resources.rock || 0).toFixed(2)} qi ${(s.resources.qi || 0).toFixed(2)}`)
    }
  }
}

export function specializedCrafting({ ok, close, section }) {
  section('专业制作：实际产出与设施启停')
  {
    const { state: s, derived: d } = newGame()
    Object.assign(s.resources, { wood: 10000, qi: 10000 })
    s.buildings.workshop = { count: 1, on: true }
    E.recompute(s, d)
    const stoneYield = E.craftYield(d, CRAFT_MAP.infuseStone)
    const pillYield = E.craftYield(d, CRAFT_MAP.refinePill)
    s.buildings.alchemyRoom = { count: 10, on: true }
    E.recompute(s, d)
    ok('炼丹房提高丹药收益而不增加凝石收益', close(E.craftYield(d, CRAFT_MAP.refinePill) - pillYield, 10 * BUILDING_MAP.alchemyRoom.effects.craftBonusByResource.pill) && close(E.craftYield(d, CRAFT_MAP.infuseStone), stoneYield))
    E.toggleBuilding(s, d, 'alchemyRoom')
    ok('专业加成随设施停用停止', close(E.craftYield(d, CRAFT_MAP.refinePill), pillYield))
    const effects = describeEffects(BUILDING_MAP.forge.effects)
    ok('设施效果明确列出专业成品', effects.some(row => row.label === '玄钢 制作产出') && !effects.some(row => row.label === '制作产出'))
    s.upgrades.alchemyCauldron = true
    E.recompute(s, d)
    const unrefined = E.craftYield(d, CRAFT_MAP.refinePill)
    s.treasureLevels.alchemyCauldron = 2
    E.recompute(s, d)
    ok('法宝祭炼正确放大专业加成', close(E.craftYield(d, CRAFT_MAP.refinePill) - unrefined, 0.048))
    s.resources.wood = 0
    E.recompute(s, d)
    ok('百工坊无需维护材料即可提供通用制作收益', close(d.craftBonus, 0.06))
    ok('无维护费的百工坊遵循免费建筑不可停用规则', E.toggleBuilding(s, d, 'workshop') === null && close(d.craftBonus, 0.06))
  }
}

export function realmCraftSpeed({ ok, close, section }) {
  section('境界加工速度与数量级分层')
  {
    const { state: s, derived: d } = newGame()
    s.buildings.talismanHall = { count: 1, on: true }
    s.upgrades.intuition = true
    Object.assign(s.resources, { wood: 2000, qi: 2000 })
    E.recompute(s, d)
    const recipe = CRAFT_MAP.drawTalisman
    const earlyYield = E.craftYield(d, recipe)
    const earlyStep = E.autoCraftStatus(s, d, recipe.id).step
    s.realm = 7
    s.autoCraft[recipe.id] = true
    E.recompute(s, d)
    const lateSpeed = Math.sqrt(4.4 / 2)
    ok('后期境界提高加工吞吐而不直接扩大单份收益', close(d.craftSpeed, lateSpeed) && close(E.autoCraftStatus(s, d, recipe.id).step, earlyStep / lateSpeed) && close(E.craftYield(d, recipe), earlyYield))
    const clone = normalizeState(JSON.parse(JSON.stringify(s)))
    const cd = E.createDerived()
    E.recompute(clone, cd)
    const duration = E.craftTime(recipe, d) * 4
    E.runAutoCraft(s, d, duration)
    for (let i = 0; i < 40; i++) E.runAutoCraft(clone, cd, duration / 40)
    ok('小步与批量自动加工产出和扣料一致', s.resources.talisman === 4 && clone.resources.talisman === 4 && s.resources.wood === clone.resources.wood && s.resources.qi === clone.resources.qi && close(s.craftProgress[recipe.id], clone.craftProgress[recipe.id]))
    ok('自动节拍与收支估计一致', close(E.autoCraftStatus(s, d, recipe.id).step, E.craftTime(recipe, d)))
    d.craftBonus = 10
    ok('后期制作设施持续增产且没有统一200%封顶', E.craftYield(d, recipe) > 11)
    s.buildings.arcaneVault = { count: 2, on: true }
    s.buildings.medicineVault = { count: 2, on: true }
    E.recompute(s, d)
    ok('专藏可承接灵宝的三路投料', Object.entries(CRAFT_MAP.forgeSpiritTreasure.cost).every(([res, n]) => d.max[res] >= n))
  }
}
