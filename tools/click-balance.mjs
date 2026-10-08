import { createInitialState } from '../src/game/state.js'
import * as E from '../src/game/engine.js'
import { createBot } from './player-bot.mjs'
import { REALMS } from '../src/data/realms.js'

const hours = Number(process.argv[2] || 12)
if (!Number.isFinite(hours) || hours <= 0 || hours > 72) throw new Error('小时数需在0~72之间')
// 决策策略相同，仅增加点击；无随机事件。聚合每秒点击不代表真人持续操作。
for (const clicksPerSecond of [0, 1, 4]) {
  const state = createInitialState()
  const derived = E.createDerived()
  E.recompute(state, derived)
  const bot = createBot(state, derived)
  const milestones = {}
  let clickedQi = 0
  for (let t = 1; t <= hours * 3600; t++) {
    for (let i = 0; i < clicksPerSecond; i++) {
      const before = state.resources.qi
      E.drawQi(state, derived)
      clickedQi += state.resources.qi - before
    }
    E.tick(state, derived, 1, { events: false })
    if (t % 5 === 0) bot.act()
    if (state.realm >= 4 && !milestones[REALMS[state.realm].name]) milestones[REALMS[state.realm].name] = +(t / 3600).toFixed(2)
  }
  console.log(JSON.stringify({ clicksPerSecond, realm: REALMS[state.realm].name, milestones, clickedQi: Math.round(clickedQi), clicks: state.stats.clicks }))
}
