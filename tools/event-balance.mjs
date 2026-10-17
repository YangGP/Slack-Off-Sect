import { setGameContext } from '../src/game/context.js'
import * as E from './engine-fixture.mjs'
import { createInitialState } from '../src/game/state.js'
import { createBot } from './player-bot.mjs'
import { EVENT_MAP } from '../src/data/events.js'
import { REALMS } from '../src/data/realms.js'
// 固定随机种子、模拟时钟；选择策略按仓储占比估价，收益不够就放弃。
// 用于事件回归比较，不代表真人玩法或最优选择。
const hours = Number(process.argv[2] || 16)
const karma = Number(process.argv[3] || 0)
if (!Number.isFinite(hours) || hours <= 0 || hours > 168) throw new Error('小时数必须为正数')
if (!Number.isFinite(karma) || karma < 0) throw new Error('仙缘必须为非负数')
for (const [seed, response] of [[0, 'none'], [17, 'active'], [17, 'default'], [83, 'active'], [83, 'default']]) {
  let rng = seed || 1
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296 }
  let now = 1800000000000
  const s = createInitialState(now)
  setGameContext(s, { now: () => now, random })
  s.karma = E.money(karma)
  const d = E.createDerived()
  E.recompute(s, d)
  const bot = createBot(s, d)
  let invalid = false
  let declined = 0
  const threats = { choices: {}, spent: {}, herbLost: 0 }
  const milestones = {}
  for (let t = 1; t <= hours * 3600; t++) {
    now += 1000
    E.tick(s, d, 1, { events: seed !== 0, startAt: now - 1000 })
    if (t % 5 === 0) {
      if (s.pendingChoice) {
        const event = EVENT_MAP[s.pendingChoice.id]
        let index = event.options.findIndex(o => o.effect.decline || o.effect.beastResponse === 'default')
        let best = 0
        if (event.threat && response === 'active') {
          // 轮流尝试三条主动路径，缺料则采用收缩；不把安宁当作物资收益估价。
          const count = Object.values(threats.choices).reduce((sum, n) => sum + n, 0)
          const preferred = count % 3
          index = E.eventOutcome(s, d, event.options[preferred].effect).affordable ? preferred : 2
        }
        if (!event.threat) event.options.forEach((o, i) => {
          const result = E.eventOutcome(s, d, o.effect)
          if (!result.affordable) return
          // 收益与仓容都是金额：先在 Decimal 域求净收益，再按仓容占比降到 Number 估价。
          const score = result.rows.reduce((sum, row) => sum +
            E.moneyToNumber(E.moneySubtract(row.gained, row.lost)) / Math.max(1, E.moneyToNumber(d.max[row.res])), 0)
          if (score > best) { best = score; index = i }
        })
        if (event.threat) {
          const effect = event.options[index].effect
          const result = E.eventOutcome(s, d, effect)
          threats.choices[effect.beastResponse] = (threats.choices[effect.beastResponse] || 0) + 1
          for (const [res, amount] of Object.entries(result.required)) threats.spent[res] = E.money(threats.spent[res]).plus(amount)
          threats.herbLost = E.money(threats.herbLost).plus(result.rows.find(row => row.res === 'herb')?.lost ?? E.ZERO)
        }
        if (event.options[index].effect.decline) declined++
        E.resolveChoice(s, d, index)
        E.recompute(s, d)
      }
      bot.act()
    }
    if (s.realm >= 4 && !milestones[REALMS[s.realm].name]) milestones[REALMS[s.realm].name] = (t / 3600).toFixed(2)
    if (Object.values(s.resources).some(v => !E.moneyFinite(v) || E.moneyLt(v, 0))) invalid = true
  }
  // 报告边界：金额统一降到 Number 再输出。
  const report = {
    ...threats,
    spent: Object.fromEntries(Object.entries(threats.spent).map(([res, amount]) => [res, E.moneyToNumber(amount)])),
    herbLost: E.moneyToNumber(threats.herbLost),
  }
  console.log(JSON.stringify({ seed, karma, response, events: s.stats.eventsSeen, choices: s.stats.choicesMade, declined, realm: REALMS[s.realm].name, milestones, threats: report, invalid }))
  if (invalid) process.exitCode = 1
}
