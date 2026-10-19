import { normalizeState, resetForReincarnation } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { JOBS } from '../../src/data/jobs.js'
import { UPGRADE_MAP } from '../../src/data/upgrades.js'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { EVENT_MAP } from '../../src/data/events.js'
import { newGame, newGameRunning } from './fixtures.mjs'

/** 独立回归入口：真实 v1 在途结构连续读档后仍按旧规则归队，不重复收费或丢失岗位。 */
export function legacyMissionRegression({ ok }) {
  const { state, derived } = newGameRunning()
  state.realm = 3
  state.upgrades.wildHunting = true
  state.buildings.huntingCamp = { count: 1, on: true }
  state.resources.warrant = E.money(300)
  E.recompute(state, derived)
  const member = state.disciples.members[0]
  E.assignDisciples(state, derived, [member.id], 'farmer')
  const role = member.roleId
  const { mission } = E.departHunt(state, derived, { fieldId: 'foothills', teamIds: [member.id] })
  mission.formulaVersion = 1
  mission.baseDuration = 120
  mission.actualDuration = 120
  mission.progressSeconds = 70
  mission.baseYield = { beastHide: E.money(0.12), beastBone: E.money(0.08) }
  delete mission.snapshots[0].y
  state.hunting.schemaVersion = 1
  const loaded = normalizeState(JSON.parse(JSON.stringify(state)))
  const again = normalizeState(JSON.parse(JSON.stringify(loaded)))
  const saved = E.activeMission(again)
  const retained = saved?.formulaVersion === 1 && saved.actualDuration === 120 && saved.progressSeconds === 70 &&
    E.moneyEq(saved.baseYield.beastHide, 0.12) && saved.snapshots[0].y === 1 && again.disciples.members[0].onMission
  const before = E.money(again.resources.beastHide).plus(again.hunting.yieldRemainders.beastHide || 0)
  const expected = E.money(0.12).times(120).times(saved?.support || 0).times(saved?.snapshots[0].A || 0).times(saved?.yieldBonus || 0)
  const ad = E.createDerived()
  E.recompute(again, ad)
  // 独立序列第一抽必成功，直接推进猎杀以隔离生产和其他系统的影响。
  again.hunting.randomSeed = 1
  E.advanceHunt(again, ad, 50)
  const earned = E.money(again.resources.beastHide).plus(again.hunting.yieldRemainders.beastHide || 0).minus(before)
  const completed = role === 'farmer' && !E.activeMission(again) && again.disciples.members[0].roleId === role && !again.disciples.members[0].onMission &&
    E.moneyEq(again.resources.warrant, 200) && earned.eq(expected)
  const reloaded = normalizeState(JSON.parse(JSON.stringify(again)))
  E.recompute(reloaded, ad)
  const next = E.departHunt(reloaded, ad, { fieldId: 'foothills', teamIds: [member.id] })
  ok('v1任务保留进度与旧收益、恢复岗位，完成后仅新任务使用v2', retained && completed &&
    reloaded.hunting.statistics.completedMissions === 1 && next.ok && next.mission.formulaVersion === 2 &&
    next.mission.actualDuration === 60 && E.moneyEq(reloaded.resources.warrant, 100))
}

/** 独立回归入口：旧档无天赋钉选可见且可取消，取消后人数上限生效。 */
export async function pinnedTeamRegression({ ok }) {
  const { createSSRApp } = await import('vue')
  const { renderToString } = await import('@vue/server-renderer')
  const { default: HuntPanel } = await import('../../src/modules/hunting/HuntPanel.vue')
  const store = await import('../../src/game/store.js')
  const { state } = newGameRunning()
  state.realm = 3
  state.upgrades.wildHunting = true
  state.buildings.huntingCamp = { count: 1, on: true }
  for (const member of state.disciples.members) member.talents = []
  const ids = state.disciples.members.map(member => member.id)
  state.hunting.settings.teamIds = [...ids, 99999]
  state.hunting.settings.autoTeamSize = 1
  Object.assign(store.state, normalizeState(JSON.parse(JSON.stringify(state))))
  E.recompute(store.state, store.derived)
  const html = await renderToString(createSSRApp(HuntPanel))
  const checkboxes = html.match(/<input type="checkbox" checked/g) || []
  const visible = checkboxes.length === ids.length && store.state.hunting.settings.teamIds.length === ids.length
  E.setHuntTeam(store.state, [])
  const picked = E.autoPickTeam(store.state, store.derived, 'foothills')
  ok('无猎杀天赋的旧钉选均可操作，失效ID清理，取消后人数上限恢复', visible &&
    picked.length === 1 && store.state.hunting.settings.teamIds.length === 0)
}

