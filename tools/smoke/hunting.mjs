import { normalizeState, resetForReincarnation } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { JOBS } from '../../src/data/jobs.js'
import { deactivateModule } from '../../src/game/moduleRegistry.js'
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
    hs.resources.huntPreparation = 99
    E.recompute(hs, hd)
    ok('猎备不足 100 不能出征', E.canDepart(hs, hd, 'foothills', [1]).ok === false)

    hs.resources.huntPreparation = 250
    E.recompute(hs, hd)
    const first = E.departHunt(hs, hd, { fieldId: 'foothills', teamIds: [1, 2] })
    ok('250 猎备出发后剩 150', first.ok && Math.abs(hs.resources.huntPreparation - 150) < 1e-9)
    ok('出征成员让出岗位并被占用', hs.disciples.members.filter(m => m.onMission).length === 2 &&
      Object.values(hs.hunting.missions).length === 1)
    ok('同时只能有一支队伍', E.departHunt(hs, hd, { fieldId: 'foothills', teamIds: [3] }).ok === false)

    E.tick(hs, hd, first.mission.actualDuration + 1)
    ok('任务完成后清空活动表', Object.values(hs.hunting.missions).length === 0)
    ok('归队后成员恢复未占用', hs.disciples.members.every(m => !m.onMission))
    ok('完成统计记录两名猎人', hs.hunting.statistics.successfulHunters + hs.hunting.statistics.failedHunters === 2)
    ok('归队获得整数兽材或留不足一件的小数余量',
      (hs.resources.beastHide || 0) >= 1 || (hs.hunting.yieldRemainders.beastHide || 0) > 0)

    hs.resources.huntPreparation = 100
    E.recompute(hs, hd)
    E.departHunt(hs, hd, { fieldId: 'foothills', teamIds: [1] })
    const hideBefore = hs.resources.beastHide
    E.cancelHunt(hs, hd)
    ok('取消立即归队、不退猎备、不发半程兽材',
      Object.values(hs.hunting.missions).length === 0 && hs.resources.huntPreparation === 0 &&
      hs.resources.beastHide === hideBefore && hs.disciples.members.every(m => !m.onMission))

    // 存档 → 读档：活动任务保留、成员占用重挂、猎备仓容不受仙缘倍率影响
    hs.resources.huntPreparation = 100
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
      value.resources.huntPreparation = 300
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
    ok('猎备仓容独立于仙缘仓储倍率', rd.karmaStorageMult > 1 && rd.max.huntPreparation === 300)
  }
}

