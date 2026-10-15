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

export function bulkAutomation({ ok, section }) {
  section('批量自动炼制')
  {
    const { state: s, derived: d } = newGame()
    s.buildings.quarry = { count: 1, on: true }
    s.settings.autoCraftOn = false
    ok('未解锁自动炼制不能批量开启', !E.setAllAutoCraft(s, d, true) && !s.settings.autoCraftOn && Object.keys(s.autoCraft).length === 0)
    s.upgrades.intuition = true
    E.recompute(s, d)
    s.ui.craftFilter = 'advanced'
    ok('批量自动可在缺料时开启且保持总开关关闭', E.setAllAutoCraft(s, d, true) && !s.settings.autoCraftOn && s.autoCraft.infuseStone)
    ok('批量自动只选择已解锁配方，不受筛选影响', CRAFTS.every(c => !!s.autoCraft[c.id] === E.isCraftUnlocked(s, c)))
    s.craftTargets.infuseStone = 8
    s.autoCraft.refinePill = true // 旧偏好即使当前配方锁定，也要可清除。
    s.settings.autoCraftOn = true
    ok('取消自动清除所有选择且保持总开关开启', E.setAllAutoCraft(s, d, false) && s.settings.autoCraftOn && Object.values(s.autoCraft).every(on => !on))
    ok('批量切换保留库存目标', s.craftTargets.infuseStone === 8)
    s.upgrades.intuition = false
    s.upgrades.condenseArt = true
    s.resources.qi = d.max.qi
    s.resources.rock = 10
    E.recompute(s, d)
    s.upgrades.qiMeasure = true
    s.upgrades.qiLiquid = true
    s.upgrades.liquidArt = true
    E.recompute(s, d)
    ok('取消配方自动不影响节气凝液且不需要常驻解锁', E.setAllAutoCraft(s, d, false) && s.settings.autoCraftOn && E.runAutoCondense(s, d) && s.resources.spiritLiquid > 0)
  }
}

export function craftTargets({ ok, section }) {
  section('金丹工艺：阵基与库存目标')
  {
    const { state: s, derived: d } = newGame()
    s.upgrades.woodworking = true
    s.upgrades.talismanArt = true
    s.upgrades.arrayAssembly = true
    s.buildings.talismanHall = { count: 1, on: true }
    s.resources.plank = CRAFT_MAP.assembleArrayBase.cost.plank * 2
    s.resources.talisman = 7
    s.resources.qi = CRAFT_MAP.assembleArrayBase.cost.qi * 2
    s.resources.ore = CRAFT_MAP.assembleArrayBase.cost.ore * 2
    s.realm = 3
    E.recompute(s, d)
    ok('金丹前不能组装阵基', !E.isCraftUnlocked(s, CRAFT_MAP.assembleArrayBase) && E.craft(s, d, 'assembleArrayBase') === 0)
    ok('金丹前普通存档不能设置库存目标', !E.setCraftTarget(s, d, 'infuseStone', 3))
    s.realm = 4
    E.recompute(s, d)
    const made = E.craft(s, d, 'assembleArrayBase', { times: 2 })
    ok('阵基消耗木板、玄铁与灵气，不消耗符箓，整件产出', made === 2 && s.resources.arrayBase === 2 && s.resources.plank === 0 && s.resources.talisman === 7 && s.resources.qi === 0 && s.resources.ore === 0)
    s.upgrades.preachArt = true
    s.resources.arrayBase = BUILDING_MAP.academy.cost.arrayBase
    s.resources.plank = BUILDING_MAP.academy.cost.plank
    ok('第一座讲经堂可以用基础阵基仓储启动', E.buyBuilding(s, d, 'academy', 1) === 1 && s.resources.arrayBase === 0)
    ok('阵基具有至少三处可重复建造用途', BUILDINGS.filter(b => b.cost.arrayBase > 0).length >= 3)
    ok('讲经研究无境界门槛并保留建筑前置', UPGRADE_MAP.preachArt.needs.realm == null && !!UPGRADE_MAP.preachArt.needs.building)
    ok('静心研究无境界门槛并保留建筑前置', UPGRADE_MAP.calmMind.needs.realm == null && !!UPGRADE_MAP.calmMind.needs.building)

    s.upgrades.intuition = true
    s.buildings.quarry = { count: 1, on: true }
    s.resources.qi = 450
    s.resources.rock = 30
    s.resources.stone = 0
    s.autoCraft.infuseStone = true
    E.recompute(s, d)
    ok('可以设置成品库存目标', E.setCraftTarget(s, d, 'infuseStone', 3))
    E.runAutoCraft(s, d, 10)
    ok('达到目标后不继续消耗原料', s.resources.stone === 3 && s.resources.qi === 405)
    ok('状态明确显示目标暂停', E.autoCraftStatus(s, d, 'infuseStone').reason === '目标已达 · 暂停')
    s.resources.stone -= 2
    E.runAutoCraft(s, d, 6)
    ok('使用成品后自动补回库存目标', s.resources.stone === 3 && s.resources.qi === 375)
    E.craft(s, d, 'infuseStone')
    ok('手动制作可以超过自动目标', s.resources.stone === 4)
    ok('非法目标不覆盖已有设置', !E.setCraftTarget(s, d, 'infuseStone', -1) && !E.setCraftTarget(s, d, 'infuseStone', Infinity) && E.craftTarget(s, d, 'infuseStone') === 3)
    E.setCraftTarget(s, d, 'infuseStone', 0)
    E.runAutoCraft(s, d, 3)
    ok('目标为零表示不限', s.resources.stone > 4)
    E.setCraftTarget(s, d, 'infuseStone', 8)
    s.resources.stone = 0
    s.resources.qi = 450
    s.resources.rock = 30
    E.simulateOffline(s, d, 30)
    ok('离线自动炼制也遵守目标', s.resources.stone === 8)
    const restored = parseImport(exportSave(s))
    ok('目标数量与阵基资源能导出导入', restored.craftTargets.infuseStone === 8 && 'arrayBase' in restored.resources)
    const old = normalizeState({ resources: { wood: 5 }, realm: 4 })
    ok('旧存档补零阵基与空目标，原资源不变', old.resources.arrayBase === 0 && old.resources.wood === 5 && Object.keys(old.craftTargets).length === 0)
    resetForReincarnation(s, 5)
    E.recompute(s, d)
    ok('转世清空本世库存目标与阵基', Object.keys(s.craftTargets).length === 0 && s.resources.arrayBase === 0)
  }
}