export function huntingLoop({ ok, close, section }) {  section('猎杀（山麓闭环）')
  {
    const { state: hs, derived: hd } = newGameRunning()
    hs.realm = 3
    hs.upgrades.wildHunting = true
    hs.buildings.huntingCamp = { count: 1, on: true }
    hs.resources.warrant = E.money(99)
    E.recompute(hs, hd)
    ok('信符不足 100 不能出征', E.canDepart(hs, hd, 'foothills', [1]).ok === false)

    hs.resources.warrant = E.money(250)
    E.recompute(hs, hd)
    const first = E.departHunt(hs, hd, { fieldId: 'foothills', teamIds: [1, 2] })
    ok('250 信符出发后剩 150', first.ok && E.moneySubtract(hs.resources.warrant, 150).abs().lt(1e-9))
    ok('出征成员让出岗位并被占用', hs.disciples.members.filter(m => m.onMission).length === 2 &&
      Object.values(hs.hunting.missions).length === 1)
    ok('同时只能有一支队伍', E.departHunt(hs, hd, { fieldId: 'foothills', teamIds: [3] }).ok === false)

    E.tick(hs, hd, first.mission.actualDuration + 1)
    ok('任务完成后清空活动表', Object.values(hs.hunting.missions).length === 0)
    ok('归队后成员恢复未占用', hs.disciples.members.every(m => !m.onMission))
    ok('完成统计记录两名猎人', hs.hunting.statistics.successfulHunters + hs.hunting.statistics.failedHunters === 2)
    ok('归队获得整数兽材或留不足一件的小数余量',
      E.moneyGte(hs.resources.beastHide, 1) || E.moneyIsPositive(hs.hunting.yieldRemainders.beastHide))

    hs.resources.warrant = E.money(100)
    E.recompute(hs, hd)
    E.departHunt(hs, hd, { fieldId: 'foothills', teamIds: [1] })
    const hideBefore = hs.resources.beastHide
    E.cancelHunt(hs, hd)
    ok('取消立即归队、不退信符、不发半程兽材',
      Object.values(hs.hunting.missions).length === 0 && E.moneyIsZero(hs.resources.warrant) &&
      E.moneyEq(hs.resources.beastHide, hideBefore) && hs.disciples.members.every(m => !m.onMission))

    // 存档 → 读档：活动任务保留、成员占用重挂、信符仓容不受仙缘倍率影响
    hs.resources.warrant = E.money(100)
    E.recompute(hs, hd)
    E.departHunt(hs, hd, { fieldId: 'foothills', teamIds: [1, 2, 3] })
    const reloaded = normalizeState(JSON.parse(JSON.stringify(hs)))
    ok('读档保留活动任务', Object.values(reloaded.hunting.missions).filter(m => m.status === 'active').length === 1)
    ok('读档重挂出征占用', reloaded.disciples.members.filter(m => m.onMission).length === 3)
    for (const mutation of [
      m => { m.snapshots = { bad: true } },
      m => { m.fieldId = '__proto__' },
      m => { m.actualDuration = Infinity },
      m => { m.progressSeconds = -1 },
      m => { m.snapshots[0].p = NaN },
      m => { m.snapshots.push(m.snapshots[0]) },
    ]) {
      const damaged = JSON.parse(JSON.stringify(hs))
      mutation(Object.values(damaged.hunting.missions)[0])
      const repaired = normalizeState(damaged)
      ok('损坏猎杀任务被过滤而宗门和弟子进度保留', Object.keys(repaired.hunting.missions).length === 0 &&
        repaired.disciples.total === hs.disciples.total && repaired.disciples.members.every(m => !m.onMission))
    }
    const missingTeam = JSON.parse(JSON.stringify(hs))
    missingTeam.disciples.members = []
    const missingRestored = normalizeState(missingTeam, { preferMembers: true })
    ok('成员已不存在的猎杀任务不会卡住或产生幽灵猎获', Object.keys(missingRestored.hunting.missions).length === 0)
    const repeated = JSON.parse(JSON.stringify(hs))
    const active = Object.values(repeated.hunting.missions)[0]
    repeated.hunting.nextMissionId = 1
    const repeatedRestored = normalizeState(repeated)
    ok('读档后的任务编号不会覆盖活动任务', repeatedRestored.hunting.nextMissionId > active.id)
    const clockStart = 1000000
    const huntOnline = normalizeState(JSON.parse(JSON.stringify(hs)))
    const huntOffline = normalizeState(JSON.parse(JSON.stringify(hs)))
    for (const value of [huntOnline, huntOffline]) {
      const mission = Object.values(value.hunting.missions)[0]
      mission.startedAt = clockStart
      value.resources.warrant = E.money(700)
      value.hunting.settings.autoRepeat = true
    }
    const hod = E.createDerived(), hfd = E.createDerived()
    const baseStats = { ...huntOffline.hunting.statistics }
    const stockBefore = { ...huntOffline.resources }
    const remaindersBefore = { ...huntOffline.hunting.yieldRemainders }
    for (let i = 0; i < 370; i++) E.tick(huntOnline, hod, 1, { offline: true, events: false, startAt: clockStart + i * 1000 })
    const offlineReport = E.simulateOffline(huntOffline, hfd, 370, { startAt: clockStart })
    // 长离线的自动重复按整趟批量估算：随机序列与逐趟结果允许不同，
    // 但扣费、趟数上界、末趟进度与成员占用必须自洽，收益不得超过期望奖励上界。
    const field = E.huntField('foothills')
    const trips = huntOffline.hunting.statistics.completedMissions - baseStats.completedMissions
    // 上界用「本次出征队伍」的口径：末趟仍占用着队伍，所以优先取它保存的战场快照。
    const tail = Object.values(huntOffline.hunting.missions)
    const teamRows = tail.length
      ? tail[0].snapshots.map(snap => ({ ...snap, support: tail[0].support }))
      : E.huntEvaluation(huntOffline, hfd, field.id, E.autoPickTeam(huntOffline, hfd, field.id))
    const estimate = E.huntBatchGainEstimate(field, teamRows, hfd, trips)
    // 370 秒 = 6 趟整（60 秒）＋10 秒尾段：v0.421 起每趟 60 秒，末趟保留已扣费任务（700 信符够 6 趟）。
    ok('长离线自动重复在 370 秒内正好完成 6 趟并留下 10 秒尾段',
      offlineReport.approximate === true && trips === 6 &&
      huntOffline.hunting.statistics.departures - baseStats.departures === 6 &&
      E.moneyEq(huntOffline.resources.warrant, E.money(100)) && tail.length === 1 &&
      Math.abs(tail[0].progressSeconds - 10) < 0.05)
    ok('批量猎杀收益不超过可完成趟数的奖励上界', teamRows.length === 0 ||
      Object.entries(estimate.maximum).every(([res, maximum]) =>
        E.moneyGte(E.money(maximum).plus(1e-6), E.moneySubtract(
          E.money(huntOffline.resources[res]).plus(E.money(huntOffline.hunting.yieldRemainders[res])),
          E.money(stockBefore[res]).plus(E.money(remaindersBefore[res]))))))
    ok('批量估算与逐秒参考同量级（不要求逐趟一致）', ['beastHide', 'beastBone'].every(res => {
      const offline = E.moneyToNumber(E.money(huntOffline.resources[res]))
      const online = E.moneyToNumber(E.money(huntOnline.resources[res]))
      return Math.abs(offline - online) <= Math.max(2, Math.abs(online) * 0.6)
    }))
    ok('末趟保留一次已扣费任务并保持成员占用',
      tail[0].startedAt >= clockStart && tail[0].startedAt <= clockStart + 370000 &&
      huntOffline.disciples.members.filter(m => m.onMission).length === tail[0].snapshots.length)
    const reloadedOffline = normalizeState(JSON.parse(JSON.stringify(huntOffline)))
    const tailReloaded = Object.values(reloadedOffline.hunting.missions)[0] || null
    ok('保存重载不重发批量猎杀奖励、不重复扣费',
      E.moneyEq(reloadedOffline.resources.warrant, huntOffline.resources.warrant) &&
      reloadedOffline.hunting.statistics.completedMissions === huntOffline.hunting.statistics.completedMissions &&
      tailReloaded !== null && tailReloaded.id === tail[0].id && tailReloaded.startedAt === tail[0].startedAt &&
      tailReloaded.progressSeconds === tail[0].progressSeconds)

    // 单次快进 610 秒（跨越 10 趟）：走批量分支，必须一次算清多趟而不是每段只做一趟。
    {
      const bulk = normalizeState(JSON.parse(JSON.stringify(hs)))
      bulk.resources.warrant = E.money(10000)
      bulk.hunting.settings.autoRepeat = true
      const mission = Object.values(bulk.hunting.missions)[0]
      mission.progressSeconds = 0
      mission.startedAt = clockStart
      const bd = E.createDerived()
      E.recompute(bulk, bd)
      const beforeCompleted = bulk.hunting.statistics.completedMissions
      const stats = { huntBatches: 0 }
      const bulkChanged = E.advanceOfflineHunt(bulk, bd, 610, { startAt: clockStart, stats })
      const bulkTail = Object.values(bulk.hunting.missions)
      ok('已有首趟归队后由快进统一批量：610 秒完成 10 趟并留下 10 秒尾段',
        bulkChanged === true && bulk.hunting.statistics.completedMissions - beforeCompleted === 10 &&
        stats.huntBatches === 1 && E.moneyEq(bulk.resources.warrant, E.money(10000).minus(1000)) && bulkTail.length === 1 &&
        Math.abs(bulkTail[0].progressSeconds - 10) < 1e-9 &&
        bulk.disciples.members.filter(m => m.onMission).length === bulkTail[0].snapshots.length)
      const bulkReloaded = normalizeState(JSON.parse(JSON.stringify(bulk)))
      ok('批量快进结果读档不重奖、不重扣',
        E.moneyEq(bulkReloaded.resources.warrant, bulk.resources.warrant) &&
        bulkReloaded.hunting.statistics.completedMissions === bulk.hunting.statistics.completedMissions &&
        Object.values(bulkReloaded.hunting.missions)[0]?.progressSeconds === bulkTail[0].progressSeconds)
    }

    // 出征条件由 canDepart 统一把关：批量分支不能自己放宽营地、境界等资格。
    {
      const blocked = normalizeState(JSON.parse(JSON.stringify(hs)))
      E.cancelHunt(blocked, E.createDerived())
      blocked.buildings.huntingCamp.on = false
      blocked.resources.warrant = E.money(10000)
      blocked.hunting.settings.autoRepeat = true
      const campBefore = { ...blocked.hunting.statistics }
      const hideBefore = E.money(blocked.resources.beastHide)
      const cd = E.createDerived()
      E.recompute(blocked, cd)
      const allowed = E.canDepart(blocked, cd, 'foothills', E.autoPickTeam(blocked, cd, 'foothills'))
      E.advanceOfflineHunt(blocked, cd, 600, { startAt: clockStart, stats: { huntBatches: 0 } })
      ok('停用营地后离线不再出征、不扣费也不发奖励', !allowed.ok &&
        blocked.hunting.statistics.completedMissions === campBefore.completedMissions &&
        blocked.hunting.statistics.departures === campBefore.departures &&
        E.moneyEq(blocked.resources.warrant, 10000) && E.moneyEq(blocked.resources.beastHide, hideBefore))
      const downgraded = normalizeState(JSON.parse(JSON.stringify(hs)))
      E.cancelHunt(downgraded, E.createDerived())
      downgraded.realm = 1
      downgraded.resources.warrant = E.money(10000)
      downgraded.hunting.settings.autoRepeat = true
      const dd = E.createDerived()
      E.recompute(downgraded, dd)
      const realmBefore = { ...downgraded.hunting.statistics }
      E.advanceOfflineHunt(downgraded, dd, 600, { startAt: clockStart, stats: { huntBatches: 0 } })
      ok('宗门退境后离线不再出征', downgraded.hunting.statistics.completedMissions === realmBefore.completedMissions &&
        E.moneyEq(downgraded.resources.warrant, 10000))
    }
    const rd = E.createDerived()
    reloaded.karma = E.money(500)
    E.recompute(reloaded, rd)
    ok('信符仓容独立于仙缘仓储倍率', E.moneyGt(rd.karmaStorageMult, 1) && E.moneyEq(rd.max.warrant, 400))
  }

  section('猎杀（自动组队与猎杀天赋）')
  {
    const { state: as, derived: ad } = newGameRunning()
    as.realm = 3
    as.upgrades.wildHunting = true
    as.buildings.huntingCamp = { count: 1, on: true }
    as.resources.warrant = E.money(2000)
    const members = as.disciples.members
    // 场景可控：只在指定成员身上挂猎杀天赋（夹具成员默认无天赋）。
    for (const m of members) m.talents = []
    members[1].talents = [{ id: 'huntYield_tian', level: 1 }]
    E.recompute(as, ad)

    // v0.421 口径：时长减半、基准秒产翻倍，单次收益不变（基准秒产 × 时长恒等于旧值）。
    const field = E.huntField('foothills')
    ok('山麓时长减半、基准秒产翻倍（单次收益口径不变）',
      field.baseDuration === 60 && field.baseYield.beastHide === 0.24 && field.baseYield.beastBone === 0.16 &&
      field.baseDuration * field.baseYield.beastHide === 120 * 0.12)

    // 个人天赋：huntYield 抬个人收获倍率 y，huntSuccess 按百分点加成功率。
    const rows = E.huntEvaluation(as, ad, 'foothills', [members[0].id, members[1].id])
    const rowPlain = rows.find(r => r.id === members[0].id)
    const rowGifted = rows.find(r => r.id === members[1].id)
    ok('猎杀收获天赋抬高个人收获倍率', rowGifted.y === 1.5 && rowPlain.y === 1)
    members[0].talents = [{ id: 'huntSuccess_tian', level: 1 }]
    const boosted = E.huntEvaluation(as, ad, 'foothills', [members[0].id]).find(r => r.id === members[0].id)
    ok('猎杀准头天赋按百分点提高成功率', Math.abs(boosted.p - (rowPlain.p + 0.08)) < 1e-12)
    members[0].talents = []

    const pvGifted = E.huntPreview(as, ad, 'foothills', [members[1].id])
    members[1].talents = []
    const pvPlain = E.huntPreview(as, ad, 'foothills', [members[1].id])
    members[1].talents = [{ id: 'huntYield_tian', level: 1 }]
    ok('收获天赋按 1.5 倍放大期望兽材', Math.abs(
      E.moneyToNumber(pvGifted.expectedGains.beastHide) / E.moneyToNumber(pvPlain.expectedGains.beastHide) - 1.5) < 1e-9)

    // 人数上限归一到 1~5。
    E.setHuntAutoTeamSize(as, 0)
    ok('自动组队人数上限归一：低于下限回 1', as.hunting.settings.autoTeamSize === 1)
    E.setHuntAutoTeamSize(as, 99)
    ok('自动组队人数上限归一：高于上限夹 5', as.hunting.settings.autoTeamSize === 5)

    // 钉选必入、天赋优先、人数上限生效。
    E.setHuntAutoTeamSize(as, 2)
    E.setHuntTeam(as, [members[3].id])
    const picked = E.autoPickTeam(as, ad, 'foothills')
    ok('自动选队：钉选必入且猎杀天赋优先', picked.length === 2 &&
      picked[0] === members[3].id && picked[1] === members[1].id)

    // 钉选数可顶破人数上限。
    E.setHuntTeam(as, [members[0].id, members[2].id, members[3].id])
    const pickedPinned = E.autoPickTeam(as, ad, 'foothills')
    ok('自动选队：钉选可顶破人数上限', pickedPinned.length === 3 &&
      [members[0].id, members[2].id, members[3].id].every(id => pickedPinned.includes(id)))
    E.setHuntTeam(as, [])
    E.setHuntAutoTeamSize(as, 5)

    // 闲散优先于在岗：把阵徒岗位压给第一名弟子后，他应排在队尾。
    as.disciples.jobs.farmer = 1
    E.recompute(as, ad)
    const farmer = members.find(m => m.roleId === 'farmer')
    const pickedJobs = E.autoPickTeam(as, ad, 'foothills')
    ok('自动选队：闲散优先于在岗', farmer && pickedJobs.length === 4 && pickedJobs[3] === farmer.id)
    as.disciples.jobs.farmer = 0
    E.recompute(as, ad)

    // 未传名单 → 自动组队出征；钉选名单不再被出征结果覆写。
    const dep = E.departHunt(as, ad, { fieldId: 'foothills' })
    ok('未传名单时自动组队出征', dep.ok && dep.mission.snapshots.length === 4)
    ok('出征不覆写钉选名单', as.hunting.settings.teamIds.length === 0)
    ok('快照记录个人收获倍率', dep.mission.snapshots.find(s => s.id === members[1].id)?.y === 1.5)
    E.tick(as, ad, dep.mission.actualDuration + 1)

    // 单人整额结算：y = 1.5 直接放大单趟收益（randomSeed = 1 首抽 0.236 必成功）。
    // 期望：兽皮 0.24×60×2^-1.5×1.5 = 7.636… 整数 7；兽骨 0.16×60×0.530… = 5.091… 整数 5。
    E.setHuntAutoTeamSize(as, 1)
    as.resources.beastHide = E.money(0)
    as.resources.beastBone = E.money(0)
    as.hunting.yieldRemainders = {}
    as.hunting.randomSeed = 1
    const solo = E.departHunt(as, ad, { fieldId: 'foothills' })
    E.tick(as, ad, solo.mission.actualDuration + 1)
    ok('收获天赋倍率进入归队结算', solo.ok && solo.mission.snapshots.length === 1 &&
      E.moneyEq(as.resources.beastHide, E.money(7)) && E.moneyEq(as.resources.beastBone, E.money(5)))
  }
}
