import assert from 'node:assert/strict'
import { auditResource } from './audit-lib.mjs'
import { BUILDING_MAP } from '../src/data/buildings.js'
import { JOB_MAP } from '../src/data/jobs.js'
import { RESOURCE_MAP } from '../src/data/resources.js'
import { CRAFT_MAP } from '../src/data/crafts.js'
import { progressionDiagnostics } from './progression-diagnostics.mjs'
import { createBot } from './player-bot.mjs'
import { createInitialState } from '../src/game/state.js'
import * as E from './engine-fixture.mjs'

// 复现合体材料容量不足：必须追踪尚未解锁的洞天扩仓链。
const blockedState = createInitialState(), blockedDerived = E.createDerived()
blockedState.realm = 8
blockedState.buildings.depot = { count: 2, on: true }
// 此夹具隔离灵气分子仓容；灵机必须足以覆盖洞天造价，不绑定藏经阁单座容量。
blockedState.buildings.library = { count: Math.ceil(20000 / BUILDING_MAP.library.effects.storage.insight), on: true }
E.recompute(blockedState, blockedDerived)
blockedState.resources.qiParticle = 100
const blocked = progressionDiagnostics(blockedState, blockedDerived).missing.find(r => r.resource === 'qiParticle')
assert.ok(blocked.capacityBlocked && blocked.have === 100 && blocked.need === 120)
assert.ok(blocked.expansions.some(b => b.id === 'grotto' && !b.unlocked))
assert.equal(blocked.producer.id, 'splitArray')
const prerequisites = createBot(blockedState, blockedDerived).prerequisites()
assert.ok(prerequisites.upgrades.has('grottoArt'))
assert.ok(prerequisites.buildings.has('grotto'))

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
