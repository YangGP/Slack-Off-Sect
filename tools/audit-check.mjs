import assert from 'node:assert/strict'
import { auditResource } from './audit-lib.mjs'
import { BUILDING_MAP } from '../src/data/buildings.js'
import { JOB_MAP } from '../src/data/jobs.js'
import { RESOURCE_MAP } from '../src/data/resources.js'
import { CRAFT_MAP } from '../src/data/crafts.js'
import { progressionDiagnostics } from './progression-diagnostics.mjs'
import { createBot, ADVANCED_CRAFTS } from './player-bot.mjs'
import { createInitialState } from '../src/game/state.js'
import * as E from './engine-fixture.mjs'
import { createAuditContext } from './lib/audit-context.mjs'
import { inspectSave } from './lib/save-report.mjs'
import { modelBreakthroughRisk } from './lib/breakthrough-risk.mjs'
import { BREAKTHROUGH_AIDS } from '../src/data/realms.js'
import { gameRandom } from '../src/game/context.js'
import { measurePacing, pacingOptions, stageProjects, reincarnatePacingState } from './lib/pacing-scenario.mjs'
import { economyAssessment, measureSpecialization } from './lib/pacing-economy.mjs'
import { compareOnlineEconomy } from './offline-check.mjs'
import { powerFixture } from './power-scenarios.mjs'