export function optionalModules({ ok, section }) {
  section('可选模块：猎杀开关与解耦')
  {
    const { state: ms, derived: md } = newGameRunning()
    ms.realm = 4
    ms.upgrades.wildHunting = true
    ms.upgrades.beastMaterialArt = true
    ms.upgrades.forgeArt = true
    ms.buildings.huntingCamp = { count: 1, on: true }
    ms.buildings.forge = { count: 1, on: true }
    ms.resources.huntPreparation = 100
    E.recompute(ms, md)
    const hunter = JOBS.find(j => j.id === 'huntPlanner')
    ok('开启时猎杀建筑/岗位/配方可用',
      E.isBuildingUnlocked(ms, 'huntingCamp') && E.isJobUnlocked(ms, hunter) &&
      E.isCraftUnlocked(ms, CRAFT_MAP.forgeArtifactBone))
    E.departHunt(ms, md, { fieldId: 'foothills', teamIds: [1, 2] })
    E.recompute(ms, md)
    ms.disciples.members.find(m => m.id === 3).roleId = 'huntPlanner'
    ms.hunting.statistics.completedMissions = 7
    ms.hunting.yieldRemainders.beastHide = 0.75
    ms.hunting.settings.autoRepeat = true
    const preservedSeed = ms.hunting.randomSeed

    // 关闭模块
    ms.settings.modules.hunting = false
    const closedWhileActive = normalizeState(JSON.parse(JSON.stringify(ms)))
    ok('读档停用模块只召回任务并保留历史、余量、随机与偏好',
      Object.keys(closedWhileActive.hunting.missions).length === 0 &&
      closedWhileActive.hunting.statistics.completedMissions === 7 &&
      closedWhileActive.hunting.yieldRemainders.beastHide === 0.75 &&
      closedWhileActive.hunting.randomSeed === preservedSeed && closedWhileActive.hunting.settings.autoRepeat)
    ok('读档停用模块恢复原岗位并释放猎妖师和占用', closedWhileActive.disciples.members.every(m => !m.onMission && m.roleId !== 'huntPlanner') &&
      closedWhileActive.disciples.members.find(m => m.id === 1).roleId === ms.hunting.missions[Object.keys(ms.hunting.missions)[0]].snapshots[0].roleId)
    deactivateModule(ms, 'hunting')
    E.recompute(ms, md)
    ok('关闭后猎杀建筑不再解锁', E.isBuildingUnlocked(ms, 'huntingCamp') === false)
    ok('关闭后猎妖师岗位不可用', E.isJobUnlocked(ms, hunter) === false)
    ok('关闭后兽材炼器配方锁定', E.isCraftUnlocked(ms, CRAFT_MAP.forgeArtifactBone) === false)
    ok('关闭后山野研究不可参悟', E.isUpgradeUnlocked(ms, UPGRADE_MAP.wildHunting) === false)
    ok('关闭后召回出征弟子并释放占用',
      Object.keys(ms.hunting.missions).length === 0 &&
      ms.disciples.members.every(m => !m.onMission && m.roleId !== 'huntPlanner'))
    ok('关闭后猎杀加成与仓储归零',
      (md.huntSuccessBonus || 0) === 0 && (md.rates.huntPreparation || 0) === 0 &&
      (md.max.huntPreparation || 0) === 0)
    ok('关闭后不可出征', E.canDepart(ms, md, 'foothills', [1]).ok === false)
    const closedReload = normalizeState(JSON.parse(JSON.stringify(ms)))
    ok('正常关闭后刷新不清空模块存档', JSON.stringify(closedReload.hunting) === JSON.stringify(ms.hunting))

    // 重新开启：建筑与岗位恢复
    ms.settings.modules.hunting = true
    E.recompute(ms, md)
    ok('重新开启恢复建筑与岗位', E.isBuildingUnlocked(ms, 'huntingCamp') && E.isJobUnlocked(ms, hunter))
  }
}

