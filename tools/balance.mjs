import { setGameContext } from '../src/game/context.js'
/**
 * 平衡性推演：模拟一个「勤快但不精算」的玩家，看看节奏是否合理。
 * 玩家策略在 tools/player-bot.mjs 里（与 tools/resource-audit.mjs 共用，保证两边结论一致）。
 *
 * 用法：
 *   npm run balance -- [小时数] [初始仙缘]
 */
import { createInitialState } from '../src/game/state.js'
import * as E from './engine-fixture.mjs'
import { createBot } from './player-bot.mjs'
import { REALMS } from '../src/data/realms.js'
import { RESOURCES } from '../src/data/resources.js'
import { progressionDiagnostics } from './progression-diagnostics.mjs'

const HOURS = Number(process.argv[2] || 4)
if (!Number.isFinite(HOURS) || HOURS <= 0 || HOURS > 168) throw new Error('小时数需大于0且不超过168')
const TOTAL = HOURS * 3600
const DECISION_EVERY = 5
let random = () => Math.random()
let simulatedNow = Date.UTC(2026, 9, 11)
const seedInput = process.argv[4]
if (seedInput !== undefined) {
  let seed = Number(seedInput)
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('随机种子需为32位无符号整数')
  random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
}
const isolateFailure = process.argv[5] === 'industry'
if (process.argv[5] !== undefined && !isolateFailure) throw new Error('第五参数仅支持industry，隔离破境失败以验证产业路线')
const attempts = { attempted: 0, success: 0, failed: 0, regression: 0, death: 0 }

const state = createInitialState(simulatedNow)
if (seedInput !== undefined) state.disciples.rootSeed = Number(seedInput)
setGameContext(state, { now: () => simulatedNow, random })
// 可选第三参数：带指定仙缘重修，用同一策略检查后续周目的仓储链。
const karma = Number(process.argv[3] || 0)
if (!Number.isFinite(karma) || karma < 0 || !Number.isInteger(karma)) throw new Error('仙缘需为非负整数')
state.karma = E.money(karma)
const derived = E.createDerived()
E.recompute(state, derived)
const bot = createBot(state, derived, { breakthrough(s, d) {
  if (!REALMS[s.realm + 1] || !E.canAfford(s, E.breakthroughPreview(s, d).cost)) return false
  attempts.attempted++
  const before = s.realm
  const result = isolateFailure ? E.breakthrough(s, d, {}, () => 0) : E.breakthrough(s, d)
  if (result) attempts.success++
  else {
    attempts.failed++
    if (s.realm === 0 && before >= 4) attempts.death++
    else if (s.realm < before) attempts.regression++
  }
  return result
} })

const checkpoints = new Set([
  60, 300, 600, 1800, 3600, 7200, 10800, 14400, 21600, 28800, 36000, 43200, 57600,
])

function snapshot(t) {
  const res = RESOURCES.filter((r) => !r.noProduction)
    .map((r) => `${r.name} ${Math.round(E.moneyToNumber(state.resources[r.id]))}`)
    .join('  ')
  // 灵气出项占比：§5.4 用它衡量「维护费 / 弟子口粮」是不是还在产生决策压力
  const qiIn = E.moneyToNumber(derived.rates.qi)
  const qiOut = E.moneyToNumber(E.money(derived.expense?.qi).neg())
  const outPct = qiIn > 0 ? (qiOut / qiIn) * 100 : 0
  console.log(
    `t=${String(Math.round(t / 60)).padStart(4)}分 | ${REALMS[state.realm].name.padEnd(4)} | 弟子 ${String(
      state.disciples.total,
    ).padStart(3)}/${String(derived.maxDisciples).padStart(3)} | 建筑 ${String(
      state.stats.buildingsBuilt,
    ).padStart(3)} | 参悟 ${String(Object.keys(state.upgrades).length).padStart(2)} | 宜居度 ${Math.round(
      derived.habitability,
    )}点 | 每人粮 ${derived.discipleUpkeep.toFixed(3)}/s | 出项占比 ${outPct.toFixed(1)}% | 灵气净 ${derived.netQi.toFixed(2)}/s`,
  )
  console.log(`          ${res}`)
}

console.log(`模拟 ${HOURS} 小时，初始仙缘 ${karma}，每 ${DECISION_EVERY} 秒决策一次；种子 ${seedInput ?? '随机'}，路线 ${isolateFailure ? '产业（破境必成）' : '自然'}\n`)
let previousRealm = state.realm
let sawEnergy = false
for (let t = 1; t <= TOTAL; t++) {
  simulatedNow += 1000
  E.tick(state, derived, 1, { events: false, startAt: simulatedNow - 1000 })
  if (t % DECISION_EVERY === 0) bot.act()
  if (t % 300 === 0) E.recompute(state, derived)
  if (checkpoints.has(t)) snapshot(t)
  if (t % 21600 === 0) console.log(`推进诊断 ${(t / 3600).toFixed(0)}h：${JSON.stringify(progressionDiagnostics(state, derived))}`)
  if (state.realm !== previousRealm) {
    console.log(`里程碑 ${(t / 3600).toFixed(2)}h：${REALMS[state.realm].name}`)
    previousRealm = state.realm
  }
  if (!sawEnergy && E.moneyIsPositive(state.resources.qiEnergy)) {
    console.log(`里程碑 ${(t / 3600).toFixed(2)}h：首次灵能（${REALMS[state.realm].name}）`)
    sawEnergy = true
  }
}
console.log('\n最终状态：')
snapshot(TOTAL)
console.log(`成就：${Object.keys(state.achievements).length} 条`)
console.log(`累计灵气：${Math.round(E.moneyToNumber(state.stats.totalQi))}，累计灵机：${Math.round(E.moneyToNumber(state.stats.totalInsight))}`)
console.log(`遭遇天灾：${state.stats.disasters} 次，奇遇：${state.stats.eventsSeen} 次`)
console.log(`飞升可得仙缘：${E.ascensionGain(state, derived)}`)
console.log(`破境统计：${JSON.stringify(attempts)}`)
console.log(`最终诊断：${JSON.stringify(progressionDiagnostics(state, derived))}`)
