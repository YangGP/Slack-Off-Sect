import { normalizeState } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { RESOURCES } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { JOBS } from '../../src/data/jobs.js'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { newGame, newGameRunning } from './fixtures.mjs'

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