export function beastThreatLoop({ ok, section }) {
  section('金丹妖兽事务完整循环')
  {
    const realNow = Date.now
    let now = 1800000000000
    Date.now = () => now
    try {
      const event = EVENT_MAP.beastThreat
      const start = (karma = 0) => {
        const { state: s, derived: d } = newGame()
        s.realm = 4
        s.karma = karma
        s.resources.herb = 100000
        E.recompute(s, d)
        E.fireEvent(s, d, event)
        return { s, d }
      }
      const { state: early, derived: ed } = newGame()
      ok('金丹之前不能触发新妖兽事务', E.fireEvent(early, ed, event) === null)
      const { s, d } = start()
      ok('妖兽预兆有五分钟期限与有界损失', s.pendingChoice.deadline === now + 300000 && s.pendingChoice.herbLoss <= 80)
      ok('威胁没有免费取消选项', !event.options.some(o => o.effect.decline))
      ok('重大事务不覆盖现有选择', E.fireEvent(s, d, event) === null && E.fireEvent(s, d, EVENT_MAP.caravan) === null)
      const stocks = JSON.stringify(s.resources)
      ok('缺料时加固被拒绝并保留威胁', E.resolveChoice(s, d, 0) === null && s.pendingChoice?.id === event.id && JSON.stringify(s.resources) === stocks)
      s.resources.arrayBase = 1
      s.resources.talisman = 2
      const preview = E.eventOutcome(s, d, event.options[0].effect)
      ok('加固预览明确阵基与符箓用料', preview.affordable && preview.required.arrayBase === 1 && preview.required.talisman === 2)
      E.resolveChoice(s, d, 0)
      ok('加固实际扣料并保全药圃', s.resources.arrayBase === 0 && s.resources.talisman === 0 && s.resources.herb === 100000)
      ok('加固形成十五分钟安宁和二十分钟冷却', s.affairs.beastPeaceUntil === now + 900000 && s.affairs.beastCooldownUntil === now + 1200000)
      ok('安宁期间显式触发同样被拒绝', E.fireEvent(s, d, event) === null)
      now += 900001
      ok('安宁结束仍遵守同类冷却', E.fireEvent(s, d, event) === null)
      now += 300000
      ok('冷却结束能够再次触发', !!E.fireEvent(s, d, event))
      s.upgrades.arrayBasics = true
      ok('阵法初解将符箓用量降到一枚', E.eventOutcome(s, d, event.options[0].effect).required.talisman === 1)
      s.resources.artifact = 1
      s.resources.pill = 3
      ok('无救护准备出击需要三枚丹药', E.eventOutcome(s, d, event.options[1].effect).required.pill === 3)
      s.buildings.meditationPool = { count: 1, on: true }
      ok('静心池将出击丹药用量降到一枚', E.eventOutcome(s, d, event.options[1].effect).required.pill === 1)
      E.resolveChoice(s, d, 1)
      ok('出击扣除法器丹药并获得三十分钟安宁', s.resources.artifact === 0 && s.resources.pill === 2 && s.affairs.beastPeaceUntil === now + 1800000)
      const { s: retreat, d: rd } = start()
      E.resolveChoice(retreat, rd, 2)
      E.recompute(retreat, rd)
      ok('收缩采药只降低灵草产出且不扣成品', retreat.buffs.some(b => b.target === 'herb' && b.mult === -0.25 && b.until === now + 120000))
      now += 120001
      E.tick(retreat, rd, 0.1, { events: false })
      ok('收缩采药到期自动恢复', !retreat.buffs.some(b => b.id === 'withdrawHerbs'))
      for (const karma of [0, 202]) {
        const { s: guarded, d: gd } = start(karma)
        gd.disasterGuard = 0.5
        const expected = E.eventOutcome(guarded, gd, event.options[3].effect)
        const loss = expected.rows.find(row => row.res === 'herb').lost
        E.resolveChoice(guarded, gd, 3)
        ok(`${karma}仙缘超额库存默认防守预览与结算相同且减损`, guarded.resources.herb === 100000 - loss && loss <= 40 && !guarded.pendingChoice)
      }
      const { s: expired, d: xd } = start()
      const saved = normalizeState(JSON.parse(JSON.stringify(expired)))
      ok('威胁期限与损失估价可存读档', saved.pendingChoice.deadline === expired.pendingChoice.deadline && saved.pendingChoice.herbLoss === expired.pendingChoice.herbLoss)
      now += 300001
      E.simulateOffline(saved, xd, 2)
      const after = saved.resources.herb
      ok('离线已有威胁有界结算一次并不积累新事件', !saved.pendingChoice && after >= 99920 && saved.stats.eventsSeen === 1)
      E.simulateOffline(saved, xd, 2)
      ok('再次离线不会重复扣损失', saved.resources.herb === after)
      const { s: late, d: ld } = start()
      late.resources.arrayBase = 1
      late.resources.talisman = 2
      now += 300001
      E.resolveChoice(late, ld, 0)
      ok('到期点击按默认防守结算，不花付费材料', !late.pendingChoice && late.resources.arrayBase === 1 && late.resources.talisman === 2)
      const old = normalizeState({ pendingChoice: {} })
      ok('旧档补齐事务状态并清除无效选择', old.affairs.beastPeaceUntil === 0 && old.pendingChoice === null)
      resetForReincarnation(s, 0)
      ok('转世清空威胁与本世安宁', !s.pendingChoice && s.affairs.beastPeaceUntil === 0 && s.affairs.beastCooldownUntil === 0)
    } finally {
      Date.now = realNow
    }
  }
}
