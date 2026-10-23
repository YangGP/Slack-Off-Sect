import { normalizeState } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { RESOURCES } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { JOBS } from '../../src/data/jobs.js'
import { recountDisciples } from '../../src/data/disciples.js'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { newGame, newGameRunning } from './fixtures.mjs'

export function buildingMaintenanceCompatibility({ ok, section }) {
  section('取消维护费后的旧档建筑恢复')
  const free = ['crystalArray', 'alchemyRoom', 'pillFurnace', 'forge', 'talismanHall',
    'etchTable', 'crystalBench', 'temperFurnace']
  const powered = ['heavenTower', 'karmaPool', 'trialTower']
  const state = normalizeState({ buildings: Object.fromEntries([...free, ...powered]
    .map(id => [id, { count: 2, on: false, power: 'energy' }])) })
  const derived = E.createDerived()
  E.recompute(state, derived)
  ok('取消维护费的八座设施恢复启用且不允许再停用', free.every(id =>
    state.buildings[id].on && E.toggleBuilding(state, derived, id) === null && !BUILDING_MAP[id].upkeep))
  ok('零物料库存仍恢复加工与采集增益', derived.craftBonusByResource.pill > 0 &&
    derived.craftBonusByResource.crystal > 0 && derived.craftBonusByResource.artifact > 0)
  ok('通天塔、因果池与试炼塔保留旧档停用及供能偏好', powered.every(id =>
    state.buildings[id].on === false && state.buildings[id].power === 'energy'))
  ok('通天塔与因果池只移除物料费，试炼塔仍收玄铁修缮费',
    !BUILDING_MAP.heavenTower.upkeep && !BUILDING_MAP.karmaPool.upkeep &&
    powered.every(id => BUILDING_MAP[id].upkeepQi > 0 && BUILDING_MAP[id].upkeepEnergy > 0) &&
    BUILDING_MAP.trialTower.upkeep.ore > 0)
  const again = normalizeState(JSON.parse(JSON.stringify(state)))
  ok('重复读档保持建筑数量与启停状态', [...free, ...powered].every(id =>
    again.buildings[id].count === 2 && again.buildings[id].on === state.buildings[id].on))
}

export function spiritQuarryInfusion({ ok, section }) {
  section('灵石矿可选灵液注灵')
  const { state: s, derived: d } = newGameRunning()
  s.settings.autoTalentJobs = false
  s.buildings.quarry = { count: 1, on: true }
  s.buildings.spiritQuarry = { count: 2, on: true }
  s.upgrades.prospectStudy = true
  for (const member of s.disciples.members) { member.roleId = 'miner'; member.loyalty = 1 }
  recountDisciples(s.disciples)
  E.recompute(s, d)
  const base = d.rates.stone, rock = d.rates.rock, ore = d.rates.ore
  ok('未学原理不能开启，旧矿默认不耗灵液', E.setBuildingBoost(s, d, 'spiritQuarry', true) === null && !d.maintenance.spiritLiquid)
  s.upgrades.infuseTheory = true
  s.resources.spiritLiquid = E.money(1)
  E.setBuildingBoost(s, d, 'spiritQuarry', true)
  ok('注灵只让矿工灵石采出翻倍，费用按矿井数量结算', d.rates.stone.eq(base.times(2)) && d.rates.rock.eq(rock) && d.rates.ore.eq(ore) && d.maintenance.spiritLiquid.eq('0.2'))
  ok('已开启状态随读档保留', normalizeState(s, { preferMembers: true }).buildings.spiritQuarry.boost === true)
  E.tick(s, d, 1, { events: false })
  ok('在线真实扣灵液', s.resources.spiritLiquid.eq('0.8'))
  s.resources.spiritLiquid = E.money('0.1')
  E.recompute(s, d)
  ok('半供只保留一半额外增产', d.buildingSupply.spiritQuarryInfusion === 0.5 && d.rates.stone.eq(base.times('1.5')))
  s.resources.spiritLiquid = E.ZERO
  E.recompute(s, d)
  ok('断液保留普通采矿且不欠费', d.rates.stone.eq(base) && d.maintenance.spiritLiquid.isZero())
  s.resources.spiritLiquid = E.money(1)
  E.setBuildingBoost(s, d, 'spiritQuarry', false)
  ok('关闭后停止耗液，读档保留开关', d.rates.stone.eq(base) && !d.maintenance.spiritLiquid && normalizeState(s, { preferMembers: true }).buildings.spiritQuarry.boost === false)
  s.buildings.infusionAltar = { count: 2, on: true }
  const migrated = normalizeState(s, { preferMembers: true })
  ok('旧台按参考造价补偿，研究保留且默认不打开注灵', !migrated.buildings.infusionAltar && migrated.upgrades.infuseTheory && !migrated.buildings.spiritQuarry.boost && migrated.resources.spiritLiquid.eq('10.2'))
  const again = normalizeState(migrated, { preferMembers: true })
  ok('再次读档不重复补偿', again.resources.spiritLiquid.eq(migrated.resources.spiritLiquid) && again.resources.stone.eq(migrated.resources.stone))
  for (const member of s.disciples.members) member.roleId = null
  recountDisciples(s.disciples)
  E.setBuildingBoost(s, d, 'spiritQuarry', true)
  ok('无人采矿时不空耗灵液', !d.maintenance.spiritLiquid)
}

