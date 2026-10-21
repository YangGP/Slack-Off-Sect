import { createInitialState, normalizeState, resetForReincarnation } from '../src/game/state.js'
import { REALMS } from '../src/data/realms.js'
import { CONFIG } from '../src/data/config.js'
import { EVENT_MAP } from '../src/data/events.js'
import { trainDisciples } from './disciple-training.mjs'
import { recruitArrivals } from '../src/game/systems/disciples.js'
import { cultivationRequired, cultivationRate, discipleFactor, discipleAnnualBaseUpkeep, discipleDismissalCost, DISCIPLE_DISMISSAL, DISCIPLE_TRAINING, DISCIPLE_AIDS, discipleTrainingCost, trainingBonus, SPIRITUAL_ROOTS, SPIRITUAL_ROOT_MAP, rollSpiritualRoot, newDisciple, cultivateDisciple, sortDisciples } from '../src/data/disciples.js'

export function runDiscipleChecks(E, ok, close) {
  const setup = (total = 2, realm = 4) => {
    const state = createInitialState()
    state.realm = realm
    state.disciples.total = total
    state.disciples.jobs.farmer = total
    state.resources.qi = E.money(100000)
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
  ok('岗位按不同境界个体汇总，口粮同系数', close(d.discipleJobWeights.farmer, 3) && close(d.upkeep, CONFIG.DISCIPLE_UPKEEP * 4.5) && close(source.raw, 1.8))
  ok('弟子成长不增加建筑自带产出', close(d.sources.qi.find(row => row.kind === 'building' && row.id === 'spiritField')?.value, buildingIncome))
  const grownRate = source.value
  first.realm = 0
  E.recompute(s, d)
  ok('个人加成只影响自身岗位，宗门倍率保留', close(d.sources.qi.find(row => row.kind === 'job').value.div(grownRate), 2 / 3) && d.realmMult === 2)
  first.realm = 4
  s.realm = 3
  E.recompute(s, d)
  ok('退境保留个人境界并压低产出及口粮', first.realm === 4 && close(discipleFactor(first, s.realm), 1.6) && close(d.upkeep, CONFIG.DISCIPLE_UPKEEP * 1.3 * 2.6))
  s.realm = 4
  E.recompute(s, d)
  ok('宗门恢复后个人加成恢复', first.realm === 4 && close(discipleFactor(first, s.realm), 2))
  E.assignDisciples(s, d, [first.id], 'woodcutter')
  ok('个体分工同步人数并隔离岗位加成', s.disciples.jobs.woodcutter === 1 && s.disciples.jobs.farmer === 1 && close(d.discipleJobWeights.woodcutter, 2) && close(d.discipleJobWeights.farmer, 1))
  E.setJob(s, d, 'woodcutter', 0)
  ok('原岗位人数操作保留个体成长', first.realm === 4 && first.roleId === null)
  other.realm = 3
  other.cultivation = cultivationRequired(3)
  const baseChances = [0.475, 0.475, 0.475, 0.35, 0.30, 0.275, 0.25, 0.10, 0.075, 0.05]
  for (const [index, base] of baseChances.entries()) {
    const target = index + 1
    const candidate = { ...other, realm: target - 1, cultivation: cultivationRequired(target - 1) }
    s.realm = target
    ok(`目标境界${target}弟子基础成功率为宗门基础的一半`, close(E.discipleBreakthroughPreview(s, candidate).chance, base))
    s.realm = REALMS.length - 1
    ok(`目标境界${target}指导加成按每境10个百分点计算且封顶99%`, close(E.discipleBreakthroughPreview(s, candidate).chance, Math.min(0.99, base + (s.realm - target) * 0.1)))
  }
  for (const [roll, success] of [[0.349999, true], [0.35, false]]) {
    const [boundary, boundaryDerived] = setup(1, 4)
    const member = boundary.disciples.members[0]
    member.realm = 3
    member.cultivation = cultivationRequired(3)
    const cost = E.discipleBreakthroughPreview(boundary, member).cost
    Object.assign(boundary.resources, cost)
    const outcome = E.breakthroughDisciples(boundary, boundaryDerived, [member.id], () => roll)
    ok(`结丹35%实际判定边界 ${roll}`, success ? outcome.success === 1 : outcome.failed === 1)
  }
  s.realm = 4
  let preview = E.discipleBreakthroughPreview(s, other)
  ok('弟子结丹基础成功率为宗门70%的一半，即35%', close(preview.chance, 0.35))
  for (const [root, delta] of Object.entries({ heaven: 6, variant: 4, dual: 2, triple: 0, quad: -1, five: -2 })) {
    const probe = { ...other, spiritualRoot: root }
    ok(`灵根${SPIRITUAL_ROOT_MAP[root].name}影响突破概率 ${delta > 0 ? '+' : ''}${delta}pt`, close(E.discipleBreakthroughPreview(s, probe).chance, 0.35 + delta / 100))
  }
  s.realm = 5
  preview = E.discipleBreakthroughPreview(s, other)
  ok('宗门指导按突破目标境界加成', close(preview.chance, 0.45))
  const guided = { ...other, realm: 0 }
  ok('元婴宗门指导引气弟子为47.5%加40个百分点', close(E.discipleBreakthroughPreview(s, guided).chance, 0.875))
  s.realm = 3
  const before = JSON.stringify(s.resources)
  let result = E.breakthroughDisciples(s, d, [other.id], () => 0)
  ok('不能突破宗门上限且不扣材料', result.skipped === 1 && JSON.stringify(s.resources) === before)
  s.realm = 4
  for (const [id, amount] of Object.entries(preview.cost)) s.resources[id] = amount
  result = E.breakthroughDisciples(s, d, [other.id], () => 1)
  ok('失败扣材料、损失本境修为、调息且不降境', result.failed === 1 && other.realm === 3 && close(other.cultivation, cultivationRequired(3) * 0.8) && other.cooldown === 60 && Object.keys(preview.cost).every(id => E.moneyIsZero(s.resources[id])))
  ok('个人突破支付的灵气计入累计消耗', E.moneyEq(other.totalQiConsumed, preview.cost.qi))
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
  // 本例隔离「缺料停止」语义：宗门材料保留默认开启，开启时的批量行为在下方培养预算小节单独测。
  batch.settings.sectBreakthroughReserve = false
  for (const m of batch.disciples.members) m.cultivation = cultivationRequired(0)
  const cost = E.discipleBreakthroughPreview(batch, batch.disciples.members[0]).cost
  for (const [id, amount] of Object.entries(cost)) batch.resources[id] = amount
  result = E.breakthroughDisciples(batch, bd, batch.disciples.members.map(m => m.id), () => 0)
  ok('批量逐人支付且缺料停止无超支', result.success === 1 && result.insufficient && batch.disciples.members.filter(m => m.realm === 1).length === 1 && Object.values(batch.resources).every(n => E.moneyGte(n, 0)))
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
  leaving.resources.qi = E.money(0)
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
    ok(`${root.name}按系数影响修为速度，调息按真实时间`, close(member.cultivation, root.rate * 10) && member.cooldown === 50 && discipleFactor(member, 4) === 1)
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
  const focusSorted = [{ id: 2, realm: 1, cultivation: 3000, spiritualRoot: 'heaven' }, { id: 1, realm: 0, cultivation: 1800, spiritualRoot: 'five', focus: true }]
  ok('重点名单在任一排序下置顶', sortDisciples(focusSorted, 'progress')[0].id === 1 && sortDisciples(focusSorted, 'rate')[0].id === 1 && sortDisciples(focusSorted, 'arrival')[0].id === 1)
  const [marked, markedD] = setup(3, 1)
  ok('新弟子默认非重点', marked.disciples.members.every(m => m.focus === false))
  const [ma, mb] = marked.disciples.members
  E.setDiscipleFocus(marked, markedD, [ma.id], true)
  ok('标记重点只作用于所选个体且重复标记不叠加', ma.focus === true && !mb.focus && E.setDiscipleFocus(marked, markedD, [ma.id], true) === 0)
  const focusSaved = normalizeState(JSON.parse(JSON.stringify(marked)))
  ok('重点标记随存档保留', focusSaved.disciples.members.every(m => m.focus === (m.id === ma.id)))
  const legacyFocus = normalizeState({ disciples: { total: 1, jobs: {}, rootSeed: 12345 } })
  ok('旧档弟子默认非重点', legacyFocus.disciples.members.every(m => m.focus === false))
  const [training, td] = setup(2, 1)
  for (const member of training.disciples.members) member.cultivation = cultivationRequired(0)
  training.resources.insight = E.money(80)
  training.resources.qi = E.money(1000)
  const protectedResult = trainDisciples(training, td, { mode: 'protected', random: () => 0 })
  ok('培养模拟保留宗门下一境材料', protectedResult.success === 0 && protectedResult.reserved === 2 && E.moneyEq(training.resources.insight, 80))
  const greedyResult = trainDisciples(training, td, { mode: 'greedy', random: () => 0 })
  ok('培养模拟调用真实突破并记录实际支付', greedyResult.success === 2 && E.moneyEq(training.resources.insight, '79.2') && E.moneyEq(greedyResult.spent.insight, '0.8') && E.moneyEq(greedyResult.spent.qi, 5))

  const [account, ad] = setup(2, 4)
  account.disciples.members[0].realm = 4
  E.tick(account, ad, 10, { events: false })
  ok('个人口粮按有效境界累计，停留时间独立于灵根', close(account.disciples.members[0].totalQiConsumed, CONFIG.DISCIPLE_UPKEEP * 30) && close(account.disciples.members[1].totalQiConsumed, CONFIG.DISCIPLE_UPKEEP * 15) && account.disciples.members.every(member => member.residenceSeconds === 10))
  const full = account.disciples.members[0]
  full.cultivation = cultivationRequired(full.realm)
  E.tick(account, ad, 1, { events: false })
  ok('修满后仍累计在宗门时间与实际口粮', full.residenceSeconds === 11 && close(full.totalQiConsumed, CONFIG.DISCIPLE_UPKEEP * 33))
  const [shortage, shortageDerived] = setup(2, 0)
  shortage.disciples.jobs.farmer = 0
  shortage.resources.qi = E.money(0.125)
  E.tick(shortage, shortageDerived, 1, { events: false })
  ok('断供口粮仅按实际可供灵气分摊', E.moneyIsZero(shortage.resources.qi) && shortage.disciples.members.every(member => close(member.totalQiConsumed, 0.0625)))
  E.tick(shortage, shortageDerived, 1, { events: false })
  ok('完全断供不虚增累计消耗，但停留继续计时', shortage.disciples.members.every(member => close(member.totalQiConsumed, 0.0625) && member.residenceSeconds === 2))
  ok('旧档停留与口粮历史缺失时补零', migrated.disciples.members.every(member => member.residenceSeconds === 0 && E.moneyIsZero(member.totalQiConsumed)))
  const accountingSave = normalizeState(JSON.parse(JSON.stringify(account)))
  ok('个人停留与累计消耗随存档保留', accountingSave.disciples.members[0].residenceSeconds === full.residenceSeconds && E.moneyEq(accountingSave.disciples.members[0].totalQiConsumed, full.totalQiConsumed))
  const year = DISCIPLE_DISMISSAL.yearSeconds
  const annual1 = discipleAnnualBaseUpkeep({ realm: 1 }, 1)
  const annual0 = discipleAnnualBaseUpkeep({ realm: 0 }, 0)
  ok('逐出按当前年基础口粮乘已满年数加1并保留小数', E.moneyEq(discipleDismissalCost({ realm: 1, residenceSeconds: year - 0.01 }, 1), annual1) && E.moneyEq(discipleDismissalCost({ realm: 1, residenceSeconds: year }, 1), annual1.times(2)) && E.moneyEq(discipleDismissalCost({ realm: 1, residenceSeconds: year * 2 }, 1), annual1.times(3)))
  ok('逐出费用不随历史突破或累计口粮增加', E.moneyEq(discipleDismissalCost({ realm: 0, residenceSeconds: year, totalQiConsumed: E.money(0) }, 0), annual0.times(2)) && E.moneyEq(discipleDismissalCost({ realm: 0, residenceSeconds: year, totalQiConsumed: E.money(1000000) }, 0), annual0.times(2)))
  ok('宗门退境按当前有效境界计算年基础口粮', E.moneyEq(discipleDismissalCost({ realm: 4, residenceSeconds: year }, 1), discipleAnnualBaseUpkeep({ realm: 4 }, 1).times(2)) && E.moneyEq(discipleDismissalCost({ realm: 4, residenceSeconds: year }, 4), discipleAnnualBaseUpkeep({ realm: 4 }, 4).times(2)))
  const [expel, ed] = setup(3, 0)
  const [a, b, c] = expel.disciples.members
  a.residenceSeconds = year
  a.totalQiConsumed = E.money(10.1)
  b.totalQiConsumed = E.money(20)
  E.assignDisciples(expel, ed, [b.id], 'woodcutter')
  const ids = [a.id, b.id, a.id, 999999]
  expel.resources.qi = E.money(971)
  const populationBefore = JSON.stringify(expel.disciples)
  let dismissal = E.dismissDisciples(expel, ed, ids)
  ok('逐出费用逐人合计并去重，未知身份不收费', E.moneyEq(E.discipleDismissalPreview(expel, ids).cost.qi, 972) && E.discipleDismissalPreview(expel, ids).count === 2)
  ok('整批灵气不足时不扣费且不移除任何弟子', dismissal.dismissed === 0 && dismissal.reason === 'insufficient' && E.moneyEq(expel.resources.qi, 971) && JSON.stringify(expel.disciples) === populationBefore)
  expel.resources.qi = E.money(1000)
  const quote = E.discipleDismissalPreview(expel, ids)
  a.residenceSeconds += year
  dismissal = E.dismissDisciples(expel, ed, ids, quote)
  ok('确认后费用变化时整批拒绝并要求重新确认', dismissal.reason === 'changed' && expel.disciples.total === 3 && E.moneyEq(expel.resources.qi, 1000))
  a.residenceSeconds -= year
  dismissal = E.dismissDisciples(expel, ed, ids)
  ok('逐出支付精确费用并同步人口岗位和口粮', dismissal.dismissed === 2 && E.moneyEq(expel.resources.qi, 28) && expel.disciples.total === 1 && expel.disciples.members[0].id === c.id && expel.disciples.jobs.farmer === 1 && expel.disciples.jobs.woodcutter === 0 && close(ed.discipleWeight, 1))
  E.recompute(expel, ed)
  const expelSave = normalizeState(JSON.parse(JSON.stringify(expel)))
  ok('逐出弟子不会在刷新或读档时重新补回', expelSave.disciples.members.length === 1 && expelSave.disciples.members[0].id === c.id)
  expel.resources.qi = E.money(324)
  dismissal = E.dismissDisciples(expel, ed, [c.id])
  ok('逐出最后一名弟子清空人口岗位且不复用身份', dismissal.dismissed === 1 && expel.disciples.total === 0 && Object.values(expel.disciples.jobs).every(value => value === 0) && newDisciple(expel.disciples).id > c.id)

  // ============ 手动培养：传功与个人护道 ============
  const [fractionalRoom, fractionalRoomD] = setup(49, 0)
  fractionalRoom.buildings.hut = { count: 30, on: true }
  E.recompute(fractionalRoom, fractionalRoomD)
  fractionalRoom.habitabilityPenalty += -0.5 - fractionalRoomD.habitability
  E.recompute(fractionalRoom, fractionalRoomD)
  fractionalRoom.arrivalTimer = 100000
  const recruitsBefore = fractionalRoom.stats.recruits
  const arrivals = recruitArrivals(fractionalRoom, fractionalRoomD, 1, { silent: true })
  ok('小数宜居度批量收徒的成员、统计与返回人数一致', arrivals === 1 && fractionalRoom.disciples.total === 50 && fractionalRoom.stats.recruits === recruitsBefore + 1)
  const [ment, mentD] = setup(2, 4)
  ment.upgrades.mentorship = true
  const [m1, m2] = ment.disciples.members
  m1.realm = 4
  m1.cultivation = 0
  ok('开关传功写入个体且只影响本人', E.setMentored(ment, mentD, [m1.id], true) === 1 && m1.mentored === true && m2.mentored === false)
  ok('传功按有效境界计费并进入灵气出项', close(discipleTrainingCost(m1, ment.realm), DISCIPLE_TRAINING.qiPerSecond * 2) &&
    close(mentD.trainingCost, DISCIPLE_TRAINING.qiPerSecond * 2) && mentD.trainingActive)
  ok('未受传功的弟子不产生传功开销', E.moneyIsZero(discipleTrainingCost(m2, ment.realm)))
  ok('传功使本人修炼速度提升 75%', close(cultivationRate(m1, true) / cultivationRate(m1, false), 1 + DISCIPLE_TRAINING.speed))
  m1.cultivation = cultivationRequired(4)
  E.recompute(ment, mentD)
  ok('本境修为已满时传功不收费不生效', E.moneyIsZero(discipleTrainingCost(m1, ment.realm)) && E.moneyIsZero(mentD.trainingCost) && !mentD.trainingActive && trainingBonus(m1, true) === 0)
  const [dry, dd] = setup(1, 0)
  dry.upgrades.mentorship = true
  // 门控边界以底线关闭为口径（默认 30 秒底线的行为在下方「培养预算」小节单独测）。
  dry.settings.trainingQiFloorSeconds = 0
  dry.disciples.jobs.farmer = 0
  dry.disciples.members[0].mentored = true
  dry.resources.qi = E.money(0)
  E.recompute(dry, dd)
  ok('灵气见底且无产出时整批传功暂停、不欠账', E.moneyIsZero(dd.trainingCost) && !dd.trainingActive && dry.disciples.members[0].mentored === true)
  dry.resources.qi = E.money(0.001)
  E.recompute(dry, dd)
  E.tick(dry, dd, 1, { events: false })
  ok('少量库存不足支付整批传功时只按普通速度修炼', !dd.trainingActive && close(dry.disciples.members[0].cultivation, cultivationRate(dry.disciples.members[0])) && E.moneyIsZero(dry.resources.qi))
  dry.resources.qi = E.money(0.7)
  E.recompute(dry, dd, 2)
  ok('传功供给按实际结算时长校验', !dd.trainingActive)
  E.recompute(dry, dd, 1)
  ok('库存恰好支付口粮与传功时生效', dd.trainingActive)
  delete dry.upgrades.mentorship
  E.recompute(dry, dd)
  ok('旧偏好不能绕过传功研究门槛', !dd.trainingActive)
  const [mentEq, mentEqD] = setup(1, 2)
  mentEq.upgrades.mentorship = true
  mentEq.disciples.members[0].mentored = true
  mentEq.disciples.members[0].cultivation = 0
  E.recompute(mentEq, mentEqD)
  const trainRows = (mentEqD.expenseSources.qi || []).filter(entry => entry.id === 'training')
  ok('传功出项唯一且等于 trainingCost，不重复计费', trainRows.length === 1 && close(trainRows[0].value.neg(), mentEqD.trainingCost) &&
    close(mentEqD.trainingCost, discipleTrainingCost(mentEq.disciples.members[0], mentEq.realm)))
  const mentOffline = normalizeState(JSON.parse(JSON.stringify(mentEq)))
  const mentOfflineD = E.createDerived()
  E.recompute(mentOffline, mentOfflineD)
  E.tick(mentEq, mentEqD, 10, { events: false })
  E.simulateOffline(mentOffline, mentOfflineD, 10)
  ok('传功在线与离线修炼一致且按 +75% 生效', close(mentEq.disciples.members[0].cultivation, mentOffline.disciples.members[0].cultivation) &&
    close(mentEq.disciples.members[0].cultivation, 10 * cultivationRate(mentEq.disciples.members[0], true)))

  // ============ 培养预算：灵气底线、宗门破境材料保留与传功上限（§2.2.2） ============
  const [floorOn, floorOnD] = setup(1, 0)
  floorOn.upgrades.mentorship = true
  floorOn.disciples.jobs.farmer = 0
  const floorMember = floorOn.disciples.members[0]
  floorMember.mentored = true
  floorMember.cultivation = 0
  E.recompute(floorOn, floorOnD, 1)
  const floorFood = E.money(floorOnD.upkeep)
  const floorTrain = E.money(discipleTrainingCost(floorMember, floorOn.realm))
  floorOn.resources.qi = floorFood.plus(floorTrain)
  E.recompute(floorOn, floorOnD, 1)
  ok('默认灵气底线拦截只够口粮与传功的库存', !floorOnD.trainingActive)
  floorOn.settings.trainingQiFloorSeconds = 0
  E.recompute(floorOn, floorOnD, 1)
  ok('底线为 0 时恢复原门控口径', floorOnD.trainingActive)
  floorOn.settings.trainingQiFloorSeconds = 30
  floorOn.resources.qi = floorFood.plus(floorTrain).plus(floorFood.times(30))
  E.recompute(floorOn, floorOnD, 1)
  ok('库存覆盖底线与传功开销时生效', floorOnD.trainingActive)
  floorOn.resources.qi = floorFood.plus(floorTrain).plus(floorFood.times(30)).minus(E.money(0.001))
  E.recompute(floorOn, floorOnD, 1)
  ok('击穿底线的传功整批暂停、不欠账', !floorOnD.trainingActive)

  const [limitState, limitD] = setup(3, 1)
  limitState.upgrades.mentorship = true
  limitState.settings.mentorLimit = 2
  const [l1, l2, l3] = limitState.disciples.members
  ok('传功人数上限在开关时校验：达上限后拒绝开启', E.setMentored(limitState, limitD, [l1.id, l2.id], true) === 2 &&
    E.setMentored(limitState, limitD, [l3.id], true) === 0 && l3.mentored === false)
  ok('停功不受上限影响并空出名额', E.setMentored(limitState, limitD, [l1.id], false) === 1 &&
    E.setMentored(limitState, limitD, [l3.id], true) === 1)
  const [batchLimit, batchLimitD] = setup(3, 1)
  batchLimit.upgrades.mentorship = true
  batchLimit.settings.mentorLimit = 2
  E.setMentored(batchLimit, batchLimitD, batchLimit.disciples.members.map(member => member.id), true)
  ok('批量传功到上限即停', batchLimit.disciples.members.filter(member => member.mentored === true).length === 2)

  const [reserveState, reserveD] = setup(2, 1)
  reserveState.upgrades.mentorship = true
  E.recompute(reserveState, reserveD)
  for (const member of reserveState.disciples.members) { member.realm = 0; member.cultivation = cultivationRequired(0) }
  const sectNext = E.realmCost(reserveState, reserveD, reserveState.realm + 1) || {}
  const fee = E.discipleBreakthroughPreview(reserveState, reserveState.disciples.members[0]).cost
  for (const [id, amount] of Object.entries(sectNext)) reserveState.resources[id] = E.money(amount).plus(fee[id] ?? E.ZERO)
  for (const [id, amount] of Object.entries(fee)) if (reserveState.resources[id] === undefined) reserveState.resources[id] = E.money(amount)
  const reserveResult = E.breakthroughDisciples(reserveState, reserveD, reserveState.disciples.members.map(member => member.id), () => 0)
  ok('批量突破保留宗门下一境材料并在余量不足时停止', reserveResult.success === 1 && reserveResult.reserved === 1 &&
    Object.entries(sectNext).every(([id, amount]) => E.moneyGte(reserveState.resources[id], amount)))
  const [singleReserve, singleReserveD] = setup(2, 1)
  for (const member of singleReserve.disciples.members) { member.realm = 0; member.cultivation = cultivationRequired(0) }
  const singleFee = E.discipleBreakthroughPreview(singleReserve, singleReserve.disciples.members[0]).cost
  for (const [id, amount] of Object.entries(singleFee)) singleReserve.resources[id] = E.money(amount)
  const singleResult = E.breakthroughDisciples(singleReserve, singleReserveD, [singleReserve.disciples.members[0].id], () => 0)
  ok('单人手动突破不受材料保留限制', singleResult.success === 1 && singleResult.reserved === 0)
  reserveState.settings.sectBreakthroughReserve = false
  for (const [id, amount] of Object.entries(fee)) reserveState.resources[id] = E.money(reserveState.resources[id] ?? E.ZERO).plus(amount)
  const afterOff = E.breakthroughDisciples(reserveState, reserveD, reserveState.disciples.members.map(member => member.id), () => 0)
  ok('关闭材料保留后批量不再受限', afterOff.reserved === 0 && afterOff.success === 1)

  const legacyBudget = normalizeState({ disciples: { total: 1, jobs: {}, rootSeed: 12345 } })
  ok('旧档培养预算补默认值', legacyBudget.settings.trainingQiFloorSeconds === 30 &&
    legacyBudget.settings.sectBreakthroughReserve === true && legacyBudget.settings.mentorLimit === 20)
  const badBudget = JSON.parse(JSON.stringify(legacyBudget))
  badBudget.settings.trainingQiFloorSeconds = 9999
  badBudget.settings.mentorLimit = -5
  badBudget.settings.sectBreakthroughReserve = 'yes'
  const fixedBudget = normalizeState(badBudget)
  ok('培养预算越界值归一化', fixedBudget.settings.trainingQiFloorSeconds === 300 &&
    fixedBudget.settings.mentorLimit === 0 && fixedBudget.settings.sectBreakthroughReserve === true)

  // ============ 自动突破（§2.2.3）：仅在线、重点优先、缺料跳过、预留优先 ============
  const [autoUnlocked, autoUnlockedD] = setup(2, 1)
  autoUnlocked.upgrades.adaptiveTeaching = true
  E.recompute(autoUnlocked, autoUnlockedD)
  ok('掌握《因材施教》后开放自动突破入口', autoUnlockedD.autoDiscipleBreakthroughUnlocked)
  for (const member of autoUnlocked.disciples.members) member.cultivation = cultivationRequired(0)
  E.tick(autoUnlocked, autoUnlockedD, 1, { events: false })
  ok('自动突破默认关闭：掌握研究后仍不自动突破', autoUnlocked.disciples.members.every(member => member.realm === 0 && member.cooldown === 0))

  const [autoFocus, autoFocusD] = setup(2, 1)
  autoFocus.upgrades.adaptiveTeaching = true
  autoFocus.settings.autoBreakthrough = true
  // 隔离人选口径：关闭保留与底线，只看「重点优先、在线触发」本身。
  autoFocus.settings.sectBreakthroughReserve = false
  autoFocus.settings.trainingQiFloorSeconds = 0
  const [af1, af2] = autoFocus.disciples.members
  for (const member of autoFocus.disciples.members) member.cultivation = cultivationRequired(0)
  const autoFee = E.discipleBreakthroughPreview(autoFocus, af1).cost
  for (const [id, amount] of Object.entries(autoFee)) autoFocus.resources[id] = E.money(amount).times(2)
  E.recompute(autoFocus, autoFocusD)
  E.tick(autoFocus, autoFocusD, 1, { events: false })
  ok('默认仅重点名单：无人标记时不自动突破', af1.realm === 0 && af1.cooldown === 0 && af2.realm === 0 && af2.cooldown === 0)
  E.setDiscipleFocus(autoFocus, autoFocusD, [af1.id], true)
  E.tick(autoFocus, autoFocusD, 1, { events: false })
  ok('重点弟子由在线 tick 自动突破', (af1.realm === 1 || af1.cooldown > 0) && af2.realm === 0 && af2.cooldown === 0)
  autoFocus.settings.autoBreakthroughScope = 'all'
  E.tick(autoFocus, autoFocusD, 1, { events: false })
  ok('改为全部弟子后其余弟子也尝试自动突破', (af2.realm === 1 || af2.cooldown > 0))

  const [autoSkip, autoSkipD] = setup(3, 4)
  autoSkip.upgrades.adaptiveTeaching = true
  autoSkip.settings.autoBreakthrough = true
  autoSkip.settings.autoBreakthroughScope = 'all'
  autoSkip.settings.sectBreakthroughReserve = false
  autoSkip.settings.trainingQiFloorSeconds = 0
  const [sk1, sk2, sk3] = autoSkip.disciples.members
  // 中间那位目标是元婴：金丹以上费用含早期目标没有的材料，故意不备——验证缺料跳过、不停止后续人选。
  sk2.realm = 3
  for (const member of autoSkip.disciples.members) member.cultivation = cultivationRequired(member.realm)
  const skipFee = E.discipleBreakthroughPreview(autoSkip, sk1).cost
  for (const [id, amount] of Object.entries(skipFee)) autoSkip.resources[id] = E.money(amount).times(2)
  E.recompute(autoSkip, autoSkipD)
  const skipResult = E.autoBreakthroughStep(autoSkip, autoSkipD, () => 0)
  ok('自动突破缺料跳过并继续后续人选', skipResult.success === 2 && skipResult.skipped === 1 &&
    sk1.realm === 1 && sk2.realm === 3 && sk3.realm === 1)

  const [autoReserve, autoReserveD] = setup(2, 1)
  autoReserve.upgrades.adaptiveTeaching = true
  autoReserve.settings.autoBreakthrough = true
  autoReserve.settings.autoBreakthroughScope = 'all'
  autoReserve.settings.trainingQiFloorSeconds = 0
  for (const member of autoReserve.disciples.members) member.cultivation = cultivationRequired(0)
  const autoReserveCost = E.realmCost(autoReserve, autoReserveD, autoReserve.realm + 1) || {}
  const autoReserveFee = E.discipleBreakthroughPreview(autoReserve, autoReserve.disciples.members[0]).cost
  for (const [id, amount] of Object.entries(autoReserveCost)) autoReserve.resources[id] = E.money(amount).plus(autoReserveFee[id] ?? E.ZERO)
  for (const [id, amount] of Object.entries(autoReserveFee)) if (autoReserve.resources[id] === undefined) autoReserve.resources[id] = E.money(amount)
  E.recompute(autoReserve, autoReserveD)
  const autoReserveResult = E.autoBreakthroughStep(autoReserve, autoReserveD, () => 0)
  ok('自动突破遵守宗门材料保留并跳过余量不足者', autoReserveResult.success === 1 && autoReserveResult.skipped === 1 &&
    Object.entries(autoReserveCost).every(([id, amount]) => E.moneyGte(autoReserve.resources[id], amount)))

  const [autoFloor, autoFloorD] = setup(1, 4)
  autoFloor.upgrades.adaptiveTeaching = true
  autoFloor.settings.autoBreakthrough = true
  autoFloor.settings.sectBreakthroughReserve = false
  const floorTarget = autoFloor.disciples.members[0]
  E.setDiscipleFocus(autoFloor, autoFloorD, [floorTarget.id], true)
  floorTarget.realm = 3
  floorTarget.cultivation = cultivationRequired(3)
  E.recompute(autoFloor, autoFloorD)
  const autoFloorFee = E.discipleBreakthroughPreview(autoFloor, floorTarget).cost
  const autoFloorReserve = E.money(autoFloorD.upkeep).times(30)
  autoFloor.resources.qi = E.money(autoFloorFee.qi).plus(autoFloorReserve).minus(E.money(0.001))
  for (const [id, amount] of Object.entries(autoFloorFee)) if (id !== 'qi') autoFloor.resources[id] = E.money(amount)
  const floorBlocked = E.autoBreakthroughStep(autoFloor, autoFloorD, () => 0)
  ok('自动突破的灵气支出不得击穿底线', floorBlocked.success === 0 && floorBlocked.skipped === 1 && floorTarget.realm === 3)
  autoFloor.settings.trainingQiFloorSeconds = 0
  const floorAllowed = E.autoBreakthroughStep(autoFloor, autoFloorD, () => 0)
  ok('底线关闭后同一库存允许自动突破', floorAllowed.success === 1 && floorTarget.realm === 4)

  const [autoCap, autoCapD] = setup(1, 4)
  autoCap.upgrades.adaptiveTeaching = true
  autoCap.settings.autoBreakthrough = true
  autoCap.settings.sectBreakthroughReserve = false
  autoCap.settings.trainingQiFloorSeconds = 0
  autoCap.settings.autoBreakthroughCap = 1
  const capMember = autoCap.disciples.members[0]
  E.setDiscipleFocus(autoCap, autoCapD, [capMember.id], true)
  capMember.realm = 2
  capMember.cultivation = cultivationRequired(2)
  const capResult = E.autoBreakthroughStep(autoCap, autoCapD, () => 0)
  ok('目标超过止步境界的弟子不自动突破', capResult.success === 0 && capMember.realm === 2)

  const [autoOffline, autoOfflineD] = setup(2, 1)
  autoOffline.upgrades.adaptiveTeaching = true
  autoOffline.settings.autoBreakthrough = true
  autoOffline.settings.autoBreakthroughScope = 'all'
  autoOffline.settings.sectBreakthroughReserve = false
  autoOffline.settings.trainingQiFloorSeconds = 0
  for (const member of autoOffline.disciples.members) member.cultivation = cultivationRequired(0)
  const offFee = E.discipleBreakthroughPreview(autoOffline, autoOffline.disciples.members[0]).cost
  for (const [id, amount] of Object.entries(offFee)) autoOffline.resources[id] = E.money(amount).times(2)
  E.recompute(autoOffline, autoOfflineD)
  const offSummary = E.simulateOffline(autoOffline, autoOfflineD, 30)
  ok('离线（含 60 秒内精确路径）不自动突破并汇总修满人数', autoOffline.disciples.members.every(member => member.realm === 0) &&
    offSummary.readyToBreak === 2)

  const legacyAuto = normalizeState({ disciples: { total: 1, jobs: {}, rootSeed: 12345 } })
  ok('旧档自动突破默认关闭且口径为默认值', legacyAuto.settings.autoBreakthrough === false &&
    legacyAuto.settings.autoBreakthroughCap === 'sect' && legacyAuto.settings.autoBreakthroughScope === 'focus')
  const badAuto = JSON.parse(JSON.stringify(legacyAuto))
  badAuto.settings.autoBreakthrough = true
  badAuto.settings.autoBreakthroughCap = 99
  badAuto.settings.autoBreakthroughScope = 'everyone'
  const fixedAuto = normalizeState(badAuto)
  ok('自动突破越界设置归一化但保留开关', fixedAuto.settings.autoBreakthrough === true &&
    fixedAuto.settings.autoBreakthroughCap === 'sect' && fixedAuto.settings.autoBreakthroughScope === 'focus')



  const [aid, aidD] = setup(1, 4)
  const am = aid.disciples.members[0]
  am.realm = 3
  am.cultivation = cultivationRequired(3)
  const aidPreview = E.discipleAidPreview(aid, am)
  ok('个人护道按目标境界配置材料与加成', aidPreview.target === 4 && aidPreview.bonus === DISCIPLE_AIDS[4].bonus &&
    Object.keys(aidPreview.cost).length === Object.keys(DISCIPLE_AIDS[4].cost).length &&
    Object.keys(DISCIPLE_AIDS[4].cost).every(res => E.moneyEq(aidPreview.cost[res], DISCIPLE_AIDS[4].cost[res])) && !aidPreview.pending)
  const aidBase = E.discipleBreakthroughPreview(aid, am).chance
  aid.resources.immortalHerb = E.money(DISCIPLE_AIDS[4].cost.immortalHerb)
  const aidApplied = E.applyDiscipleAid(aid, aidD, [am.id])
  ok('护道预付材料并立刻提升本人突破概率', aidApplied.applied === 1 && am.aidBonus === DISCIPLE_AIDS[4].bonus && E.moneyIsZero(aid.resources.immortalHerb) &&
    close(E.discipleBreakthroughPreview(aid, am).chance, Math.min(0.99, aidBase + DISCIPLE_AIDS[4].bonus)))
  ok('已护道不重复支付', E.applyDiscipleAid(aid, aidD, [am.id]).applied === 0)
  for (const [id, amount] of Object.entries(E.discipleBreakthroughPreview(aid, am).cost)) aid.resources[id] = amount
  aid.resources.qi = E.money(100000)
  ok('护道在本次成功后清除', E.breakthroughDisciples(aid, aidD, [am.id], () => 0).success === 1 && am.aidBonus === 0)
  am.realm = 3
  am.cultivation = cultivationRequired(3)
  am.cooldown = 0
  am.aidBonus = DISCIPLE_AIDS[4].bonus
  for (const [id, amount] of Object.entries(E.discipleBreakthroughPreview(aid, am).cost)) aid.resources[id] = amount
  aid.resources.qi = E.money(100000)
  ok('护道在本次失败后同样清除', E.breakthroughDisciples(aid, aidD, [am.id], () => 1).failed === 1 && am.aidBonus === 0)
  const [poor, pd] = setup(2, 4)
  for (const member of poor.disciples.members) { member.realm = 3; member.cultivation = cultivationRequired(3) }
  poor.resources.immortalHerb = E.money(0)
  const poorResult = E.applyDiscipleAid(poor, pd, poor.disciples.members.map(m => m.id))
  ok('护道材料不足即停止且不扣费', poorResult.applied === 0 && poorResult.insufficient && poor.disciples.members.every(m => m.aidBonus === 0))

  const [locked, lockedD] = setup(0, 1)
  ok('未掌握《传功授业》时不开通培养', !lockedD.discipleTrainingUnlocked)
  locked.upgrades.mentorship = true
  E.recompute(locked, lockedD)
  ok('掌握《传功授业》后开通培养', lockedD.discipleTrainingUnlocked)
  const legacyTraining = normalizeState({ disciples: { total: 1, jobs: {}, rootSeed: 12345 } })
  ok('旧档弟子默认未传功、无护道', legacyTraining.disciples.members.every(member => member.mentored === false && member.aidBonus === 0))
}

/** 独立回归入口：研究前后的材料保留门槛，不运行整套弟子检查。 */
export function budgetUnlockRegression(E, { ok }) {
  const state = createInitialState()
  state.realm = 1
  state.disciples.total = 2
  const derived = E.createDerived()
  E.recompute(state, derived)
  for (const member of state.disciples.members) member.cultivation = cultivationRequired(0)
  const ids = state.disciples.members.map(member => member.id)
  const fee = E.discipleBreakthroughPreview(state, state.disciples.members[0]).cost
  for (const [id, amount] of Object.entries(fee)) state.resources[id] = amount.times(2)
  const raw = JSON.stringify(state)
  const before = E.breakthroughDisciples(state, derived, ids, () => 0)
  const learned = normalizeState(JSON.parse(raw))
  learned.upgrades.mentorship = true
  E.recompute(learned, derived)
  const blocked = E.breakthroughDisciples(learned, derived, ids, () => 0)
  learned.settings.sectBreakthroughReserve = false
  const allowed = E.breakthroughDisciples(learned, derived, ids, () => 0)
  ok('材料保留在研究后才生效，关闭后恢复批量突破', before.success === 2 && !before.reserved &&
    blocked.success === 0 && blocked.reserved === 1 && allowed.success === 2)
}

/** 独立回归入口：重点弟子优先取得唯一一份突破材料与传功名额。 */
export function focusPriorityRegression(E, { ok }) {
  const state = createInitialState()
  state.realm = 1
  state.disciples.total = 2
  state.settings.sectBreakthroughReserve = false
  state.settings.mentorLimit = 1
  state.upgrades.mentorship = true
  const derived = E.createDerived()
  E.recompute(state, derived)
  const [ordinary, focused] = state.disciples.members
  focused.focus = true
  for (const member of state.disciples.members) member.cultivation = cultivationRequired(0)
  const fee = E.discipleBreakthroughPreview(state, ordinary).cost
  for (const [id, amount] of Object.entries(fee)) state.resources[id] = amount
  const ids = [ordinary.id, focused.id]
  const result = E.breakthroughDisciples(state, derived, ids, () => 0)
  E.setMentored(state, derived, ids, true)
  ok('重点后入门弟子优先突破及传功，原名单顺序不变', result.success === 1 && focused.realm === 1 &&
    ordinary.realm === 0 && focused.mentored && !ordinary.mentored && state.disciples.members[0] === ordinary)
}
