import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { parseImport, serialize } from '../src/game/save.js'
import { createDerived, recompute, simulateOffline, simulateOfflineAsync } from '../src/game/engine.js'
import { setGameContext } from '../src/game/context.js'
import { longOfflineFixture, OFFLINE_FIXTURE_START } from './lib/offline-fixture.mjs'

// 用真实存档或被允许的专项夹具测量离线补算；仅操作内存副本，输出快照可用于前后逐项比较。
// async 模式一批只跑一段，因此 longestSegmentMs 就是「最长连续计算段」。
const BENCH_MODES = ['optimized', 'reference', 'async']
let [input, duration = '3600', output, mode = 'optimized'] = process.argv.slice(2)
if (!input) throw new Error('Usage: offline-benchmark.js <save.txt|--fixture> [seconds] [output.json] [optimized|reference|async]')
// 省略输出快照时模式会落到 output 位：识别出来当模式用，免得把模式名写成文件。
if (BENCH_MODES.includes(output) && mode === 'optimized') {
  mode = output
  output = undefined
}
if (!BENCH_MODES.includes(mode)) throw new Error('Unknown benchmark mode')
const seconds = Number(duration)
if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 168 * 3600) throw new Error('seconds must be positive and at most 168 hours')
const fixture = input === '--fixture'
if (output) {
  const target = existsSync(output) ? realpathSync(output) : resolve(output)
  if (!fixture) {
    const source = realpathSync(input)
    if (process.platform === 'win32' ? target.toLowerCase() === source.toLowerCase() : target === source) {
      throw new Error('Benchmark output must not overwrite the input save')
    }
  }
}
const state = fixture ? longOfflineFixture(OFFLINE_FIXTURE_START) : parseImport(readFileSync(input, 'utf8'))
if (state.__recoveryNotice) throw new Error(state.__recoveryNotice)
const derived = createDerived()
let seed = 12345
setGameContext(state, { now: () => state.lastSaveAt, random: () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
} })
recompute(state, derived)
const start = performance.now()
let yields = 0, longestSegmentMs = 0, batchStart = null
const options = { startAt: state.lastSaveAt, cacheEconomy: mode !== 'reference', economyDetails: mode === 'reference' }
const result = mode === 'async' ? await simulateOfflineAsync(state, derived, seconds, { ...options,
  maxBatchSteps: 1,
  yieldControl: () => {
    if (batchStart !== null) longestSegmentMs = Math.max(longestSegmentMs, performance.now() - batchStart)
    yields++
    return new Promise(resolve => setTimeout(() => { batchStart = performance.now(); resolve() }, 0))
  } }) : simulateOffline(state, derived, seconds, options)
if (batchStart !== null) longestSegmentMs = Math.max(longestSegmentMs, performance.now() - batchStart)
const elapsedMs = performance.now() - start
console.log(JSON.stringify({ mode, source: fixture ? 'fixture' : 'save', seconds, elapsedMs: Math.round(elapsedMs),
  members: state.disciples.total, segments: result.segments ?? null, baseSegments: result.baseSegments ?? null,
  industryRounds: result.industryRounds ?? null, huntBatches: result.huntBatches ?? null,
  ...(mode === 'async' ? { yields, longestSegmentMs: Math.round(longestSegmentMs * 10) / 10 } : {}) }))
if (process.env.OFFLINE_BENCH_DETAILS) console.log(JSON.stringify({ buildingSupply: derived.buildingSupply,
  upgradeSupply: derived.upgradeSupply, trainingCost: derived.trainingCost, maintenance: derived.maintenance }))
if (output) writeFileSync(output, JSON.stringify({ state: serialize(state, state.lastTickAt), result, seed }))