// 成对报告的开关必须显式有效；记录开关不能改变实际经济状态。
assert.throws(() => pacingOptions(['--hours=NaN']), /范围/)
assert.equal(pacingOptions(['--wall-seconds=7200']).wallSeconds, 7200)
assert.throws(() => pacingOptions(['--wall-seconds=7201']), /范围/)
assert.throws(() => pacingOptions(['--seed=0']), /范围/)
assert.throws(() => pacingOptions(['--aids=almost']), /范围/)
assert.throws(() => pacingOptions(['--visits=daily']), /范围/)
assert.throws(() => pacingOptions(['--unknown=1']), /未知/)
assert.throws(() => pacingOptions(['--decision-seconds=0']), /范围/)
assert.throws(() => pacingOptions(['--batch-actions=25']), /范围/)
assert.throws(() => pacingOptions(['--reincarnations=4']), /范围/)
assert.throws(() => pacingOptions(['--reincarnate-realm=5']), /范围/)
assert.throws(() => pacingOptions(['--reincarnate-preparation=free']), /范围/)
assert.throws(() => pacingOptions(['--stop-realm=6', '--reincarnations=1']), /范围/)
const realmStop = measurePacing({ hours: 2, stopRealm: 1, traceLimit: 0, wallSeconds: 30 })
assert.equal(realmStop.stopReason, 'realm-target')
assert.equal(realmStop.completed, false)
assert.equal(realmStop.final.realm, 1)
assert.equal(realmStop.ascensions.length, 0)
assert.throws(() => pacingOptions(['--details=unknown']), /范围/)
const detailCase = { hours: 600 / 3600, visits: 'waking', decisionSeconds: 150, batchActions: 12, events: 1, traceLimit: 0 }
const fullDetails = measurePacing(detailCase), deferredDetails = measurePacing({ ...detailCase, details: 'decisions' })
assert.deepEqual(fullDetails.final, deferredDetails.final)
assert.deepEqual(fullDetails.attempts, deferredDetails.attempts)
// 用真实结算校验转世边界：不送道果，永久修持保留，世内积累清空。
const rebirthClock = createAuditContext(), rebirthDerived = E.createDerived(), rebirthState = rebirthClock.state
E.recompute(rebirthState, rebirthDerived)
assert.equal(reincarnatePacingState(rebirthState, rebirthDerived), null)
rebirthState.realm = 6
rebirthState.stats.lifeInsight = E.money(200000)
rebirthState.resources.daoHeart = E.money(2)
rebirthState.faithProgression.cultivation.realmDevotion = 1
E.recompute(rebirthState, rebirthDerived)
const expectedRebirthGain = E.reincarnationGain(rebirthState, rebirthDerived)
const startingRebirthKarma = E.money(rebirthState.karma), startingRebirthDao = E.money(rebirthState.dao)
const startingRebirthCount = rebirthState.stats.reincarnations
assert.ok(reincarnatePacingState(rebirthState, rebirthDerived).eq(expectedRebirthGain))
assert.ok(rebirthState.karma.eq(startingRebirthKarma.plus(expectedRebirthGain)))
assert.ok(rebirthState.resources.karma.eq(rebirthState.karma))
assert.ok(rebirthState.dao.eq(startingRebirthDao))
assert.ok(rebirthState.resources.dao.eq(startingRebirthDao))
assert.equal(rebirthState.stats.reincarnations, startingRebirthCount + 1)
assert.equal(rebirthState.realm, 0)
assert.ok(E.lifeInsightOf(rebirthState).isZero())
assert.ok(rebirthState.resources.daoHeart.eq(2))
assert.equal(rebirthState.faithProgression.cultivation.realmDevotion, 1)
const spacedPacing = measurePacing({ hours: 301 / 3600, visits: 'waking', decisionSeconds: 150, batchActions: 12, traceLimit: 0 })
assert.equal(spacedPacing.interactionCount, 3)
assert.equal(spacedPacing.decisionCount, 36)
assert.equal(spacedPacing.activeSeconds, 301)
assert.deepEqual(stageProjects(8), ['splitArray', 'polarizeArray', 'annihilationFurnace'].map(id => ({ id, count: 2 })))
assert.deepEqual(stageProjects(8, false), [])
const tinyPacing = { hours: 10 / 3600, wallSeconds: 60 }
const pacingRecorded = measurePacing(tinyPacing)
const pacingUnrecorded = measurePacing({ ...tinyPacing, traceLimit: 0 })
assert.deepEqual(pacingRecorded.final, pacingUnrecorded.final)
assert.deepEqual(pacingRecorded.attempts, pacingUnrecorded.attempts)
assert.deepEqual(pacingRecorded.final, measurePacing(tinyPacing).final)
assert.equal(pacingRecorded.stopReason, 'horizon')
assert.equal(pacingRecorded.simulatedSeconds, 10)
assert.equal(pacingRecorded.ascensions.length, 0)
assert.equal(pacingRecorded.completed, false)
assert.ok(pacingRecorded.trace.some(row => row.buildDecision.candidates.some(candidate => candidate.reason)))
assert.equal(pacingUnrecorded.trace.length, 0)
assert.ok(pacingUnrecorded.traceDropped > 0)
const briefOfflinePacing = measurePacing({ hours: 0.3, visits: 'three', wallSeconds: 60, traceLimit: 0 })
assert.equal(briefOfflinePacing.simulatedSeconds, 1080)
assert.equal(briefOfflinePacing.activeSeconds, 900)
assert.equal(briefOfflinePacing.cappedSeconds, 0)
assert.equal(briefOfflinePacing.completed, false)
// 默认共享机器人的观察回调本身只读，不得改变原有行动。
const observedClock = createAuditContext(), silentClock = createAuditContext()
const observedDerived = E.createDerived(), silentDerived = E.createDerived()
E.recompute(observedClock.state, observedDerived)
E.recompute(silentClock.state, silentDerived)
let buildObservation = null, reserveObservation = null
createBot(observedClock.state, observedDerived, {
  onBuildDecision: row => { buildObservation = row }, onDecision: row => { reserveObservation = row },
}).act()
createBot(silentClock.state, silentDerived).act()
assert.deepEqual(observedClock.state, silentClock.state)
assert.ok(buildObservation && reserveObservation)
// 只差灵气时保护尾款，仅允许在剩余等待内回本的供气投资；开局仍能自举。
const savingClock = createAuditContext(), savingDerived = E.createDerived()
const saving = savingClock.state
saving.realm = 2
for (const upgrade of E.ALL_UPGRADES) saving.upgrades[upgrade.id] = true
for (const building of E.BUILDINGS) saving.buildings[building.id] = { count: 1, on: true }
saving.buildings.granary.count = 50
E.recompute(saving, savingDerived)
for (const id of Object.keys(saving.resources)) saving.resources[id] = E.money(100000)
saving.resources.qi = E.money(500)
let qiReserve = null
let qiInvestment = E.ZERO, selectedInvestment = null
createBot(saving, savingDerived, { protectBreakthrough: true, realmCost: () => ({ qi: 1700 }),
  breakthrough: () => false, onDecision: row => { qiReserve = row.reserveSource },
  onBuildDecision: row => { selectedInvestment = row.candidates.find(candidate => candidate.id === row.selected) },
  onBuildResult: row => {
    if (!row.bought) return
    assert.equal(row.id, 'spiritField', '攒灵气期间只允许供气设施使用尾款')
    assert.ok(selectedInvestment?.qiSupport, '供气投资必须能在剩余等待内回本')
    qiInvestment = qiInvestment.plus(E.money(row.cost.qi).times(row.bought))
  },
}).act()
assert.equal(qiReserve?.kind, 'breakthrough')
assert.ok(qiInvestment.gt(0), '正供气且可回本的夹具应实际进行供气投资')
assert.ok(saving.resources.qi.eq(E.money(500).minus(qiInvestment)), '除已核对的供气投资外，不得将灵气花到普通制作和可选建设')
const bootClock = createAuditContext(), bootDerived = E.createDerived()
E.recompute(bootClock.state, bootDerived)
createBot(bootClock.state, bootDerived, { protectBreakthrough: true }).act()
assert.ok(bootClock.state.stats.buildingsBuilt > 0, '突破预留不能阻止首座设施自举')
const specializationProbe = measureSpecialization(60)
assert.equal(specializationProbe.rows.length, 6)
for (const row of specializationProbe.rows) {
  assert.deepEqual(row.before.manual, row.after.manual, `${row.id}: 不增加瞬发手动收益或减少费用`)
  assert.ok(row.before.manual.output > 0, `${row.id}: 手动对照必须实际出货，不能比较两次拒绝`)
  assert.ok(row.after.output > row.before.output, `${row.id}: 富料自动加工必须有真实增量`)
  assert.equal(row.before.work, row.after.work, `${row.id}: 效率不能伪造工位扩容`)
  assert.ok(Object.keys(row.after.paid).length > 0, `${row.id}: 专精必须实际支付成本`)
}

