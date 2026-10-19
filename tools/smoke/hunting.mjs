import { normalizeState, resetForReincarnation } from '../../src/game/state.js'
import { createGame } from '../../src/game/runtime.js'
import { exportJson } from '../../src/game/save.js'
import * as E from '../engine-fixture.mjs'
import { newGameRunning } from './fixtures.mjs'

function setup() {
  const { state, derived } = newGameRunning()
  state.realm = 3
  state.upgrades.wildHunting = true
  state.buildings.huntingCamp = { count: 1, on: true }
  state.resources.warrant = E.money(1000)
  for (const member of state.disciples.members) member.talents = []
  E.recompute(state, derived)
  return { state, derived }
}

/** 真实旧档结构：已付100信符，岗位只保存在任务快照中。 */
function legacySave(version, disabled = false) {
  const { state, derived } = setup()
  const member = state.disciples.members[0]
  const row = E.huntEvaluation(state, derived, 'foothills', [member.id])[0]
  state.resources.warrant = E.money(200)
  state.hunting.schemaVersion = version
  state.hunting.nextMissionId = 2
  state.hunting.statistics.departures = 1
  state.hunting.settings.autoRepeat = true
  state.hunting.settings.elapsedSeconds = 23
  state.settings.modules.hunting = !disabled
  member.roleId = null
  state.disciples.jobs.farmer = 0
  state.hunting.missions = { 1: {
    id: 1, fieldId: 'foothills', status: 'active', startedAt: 1000000,
    formulaVersion: version, actualDuration: version === 1 ? 120 : 60,
    baseDuration: version === 1 ? 120 : 60, progressSeconds: 10,
    support: 1, yieldBonus: 1, preparationPaid: E.money(100),
    snapshots: [{ ...row, roleId: 'farmer', ...(version === 1 ? {} : { y: 1.5 }) }],
  } }
  return state
}

export function instantHuntRegression({ ok }) {
  const { state, derived } = setup()
  const ids = state.disciples.members.map(member => member.id)
  E.assignDisciples(state, derived, ids, 'farmer')
  const before = E.cloneRuntime(state.disciples)
  const rate = derived.netQi
  const result = E.departHunt(state, derived, { teamIds: ids.slice(0, 2) })
  E.recompute(state, derived)
  ok('即时猎杀一次扣费并结算，不创建在途任务或改变生产', result.ok &&
    E.moneyEq(state.resources.warrant, 900) && state.hunting.statistics.completedMissions === 1 &&
    state.hunting.statistics.successfulHunters + state.hunting.statistics.failedHunters === 2 &&
    Object.keys(state.hunting.missions).length === 0 && !state.disciples.members.some(member => member.onMission) &&
    JSON.stringify(state.disciples) === JSON.stringify(before) && E.moneyEq(derived.netQi, rate))
  state.resources.warrant = E.money(99)
  const seed = state.hunting.randomSeed
  const hide = state.resources.beastHide
  const failed = E.departHunt(state, derived)
  ok('缺信符失败不扣费、不抽随机、不发奖励', !failed.ok && E.moneyEq(state.resources.warrant, 99) &&
    state.hunting.randomSeed === seed && E.moneyEq(state.resources.beastHide, hide))
  state.resources.warrant = E.money(100)
  const empty = E.departHunt(state, derived, { teamIds: [] })
  ok('显式无效名单不被替换成自动阵容', !empty.ok && E.moneyEq(state.resources.warrant, 100) && state.hunting.randomSeed === seed)
}

