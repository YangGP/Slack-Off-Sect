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

// 配方改料后不得继续按已经移除的原料暂停模拟加工。
for (const [id, policy] of Object.entries(ADVANCED_CRAFTS)) {
  const floors = policy.floors || { [policy.base]: policy.floor }
  for (const resource of Object.keys(floors)) assert.ok(CRAFT_MAP[id].cost[resource] > 0, `${id} 的模拟保留料 ${resource} 已不在实际配方中`)
}

// 复现合体材料容量不足：必须追踪尚未解锁的洞天扩仓链。
const blockedState = createInitialState(), blockedDerived = E.createDerived()
blockedState.realm = 8
blockedState.buildings.depot = { count: 2, on: true }
// 此夹具隔离灵气分子仓容；灵机必须足以覆盖洞天造价，由典籍库提供。
blockedState.buildings.scriptureArchive = { count: Math.ceil(20000 / BUILDING_MAP.scriptureArchive.effects.storage.insight), on: true }
E.recompute(blockedState, blockedDerived)
blockedState.resources.qiParticle = 100
const blocked = progressionDiagnostics(blockedState, blockedDerived).missing.find(r => r.resource === 'qiParticle')
assert.ok(blocked.capacityBlocked && blocked.have === 100 && blocked.need === 120)
assert.ok(blocked.expansions.some(b => b.id === 'grotto' && !b.unlocked))
assert.equal(blocked.producer.id, 'splitArray')
const prerequisites = createBot(blockedState, blockedDerived).prerequisites()
assert.ok(prerequisites.upgrades.has('grottoArt'))
assert.ok(prerequisites.buildings.has('grotto'))

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
studying.resources.qi = 1000000
studying.resources.insight = 10000
studying.resources.ore = 80
const talismanRecipe = CRAFT_MAP.drawTalisman
const copies = Math.ceil(6 / E.craftYield(studyDerived, talismanRecipe))
for (const [id, amount] of Object.entries(talismanRecipe.cost)) studying.resources[id] = Math.max(studying.resources[id], amount * copies)
const studyBot = createBot(studying, studyDerived, { realmCost: () => ({ crystal: 35 }), breakthrough: () => false })
studyBot.act()
assert.ok(studying.resources.talisman >= 6, '研究所需符箓应先于住房与其他加工留存')
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
assert.equal(patched.derived.max.qi, 250)
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
