import { createInitialState, normalizeState, resetForReincarnation } from '../src/game/state.js'
import { REALMS } from '../src/data/realms.js'
import { EVENT_MAP } from '../src/data/events.js'
import { trainDisciples } from './disciple-training.mjs'
import { cultivationRequired, cultivationRate, discipleFactor, discipleDismissalCost, DISCIPLE_DISMISSAL, SPIRITUAL_ROOTS, SPIRITUAL_ROOT_MAP, rollSpiritualRoot, newDisciple, cultivateDisciple, sortDisciples } from '../src/data/disciples.js'

export function runDiscipleChecks(E, ok, close) {
  const setup = (total = 2, realm = 4) => {
    const state = createInitialState()
    state.realm = realm
    state.disciples.total = total
    state.disciples.jobs.farmer = total
    state.resources.qi = 100000
    state.buildings.hut = { count: 1, on: true }
    const derived = E.createDerived()
    E.recompute(state, derived)
    for (const member of state.disciples.members) member.spiritualRoot = 'triple'
    return [state, derived]
  }
  const [s, d] = setup()
  s.buildings.spiritField = { count: 1, on: true }
  E.recompute(s, d)
  const buildingIncome = d.sources.qi.find(row => row.kind === 'building' && row.id === 'spiritField')?.value
  ok('旧人数接口补齐个体并保留分工', s.disciples.members.length === 2 && s.disciples.members.every(m => m.roleId === 'farmer'))
  const first = s.disciples.members[0]
  first.realm = 4
  const other = s.disciples.members[1]
  E.recompute(s, d)
  const source = d.sources.qi.find(row => row.kind === 'job')
  ok('岗位按不同境界个体汇总，口粮同系数', close(d.discipleJobWeights.farmer, 3) && close(d.upkeep, 1.5) && close(source.raw, 1.8))
  ok('弟子成长不增加建筑自带产出', close(d.sources.qi.find(row => row.kind === 'building' && row.id === 'spiritField')?.value, buildingIncome))
  const grownRate = source.value
  first.realm = 0
  E.recompute(s, d)
  ok('个人加成只影响自身岗位，宗门倍率保留', close(d.sources.qi.find(row => row.kind === 'job').value / grownRate, 2 / 3) && d.realmMult === 2)
  first.realm = 4
  s.realm = 3
  E.recompute(s, d)
  ok('退境保留个人境界并压低产出及口粮', first.realm === 4 && close(discipleFactor(first, s.realm), 1.6) && close(d.upkeep, 0.25 * 1.6 * 2.6))
  s.realm = 4
  E.recompute(s, d)
  ok('宗门恢复后个人加成恢复', first.realm === 4 && close(discipleFactor(first, s.realm), 2))
  E.assignDisciples(s, d, [first.id], 'woodcutter')
  ok('个体分工同步人数并隔离岗位加成', s.disciples.jobs.woodcutter === 1 && s.disciples.jobs.farmer === 1 && close(d.discipleJobWeights.woodcutter, 2) && close(d.discipleJobWeights.farmer, 1))
  E.setJob(s, d, 'woodcutter', 0)
  ok('原岗位人数操作保留个体成长', first.realm === 4 && first.roleId === null)
  other.realm = 3
  other.cultivation = cultivationRequired(3)
  let preview = E.discipleBreakthroughPreview(s, other)
  ok('弟子结丹基础成功率85%', close(preview.chance, 0.85))
  s.realm = 5
  preview = E.discipleBreakthroughPreview(s, other)
  ok('宗门指导按突破目标境界加成', close(preview.chance, 0.90))
  const guided = { ...other, realm: 0 }
  ok('宗门指导成功率不超过99%', close(E.discipleBreakthroughPreview(s, guided).chance, 0.99))
  s.realm = 3
  const before = JSON.stringify(s.resources)
  let result = E.breakthroughDisciples(s, d, [other.id], () => 0)
  ok('不能突破宗门上限且不扣材料', result.skipped === 1 && JSON.stringify(s.resources) === before)
  s.realm = 4
  for (const [id, amount] of Object.entries(preview.cost)) s.resources[id] = amount
  result = E.breakthroughDisciples(s, d, [other.id], () => 1)
  ok('失败扣材料、损失本境修为、调息且不降境', result.failed === 1 && other.realm === 3 && close(other.cultivation, cultivationRequired(3) * 0.8) && other.cooldown === 60 && Object.keys(preview.cost).every(id => s.resources[id] === 0))
  ok('个人突破支付的灵气计入累计消耗', other.totalQiConsumed === preview.cost.qi)
  const cd = E.discipleBreakthroughPreview(s, other)
  ok('调息中禁止重复突破', !cd.ready && cd.status === '突破调息中')
  other.cooldown = 0
  other.cultivation = cultivationRequired(3)
  for (const [id, amount] of Object.entries(preview.cost)) s.resources[id] = amount
  result = E.breakthroughDisciples(s, d, [other.id], () => 0)
  ok('成功晋升只清空本境修为', result.success === 1 && other.realm === 4 && other.cultivation === 0)
  const loaded = normalizeState(JSON.parse(JSON.stringify(s)))
  const loadedAgain = normalizeState(JSON.parse(JSON.stringify(loaded)))
  ok('个体身份、姓名、成长与岗位重复读档不变', JSON.stringify(loaded.disciples) === JSON.stringify(loadedAgain.disciples))
  const [batch, bd] = setup(3, 1)
  for (const m of batch.disciples.members) m.cultivation = cultivationRequired(0)
  const cost = E.discipleBreakthroughPreview(batch, batch.disciples.members[0]).cost
  for (const [id, amount] of Object.entries(cost)) batch.resources[id] = amount
  result = E.breakthroughDisciples(batch, bd, batch.disciples.members.map(m => m.id), () => 0)
  ok('批量逐人支付且缺料停止无超支', result.success === 1 && result.insufficient && batch.disciples.members.filter(m => m.realm === 1).length === 1 && Object.values(batch.resources).every(n => n >= 0))
  const [online, od] = setup(1, 1)
  const offline = normalizeState(JSON.parse(JSON.stringify(online)))
  const fd = E.createDerived()
  E.recompute(offline, fd)
  E.tick(online, od, 20, { events: false })
  E.simulateOffline(offline, fd, 20)
  ok('在线与离线成长一致', online.disciples.members[0].cultivation === 20 && JSON.stringify(normalizeState(online).disciples) === JSON.stringify(normalizeState(offline).disciples))
  ok('离线新来的弟子只修炼入门后时间', offline.disciples.members.length === 2 && close(offline.disciples.members[1].cultivation, 5 * cultivationRate(offline.disciples.members[1])))
  offline.disciples.members[0].cultivation = cultivationRequired(0) - 1
  E.simulateOffline(offline, fd, 3)
  ok('修满停止不自动突破也不积累下一境', offline.disciples.members[0].cultivation === cultivationRequired(0) && offline.disciples.members[0].realm === 0)
  const [leaving, ld] = setup(2, 1)
  leaving.disciples.members[0].roleId = null
  leaving.disciples.members[1].roleId = 'woodcutter'
  leaving.disciples.jobs.farmer = 0
  leaving.disciples.jobs.woodcutter = 1
  leaving.resources.qi = 0
  leaving.starvationTimer = 24
  leaving.buildings.hut.count = 0
  const idleId = leaving.disciples.members[0].id
  E.tick(leaving, ld, 1, { events: false })
  ok('断供移除实际闲散弟子并保留岗位人选', leaving.disciples.total === 1 && !leaving.disciples.members.some(m => m.id === idleId) && leaving.disciples.members[0].roleId === 'woodcutter')
  resetForReincarnation(s, 0)
  ok('重修清空个体成长记录', s.disciples.total === 0 && s.disciples.members.length === 0 && s.disciples.nextId === 1)
  const malformed = createInitialState()
  malformed.disciples.total = 2
  malformed.disciples.members = [{ id: 3, realm: 999, cultivation: Infinity, cooldown: -1, name: '甲', roleId: 'bad' }, { id: 3 }, null]
  const repaired = normalizeState(malformed)
  ok('归一化修复重复身份和异常数值', repaired.disciples.members.length === 2 && new Set(repaired.disciples.members.map(m => m.id)).size === 2 && repaired.disciples.members.every(m => m.realm < REALMS.length && Number.isFinite(m.cultivation)))
  const [fractional, fracDerived] = setup(0, 1)
  fractional.arrivalTimer = 14.8
  E.tick(fractional, fracDerived, 0.5, { events: false })
  ok('在线半秒tick按实际入门时刻修炼', fractional.disciples.members.length === 1 && close(fractional.disciples.members[0].cultivation, 0.3 * cultivationRate(fractional.disciples.members[0])))
  const [eventState, eventDerived] = setup(0, 1)
  E.fireEvent(eventState, eventDerived, EVENT_MAP.wanderer)
  E.fireEvent(eventState, eventDerived, EVENT_MAP.wanderer)
  ok('事件招入立即建立独立个体', eventState.disciples.total === 2 && eventState.disciples.members.length === 2 && eventState.disciples.members.every(m => m.cultivation === 0))
  ok('六种灵根权重完整且总和100', SPIRITUAL_ROOTS.length === 6 && SPIRITUAL_ROOTS.reduce((sum, root) => sum + root.weight, 0) === 100)
  let lower = 0
  for (const root of SPIRITUAL_ROOTS) {
    ok(`${root.name}抽取边界遵守权重`, rollSpiritualRoot(() => lower / 100) === root.id && rollSpiritualRoot(() => (lower + root.weight - 0.0001) / 100) === root.id)
    lower += root.weight
    const member = { realm: 0, cultivation: 0, cooldown: 60, spiritualRoot: root.id }
    cultivateDisciple(member, 10)
    ok(`${root.name}只改变修为速度，调息按真实时间`, close(member.cultivation, root.rate * 10) && member.cooldown === 50 && discipleFactor(member, 4) === 1)
  }
  const legacy = createInitialState()
  legacy.disciples.total = 2
  legacy.disciples.members = [{ id: 1, name: '旧弟子', realm: 2, roleId: null, cultivation: 100, cooldown: 3 }, { id: 2, spiritualRoot: 'unknown' }]
  const migrated = normalizeState(legacy)
  ok('旧弟子补三灵根并保留已培养修为', migrated.disciples.members.every(m => m.spiritualRoot === 'triple') && migrated.disciples.members[0].cultivation === 100 && migrated.disciples.members[0].realm === 2)
  const sequence = { nextId: 1, rootSeed: 12345 }
  const generated = Array.from({ length: 200 }, () => newDisciple(sequence))
  const continuation = newDisciple({ ...sequence })
  ok('新弟子按独立序列获得有效灵根且可重复验证', generated.every(m => SPIRITUAL_ROOT_MAP[m.spiritualRoot]) && new Set(generated.map(m => m.spiritualRoot)).size === 6 && newDisciple(sequence).spiritualRoot === continuation.spiritualRoot)
  const persisted = setup()[0]
  persisted.disciples.members[0].spiritualRoot = 'heaven'
  persisted.disciples.members[1].spiritualRoot = 'five'
  persisted.disciples.members[0].cultivation = 100
  const saved = normalizeState(JSON.parse(JSON.stringify(persisted)))
  ok('灵根与抽取序列保存后不重抽', saved.disciples.members[0].spiritualRoot === 'heaven' && saved.disciples.members[1].spiritualRoot === 'five' && saved.disciples.rootSeed === persisted.disciples.rootSeed)
  const mixedOffline = normalizeState(JSON.parse(JSON.stringify(saved)))
  const sd = E.createDerived(), md = E.createDerived()
  saved.buildings.hut.count = 0
  mixedOffline.buildings.hut.count = 0
  E.tick(saved, sd, 10, { events: false })
  E.simulateOffline(mixedOffline, md, 10)
  ok('混合灵根在线离线一致且不同速度生效', close(saved.disciples.members[0].cultivation, 120) && close(saved.disciples.members[1].cultivation, 8) && JSON.stringify(saved.disciples) === JSON.stringify(mixedOffline.disciples))
  const sorted = [{ id: 2, realm: 1, cultivation: 3000, spiritualRoot: 'heaven' }, { id: 1, realm: 0, cultivation: 1800, spiritualRoot: 'five' }]
  ok('进度排序按本境比例而非修为绝对值', sortDisciples(sorted, 'progress')[0].id === 1)
  ok('速度排序和入门排序稳定且不改存档顺序', sortDisciples(sorted, 'rate')[0].id === 2 && sortDisciples(sorted, 'arrival')[0].id === 1 && sorted[0].id === 2)
  const [training, td] = setup(2, 1)
  for (const member of training.disciples.members) member.cultivation = cultivationRequired(0)
  training.resources.insight = 80
  training.resources.qi = 1000
  const protectedResult = trainDisciples(training, td, { mode: 'protected', random: () => 0 })
  ok('培养模拟保留宗门下一境材料', protectedResult.success === 0 && protectedResult.reserved === 2 && training.resources.insight === 80)
  const greedyResult = trainDisciples(training, td, { mode: 'greedy', random: () => 0 })
  ok('培养模拟调用真实突破并记录实际支付', greedyResult.success === 2 && training.resources.insight === 78 && greedyResult.spent.insight === 2 && greedyResult.spent.qi === 6)

  const [account, ad] = setup(2, 4)
  account.disciples.members[0].realm = 4
  E.tick(account, ad, 10, { events: false })
  ok('个人口粮按有效境界累计，停留时间独立于灵根', close(account.disciples.members[0].totalQiConsumed, 10) && close(account.disciples.members[1].totalQiConsumed, 5) && account.disciples.members.every(member => member.residenceSeconds === 10))
  const full = account.disciples.members[0]
  full.cultivation = cultivationRequired(full.realm)
  E.tick(account, ad, 1, { events: false })
  ok('修满后仍累计在宗门时间与实际口粮', full.residenceSeconds === 11 && close(full.totalQiConsumed, 11))
  const [shortage, shortageDerived] = setup(2, 0)
  shortage.disciples.jobs.farmer = 0
  shortage.resources.qi = 0.125
  E.tick(shortage, shortageDerived, 1, { events: false })
  ok('断供口粮仅按实际可供灵气分摊', shortage.resources.qi === 0 && shortage.disciples.members.every(member => close(member.totalQiConsumed, 0.0625)))
  E.tick(shortage, shortageDerived, 1, { events: false })
  ok('完全断供不虚增累计消耗，但停留继续计时', shortage.disciples.members.every(member => close(member.totalQiConsumed, 0.0625) && member.residenceSeconds === 2))
  ok('旧档停留与口粮历史缺失时补零', migrated.disciples.members.every(member => member.residenceSeconds === 0 && member.totalQiConsumed === 0))
  const accountingSave = normalizeState(JSON.parse(JSON.stringify(account)))
  ok('个人停留与累计消耗随存档保留', accountingSave.disciples.members[0].residenceSeconds === full.residenceSeconds && accountingSave.disciples.members[0].totalQiConsumed === full.totalQiConsumed)
  const year = DISCIPLE_DISMISSAL.yearSeconds
  ok('逐出按游戏已满年数加1倍计费并向上取整', discipleDismissalCost({ residenceSeconds: year - 0.01, totalQiConsumed: 10.1 }) === 11 && discipleDismissalCost({ residenceSeconds: year, totalQiConsumed: 10.1 }) === 21 && discipleDismissalCost({ residenceSeconds: year * 2, totalQiConsumed: 10.1 }) === 31)
  const [expel, ed] = setup(3, 4)
  const [a, b, c] = expel.disciples.members
  a.residenceSeconds = year
  a.totalQiConsumed = 10.1
  b.totalQiConsumed = 20
  E.assignDisciples(expel, ed, [b.id], 'woodcutter')
  const ids = [a.id, b.id, a.id, 999999]
  expel.resources.qi = 40
  const populationBefore = JSON.stringify(expel.disciples)
  let dismissal = E.dismissDisciples(expel, ed, ids)
  ok('逐出费用逐人取整并去重，未知身份不收费', E.discipleDismissalPreview(expel, ids).cost.qi === 41 && E.discipleDismissalPreview(expel, ids).count === 2)
  ok('整批灵气不足时不扣费且不移除任何弟子', dismissal.dismissed === 0 && dismissal.reason === 'insufficient' && expel.resources.qi === 40 && JSON.stringify(expel.disciples) === populationBefore)
  expel.resources.qi = 100
  const quote = E.discipleDismissalPreview(expel, ids)
  a.totalQiConsumed += 1
  dismissal = E.dismissDisciples(expel, ed, ids, quote)
  ok('确认后费用变化时整批拒绝并要求重新确认', dismissal.reason === 'changed' && expel.disciples.total === 3 && expel.resources.qi === 100)
  a.totalQiConsumed -= 1
  dismissal = E.dismissDisciples(expel, ed, ids)
  ok('逐出支付精确费用并同步人口岗位和口粮', dismissal.dismissed === 2 && expel.resources.qi === 59 && expel.disciples.total === 1 && expel.disciples.members[0].id === c.id && expel.disciples.jobs.farmer === 1 && expel.disciples.jobs.woodcutter === 0 && close(ed.discipleWeight, 1))
  E.recompute(expel, ed)
  const expelSave = normalizeState(JSON.parse(JSON.stringify(expel)))
  ok('逐出弟子不会在刷新或读档时重新补回', expelSave.disciples.members.length === 1 && expelSave.disciples.members[0].id === c.id)
  dismissal = E.dismissDisciples(expel, ed, [c.id])
  ok('逐出最后一名弟子清空人口岗位且不复用身份', dismissal.dismissed === 1 && expel.disciples.total === 0 && Object.values(expel.disciples.jobs).every(value => value === 0) && newDisciple(expel.disciples).id > c.id)
}
