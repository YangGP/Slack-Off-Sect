import { normalizeState, resetForReincarnation } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { JOBS } from '../../src/data/jobs.js'
import { UPGRADE_MAP } from '../../src/data/upgrades.js'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { EVENT_MAP } from '../../src/data/events.js'
import { newGame, newGameRunning } from './fixtures.mjs'

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
      value.resources.warrant = E.money(300)
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
      : E.huntEvaluation(huntOffline, hfd, field.id, huntOffline.hunting.settings.teamIds)
    const estimate = E.huntBatchGainEstimate(field, teamRows, hfd, trips)
    // 370 秒 = 3 趟整（120 秒）＋10 秒尾段：既有首趟每 120 秒完成一趟，末趟保留已扣费任务。
    ok('长离线自动重复在 370 秒内正好完成 3 趟并留下 10 秒尾段',
      offlineReport.approximate === true && trips === 3 &&
      huntOffline.hunting.statistics.departures - baseStats.departures === 3 &&
      E.money(huntOffline.resources.warrant).abs().lt(1e-9) && tail.length === 1 &&
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

    // 单次快进 610 秒（跨越 5 趟）：走批量分支，必须一次算清多趟而不是每段只做一趟。
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
      ok('已有首趟归队后由快进统一批量：610 秒完成 5 趟并留下 10 秒尾段',
        bulkChanged === true && bulk.hunting.statistics.completedMissions - beforeCompleted === 5 &&
        stats.huntBatches === 1 && E.moneyEq(bulk.resources.warrant, E.money(10000).minus(500)) && bulkTail.length === 1 &&
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
      const allowed = E.canDepart(blocked, cd, 'foothills', blocked.hunting.settings.teamIds)
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
}
