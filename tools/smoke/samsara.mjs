import { createInitialState, normalizeState, resetForAscension } from '../../src/game/state.js'
import { newDisciple, recountDisciples, cultivationRequired, cultivateDisciple } from '../../src/data/disciples.js'
import { withGameContext } from '../../src/game/context.js'
import { ALL_UPGRADES } from '../../src/data/upgrades.js'
import { serialize, parseImport } from '../../src/game/save.js'
import * as E from '../engine-fixture.mjs'

/** 只检查跨系统的状态边界，不尝试用短测证明半年／一年平衡目标。 */
export function samsaraLifecycle({ ok, section }) {
  section('轮回生命周期：贡献、永久权益、离线培养与人数锁定')
  const s = createInitialState(1000000), d = E.createDerived()
  s.realm = 3
  s.buildings.hut = { count: 10, on: true }
  s.buildings.spiritField = { count: 100, on: true }
  const m = newDisciple(s.disciples, 'triple')
  m.focus = true
  m.cultivation = cultivationRequired(0) - 1
  s.disciples.members.push(m)
  recountDisciples(s.disciples)
  s.resources.qi = E.money(10000)
  s.resources.insight = E.money(10000)
  s.upgrades[ALL_UPGRADES.find(u => u.effects?.autoDiscipleBreakthrough).id] = true
  s.settings.autoBreakthrough = true
  s.settings.sectBreakthroughReserve = false
  s.settings.trainingQiFloorSeconds = 0
  E.recompute(s, d)
  withGameContext(s, { random: () => 0 }, () => E.simulateOffline(s, d, 120, { startAt: 1000000 }))
  ok('已开启的离线自动突破通过共用入口推进到下一境', m.realm === 1 && m.lifetimeCultivation > 0)
  m.cultivation = cultivationRequired(m.realm)
  const contribution = m.lifetimeCultivation
  cultivateDisciple(m, 100)
  ok('修满挂机不刷终身修为', m.lifetimeCultivation === contribution)
  s.dao = E.money(10)
  s.samsara.shopOpen = true
  s.samsara.automation = true
  E.recompute(s, d)
  const production = d.globalMult
  ok('道果购买成功', E.buyDaoPerk(s, d, 'cultivation'))
  ok('花道果不降低生产或自动化', d.globalMult.eq(production) && d.daoAutomation)
  const loaded = normalizeState(s, { preferMembers: true })
  ok('读档保留贡献和永久购买', loaded.disciples.members[0].lifetimeCultivation === contribution && loaded.samsara.levels.cultivation === 1)
  s.realm = 10
  s.disciples.peak = 12
  ok('挑战取本世峰值并补足普通成员', E.beginChallenge(s, d) && s.challenge.target === 12 && s.disciples.members.length === 12)
  ok('挑战中禁止普通退出和逐出', !E.canAscend(s) && !E.canReincarnate(s) && E.discipleDismissalPreview(s, [m.id]).count === 0)
  ok('事件来客不能绕过固定挑战人数', E.eventOutcome(s, d, { recruit: 2 }).recruits === 0)
  for (const member of s.disciples.members) { member.realm = 10; member.finalReady = true }
  s.challenge.protection = 10
  ok('公共护道充分后一次集体判定必成', E.challengeQuote(s).chance === 1 && E.resolveChallenge(s, d).success)
  const newcomer = newDisciple(s.disciples, 'triple')
  s.disciples.members.push(newcomer)
  ok('圆满标记只属于本次参与者，读档保留', !newcomer.collectiveAscended && normalizeState(s, { preferMembers: true }).disciples.members.filter(member => member.collectiveAscended).length === 12)
  const reward = E.daoReward(s), balance = s.dao
  resetForAscension(s, E.money(2))
  ok('新世发放贡献道果并保留纪念与永久资产', s.dao.eq(balance.plus(reward)) && s.samsara.records.length === 13 && s.samsara.records.filter(r => r.outcome === '飞升圆满').length === 12 && s.samsara.completions === 1 && s.samsara.levels.cultivation === 1)
  const old = createInitialState(1000000)
  delete old.disciples.cultivationVersion
  old.disciples.total = 1
  old.disciples.members = [{ id: 1, name: '旧成员', realm: 4, cultivation: 43200, spiritualRoot: 'triple' }]
  old.dao = E.money('2.5')
  old.samsara.spent = E.money('1.25')
  const migrated = normalizeState(old, { preferMembers: true })
  ok('旧本境修为按比例迁移', Math.abs(migrated.disciples.members[0].cultivation / cultivationRequired(4) - 0.5) < 1e-9)
  const roundTrip = parseImport(JSON.stringify(serialize(migrated)))
  ok('存档往返不重复迁移，永久金额与自动化保留', roundTrip.disciples.members[0].lifetimeCultivation === migrated.disciples.members[0].lifetimeCultivation && roundTrip.samsara.spent.eq('1.25') && roundTrip.dao.eq('2.5') && roundTrip.samsara.automation)
}
