import { normalizeState, resetForReincarnation } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { UPGRADE_MAP } from '../../src/data/upgrades.js'
import { CRAFTS, CRAFT_MAP } from '../../src/data/crafts.js'
import { exportSave, parseImport } from '../../src/game/save.js'
import { newGame } from './fixtures.mjs'

/** 金额差值：夹具里「涨了多少」一律走 Decimal，不用原生减法。 */
const grew = (after, before) => E.moneySubtract(after, before)
/** 金额差值转 Number：只用于「约等于几份」这类带 ±1 容差的比较。 */
const grewNumber = (after, before) => E.moneyToNumber(grew(after, before))

export function idleCraftAdvice({ ok, section }) {
  section('挂机建议与原子应用')
  const { state: s, derived: d } = newGame()
  s.realm = 6
  for (const u of E.ALL_UPGRADES) s.upgrades[u.id] = true
  d.autoCraftUnlocked = d.craftTargetsUnlocked = true
  s.autoCraft = { compileDaoTreatise: true, drawArrayDiagram: true }
  s.settings.craftReserves = { daoNote: E.ZERO, daoTreatise: E.money(200), paper: E.money(7) }
  const a = E.craftAdvice(s, d)
  ok('建议为下游五份用量，已有0与高定额均默认保留', a.reserves.find(r => r.id === 'daoNote').amount.eq(100) && a.reserves.every(r => !r.selected))
  ok('中层目标覆盖已有更高保护量', a.targets.find(r => r.id === 'compileDaoTreatise').amount.eq(201))
  ok('预览不更改设置或开启新产线', s.settings.craftReserves.daoTreatise.eq(200) && Object.keys(s.autoCraft).length === 2)
  const selected = E.craftAdvice(s, d, ['daoTreatise'])
  ok('选中保护值后联动中层目标', selected.targets.find(r => r.id === 'compileDaoTreatise').amount.eq(51))
  const selection = { signature: a.signature, reserveIds: ['daoTreatise'], targetIds: ['compileDaoTreatise'] }
  ok('主动选中后原子合并，未选0和定额保留', E.applyCraftAdvice(s, d, selection) && s.craftTargets.compileDaoTreatise.eq(51) && s.settings.craftReserves.daoNote.eq(0) && s.settings.craftReserves.paper.eq(7))
  const saved = normalizeState(parseImport(exportSave(s)))
  ok('重载保留显式0与建议快照', saved.settings.craftReserves.daoNote.eq(0) && saved.craftTargets.compileDaoTreatise.eq(51))
  ok('陈旧预览与重复应用拒绝', !E.applyCraftAdvice(s, d, selection))
  const current = E.craftAdvice(s, d)
  s.autoCraft.drawArrayDiagram = false
  ok('配方变化后不应用旧预览', !E.applyCraftAdvice(s, d, { ...selection, signature: current.signature }))
}

export function idleProtectionDetails({ ok, section }) {
  section('材料保护原因与恢复')
  const { state: s, derived: d } = newGame()
  s.realm = 5
  for (const u of E.ALL_UPGRADES) s.upgrades[u.id] = true
  d.autoCraftUnlocked = d.craftTargetsUnlocked = true
  s.autoCraft.compileDaoTreatise = true
  s.settings.craftReserves = { daoNote: E.money(100) }
  s.resources.daoNote = E.money(110)
  s.resources.insight = s.resources.paper = E.money(10000)
  const status = E.autoCraftStatus(s, d, 'compileDaoTreatise')
  ok('110库存扣20会穿透100保护，明细缺口为10', !status.ready && status.reason.includes('道札') && status.protectedInputs[0].deficit.eq(10))
  s.resources.daoNote = E.money(120)
  ok('补足一份后允许自动加工', E.canAutoCraft(s, d, CRAFT_MAP.compileDaoTreatise))
  s.craftTargets.compileDaoTreatise = E.money(1)
  s.resources.daoTreatise = E.money(1)
  ok('目标达成暂停', E.autoCraftStatus(s, d, 'compileDaoTreatise').reason.startsWith('目标已达'))
  s.resources.daoTreatise = E.ZERO
  ok('消费成品后恢复补货', E.canAutoCraft(s, d, CRAFT_MAP.compileDaoTreatise))
  s.resources.daoNote = E.money(110)
  ok('手动制作仍能使用受保护库存', E.craft(s, d, 'compileDaoTreatise') && s.resources.daoNote.eq(90))
}

