import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { parseImport, serialize } from '../src/game/save.js'
import { createDerived, recompute, simulateOffline, simulateOfflineAsync } from '../src/game/engine.js'
import { setGameContext } from '../src/game/context.js'

// 用真实存档测量离线补算；仅操作内存副本，输出快照可用于前后逐项比较。
const [input, duration = '3600', output, mode = 'optimized'] = process.argv.slice(2)
if (!input) throw new Error('Usage: offline-benchmark.js <save.txt> [seconds] [output.json] [optimized|reference|async]')
if (!['optimized', 'reference', 'async'].includes(mode)) throw new Error('Unknown benchmark mode')
const seconds = Number(duration)
if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 168 * 3600) throw new Error('seconds must be positive and at most 168 hours')
if (output) {
  const target = existsSync(output) ? realpathSync(output) : resolve(output)
  const source = realpathSync(input)
  if (process.platform === 'win32' ? target.toLowerCase() === source.toLowerCase() : target === source) {
    throw new Error('Benchmark output must not overwrite the input save')
  }
}
const state = parseImport(readFileSync(input, 'utf8'))
if (state.__recoveryNotice) throw new Error(state.__recoveryNotice)
const derived = createDerived()
let seed = 12345
setGameContext(state, { now: () => state.lastSaveAt, random: () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
} })
recompute(state, derived)
const start = performance.now()
let yields = 0, longestBatchMs = 0, batchStart = null
const options = { startAt: state.lastSaveAt, cacheEconomy: mode !== 'reference', economyDetails: mode === 'reference' }
const result = mode === 'async' ? await simulateOfflineAsync(state, derived, seconds, { ...options,
  yieldControl: () => {
    if (batchStart !== null) longestBatchMs = Math.max(longestBatchMs, performance.now() - batchStart)
    yields++
    return new Promise(resolve => setTimeout(() => { batchStart = performance.now(); resolve() }, 0))
  } }) : simulateOffline(state, derived, seconds, options)
if (batchStart !== null) longestBatchMs = Math.max(longestBatchMs, performance.now() - batchStart)
const elapsedMs = performance.now() - start
console.log(JSON.stringify({ mode, seconds, elapsedMs: Math.round(elapsedMs), members: state.disciples.total,
  ...(mode === 'async' ? { yields, longestBatchMs: Math.round(longestBatchMs * 10) / 10 } : {}) }))
if (process.env.OFFLINE_BENCH_DETAILS) console.log(JSON.stringify({ buildingSupply: derived.buildingSupply,
  upgradeSupply: derived.upgradeSupply, trainingCost: derived.trainingCost, maintenance: derived.maintenance }))
if (output) writeFileSync(output, JSON.stringify({ state: serialize(state, state.lastTickAt), result, seed }))