export function craftSpeedControls({ ok, close, section }) {
  section('疾炼法与自动调速')
  {
    const makeGame = () => {
      const game = newGame()
      game.state.realm = 5
      game.state.buildings.quarry = { count: 1, on: true }
      Object.assign(game.state.upgrades, { intuition: true, arrayAssembly: true, liquidArt: true })
      E.recompute(game.state, game.derived)
      return game
    }
    const { state: s, derived: d } = makeGame()
    ok('研究前不能绕过解锁调速', !E.setAutoCraftSpeed(s, d, 'infuseStone', 10) && d.autoCraftSpeeds.infuseStone === 1)
    s.settings.autoCraftSpeeds.infuseStone = 10
    E.recompute(s, d)
    ok('未解锁时存档中的高速设置不生效', d.autoCraftSpeeds.infuseStone === 1)
    s.settings.autoCraftSpeeds.infuseStone = 1
    Object.assign(s.resources, UPGRADE_MAP.craftTempo.cost)
    ok('疾炼法可通过正常参悟解锁并扣料', E.research(s, d, 'craftTempo') && d.autoCraftSpeedUnlocked && Object.keys(UPGRADE_MAP.craftTempo.cost).every(res => s.resources[res] === 0))
    Object.assign(s.resources, { qi: 1500, rock: 300, stone: 0 })
    s.autoCraft.infuseStone = true
    E.recompute(s, d)
    const beforeRate = E.eventResourceRate(s, d, 'stone')
    const step = E.autoCraftStatus(s, d, 'infuseStone').step
    const yieldBefore = E.craftYield(d, CRAFT_MAP.infuseStone)
    const woodStep = E.autoCraftStatus(s, d, 'growWood').step
    s.craftTimers.growWood = { t: woodStep / 2, made: 0 }
    s.craftTimers.infuseStone = { t: step / 2, made: 0 }
    ok('十倍速度叠加境界节拍', E.setAutoCraftSpeed(s, d, 'infuseStone', 10) && close(E.autoCraftStatus(s, d, 'infuseStone').step, step / 10))
    ok('切换速度保持半份进度且不立即产出', close(s.craftTimers.infuseStone.t, step / 20) && s.resources.stone === 0)
    ok('调节灵石不会改变其他配方的节拍与进度', d.autoCraftSpeeds.growWood === 1 && close(E.autoCraftStatus(s, d, 'growWood').step, woodStep) && close(s.craftTimers.growWood.t, woodStep / 2))
    ok('另一配方可独立设为两倍且保留进度', E.setAutoCraftSpeed(s, d, 'growWood', 2) && close(E.autoCraftStatus(s, d, 'growWood').step, woodStep / 2) && close(s.craftTimers.growWood.t, woodStep / 4) && d.autoCraftSpeeds.infuseStone === 10)
    ok('调速不改变每份收益或事件产能报价', E.craftYield(d, CRAFT_MAP.infuseStone) === yieldBefore && E.eventResourceRate(s, d, 'stone') === beforeRate)
    ok('耗料明细同步十倍自动节拍', close(d.autoCraftDrain.qi.find(row => row.id === 'infuseStone').value, -15 / (step / 10)))
    const loaded = normalizeState(JSON.parse(JSON.stringify(s))), ld = E.createDerived()
    E.recompute(loaded, ld)
    ok('存档保留已解锁速度与加工进度', ld.autoCraftSpeeds.infuseStone === 10 && close(loaded.craftTimers.infuseStone.t, step / 20))
    ok('非法速度不会改变设置或计时', [0, -1, NaN, Infinity, 100].every(speed => !E.setAutoCraftSpeed(s, d, 'infuseStone', speed)) && s.settings.autoCraftSpeeds.infuseStone === 10 && close(s.craftTimers.infuseStone.t, step / 20))
    ok('旧存档与非法存档默认一倍', normalizeState({}).settings.autoCraftSpeeds.infuseStone === 1 && normalizeState({ settings: { autoCraftSpeed: 100 } }).settings.autoCraftSpeeds.infuseStone === 1)
    const migrated = normalizeState({ settings: { autoCraftSpeed: 5, autoCraftSpeeds: { growWood: 2, infuseStone: 100, unknown: 10 } } })
    ok('旧统一速度迁移且合法独立设置优先', migrated.settings.autoCraftSpeeds.condenseLiquid === 5 && migrated.settings.autoCraftSpeeds.growWood === 2 && migrated.settings.autoCraftSpeeds.infuseStone === 1 && !('unknown' in migrated.settings.autoCraftSpeeds) && !('autoCraftSpeed' in migrated.settings))
    ok('未知或未解锁配方拒绝调速', !E.setAutoCraftSpeed(s, d, 'unknown', 2) && !E.setAutoCraftSpeed(s, d, 'refinePill', 2))
    s.craftTimers.infuseStone.t = 0
    loaded.craftTimers.infuseStone.t = 0
    E.runAutoCraft(s, d, step)
    for (let i = 0; i < 100; i++) E.runAutoCraft(loaded, ld, step / 100)
    ok('高速整批与小步制作耗料、产出一致', s.resources.stone === 10 && loaded.resources.stone === 10 && s.resources.qi === loaded.resources.qi && s.resources.rock === loaded.resources.rock)
    s.craftTargets.infuseStone = 12
    E.runAutoCraft(s, d, step * 100)
    ok('高速制作遵守库存目标且不多扣料', s.resources.stone === 12 && s.resources.qi === 1500 - 12 * 15)
    s.craftTargets.infuseStone = 0
    s.settings.craftReserves.qi = s.resources.qi - 30
    E.runAutoCraft(s, d, step * 100)
    ok('高速批量保留指定原料', s.resources.stone === 14 && s.resources.qi === s.settings.craftReserves.qi)
    delete s.settings.craftReserves.qi
    s.resources.stone = d.max.stone
    const qiBefore = s.resources.qi
    E.runAutoCraft(s, d, step * 100)
    ok('高速满仓暂停且只保留一份等待', s.resources.qi === qiBefore && close(s.craftTimers.infuseStone.t, step / 10))
    const offline = makeGame(), online = makeGame()
    for (const game of [offline, online]) {
      game.state.upgrades.craftTempo = true
      game.state.settings.autoCraftSpeeds.infuseStone = 10
      game.state.autoCraft.infuseStone = true
      Object.assign(game.state.resources, { qi: 1500, rock: 300, stone: 0 })
      E.recompute(game.state, game.derived)
    }
    E.simulateOffline(offline.state, offline.derived, 3)
    for (let i = 0; i < 3; i++) E.tick(online.state, online.derived, 1, { offline: true, events: false })
    ok('离线推进采用相同高速和用料规则', offline.state.resources.stone > 0 && ['qi', 'rock', 'stone'].every(res => close(offline.state.resources[res], online.state.resources[res])))
  }
}