export function automaticHuntRegression({ ok, close }) {
  const { state, derived } = setup()
  E.setHuntAutoRepeat(state, true)
  E.advanceHunt(state, derived, 59)
  ok('周期到达前不执行', state.hunting.statistics.completedMissions === 0)
  E.advanceHunt(state, derived, 1)
  ok('60秒执行一次，普通弟子无须手选且计时清零', state.hunting.statistics.completedMissions === 1 &&
    state.hunting.lastOutcome.teamSize === 4 && state.hunting.settings.elapsedSeconds === 0)
  state.resources.warrant = E.money(0)
  E.advanceHunt(state, derived, 60)
  state.resources.warrant = E.money(100)
  E.advanceHunt(state, derived, 59)
  ok('缺符周期跳过，不在补符时补发', state.hunting.statistics.completedMissions === 1 && E.moneyEq(state.resources.warrant, 100))
  E.advanceHunt(state, derived, 1)
  ok('下一周期重新检查并支付', state.hunting.statistics.completedMissions === 2 && E.moneyEq(state.resources.warrant, 0))
  E.advanceHunt(state, derived, 25)
  const loaded = normalizeState(JSON.parse(JSON.stringify(state)))
  ok('保存重载保留周期进度且不发奖', loaded.hunting.settings.elapsedSeconds === 25 && loaded.hunting.statistics.completedMissions === 2)
  state.resources.warrant = E.money(200)
  E.departHunt(state, derived)
  ok('手动成功从零开始下一周期', state.hunting.settings.elapsedSeconds === 0)
  E.setHuntAutoInterval(state, 120)
  const expected = E.huntPreview(state, derived, 'foothills').expectedGains.beastHide
  E.setHuntAutoInterval(state, 300)
  ok('修改间隔不改变单次奖励', E.moneyEq(E.huntPreview(state, derived, 'foothills').expectedGains.beastHide, expected))
  E.setHuntAutoInterval(state, -1)
  const low = state.hunting.settings.autoIntervalSeconds
  E.setHuntAutoInterval(state, Infinity)
  ok('非法间隔回默认，低值夹至30秒', low === 30 && state.hunting.settings.autoIntervalSeconds === 60)
  E.advanceHunt(state, derived, 10)
  E.setHuntAutoRepeat(state, false)
  ok('关闭自动清零进度', state.hunting.settings.elapsedSeconds === 0)

  const bulk = setup()
  bulk.state.resources.warrant = E.money(250)
  E.setHuntAutoRepeat(bulk.state, true)
  const rows = E.huntEvaluation(bulk.state, bulk.derived, 'foothills', E.resolveHuntTeam(bulk.state, bulk.derived, 'foothills'))
  const estimate = E.huntBatchGainEstimate(E.huntField('foothills'), rows, bulk.derived, 2)
  E.advanceOfflineHunt(bulk.state, bulk.derived, 605)
  ok('离线按实际信符封顶，不积压次数或创建尾段任务', bulk.state.hunting.statistics.completedMissions === 2 &&
    E.moneyEq(bulk.state.resources.warrant, 50) && close(bulk.state.hunting.settings.elapsedSeconds, 5) &&
    Object.keys(bulk.state.hunting.missions).length === 0)
  ok('离线收益不超规则上界，小数余量跨次保留', Object.entries(estimate.maximum).every(([res, max]) =>
    E.money(bulk.state.resources[res]).plus(bulk.state.hunting.yieldRemainders[res] || E.ZERO).lte(max)))
  bulk.state.resources.warrant = E.money(100)
  E.advanceOfflineHunt(bulk.state, bulk.derived, 54)
  ok('离线失败周期不会变成下次待补算次数', bulk.state.hunting.statistics.completedMissions === 2)
  E.advanceOfflineHunt(bulk.state, bulk.derived, 1)
  ok('离线下一周期正常执行', bulk.state.hunting.statistics.completedMissions === 3)
}

