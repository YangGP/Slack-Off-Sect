import { createInitialState, normalizeState } from '../src/game/state.js'
import { newDisciple, recountDisciples } from '../src/data/disciples.js'
import { exportJson, parseImport } from '../src/game/save.js'
import { TALENT_MAP } from '../src/data/talents.js'

export function runAutoTalentChecks(E, ok, close) {
  const state = createInitialState(100000)
  state.buildings = { hut: { count: 5, on: true }, spiritField: { count: 1, on: true }, library: { count: 2, on: true }, quarry: { count: 1, on: true } }
  state.resources.qi = 500
  state.resources.insight = 300
  const talents = ['job_woodcutter_huang', 'job_miner_xuan', 'job_herbalist_di', 'job_incenseKeeper_tian', 'cultivation_xuan', 'job_woodcutter_di']
  for (const id of talents) {
    const member = newDisciple(state.disciples)
    member.talents = [{ id, level: 1 }]
    member.roleId = 'farmer'
    state.disciples.members.push(member)
  }
  const members = state.disciples.members
  members[5].onMission = true
  members[5].roleId = null
  recountDisciples(state.disciples)
  const derived = E.createDerived()
  E.recompute(state, derived)
  ok('未研究知人善任不自动转岗且研究遵守前置', E.autoAssignTalentJobs(state) === 0 && !E.research(state, derived, 'talentAssignment') && members.slice(0, 5).every(m => m.roleId === 'farmer'))
  state.upgrades.homePlanning = true
  state.upgrades.qiOrigin = true
  ok('实际参悟立即按专长分工并扣除研究费用', E.research(state, derived, 'talentAssignment') && members[0].roleId === 'woodcutter' && members[1].roleId === 'miner' && state.resources.qi === 0 && state.resources.insight === 0 && derived.autoTalentJobsUnlocked)
  ok('未开放岗位、非岗位天赋与出征弟子保持原分工', members.slice(2, 5).every(m => m.roleId === 'farmer') && members[5].roleId === null && state.disciples.jobs.woodcutter === 1 && state.disciples.jobs.miner === 1 && state.disciples.total === 6)
  const logCount = state.log.length
  ok('重复自动匹配不改人数、不追加日志', E.autoAssignTalentJobs(state) === 0 && state.disciples.jobs.farmer === 3 && state.log.length === logCount)
  state.buildings.herbGarden = { count: 1, on: true }
  state.resources.qi = 1000
  E.tick(state, derived, 1, { events: false })
  ok('岗位解锁后下个结算步自动接纳对应专长', members[2].roleId === 'herbalist')
  state.settings.autoTalentJobs = false
  members[0].roleId = 'farmer'
  recountDisciples(state.disciples)
  E.tick(state, derived, 1, { events: false })
  ok('暂停自动分工后手动分配得以保留', members[0].roleId === 'farmer')
  ok('暂停偏好随存档保留，旧档缺失偏好默认启用但受研究门槛控制', parseImport(exportJson(state)).settings.autoTalentJobs === false && normalizeState({}).settings.autoTalentJobs === true)
  state.settings.autoTalentJobs = true
  state.buildings.gate = { count: 1, on: true }
  members[5].onMission = false
  E.tick(state, derived, 1, { events: false })
  ok('恢复自动分工与归队后继续匹配', members[0].roleId === 'woodcutter' && members[3].roleId === 'incenseKeeper' && members[5].roleId === 'woodcutter' && members[4].roleId === 'farmer')
  members[4].talents = [{ id: 'job_scholar_huang', level: 1 }]
  E.tick(state, derived, 1, { events: false })
  ok('新领悟的岗位专长在结算时自动分配', members[4].roleId === 'scholar')
  members[0].roleId = 'farmer'
  recountDisciples(state.disciples)
  const stepped = JSON.parse(JSON.stringify(state))
  const offline = JSON.parse(JSON.stringify(state))
  const steppedD = E.createDerived(), offlineD = E.createDerived()
  for (let i = 0; i < 10; i++) E.tick(stepped, steppedD, 1, { events: false })
  E.tick(offline, offlineD, 10, { offline: true, events: false })
  ok('自动分工在线小步与离线批量的岗位及产出一致', JSON.stringify(stepped.disciples.jobs) === JSON.stringify(offline.disciples.jobs) && Object.keys(stepped.resources).every(id => close(stepped.resources[id], offline.resources[id])))

  // 固定找到会产生岗位专长的种子，用真实收徒入口验证即时分工。
  let birthSeed = null, expectedRole = null
  for (let seed = 0; seed < 10000; seed++) {
    const probe = newDisciple({ nextId: 1, rootSeed: 12345, talentSeed: seed })
    const entry = probe.talents.find(entry => TALENT_MAP[entry.id]?.category === 'job')
    if (entry) { birthSeed = seed; expectedRole = TALENT_MAP[entry.id].jobId; break }
  }
  state.disciples.talentSeed = birthSeed
  state.disciples.rootSeed = 12345
  E.recompute(state, derived)
  state.arrivalTimer = E.arrivalInterval(derived) - 0.5
  const recruited = E.recruitArrivals(state, derived, 1)
  ok('真实收徒立即将先天岗位专长安排到对应岗位', recruited === 1 && expectedRole && state.disciples.members.at(-1).roleId === expectedRole)
}