// 配方改料后不得继续按已经移除的原料暂停模拟加工。
for (const [id, policy] of Object.entries(ADVANCED_CRAFTS)) {
  const floors = policy.floors || { [policy.base]: policy.floor }
  for (const resource of Object.keys(floors)) assert.ok(CRAFT_MAP[id].cost[resource] > 0, `${id} 的模拟保留料 ${resource} 已不在实际配方中`)
}

// 复现合体材料容量不足：必须追踪尚未解锁的扩仓链。
// 合并后由炼虚档洞天承接中后期扩仓，追踪空间建设链。
const blockedState = createInitialState(), blockedDerived = E.createDerived()
blockedState.realm = 8
blockedState.buildings.warehouse = { count: 10, on: true }
// 此夹具隔离灵气分子仓容；灵机必须足以覆盖扩仓造价，由典籍库提供。
blockedState.buildings.scriptureArchive = { count: Math.ceil(20000 / BUILDING_MAP.scriptureArchive.effects.storage.insight), on: true }
E.recompute(blockedState, blockedDerived)
blockedState.resources.qiParticle = E.money(100)
const blocked = progressionDiagnostics(blockedState, blockedDerived).missing.find(r => r.resource === 'qiParticle')
assert.ok(blocked.capacityBlocked && blocked.have === 100 && blocked.need > blocked.have)
assert.equal(blocked.need, E.moneyToNumber(E.realmCost(blockedState, blockedDerived, 9).qiParticle))
assert.ok(blocked.expansions.some(b => b.id === 'grotto' && !b.unlocked))
assert.equal(blocked.producer.id, 'splitArray')
const prerequisites = createBot(blockedState, blockedDerived).prerequisites()
assert.ok(prerequisites.upgrades.has('earthEssence'))
assert.ok(prerequisites.buildings.has('arcaneVault')) // 法藏提供有限粒子仓容，早于洞天解决此缺口。

