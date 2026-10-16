import { normalizeState, resetForReincarnation } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { JOBS } from '../../src/data/jobs.js'
import { UPGRADE_MAP } from '../../src/data/upgrades.js'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { EVENT_MAP } from '../../src/data/events.js'
import { newGame, newGameRunning } from './fixtures.mjs'

export function huntingLoop({ ok, close, section }) {
  section('猎杀（山麓闭环）')
  {
    const { state: hs, derived: hd } = newGameRunning()
    hs.realm = 3
    hs.upgrades.wildHunting = true
    hs.buildings.huntingCamp = { count: 1, on: true }
    hs.resources.warrant = 99
    E.recompute(hs, hd)
    ok('信符不足 100 不能出征', E.canDepart(hs, hd, 'foothills', [1]).ok === false)

    hs.resources.warrant = 250
    E.recompute(hs, hd)
    const first = E.departHunt(hs, hd, { fieldId: 'foothills', teamIds: [1, 2] })
    ok('250 信符出发后剩 150', first.ok && Math.abs(hs.resources.warrant - 150) < 1e-9)
    ok('出征成员让出岗位并被占用', hs.disciples.members.filter(m => m.onMission).length === 2 &&
      Object.values(hs.hunting.missions).length === 1)
    ok('同时只能有一支队伍', E.departHunt(hs, hd, { fieldId: 'foothills', teamIds: [3] }).ok === false)

    E.tick(hs, hd, first.mission.actualDuration + 1)
    ok('任务完成后清空活动表', Object.values(hs.hunting.missions).length === 0)
    ok('归队后成员恢复未占用', hs.disciples.members.every(m => !m.onMission))
    ok('完成统计记录两名猎人', hs.hunting.statistics.successfulHunters + hs.hunting.statistics.failedHunters === 2)
    ok('归队获得整数兽材或留不足一件的小数余量',
      (hs.resources.beastHide || 0) >= 1 || (hs.hunting.yieldRemainders.beastHide || 0) > 0)

    hs.resources.warrant = 100
    E.recompute(hs, hd)
    E.departHunt(hs, hd, { fieldId: 'foothills', teamIds: [1] })
    const hideBefore = hs.resources.beastHide
    E.cancelHunt(hs, hd)
    ok('取消立即归队、不退信符、不发半程兽材',
      Object.values(hs.hunting.missions).length === 0 && hs.resources.warrant === 0 &&
      hs.resources.beastHide === hideBefore && hs.disciples.members.every(m => !m.onMission))

    // 存档 → 读档：活动任务保留、成员占用重挂、信符仓容不受仙缘倍率影响
    hs.resources.warrant = 100
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
      value.resources.warrant = 300
      value.hunting.settings.autoRepeat = true
    }
    const hod = E.createDerived(), hfd = E.createDerived()
    for (let i = 0; i < 370; i++) E.tick(huntOnline, hod, 1, { offline: true, events: false, startAt: clockStart + i * 1000 })
    E.simulateOffline(huntOffline, hfd, 370, { startAt: clockStart })
    ok('长离线自动重复猎杀与逐秒参考的任务、随机与收益一致', JSON.stringify(huntOnline.hunting) === JSON.stringify(huntOffline.hunting) &&
      close(huntOnline.resources.beastHide, huntOffline.resources.beastHide))
    ok('自动重复出征起点使用真实归队边界', Object.values(huntOffline.hunting.missions)[0]?.startedAt === clockStart + 360000)
    const rd = E.createDerived()
    reloaded.karma = 500
    E.recompute(reloaded, rd)
    ok('信符仓容独立于仙缘仓储倍率', rd.karmaStorageMult > 1 && rd.max.warrant === 400)
  }
}
