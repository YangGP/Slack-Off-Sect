/**
 * 平衡性推演：模拟一个「勤快但不精算」的玩家，看看节奏是否合理。
 * 玩家策略在 tools/player-bot.mjs 里（与 tools/resource-audit.mjs 共用，保证两边结论一致）。
 *
 * 用法：
 *   node --import <shim> node_modules/vite/bin/vite.js build --ssr tools/balance.mjs --outDir .smoke-balance
 *   node .smoke-balance/balance.js [小时数]
 */
import { createInitialState } from '../src/game/state.js'
import * as E from '../src/game/engine.js'
import { createBot } from './player-bot.mjs'
import { REALMS } from '../src/data/realms.js'
import { RESOURCES } from '../src/data/resources.js'

const HOURS = Number(process.argv[2] || 4)
const TOTAL = HOURS * 3600
const DECISION_EVERY = 5

const state = createInitialState()
// 可选第三参数：带指定仙缘重修，用同一策略检查后续周目的仓储链。
const karma = Number(process.argv[3] || 0)
if (!Number.isFinite(karma) || karma < 0 || !Number.isInteger(karma)) throw new Error('仙缘需为非负整数')
state.karma = karma
const derived = E.createDerived()
E.recompute(state, derived)
const bot = createBot(state, derived)

const checkpoints = new Set([
  60, 300, 600, 1800, 3600, 7200, 10800, 14400, 21600, 28800, 36000, 43200, 57600,
])

function snapshot(t) {
  const res = RESOURCES.filter((r) => !r.noProduction)
    .map((r) => `${r.name} ${Math.round(state.resources[r.id] || 0)}`)
    .join('  ')
  // 灵气出项占比：§5.4 用它衡量「维护费 / 弟子口粮」是不是还在产生决策压力
  const qiIn = derived.rates.qi || 0
  const qiOut = -(derived.expense?.qi || 0)
  const outPct = qiIn > 0 ? (qiOut / qiIn) * 100 : 0
  console.log(
    `t=${String(Math.round(t / 60)).padStart(4)}分 | ${REALMS[state.realm].name.padEnd(4)} | 弟子 ${String(
      state.disciples.total,
    ).padStart(3)}/${String(derived.maxDisciples).padStart(3)} | 建筑 ${String(
      state.stats.buildingsBuilt,
    ).padStart(3)} | 参悟 ${String(Object.keys(state.upgrades).length).padStart(2)} | 宜居度 ${Math.round(
      derived.habitability,
    )}% | 每人粮 ${derived.discipleUpkeep.toFixed(3)}/s | 出项占比 ${outPct.toFixed(1)}% | 灵气净 ${derived.netQi.toFixed(2)}/s`,
  )
  console.log(`          ${res}`)
}

console.log(`模拟 ${HOURS} 小时，初始仙缘 ${karma}，每 ${DECISION_EVERY} 秒决策一次\n`)
let previousRealm = state.realm
let sawEnergy = false
for (let t = 1; t <= TOTAL; t++) {
  E.tick(state, derived, 1, { events: false })
  if (t % DECISION_EVERY === 0) bot.act()
  if (t % 300 === 0) E.recompute(state, derived)
  if (checkpoints.has(t)) snapshot(t)
  if (state.realm !== previousRealm) {
    console.log(`里程碑 ${(t / 3600).toFixed(2)}h：${REALMS[state.realm].name}`)
    previousRealm = state.realm
  }
  if (!sawEnergy && state.resources.qiEnergy > 0) {
    console.log(`里程碑 ${(t / 3600).toFixed(2)}h：首次灵能（${REALMS[state.realm].name}）`)
    sawEnergy = true
  }
}
console.log('\n最终状态：')
snapshot(TOTAL)
console.log(`成就：${Object.keys(state.achievements).length} 条`)
console.log(`累计灵气：${Math.round(state.stats.totalQi)}，累计灵机：${Math.round(state.stats.totalInsight)}`)
console.log(`遭遇天灾：${state.stats.disasters} 次，奇遇：${state.stats.eventsSeen} 次`)
console.log(`飞升可得仙缘：${E.ascensionGain(state, derived)}`)