// 满员、等待昂贵新住房时，凝晶研究的道札与上游纸料不能被常规建设抢走。
// 凝晶工艺按知识费用重构只耗道札后，改以记录道札的投入验证同一留存逻辑。
const studying = createInitialState(), studyDerived = E.createDerived()
studying.realm = 5
for (const id of ['qiOrigin', 'woodworking', 'talismanArt', 'shapeRune', 'crystalTheory', 'qiPurify', 'liquidArt', 'qiLiquid',
  'preachArt', 'arrayAssembly', 'homePlanning', 'herbStudy', 'prospectStudy', 'earthArt', 'forgeArt', 'forestryArt',
  'qiArt', 'qiGazing', 'fieldTillage', 'earthEssence', 'flowField', 'oralTeaching', 'paperArt',
  'qiRune', 'conductionRune', 'capacityRune', 'steelWorking', 'quarryArt', 'mithrilArt']) studying.upgrades[id] = true
for (const [id, count] of [['hut', 80], ['logHouse', 20], ['library', 150], ['scriptureArchive', 150], ['granary', 20], ['talismanHall', 1], ['forge', 1], ['quarry', 1], ['workshop', 1]]) studying.buildings[id] = { count, on: true }
E.recompute(studying, studyDerived)
studying.disciples.total = studyDerived.maxDisciples
studying.disciples.jobs.farmer = studying.disciples.total
E.recompute(studying, studyDerived)
studying.resources.qi = E.money(1000000)
studying.resources.insight = E.money(10000)
const daoNoteRecipe = CRAFT_MAP.recordDaoNote
const copies = Math.ceil(10 / E.moneyToNumber(E.craftYield(studyDerived, daoNoteRecipe)))
for (const [id, amount] of Object.entries(daoNoteRecipe.cost)) studying.resources[id] = E.moneyMax(studying.resources[id], E.money(amount).times(copies))
// 此用例隔离凝晶知识备料；新增的互市前置由 botDiplomacy 单独覆盖。
const studyBot = createBot(studying, studyDerived, { realmCost: () => ({ crystal: 35 }), breakthrough: () => false,
  allowUpgrade: upgrade => upgrade.id === 'crystalCraft' })
studyBot.act()
assert.ok(E.moneyGte(studying.resources.daoNote, 10), '研究所需道札应先于住房与其他加工留存')
studyBot.act()
assert.ok(studying.upgrades.crystalCraft, '留存道札后应能真实扣费掌握凝晶工艺')
const spiritPrereqs = createBot(studying, studyDerived, { realmCost: () => ({ spiritTalisman: 6 }) }).prerequisites()
assert.ok(spiritPrereqs.upgrades.has('incenseVow'), '灵符投入需要追踪香火岗位的研究来源')
assert.ok(spiritPrereqs.buildings.has('gate'), '灵符投入需要建立香火岗位的建筑来源')
// 口传心授在列（每座典籍库 80 → 112）：60 座时灵机上限 200 + 60×112 = 6920，
// 低于凝晶工艺的 8000 灵机费用，才能真实触发「研究费超仓容」的扩仓追踪。
studying.buildings.scriptureArchive.count = 60
E.recompute(studying, studyDerived)
delete studying.upgrades.crystalCraft
const researchExpansion = createBot(studying, studyDerived, { realmCost: () => ({ crystal: 35 }) }).prerequisites()
assert.ok([...researchExpansion.buildings.keys()].some(id => BUILDING_MAP[id].effects?.storage?.insight > 0), '研究费用超过仓容时应追踪扩仓，不能只看破境灵机需求')

