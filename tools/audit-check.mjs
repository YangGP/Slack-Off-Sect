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

// 配方改料后不得继续按已经移除的原料暂停模拟加工。
for (const [id, policy] of Object.entries(ADVANCED_CRAFTS)) {
  const floors = policy.floors || { [policy.base]: policy.floor }
  for (const resource of Object.keys(floors)) assert.ok(CRAFT_MAP[id].cost[resource] > 0, `${id} 的模拟保留料 ${resource} 已不在实际配方中`)
}

// 复现合体材料容量不足：必须追踪尚未解锁的扩仓链。
// v0.38 起中后期主扩仓由《广储库》(grandStore, realm 7) 承接，洞天退配合体档，故这里追踪广储库链。
const blockedState = createInitialState(), blockedDerived = E.createDerived()
blockedState.realm = 8
blockedState.buildings.depot = { count: 2, on: true }
// 此夹具隔离灵气分子仓容；灵机必须足以覆盖扩仓造价，由典籍库提供。
blockedState.buildings.scriptureArchive = { count: Math.ceil(20000 / BUILDING_MAP.scriptureArchive.effects.storage.insight), on: true }
E.recompute(blockedState, blockedDerived)
blockedState.resources.qiParticle = E.money(100)
const blocked = progressionDiagnostics(blockedState, blockedDerived).missing.find(r => r.resource === 'qiParticle')
assert.ok(blocked.capacityBlocked && blocked.have === 100 && blocked.need === 120)
assert.ok(blocked.expansions.some(b => b.id === 'grandStore' && !b.unlocked))
assert.equal(blocked.producer.id, 'splitArray')
const prerequisites = createBot(blockedState, blockedDerived).prerequisites()
assert.ok(prerequisites.upgrades.has('earthEssence'))
assert.ok(prerequisites.buildings.has('grandStore'))

// 满员、等待昂贵新住房时，凝晶研究的符箓和上游木料不能被常规建设抢走。
const studying = createInitialState(), studyDerived = E.createDerived()
studying.realm = 5
for (const id of ['qiOrigin', 'woodworking', 'talismanArt', 'shapeRune', 'crystalTheory', 'qiPurify', 'liquidArt', 'qiLiquid',
  'preachArt', 'arrayAssembly', 'homePlanning', 'herbStudy', 'prospectStudy', 'earthArt', 'forgeArt', 'forestryArt',
  'qiArt', 'qiGazing', 'fieldTillage', 'earthEssence', 'flowField', 'oralTeaching']) studying.upgrades[id] = true
for (const [id, count] of [['hut', 80], ['logHouse', 20], ['library', 150], ['scriptureArchive', 150], ['granary', 20], ['talismanHall', 1], ['forge', 1], ['quarry', 1], ['workshop', 1]]) studying.buildings[id] = { count, on: true }
E.recompute(studying, studyDerived)
studying.disciples.total = studyDerived.maxDisciples
studying.disciples.jobs.farmer = studying.disciples.total
E.recompute(studying, studyDerived)
studying.resources.qi = E.money(1000000)
studying.resources.insight = E.money(10000)
studying.resources.ore = E.money(80)
const talismanRecipe = CRAFT_MAP.drawTalisman
const copies = Math.ceil(6 / E.moneyToNumber(E.craftYield(studyDerived, talismanRecipe)))
for (const [id, amount] of Object.entries(talismanRecipe.cost)) studying.resources[id] = E.moneyMax(studying.resources[id], E.money(amount).times(copies))
const studyBot = createBot(studying, studyDerived, { realmCost: () => ({ crystal: 35 }), breakthrough: () => false })
studyBot.act()
assert.ok(E.moneyGte(studying.resources.talisman, 6), '研究所需符箓应先于住房与其他加工留存')
studyBot.act()
assert.ok(studying.upgrades.crystalCraft, '留存符箓后应能真实扣费掌握凝晶工艺')
const spiritPrereqs = createBot(studying, studyDerived, { realmCost: () => ({ spiritTalisman: 6 }) }).prerequisites()
assert.ok(spiritPrereqs.upgrades.has('incenseVow'), '灵符投入需要追踪香火岗位的研究来源')
assert.ok(spiritPrereqs.buildings.has('gate'), '灵符投入需要建立香火岗位的建筑来源')
studying.buildings.scriptureArchive.count = 80
E.recompute(studying, studyDerived)
delete studying.upgrades.crystalCraft
const researchExpansion = createBot(studying, studyDerived, { realmCost: () => ({ crystal: 35 }) }).prerequisites()
assert.ok([...researchExpansion.buildings.keys()].some(id => BUILDING_MAP[id].effects?.storage?.insight > 0), '研究费用超过仓容时应追踪扩仓，不能只看破境灵机需求')

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
assert.throws(() => inspectSave(JSON.stringify({ ...priced, version: 999 })), /无法完整兼容/)

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
