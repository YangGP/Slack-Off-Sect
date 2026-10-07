/** Compare equal player strategies at different visit frequencies.
 * Everyone starts with 15 active minutes; each later visit lasts two minutes.
 * Away time only runs production, arrivals and enabled crafting, with the real offline cap.
 * Random events are disabled for reproducible comparisons.
 */
import { createInitialState } from '../src/game/state.js'
import * as E from '../src/game/engine.js'
import { createBot } from './player-bot.mjs'
import { REALMS } from '../src/data/realms.js'

const hours = Number(process.argv[2] || 24)
if (!Number.isFinite(hours) || hours <= 0 || hours > 168) throw new Error('小时数需在 0~168 之间')
const total = Math.floor(hours * 3600)
const profiles = [
  { label: '持续操作', interval: 120 },
  { label: '每15分钟', interval: 900 },
  { label: '每小时', interval: 3600 },
  { label: '每天三次', interval: 28800 },
]
console.log(`比较 ${hours} 小时：共同开局15分钟，每次上线2分钟、每5秒决策；离线不购买/研究/破境，无随机事件。`)
console.log('模式       境界     弟子  建筑  参悟  操作分钟  离线截断小时')
for (const profile of profiles) {
  const state = createInitialState()
  const derived = E.createDerived()
  E.recompute(state, derived)
  const bot = createBot(state, derived)
  let elapsed = 0
  let active = 0
  let lost = 0
  const visit = (seconds) => {
    bot.act()
    for (let t = 1; t <= seconds; t++) {
      E.tick(state, derived, 1, { events: false })
      if (t % 5 === 0) bot.act()
    }
    elapsed += seconds
    active += seconds
  }
  visit(Math.min(total, 900))
  while (elapsed < total) {
    const away = Math.min(profile.interval - 120, total - elapsed)
    const simulated = Math.min(away, derived.offlineHours * 3600)
    E.simulateOffline(state, derived, simulated)
    lost += away - simulated
    elapsed += away
    if (elapsed < total) visit(Math.min(120, total - elapsed))
  }
  console.log(`${profile.label.padEnd(8)} ${REALMS[state.realm].name.padEnd(5)} ${String(state.disciples.total).padStart(4)} ${String(state.stats.buildingsBuilt).padStart(5)} ${String(Object.keys(state.upgrades).length).padStart(5)} ${String(Math.round(active / 60)).padStart(8)} ${(lost / 3600).toFixed(1).padStart(12)}`)
}