export function buildingActions({ ok, close, section }) {
  section('建造 / 拆除 / 停用')
  {
    const { state, derived } = newGameRunning()
    const cost = E.buildingCost(state, 'hut', 2)
    const affordable = E.maxAffordable(state, 'hut')
    const recipes = ['spiritMortar', 'ironMortar'].map(out => Object.values(CRAFT_MAP).find(c => c.out === out))
    const yields = recipes.map(recipe => E.craftYield(derived, recipe))
    state.upgrades.masonryArt = true
    E.recompute(state, derived)
    ok('已学营造技艺仍按原价计算单座与批量建筑费用',
      JSON.stringify(E.buildingCost(state, 'hut', 2)) === JSON.stringify(cost) && E.maxAffordable(state, 'hut') === affordable)
    ok('营造技艺保留两种混灵土的制作产出增益',
      recipes.every((recipe, i) => close(E.craftYield(derived, recipe), yields[i].plus(0.1))))
    state.resources.qi = cost.qi
    state.resources.wood = cost.wood
    ok('营造技艺不改变实际批量建造扣料',
      E.buyBuilding(state, derived, 'hut', 2) === 2 && close(state.resources.qi, 0) && close(state.resources.wood, 0))
    ok('拆除仍按原价返还一半材料',
      E.sellBuilding(state, derived, 'hut', 2) === 2 && close(state.resources.qi, cost.qi.div(2)) && close(state.resources.wood, cost.wood.div(2)))
  }
  {
    const { state, derived } = newGame()
    // 基础链：茅屋要一座伐木场（伐木场自身要聚灵阵，此处一并补齐）
    state.buildings.spiritField = { count: 1, on: true }
    state.buildings.lumberYard = { count: 1, on: true }
    state.resources.qi = E.money(1000)
    state.resources.wood = E.money(60)
    state.resources.stone = E.money(100)
    E.trackPeak(state)

    const before = { qi: state.resources.qi, stone: state.resources.stone }
    const built = E.buyBuilding(state, derived, 'hut', 1)
    ok('建成 1 座茅屋', built === 1 && E.countOf(state, 'hut') === 1)
    ok('扣除灵气 150', close(before.qi.minus(state.resources.qi), 150, 1e-6))
    ok('首屋不消耗灵石', E.moneyEq(state.resources.stone, before.stone))
    ok('弟子上限 0 → 2', derived.maxDisciples === 2, `实际 ${derived.maxDisciples}`)
    ok('仓储上限提升（灵气 +120，两座即过炼气破境的 700）', E.moneyEq(derived.max.qi, 620), `实际 ${derived.max.qi}`)
    ok('建造计数已记录', state.stats.buildingsBuilt === 1)

    const second = E.buildingCost(state, 'hut', 1)
    ok('第二座更贵（价格递增）', E.moneyGt(second.qi, 150), `实际 ${second.qi}`)

    const affordable = E.maxAffordable(state, 'hut')
    ok('剩余资源不足时 maxAffordable 返回零', affordable === 0, `实际 ${affordable}`)

    // 新规则：只有带维护费的建筑能停用（茅屋没有运行成本，停它只会白亏）
    ok('没有维护费的建筑拒绝停用', E.toggleBuilding(state, derived, 'hut') === null)
    ok('拒绝之后仍是启用状态', E.activeOf(state, 'hut') === 1)

    // 带维护费的建筑可以停：产出消失，维护费也一起消失
    state.buildings.gatheringArray = { count: 2, on: true }
    E.recompute(state, derived)
    const qiRateBefore = derived.rates.qi
    ok('聚灵大阵在吃灵气', E.moneyIsPositive(derived.maintenance.qi), `${derived.maintenance.qi}`)
    ok('停用带维护费的建筑', E.toggleBuilding(state, derived, 'gatheringArray') === false)
    ok('停用后启用数为 0', E.activeOf(state, 'gatheringArray') === 0)
    ok('停用后维护费归零', E.moneyIsZero(derived.maintenance.qi), `${derived.maintenance.qi}`)
    ok('停用后不再产灵气', E.moneyLt(derived.rates.qi, qiRateBefore), `${qiRateBefore} → ${derived.rates.qi}`)
    E.toggleBuilding(state, derived, 'gatheringArray')
    ok('重新启用后维护费回来', E.moneyIsPositive(derived.maintenance.qi), `${derived.maintenance.qi}`)

    const resBefore = state.resources.qi
    E.sellBuilding(state, derived, 'hut', 1)
    ok('拆除后数量归零', E.countOf(state, 'hut') === 0)
    ok('拆除返还了材料', E.moneyGt(state.resources.qi, resBefore.minus(1000)))
  }
}
