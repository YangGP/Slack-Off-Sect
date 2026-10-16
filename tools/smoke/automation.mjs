import { normalizeState, resetForReincarnation } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { UPGRADE_MAP } from '../../src/data/upgrades.js'
import { CRAFTS, CRAFT_MAP } from '../../src/data/crafts.js'
import { exportSave, parseImport } from '../../src/game/save.js'
import { newGame } from './fixtures.mjs'

export function automaticCrafting({ ok, close, section }) {
  section('自动制作（一份一份不瞬发，就是原来的「连续」）')
  {
    const { state, derived } = newGame()
    state.buildings.quarry = { count: 1, on: true }
    // 先给足仓储：这一段专门测节奏，不想被「灵石上限 150」挡住
    state.buildings.warehouse = { count: 30, on: true }
    state.resources.qi = 1500 // 够做 100 份点石成灵
    state.resources.rock = 1000 // 节奏测试备足石材，缺料另测。
    E.recompute(state, derived)
    const step = E.craftTime(E.CRAFT_MAP.infuseStone)

    // 点「制作」是瞬发的：一下立刻出一份
    const before = state.resources.stone
    E.craft(state, derived, 'infuseStone')
    ok('制作是瞬发的（点一下立刻出一份）', state.resources.stone - before === 1)

    // 批量快捷：按「材料能做出来的份数」取 ¼、½、全部
    state.resources.qi = 15 * 20 // 够做 20 份
    E.recompute(state, derived)
    ok('材料够做 20 份', E.maxCraftable(state, derived, 'infuseStone') === 20, `${E.maxCraftable(state, derived, 'infuseStone')}`)
    const q0 = state.resources.qi
    const s0 = state.resources.stone
    E.craftBatch(state, derived, 'infuseStone', 0.25)
    ok(
      '¼料 一次做掉「能做份数」的四分之一（20 → 5 份）',
      state.resources.stone - s0 === 5 && close(q0 - state.resources.qi, 15 * 5, 1e-6),
      `实际 ${state.resources.stone - s0} 份，灵气 -${q0 - state.resources.qi}`,
    )
    state.resources.qi = 15 * 20
    E.recompute(state, derived)
    const q1 = state.resources.qi
    const s1 = state.resources.stone
    E.craftBatch(state, derived, 'infuseStone', 0.5)
    ok(
      '½料 一次做掉一半（20 → 10 份）',
      state.resources.stone - s1 === 10 && close(q1 - state.resources.qi, 15 * 10, 1e-6),
      `实际 ${state.resources.stone - s1} 份`,
    )
    state.resources.qi = 15 * 20
    E.recompute(state, derived)
    const q2 = state.resources.qi
    const s2 = state.resources.stone
    E.craftBatch(state, derived, 'infuseStone', 1)
    ok(
      '全部 一次做光（20 → 20 份）',
      state.resources.stone - s2 === 20 && close(q2 - state.resources.qi, 15 * 20, 1e-6),
      `实际 ${state.resources.stone - s2} 份`,
    )
    state.resources.qi = 15 * 3 // 只够 3 份：四分之一取整为 0
    E.recompute(state, derived)
    ok('份数不足时四分之一取整为 0（不该硬做一份）', E.maxCraftable(state, derived, 'infuseStone') === 3)
    const s3 = state.resources.stone
    E.craftBatch(state, derived, 'infuseStone', 0.25)
    ok('3 份时 ¼料 做 0 份', state.resources.stone === s3)

    // 自动制作：没参悟《心有灵犀》时勾不上
    state.resources.qi = 1500
    E.recompute(state, derived)
    ok('未参悟《心有灵犀》时勾不上自动', E.toggleAutoCraft(state, derived, 'infuseStone') === false)
    ok('未参悟时自动不生效', E.autoCraftStatus(state, derived, 'infuseStone').on === false)

    // 参悟后：勾上自动，一份一份地做（不瞬发）
    state.upgrades.intuition = true
    state.settings.autoCraftOn = true
    E.recompute(state, derived)
    state.resources.qi = 1500
    ok('参悟后可以勾上', E.toggleAutoCraft(state, derived, 'infuseStone') === true)
    const stoneBefore = state.resources.stone
    const qiBefore = state.resources.qi
    ok('刚勾上时一份都还没做', state.resources.stone === stoneBefore && state.resources.qi === qiBefore)

    E.runAutoCraft(state, derived, step * 0.5)
    ok('半份时间还没出东西', state.resources.stone === stoneBefore)
    E.runAutoCraft(state, derived, step * 0.5 + 1e-6)
    ok('满一份时间出 1 份', state.resources.stone - stoneBefore === 1, `实际 +${state.resources.stone - stoneBefore}`)

    const st2 = state.resources.stone
    E.runAutoCraft(state, derived, 10)
    const expect = Math.floor(10 / step)
    ok(
      '10 秒做出约 10/step 份（不是一次性全做完）',
      Math.abs(state.resources.stone - st2 - expect) <= 1,
      `实际 +${state.resources.stone - st2}，预期约 ${expect}`,
    )
    ok('材料按份扣除', close(state.resources.qi, qiBefore - (state.resources.stone - stoneBefore) * 15 - 0, 1e-6))
    ok('材料远没被抽干（说明没有瞬发做到底）', state.resources.qi > 1000, `剩余灵气 ${Math.round(state.resources.qi)}`)

    // 材料断了：不做、也不取消勾选；补上材料就接着做
    const madeBefore = state.craftTimers.infuseStone.made
    state.resources.qi = 15
    E.recompute(state, derived)
    E.runAutoCraft(state, derived, 10)
    ok('材料不够时先歇着', E.autoCraftStatus(state, derived, 'infuseStone').on === true && state.resources.stone - st2 - expect <= 1)
    state.resources.qi = 150
    E.recompute(state, derived)
    const st3 = state.resources.stone
    E.runAutoCraft(state, derived, step * 3)
    ok('材料补上后接着做', state.resources.stone - st3 >= 2, `实际 +${state.resources.stone - st3}`)
    ok('本轮计数继续累加', state.craftTimers.infuseStone.made > madeBefore)

    // 悬停明细的「出项」要计入此刻自动制作的材料消耗（满仓/耗尽预估同一口径），
    // 但不并进 expenseSources —— tick 按 expense 结算、自动制作另按份实付，并进去会双扣
    state.resources.stone = 0
    state.resources.qi = 150
    E.recompute(state, derived)
    const drainQi = derived.autoCraftDrain.qi || []
    ok(
      '出项快照计入自动制作的材料消耗（15 灵气 ÷ 单件耗时）',
      drainQi.length === 1 &&
        drainQi[0].id === 'infuseStone' &&
        close(drainQi[0].value, -15 / step, 1e-9),
      `实际 ${drainQi.map((x) => x.value).join(', ')}`,
    )
    ok(
      '结算口径的 expenseSources 不含自动制作（tick 会双扣）',
      !(derived.expenseSources.qi || []).some((x) => x.kind === 'autoCraft'),
    )
    state.autoCraft.infuseStone = false
    E.recompute(state, derived)
    ok('关掉自动后出项快照清空', (derived.autoCraftDrain.qi || []).length === 0)
    state.autoCraft.infuseStone = true
    state.resources.qi = 10 // 连一份材料都不够：配方暂停，此刻不消耗
    E.recompute(state, derived)
    ok('材料不够时配方暂停，不再计入出项', (derived.autoCraftDrain.qi || []).length === 0)
    state.resources.qi = 150
    E.recompute(state, derived)

    // 总开关一关就停
    state.settings.autoCraftOn = false
    E.recompute(state, derived)
    const st5 = state.resources.stone
    E.runAutoCraft(state, derived, 10)
    ok('设置页的总开关关掉后不再自动做', state.resources.stone === st5)
    state.settings.autoCraftOn = true
    E.recompute(state, derived)

    // 走 tick 也能推进；离线也照做
    state.resources.qi = 1500
    state.resources.stone = 0
    E.recompute(state, derived)
    const st6 = state.resources.stone
    for (let i = 0; i < 10; i++) E.tick(state, derived, 1, { events: false })
    ok('tick 里会推进自动制作', state.resources.stone - st6 >= 3, `10 秒做出 ${state.resources.stone - st6} 份`)

    state.resources.stone = 0
    E.recompute(state, derived)
    const st7 = state.resources.stone
    E.simulateOffline(state, derived, 10, { silent: true })
    ok(
      '离线结算也继续做（挂着就一直在做）',
      state.resources.stone - st7 >= 3,
      `离线 10 秒做出 ${state.resources.stone - st7} 份`,
    )
  }
}