/** 同一时刻跨工位保留材料；下一次规划必须反映库存目标变化。 */
export function processingFuelReserveRegression({ ok, section }) {
  section('加工计划的跨工位燃料保留与失效')
  const { state: s, derived: d } = newGame()
  s.realm = 5
  for (const id of ['intuition', 'craftTempo', 'woodworking', 'steelWorking']) s.upgrades[id] = true
  for (const id of ['workshop', 'forge']) s.buildings[id] = { count: 1, on: true }
  Object.assign(s.resources, { qi: E.money(120), wood: E.money(1000), ore: E.money(1000), steel: E.ZERO })
  s.autoCraft.sawPlank = s.autoCraft.refineSteel = true
  s.settings.autoCraftSpeeds.sawPlank = s.settings.autoCraftSpeeds.refineSteel = 10
  s.settings.processingModes.woodwork = 'overload'
  E.recompute(s, d)
  // 专门观察动力保留，排除冷却短缺的干扰。
  d.processingCoolingCapacity = 100
  let plan = E.processingPlan(s, d)
  ok('木作超载为炼器保留一份灵气材料', plan.sawPlank.work > 0 && plan.sawPlank.boost === 0)
  s.craftTargets.refineSteel = E.money(1)
  s.resources.steel = E.money(1)
  plan = E.processingPlan(s, d)
  ok('炼器达标后立即释放保留燃料，木作可超载', plan.refineSteel.work === 0 && plan.sawPlank.boost > 0)
  s.resources.steel = E.ZERO
  plan = E.processingPlan(s, d)
  ok('目标库存被使用后重新保留炼器材料', plan.refineSteel.work > 0 && plan.sawPlank.boost === 0)
}