export function huntingLoop(harness) {
  const { ok, close, section } = harness
  section('即时猎杀与周期执行')
  instantHuntRegression(harness)
  automaticHuntRegression(harness)
  const { state, derived } = setup()
  const [plain, gifted] = state.disciples.members
  gifted.talents = [{ id: 'huntYield_tian', level: 1 }]
  E.setHuntTeam(state, [gifted.id])
  const team = E.resolveHuntTeam(state, derived, 'foothills')
  ok('所选加成弟子参与，普通弟子自动补位', team.length === 4 && team[0] === gifted.id)
  E.setHuntTeam(state, [])
  ok('未勾选的加成弟子不自动参与', !E.resolveHuntTeam(state, derived, 'foothills').includes(gifted.id))
  gifted.realm = 0
  plain.realm = 3
  ok('推荐按真实期望而非天赋标签排序，查询不改选择', E.recommendHuntTeam(state, derived)[0] === plain.id && state.hunting.settings.teamIds.length === 0)
  plain.realm = 0
  const withGift = E.huntPreview(state, derived, 'foothills', [gifted.id])
  gifted.talents = []
  const withoutGift = E.huntPreview(state, derived, 'foothills', [gifted.id])
  gifted.talents = [{ id: 'huntYield_tian', level: 1 }]
  ok('收获天赋只提高持有人收益', close(E.moneyToNumber(withGift.expectedGains.beastHide.div(withoutGift.expectedGains.beastHide)), 1.5))
  state.hunting.randomSeed = 1
  state.resources.beastHide = E.ZERO
  state.resources.beastBone = E.ZERO
  state.hunting.yieldRemainders = {}
  E.departHunt(state, derived, { teamIds: [gifted.id] })
  ok('单人猎杀实际结算含1.5倍天赋，整数与余量准确', E.moneyEq(state.resources.beastHide, 7) && E.moneyEq(state.resources.beastBone, 5) &&
    E.money(state.hunting.yieldRemainders.beastHide).gt(0))
  state.upgrades.mountainStep = true
  E.recompute(state, derived)
  const warrantBefore = state.resources.warrant
  E.departHunt(state, derived, { teamIds: [gifted.id] })
  ok('踏山步费用预览与实际一致，原ID仍生效', E.huntCost(derived) === 90 && E.moneyEq(warrantBefore.minus(state.resources.warrant), 90))
  state.resources.beastHide = derived.max.beastHide
  E.departHunt(state, derived, { teamIds: [gifted.id] })
  ok('即时猎杀满仓不超容', E.moneyEq(state.resources.beastHide, derived.max.beastHide))
  state.buildings.huntingCamp.on = false
  const saved = state.resources.warrant
  E.advanceOfflineHunt(state, derived, 600)
  ok('营地停用不允许猎杀', !E.departHunt(state, derived).ok && E.moneyEq(state.resources.warrant, saved))
  state.buildings.huntingCamp.on = true
  state.realm = 1
  ok('退境后不能猎杀', !E.departHunt(state, derived).ok)
  state.realm = 3
  state.settings.modules.hunting = false
  ok('模块关闭不能新猎杀', !E.departHunt(state, derived).ok)
  state.settings.modules.hunting = true
  state.karma = E.money(500)
  E.recompute(state, derived)
  ok('信符仓容独立于仙缘仓储倍率', E.moneyGt(derived.karmaStorageMult, 1) && E.moneyEq(derived.max.warrant, 400))
  E.setHuntAutoRepeat(state, true)
  E.advanceHunt(state, derived, 10)
  resetForReincarnation(state, E.ZERO)
  ok('转世重置猎杀历史、名单与自动计时', state.hunting.statistics.completedMissions === 0 &&
    state.hunting.settings.teamIds.length === 0 && state.hunting.settings.elapsedSeconds === 0 && !state.hunting.settings.autoRepeat)
}

