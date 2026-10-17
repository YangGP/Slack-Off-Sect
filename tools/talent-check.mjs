import { createInitialState, normalizeState } from '../src/game/state.js'
import { newDisciple, cultivationRate, cultivationRequired, cultivateDisciple } from '../src/data/disciples.js'
import { TALENTS, TALENT_MAP, TALENT_TIERS, birthTalents, rollTalent, normalizeTalents, talentBonus, talentMatches, gainBreakthroughTalent, upgradeTalent, talentValue, talentDescription } from '../src/data/talents.js'
import { exportJson, parseImport } from '../src/game/save.js'

export function runTalentChecks(E, ok, close) {
  const sequence = values => { let index = 0; return () => values[index++] ?? 0 }
  const categories = list => list.map(entry => TALENT_MAP[entry.id]?.category)
  ok('天赋库包含32条有效固定身份，品级权重总计100', TALENTS.length === 32 && new Set(TALENTS.map(meta => meta.id)).size === 32 && TALENT_TIERS.reduce((sum, tier) => sum + tier.weight, 0) === 100)
  for (const [roll, count] of [[0, 0], [0.699999, 0], [0.7, 1], [0.949999, 1], [0.95, 2], [0.999999, 2]]) {
    ok(`先天天赋数量边界${roll}`, birthTalents(sequence([roll])).length === count)
  }
  let total = 0
  for (const tier of TALENT_TIERS) {
    const talent = rollTalent([], sequence([total / 100, 0]))
    ok(`${tier.name}级天赋抽取边界`, TALENT_MAP[talent.id].tier === tier.id)
    total += tier.weight
  }
  const two = birthTalents(sequence([0.99]))
  ok('入宗两条天赋不重复身份或类别', two.length === 2 && new Set(categories(two)).size === 2)
  const full = [{ id: 'cultivation_huang', level: 1 }, { id: 'breakthrough_huang', level: 1 }, { id: 'job_miner_huang', level: 1 }]
  let draws = 0
  ok('满三条不抽取、不扰动序列', !rollTalent(full, () => { draws++; return 0 }) && !gainBreakthroughTalent({}, { talents: full }, () => { draws++; return 0 }) && draws === 0)
  const last = rollTalent(full.slice(0, 2), sequence([0.9999, 0]))
  ok('已占成长和突破类别时只抽岗位专长，天级岗位词条已入池', TALENT_MAP[last.id].category === 'job' &&
    TALENT_MAP[last.id].tier === 'tian' && !!TALENT_MAP[last.id].jobId && TALENT_MAP[last.id].values.length === 3)
  const normalized = normalizeTalents([{ id: 'constructor', level: 1 }, { id: '__proto__', level: 1 }, { id: 'unknown', level: 1 }, { id: 'cultivation_xuan', level: 999 },
    { id: 'cultivation_tian', level: 1 }, ...full])
  ok('异常词条归一化保留固定身份并去重类别、等级封顶Lv.3', normalized.length === 3 && normalized[0].id === 'cultivation_xuan' && normalized[0].level === 3 &&
    normalized[1].level === 1 && normalized[2].level === 1)
  const normal = { realm: 0, cultivation: 0, cooldown: 60, spiritualRoot: 'triple', talents: [full[0]] }
  const heaven = { ...normal, spiritualRoot: 'heaven', talents: [{ id: 'cultivation_tian', level: 1 }] }
  ok('修炼天赋乘灵根，天灵根与天级词条合计速度3', close(cultivationRate(normal), 1.1) && close(cultivationRate(heaven), 3))
  cultivateDisciple(heaven, 10)
  ok('调息按真实秒数，修炼按天赋加速', heaven.cooldown === 50 && heaven.cultivation === 30)
  ok('天赋筛选区分类别、岗位专长与无天赋', talentMatches({ talents: full }, 'job:miner') && !talentMatches({ talents: full }, 'job:farmer') && talentMatches({ talents: [] }, 'none') && talentMatches({ talents: full }, 'cultivation'))
  const upgradable = { talents: [{ id: 'cultivation_huang', level: 2 }, { id: 'breakthrough_huang', level: 1 }, { id: 'job_miner_huang', level: 1 }] }
  ok('升级优先提升等级最低者', upgradeTalent({}, upgradable, () => 0) === upgradable.talents[1] && upgradable.talents[1].level === 2 && upgradable.talents[0].level === 2)
  const tie = { talents: [{ id: 'cultivation_huang', level: 1 }, { id: 'breakthrough_huang', level: 1 }] }
  ok('同级升级取获取顺序最早一条', upgradeTalent({}, tie, () => 0) === tie.talents[0] && tie.talents[0].level === 2 && tie.talents[1].level === 1)
  const maxed = { talents: [{ id: 'cultivation_huang', level: 3 }] }
  let upgradeDraws = 0
  ok('已满级不判定升级、不消耗随机数', upgradeTalent({}, maxed, () => { upgradeDraws++; return 0 }) === null && upgradeDraws === 0 && maxed.talents[0].level === 3)
  const missedUpgrade = { talents: [{ id: 'cultivation_huang', level: 1 }] }
  ok('未达40%升级边界不提升', upgradeTalent({}, missedUpgrade, () => 0.4) === null && missedUpgrade.talents[0].level === 1)
  ok('效果值与说明随等级放大，天级岗位词条入池', Math.round(talentValue(TALENT_MAP.cultivation_tian, 3) * 100) === 90 &&
    talentDescription(TALENT_MAP.job_miner_tian, 1).includes('+50%') && TALENT_MAP.job_miner_tian.name === '山灵共鸣' &&
    talentDescription(TALENT_MAP.cultivation_di, 2).includes('+52%'))
  const data = { nextId: 1, rootSeed: 12345, talentSeed: 2000 }
  const rootOnly = { ...data }
  const originalRoot = newDisciple(rootOnly, null, { legacy: true })
  const born = newDisciple(data)
  ok('天赋抽取不改变灵根随机序列', born.spiritualRoot === originalRoot.spiritualRoot && data.rootSeed === rootOnly.rootSeed)
  const before = JSON.parse(JSON.stringify(data))
  const continued = newDisciple(data)
  ok('保存序列后可确定性续接新弟子与天赋', JSON.stringify(continued) === JSON.stringify(newDisciple(before)))
  const legacy = normalizeState({ disciples: { total: 2, jobs: {}, rootSeed: 12345 } })
  const seed = legacy.disciples.talentSeed
  const loaded = normalizeState(JSON.parse(JSON.stringify(legacy)))
  ok('旧人数档补空天赋，重复读取不随机补发或推进种子', loaded.disciples.members.every(member => member.talents.length === 0) && loaded.disciples.talentSeed === seed)

  const initial = createInitialState(1000000)
  initial.realm = 4
  initial.buildings = { hut: { count: 1, on: true }, quarry: { count: 1, on: true }, spiritQuarry: { count: 1, on: true } }
  initial.upgrades.prospectStudy = true
  initial.disciples.total = 2
  initial.disciples.jobs.miner = 2
  const state = normalizeState(initial), derived = E.createDerived()
  const [specialist, ordinary] = state.disciples.members
  specialist.talents = [{ id: 'job_miner_xuan', level: 1 }]
  E.recompute(state, derived)
  const upkeep = derived.upkeep
  ok('混合矿工只增加对应个人权重，口粮仍按人数境界', close(derived.discipleJobWeights.miner, 2.2) && close(derived.discipleWeight, 2) && close(upkeep, 1))
  const rates = Object.fromEntries(['rock', 'ore', 'stone'].map(id => [id, derived.sources[id]?.find(row => row.kind === 'job')?.value]))
  specialist.talents = []
  E.recompute(state, derived)
  ok('矿工专长同时作用于已开放副产出，建筑和口粮不变', Object.entries(rates).every(([id, rate]) => E.moneyIsPositive(rate) && close(rate.div(derived.sources[id].find(row => row.kind === 'job').value), 1.1)) && close(derived.upkeep, upkeep))
  specialist.talents = [{ id: 'job_miner_xuan', level: 1 }]
  E.assignDisciples(state, derived, [specialist.id], 'woodcutter')
  ok('调到其他岗位后专长保留但不生效', close(derived.discipleJobWeights.woodcutter, 1) && talentBonus(specialist, 'job') === 0 && specialist.talents.length === 1)
  ordinary.realm = 3
  ordinary.cultivation = cultivationRequired(3)
  ordinary.talents = [{ id: 'breakthrough_tian', level: 1 }]
  ok('个人破境天赋叠加百分点，金丹同境指导为43%', close(E.discipleBreakthroughPreview(state, ordinary).chance, 0.43))
  state.realm = 10
  ordinary.realm = 0
  ok('宗门指导与个人天赋合计仍封顶99%', close(E.discipleBreakthroughPreview(state, ordinary).chance, 0.99))
  ordinary.talents = []
  ordinary.realm = 3
  state.realm = 4
  ordinary.cultivation = cultivationRequired(3)
  Object.assign(state.resources, E.discipleBreakthroughPreview(state, ordinary).cost)
  state.disciples.talentSeed = 2000
  const rootSeed = state.disciples.rootSeed
  let breakthroughDraws = 0
  const result = E.breakthroughDisciples(state, derived, [ordinary.id], () => { breakthroughDraws++; return 0 })
  ok('实际成功突破后独立抽取天赋，不额外消耗突破或灵根随机', result.success === 1 && ordinary.talents.length === 1 && breakthroughDraws === 1 && state.disciples.rootSeed === rootSeed)
  const persisted = parseImport(exportJson(state))
  ok('天赋身份、等级与独立种子导出后保持一致', state.disciples.members.every(member =>
    JSON.stringify(persisted.disciples.members.find(saved => saved.id === member.id)?.talents) === JSON.stringify(member.talents)) &&
    persisted.disciples.talentSeed === state.disciples.talentSeed && persisted.disciples.rootSeed === state.disciples.rootSeed)
  const failure = { talents: [] }
  ok('未达10%获取边界不新增；命中时仅新增一条', !gainBreakthroughTalent({}, failure, () => 0.1) && gainBreakthroughTalent({}, failure, sequence([0.099999, 0, 0])) && failure.talents.length === 1)
  const offline = normalizeState(JSON.parse(JSON.stringify(state)))
  const od = E.createDerived()
  const talentBefore = JSON.stringify(offline.disciples.members.map(member => member.talents))
  const seedBefore = offline.disciples.talentSeed
  offline.buildings.hut.count = 0
  E.simulateOffline(offline, od, 10, { startAt: 1000000 })
  ok('离线只修炼，既有个体不因修满或调息随机获得天赋', JSON.stringify(offline.disciples.members.map(member => member.talents)) === talentBefore && offline.disciples.talentSeed === seedBefore)
  const arrivals = createInitialState(1000000)
  arrivals.realm = 1
  arrivals.buildings = { spiritField: { count: 100, on: true }, hut: { count: 1, on: true } }
  arrivals.disciples.talentSeed = 1500
  const online = normalizeState(arrivals), away = normalizeState(arrivals)
  const onlineDerived = E.createDerived(), awayDerived = E.createDerived()
  for (let second = 0; second < 20; second++) E.tick(online, onlineDerived, 1, { startAt: 1000000 + second * 1000, events: false })
  E.simulateOffline(away, awayDerived, 20, { startAt: 1000000 })
  ok('真实在线及离线收徒取得相同天赋序列，只成长入门后的时间',
    online.disciples.members[0].talents.length === 1 && JSON.stringify(online.disciples) === JSON.stringify(away.disciples) &&
    close(away.disciples.members[0].cultivation, 5 * cultivationRate(away.disciples.members[0])))
}
