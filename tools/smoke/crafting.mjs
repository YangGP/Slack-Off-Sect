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