export function automaticCrafting({ ok, close, section }) {
  section('自动制作（一份一份不瞬发，就是原来的「连续」）')
  {
    const { state, derived } = newGame()
    state.buildings.quarry = { count: 1, on: true }
    // 先给足仓储：这一段专门测节奏，不想被「灵石上限 150」挡住
    state.buildings.warehouse = { count: 30, on: true }
    state.resources.qi = E.money(1500) // 够做 100 份点石成灵
    state.resources.rock = E.money(1000) // 节奏测试备足石材，缺料另测。
    E.recompute(state, derived)
    const step = E.craftTime(E.CRAFT_MAP.infuseStone)

    // 点「制作」是瞬发的：一下立刻出一份
    const before = state.resources.stone
    E.craft(state, derived, 'infuseStone')
    ok('制作是瞬发的（点一下立刻出一份）', E.moneyEq(grew(state.resources.stone, before), 1))

    // 批量快捷：按「材料能做出来的份数」取 ¼、½、全部
    state.resources.qi = E.money(15 * 20) // 够做 20 份
    E.recompute(state, derived)
    ok('材料够做 20 份', E.maxCraftable(state, derived, 'infuseStone') === 20, `${E.maxCraftable(state, derived, 'infuseStone')}`)
    const q0 = state.resources.qi
    const s0 = state.resources.stone
    E.craftBatch(state, derived, 'infuseStone', 0.25)
    const madeQuarter = grew(state.resources.stone, s0)
    ok(
      '¼料 一次做掉「能做份数」的四分之一（20 → 5 份）',
      E.moneyEq(madeQuarter, 5) && close(grew(q0, state.resources.qi), 15 * 5, 1e-6),
      `实际 ${madeQuarter} 份，灵气 -${grew(q0, state.resources.qi)}`,
    )
    state.resources.qi = E.money(15 * 20)
    E.recompute(state, derived)
    const q1 = state.resources.qi
    const s1 = state.resources.stone
    E.craftBatch(state, derived, 'infuseStone', 0.5)
    const madeHalf = grew(state.resources.stone, s1)
    ok(
      '½料 一次做掉一半（20 → 10 份）',
      E.moneyEq(madeHalf, 10) && close(grew(q1, state.resources.qi), 15 * 10, 1e-6),
      `实际 ${madeHalf} 份`,
    )
    state.resources.qi = E.money(15 * 20)
    E.recompute(state, derived)
    const q2 = state.resources.qi
    const s2 = state.resources.stone
    E.craftBatch(state, derived, 'infuseStone', 1)
    const madeAll = grew(state.resources.stone, s2)
    ok(
      '全部 一次做光（20 → 20 份）',
      E.moneyEq(madeAll, 20) && close(grew(q2, state.resources.qi), 15 * 20, 1e-6),
      `实际 ${madeAll} 份`,
    )
    state.resources.qi = E.money(15 * 3) // 只够 3 份：四分之一取整为 0
    E.recompute(state, derived)
    ok('份数不足时四分之一取整为 0（不该硬做一份）', E.maxCraftable(state, derived, 'infuseStone') === 3)
    const s3 = state.resources.stone
    E.craftBatch(state, derived, 'infuseStone', 0.25)
    ok('3 份时 ¼料 做 0 份', E.moneyEq(state.resources.stone, s3))

    // 自动制作：没参悟《心有灵犀》时勾不上
    state.resources.qi = E.money(1500)
    E.recompute(state, derived)
    ok('未参悟《心有灵犀》时勾不上自动', E.toggleAutoCraft(state, derived, 'infuseStone') === false)
    ok('未参悟时自动不生效', E.autoCraftStatus(state, derived, 'infuseStone').on === false)

    // 参悟后：勾上自动，一份一份地做（不瞬发）
    state.upgrades.intuition = true
    state.settings.autoCraftOn = true
    E.recompute(state, derived)
    state.resources.qi = E.money(1500)
    ok('参悟后可以勾上', E.toggleAutoCraft(state, derived, 'infuseStone') === true)
    const stoneBefore = state.resources.stone
    const qiBefore = state.resources.qi
    ok('刚勾上时一份都还没做',
      E.moneyEq(state.resources.stone, stoneBefore) && E.moneyEq(state.resources.qi, qiBefore))

    E.runAutoCraft(state, derived, step * 0.5)
    ok('半份时间还没出东西', E.moneyEq(state.resources.stone, stoneBefore))
    E.runAutoCraft(state, derived, step * 0.5 + 1e-6)
    const firstOut = grew(state.resources.stone, stoneBefore)
    ok('满一份时间出 1 份', E.moneyEq(firstOut, 1), `实际 +${firstOut}`)

    const st2 = state.resources.stone
    E.runAutoCraft(state, derived, 10)
    const expect = Math.floor(10 / step)
    ok(
      '10 秒做出约 10/step 份（不是一次性全做完）',
      Math.abs(grewNumber(state.resources.stone, st2) - expect) <= 1,
      `实际 +${grew(state.resources.stone, st2)}，预期约 ${expect}`,
    )
    ok('材料按份扣除', close(state.resources.qi,
      qiBefore.minus(grew(state.resources.stone, stoneBefore).times(15)), 1e-6))
    ok('材料远没被抽干（说明没有瞬发做到底）', E.moneyGt(state.resources.qi, 1000),
      `剩余灵气 ${Math.round(E.moneyToNumber(state.resources.qi))}`)

    // 材料断了：不做、也不取消勾选；补上材料就接着做
    const madeBefore = state.craftTimers.infuseStone.made
    state.resources.qi = E.money(15)
    E.recompute(state, derived)
    E.runAutoCraft(state, derived, 10)
    ok('材料不够时先歇着', E.autoCraftStatus(state, derived, 'infuseStone').on === true &&
      grewNumber(state.resources.stone, st2) - expect <= 1)
    state.resources.qi = E.money(150)
    E.recompute(state, derived)
    const st3 = state.resources.stone
    E.runAutoCraft(state, derived, step * 3)
    ok('材料补上后接着做', E.moneyGte(grew(state.resources.stone, st3), 2), `实际 +${grew(state.resources.stone, st3)}`)
    ok('本轮计数继续累加', state.craftTimers.infuseStone.made > madeBefore)

    // 悬停明细的「出项」要计入此刻自动制作的材料消耗（满仓/耗尽预估同一口径），
    // 但不并进 expenseSources —— tick 按 expense 结算、自动制作另按份实付，并进去会双扣
    state.resources.stone = E.money(0)
    state.resources.qi = E.money(150)
    E.recompute(state, derived)
    const drainQi = derived.autoCraftDrain.qi || []
    ok(
      '出项快照计入自动制作的材料消耗（15 灵气 ÷ 单件耗时）',
      drainQi.length === 1 &&
        drainQi[0].id === 'infuseStone' &&
        close(drainQi[0].value, E.money(15).div(step).neg(), 1e-9),
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
    state.resources.qi = E.money(10) // 连一份材料都不够：配方暂停，此刻不消耗
    E.recompute(state, derived)
    ok('材料不够时配方暂停，不再计入出项', (derived.autoCraftDrain.qi || []).length === 0)
    state.resources.qi = E.money(150)
    E.recompute(state, derived)

    // 总开关一关就停
    state.settings.autoCraftOn = false
    E.recompute(state, derived)
    const st5 = state.resources.stone
    E.runAutoCraft(state, derived, 10)
    ok('设置页的总开关关掉后不再自动做', E.moneyEq(state.resources.stone, st5))
    state.settings.autoCraftOn = true
    E.recompute(state, derived)

    // 走 tick 也能推进；离线也照做
    state.resources.qi = E.money(1500)
    state.resources.stone = E.money(0)
    E.recompute(state, derived)
    const st6 = state.resources.stone
    for (let i = 0; i < 10; i++) E.tick(state, derived, 1, { events: false })
    ok('tick 里会推进自动制作', E.moneyGte(grew(state.resources.stone, st6), 3),
      `10 秒做出 ${grew(state.resources.stone, st6)} 份`)

    state.resources.stone = E.money(0)
    E.recompute(state, derived)
    const st7 = state.resources.stone
    E.simulateOffline(state, derived, 10, { silent: true })
    ok(
      '离线结算也继续做（挂着就一直在做）',
      E.moneyGte(grew(state.resources.stone, st7), 3),
      `离线 10 秒做出 ${grew(state.resources.stone, st7)} 份`,
    )
  }
}