// 香火页研究不在普通availableUpgrades里，明确投资D7时仍须真实学习入口研究。
studying.upgrades.incenseVow = true
studying.buildings.gate = { count: 1, on: true }
studying.resources.faith = E.money(500)
studying.resources.insight = E.money(10000)
E.recompute(studying, studyDerived)
assert.ok(!studyDerived.availableUpgrades.includes('vowPower'))
createBot(studying, studyDerived, { realmCost: () => ({}), breakthrough: () => false,
  upgrades: () => ['vowPower'] }).act()
assert.equal(studying.upgrades.vowPower, true, 'D7策略必须真实购买凝愿法，不能只请求普通页不可见条目')
const beforeAssessment = JSON.stringify(studying)
const assessment = economyAssessment(studying, studyDerived)
assert.equal(JSON.stringify(studying), beforeAssessment, '边际报价不得改变真实经营状态')
assert.ok(assessment.investments.some(row => row.id === 'pillFurnace'))
assert.ok(assessment.investments.some(row => row.id === 'harvestPlatform'))
assert.ok(assessment.recipes.every(row => Number.isFinite(row.efficiency)))
assert.ok(assessment.investments.every(row => Object.values(row.capacityDelta || {}).every(Number.isFinite)),
  '无限容量的相等项不得相减生成NaN并被JSON静默写成null')
assert.ok(compareOnlineEconomy(studying))
assert.ok(compareOnlineEconomy(powerFixture({ chains: 2, core: true, homes: true }).state))
studying.buildings.forge.on = false
E.recompute(studying, studyDerived)
const stoppedForge = economyAssessment(studying, studyDerived).investments.find(row => row.id === 'forge')
assert.deepEqual(stoppedForge.netDelta, {}, '扩建报价不得将已停用的全部炼器坊重新启用并计为新增收益')
studying.buildings.forge.on = true
E.recompute(studying, studyDerived)

const brief = { hours: 1 / 3600 }
const originalCap = RESOURCE_MAP.qi.baseMax
const patched = auditResource({ ...brief, resId: 'qi', patches: { baseMax: 250 } })
assert.ok(E.moneyEq(patched.derived.max.qi, 250))
assert.equal(RESOURCE_MAP.qi.baseMax, originalCap)
assert.throws(() => auditResource({ hours: NaN }), /小时数/)
assert.throws(() => auditResource({ ...brief, patches: { jobFactor: -1 } }), /无效审计数值/)
assert.throws(() => auditResource({ ...brief, patches: { baseMax: 100, prods: [{ buildingId: 'absent', res: 'qi', value: 1 }] } }), /无效建筑产出/)
assert.equal(RESOURCE_MAP.qi.baseMax, originalCap)

// 同一建筑的多次临时覆盖、创建prod字段，以及模拟中途抛错都要完整还原。
const court = BUILDING_MAP.livingCourt
const originalEffects = structuredClone(court.effects)
const originalCost = CRAFT_MAP.infuseStone.cost.qi
const failure = new Error('模拟中途失败')
assert.throws(() => auditResource({
  ...brief,
  patches: { craftQi: 50, prods: [
    { buildingId: 'livingCourt', res: 'qi', value: 2 },
    { buildingId: 'livingCourt', res: 'qi', value: 3 },
  ] },
  thresholds: { [Symbol.iterator]() { throw failure } },
}), error => error === failure)
assert.deepEqual(court.effects, originalEffects)
assert.equal(CRAFT_MAP.infuseStone.cost.qi, originalCost)

