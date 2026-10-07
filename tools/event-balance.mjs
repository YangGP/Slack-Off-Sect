import * as E from '../src/game/engine.js'
import { createInitialState } from '../src/game/state.js'
import { createBot } from './player-bot.mjs'
import { EVENT_MAP } from '../src/data/events.js'
import { REALMS } from '../src/data/realms.js'
// 固定随机种子、模拟时钟；选择策略按仓储占比估价，收益不够就放弃。
// 用于事件回归比较，不代表真人玩法或最优选择。
const hours = Number(process.argv[2] || 16)
if (!Number.isFinite(hours) || hours <= 0) throw new Error('小时数必须为正数')
const realNow = Date.now
const realRandom = Math.random
for (const seed of [0, 17, 83]) {
  let rng = seed || 1
  Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296 }
  let now = 1800000000000
  Date.now = () => now
  const s = createInitialState()
  const d = E.createDerived()
  E.recompute(s, d)
  const bot = createBot(s, d)
  let invalid = false
  let declined = 0
  const milestones = {}
  for (let t = 1; t <= hours * 3600; t++) {
    now += 1000
    E.tick(s, d, 1, { events: seed !== 0 })
    if (t % 5 === 0) {
      if (s.pendingChoice) {
        const event = EVENT_MAP[s.pendingChoice.id]
        let index = event.options.findIndex(o => o.effect.decline)
        let best = 0
        event.options.forEach((o, i) => {
          const result = E.eventOutcome(s, d, o.effect)
          if (!result.affordable) return
          const score = result.rows.reduce((sum, row) => sum + (row.gained - row.lost) / Math.max(1, d.max[row.res]), 0)
          if (score > best) { best = score; index = i }
        })
        if (event.options[index].effect.decline) declined++
        E.resolveChoice(s, d, index)
        E.recompute(s, d)
      }
      bot.act()
    }
    if (s.realm >= 4 && !milestones[REALMS[s.realm].name]) milestones[REALMS[s.realm].name] = (t / 3600).toFixed(2)
    if (Object.values(s.resources).some(v => !Number.isFinite(v) || v < 0)) invalid = true
  }
  console.log(JSON.stringify({ seed, events: s.stats.eventsSeen, choices: s.stats.choicesMade, declined, realm: REALMS[s.realm].name, milestones, invalid }))
  if (invalid) process.exitCode = 1
}
Date.now = realNow
Math.random = realRandom