export async function legacyMissionRegression({ ok }) {
  for (const version of [1, 2]) {
    for (const disabled of [false, true]) {
      const raw = legacySave(version, disabled)
      const before = JSON.stringify(raw)
      const loaded = normalizeState(JSON.parse(before))
      const again = normalizeState(JSON.parse(JSON.stringify(loaded)))
      ok(`v${version}模块${disabled ? '关闭' : '开启'}时归一化不结算，保留合法旧任务`,
        !!E.activeMission(again) && E.activeMission(again).formulaVersion === version &&
        again.hunting.randomSeed === 1 && again.hunting.statistics.completedMissions === 0 && JSON.stringify(raw) === before)
      const snap = E.activeMission(again).snapshots[0]
      const expected = E.money(14.4).times(snap.A).times(version === 1 ? 1 : 1.5)
      const game = createGame({ state: again })
      const total = E.money(game.state.resources.beastHide).plus(game.state.hunting.yieldRemainders.beastHide || 0)
      ok(`v${version}模块${disabled ? '关闭' : '开启'}首次生产前按旧收益结算并恢复岗位`,
        game.state.disciples.members[0].roleId === 'farmer' && !E.activeMission(game.state) &&
        game.state.hunting.statistics.completedMissions === 1 && E.moneyEq(total, expected) &&
        E.moneyEq(game.state.resources.warrant, 200) && game.state.hunting.settings.elapsedSeconds === 0)
      const seed = game.state.hunting.randomSeed
      const gained = game.state.resources.beastHide
      game.restore(JSON.parse(exportJson(game.state)))
      ok(`v${version}反复读档不重复发奖扣费或抽随机`, game.state.hunting.randomSeed === seed &&
        E.moneyEq(game.state.resources.beastHide, gained) && E.moneyEq(game.state.resources.warrant, 200) &&
        game.state.hunting.statistics.completedMissions === 1)
    }
  }
  const full = legacySave(1, true)
  full.resources.beastHide = E.money(200)
  const fullGame = createGame({ state: normalizeState(JSON.parse(JSON.stringify(full))) })
  ok('停用模块旧任务迁移遵守实际仓容，不把200满仓变成205', E.moneyEq(fullGame.state.resources.beastHide, 200))

  const raw = legacySave(2)
  const a = normalizeState(JSON.parse(JSON.stringify(raw)))
  const b = normalizeState(JSON.parse(JSON.stringify(raw)))
  const ad = E.createDerived(), bd = E.createDerived()
  E.simulateOffline(a, ad, 120, { startAt: 1000000 })
  await E.simulateOfflineAsync(b, bd, 120, { startAt: 1000000 })
  ok('迁移不吞首段离线周期，同步与异步一致且无尾段任务', a.hunting.statistics.completedMissions === 3 &&
    b.hunting.statistics.completedMissions === 3 && E.moneyEq(a.resources.warrant, 0) &&
    E.moneyEq(a.resources.beastHide, b.resources.beastHide) && !E.activeMission(a) && !E.activeMission(b) &&
    a.disciples.members[0].roleId === 'farmer' && b.disciples.members[0].roleId === 'farmer')

  for (const mutation of [
    mission => { mission.snapshots = { bad: true } },
    mission => { mission.fieldId = '__proto__' },
    mission => { mission.actualDuration = Infinity },
    mission => { mission.progressSeconds = -1 },
    mission => { mission.snapshots[0].p = NaN },
    mission => { mission.snapshots.push(mission.snapshots[0]) },
    mission => { mission.formulaVersion = 999 },
  ]) {
    const damaged = legacySave(2)
    mutation(damaged.hunting.missions[1])
    const repaired = normalizeState(JSON.parse(JSON.stringify(damaged)))
    ok('损坏或未知版本旧任务过滤，不抽随机或发奖', !E.activeMission(repaired) && repaired.hunting.randomSeed === 1 &&
      repaired.hunting.statistics.completedMissions === 0)
  }
  const missing = legacySave(2)
  missing.disciples.members = []
  const repaired = normalizeState(JSON.parse(JSON.stringify(missing)), { preferMembers: true })
  ok('已不存在的成员不会产生幽灵猎获', !E.activeMission(repaired))
}

export async function pinnedTeamRegression({ ok }) {
  const { createSSRApp } = await import('vue')
  const { renderToString } = await import('@vue/server-renderer')
  const { default: HuntPanel } = await import('../../src/modules/hunting/HuntPanel.vue')
  const store = await import('../../src/game/store.js')
  const original = E.cloneRuntime(store.state)
  try {
    const { state } = setup()
    const [ordinary, selected, unselected] = state.disciples.members
    ordinary.name = 'ORDINARY_HIDDEN'
    selected.name = 'BONUS_SELECTED'
    unselected.name = 'BONUS_UNSELECTED'
    selected.talents = [{ id: 'huntYield_tian', level: 1 }]
    unselected.talents = [{ id: 'huntSuccess_tian', level: 1 }]
    E.setHuntTeam(state, [selected.id])
    Object.assign(store.state, state)
    E.recompute(store.state, store.derived)
    const html = await renderToString(createSSRApp(HuntPanel))
    const team = E.resolveHuntTeam(store.state, store.derived, 'foothills')
    ok('只显示加成弟子及实际增益，不显示普通人员长名单', !html.includes('ORDINARY_HIDDEN') &&
      html.includes('BONUS_SELECTED') && html.includes('BONUS_UNSELECTED') && html.includes('天赋额外收获') &&
      html.includes('实际成功率') && !html.includes('推荐阵容'))
    ok('勾选加成弟子参与，普通补位且未勾选者不偷偷参与', team.includes(selected.id) && !team.includes(unselected.id) && team.includes(ordinary.id))
    E.setHuntTeam(store.state, [])
    ok('取消加成弟子后仍可用普通弟子猎杀', !E.resolveHuntTeam(store.state, store.derived, 'foothills').includes(selected.id) &&
      E.canDepart(store.state, store.derived, 'foothills').ok)
  } finally {
    Object.assign(store.state, original)
    E.recompute(store.state, store.derived)
  }
}