// 矿工副产的--job参数必须调整目标资源，且不能连带调整其他矿产。
const miner = JOB_MAP.miner
const originalOre = miner.additionalOutputs[0].base
const originalRock = miner.base
let oreValue = originalOre
const assignments = []
Object.defineProperty(miner.additionalOutputs[0], 'base', {
  configurable: true,
  get() { return oreValue },
  set(value) { assignments.push(value); oreValue = value },
})
try {
  auditResource({ ...brief, resId: 'ore', patches: { jobFactor: 0.5 } })
  assert.deepEqual(assignments, [originalOre * 0.5, originalOre])
} finally {
  Object.defineProperty(miner.additionalOutputs[0], 'base', { value: originalOre, writable: true, enumerable: true, configurable: true })
}
assert.equal(miner.base, originalRock)
const originalStone = miner.secondary.base
auditResource({ ...brief, resId: 'stone', patches: { jobFactor: 0.5 } })
assert.equal(miner.secondary.base, originalStone)
assert.equal(miner.base, originalRock)
console.log('审计工具检查通过：参数、临时修改、异常还原与矿工附产')

// 相同输入不能随现实时间或其他审计的随机消耗而变化。
const firstRun = auditResource({ hours: 0.25 })
auditResource({ hours: 0.1, patches: { baseMax: 250 } })
assert.deepEqual(auditResource({ hours: 0.25 }).state, firstRun.state)
const firstClock = createAuditContext(17), secondClock = createAuditContext(17)
assert.equal(firstClock.advance(2), firstClock.state.createdAt)
assert.equal(firstClock.advance(1), firstClock.state.createdAt + 2000)
assert.deepEqual(Array.from({ length: 8 }, () => gameRandom(firstClock.state)), Array.from({ length: 8 }, () => gameRandom(secondClock.state)))
assert.deepEqual(firstClock.state.disciples, secondClock.state.disciples)
assert.throws(() => createAuditContext(0x100000000), /uint32/)

// 已学营造技艺的存档也按原价报价，与实际扣费一致。
const priced = createInitialState(1800000000000), pricedDerived = E.createDerived()
priced.upgrades.masonryArt = true
priced.buildings.warehouse = { count: 3, on: true }
E.recompute(priced, pricedDerived)
const text = JSON.stringify(priced)
const report = inspectSave(text)
// 报告里的造价是显示用的 Number：逐项按金额口径比较，避免 Decimal/Number 混用。
const warehouseCost = E.buildingCost(priced, 'warehouse', 1)
assert.ok(Object.entries(warehouseCost).every(([res, amount]) => E.moneyEq(report.warehouse.nextCost[res] ?? 0, amount)))
delete priced.upgrades.masonryArt
assert.deepEqual(report.warehouse.nextCost, inspectSave(JSON.stringify(priced)).warehouse.nextCost)
priced.upgrades.masonryArt = true
assert.equal(JSON.stringify(priced), text)
assert.throws(() => inspectSave('{invalid'))
assert.throws(() => inspectSave(JSON.stringify({ ...priced, version: 999 })), /存档版本无法兼容/)

// 对照去掉护道减死亡率的情况，防止报告只算成功率而漏算保命材料。
const aided = modelBreakthroughRisk('aided')
const reductions = Object.values(BREAKTHROUGH_AIDS).flat().filter(aid => aid.deathReduce)
const originalReductions = reductions.map(aid => aid.deathReduce)
try {
  for (const aid of reductions) aid.deathReduce = 0
  const withoutProtection = modelBreakthroughRisk('aided')
  assert.ok(aided.expectedDeaths < withoutProtection.expectedDeaths)
  assert.ok(aided.firstLifeSuccess > withoutProtection.firstLifeSuccess)
} finally {
  reductions.forEach((aid, i) => { aid.deathReduce = originalReductions[i] })
}
assert.ok(aided.expectedTotalAttempts < modelBreakthroughRisk('naked').expectedTotalAttempts)
console.log('审计回归检查通过：重复运行、模拟时钟、存档报价与护道死亡风险')
