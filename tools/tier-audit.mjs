import { createInitialState } from '../src/game/state.js'
import * as E from '../src/game/engine.js'
import { createBot } from './player-bot.mjs'
import { CRAFTS } from '../src/data/crafts.js'
import { REALMS } from '../src/data/realms.js'
import { TECHNIQUES } from '../src/data/techniques.js'

// 同一参照玩家的加工链审计；产能是独立供料上界，不是并发实际收入。
const state = createInitialState()
const hours = Number(process.argv[2] || 24)
const karma = Number(process.argv[3] || 0)
if (!Number.isFinite(hours) || hours <= 0 || !Number.isSafeInteger(karma) || karma < 0) throw new Error('时长需为正数，仙缘需为非负整数')
state.karma = karma
const derived = E.createDerived()
E.recompute(state, derived)
const bot = createBot(state, derived)
for (let t = 1; t <= hours * 3600; t++) {
  E.tick(state, derived, 1, { events: false })
  if (t % 5 === 0) bot.act()
  if (t % 300 === 0) {
    E.recompute(state, derived)
    for (const [res, amount] of Object.entries(state.resources)) {
      if (!Number.isFinite(amount) || amount < -1e-9) throw new Error(`${res} 库存异常：${amount}`)
    }
  }
  if (![8, 16, 24, 48, 72, hours].includes(t / 3600)) continue
  const recipes = CRAFTS.filter(c => E.isCraftUnlocked(state, c)).map(c => ({
    recipe: c.name,
    tier: c.tier || 0,
    primary: c.primary || [],
    yield: +E.craftYield(derived, c).toFixed(3),
    capacityPerSecond: +E.eventResourceRate(state, derived, c.out).toFixed(3),
    effectiveInputs: Object.fromEntries(Object.entries(c.cost).map(([r, n]) => [r, +(n / E.craftYield(derived, c)).toFixed(3)])),
  }))
  const marginal = {}
  for (const id of ['arrayRefine', 'mahayanaArt', 'zhenyueSeal']) {
    if (!state.upgrades[id]) continue
    const technique = TECHNIQUES.find(u => u.id === id)
    const beforeRates = { ...derived.rates }
    const beforeYields = Object.fromEntries(CRAFTS.map(c => [c.out, E.craftYield(derived, c)]))
    const level = state.upgrades[id]
    delete state.upgrades[id]
    E.recompute(state, derived)
    marginal[id] = {
      production: Object.fromEntries(Object.keys(technique.effects.ratio || {}).map(r => [r, derived.rates[r] > 0 ? +((beforeRates[r] / derived.rates[r] - 1) * 100).toFixed(3) : null])),
      crafting: Object.fromEntries(CRAFTS.filter(c => technique.effects.craftBonusByResource?.[c.out]).map(c => [c.out, +((beforeYields[c.out] / E.craftYield(derived, c) - 1) * 100).toFixed(3)])),
    }
    state.upgrades[id] = level
    E.recompute(state, derived)
  }
  console.log(JSON.stringify({ hours: t / 3600, karma, realm: REALMS[state.realm].name, craftSpeed: derived.craftSpeed, ratioAll: derived.ratioAll, craftBonus: derived.craftBonus, rates: derived.rates, marginalPercent: marginal, recipes }))
}
