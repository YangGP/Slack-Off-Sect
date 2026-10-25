// 策略参考 Kitten Scientists 的 stock / consume / trigger 设计，按本地引擎接口重写。
// https://github.com/zhaolinxu/kitten-scientists-zhs/tree/fcd5efc302700141cd6a4ea4c6e46394fa5d0c83
export const KITTENS_BUDGET = Object.freeze({ consume: 0.6, buildTrigger: 0.75, craftTrigger: 0.95, huntTrigger: 0.95 })

export function createKittensBudget(game, decisionSeconds = 5) {
  const g = game
  function winterNet() {
    // 仅为原版计算器提供反事实天气；真实日历、缓存、资源与随机流均不改变。
    const calendar = Object.create(g.calendar)
    calendar.getWeatherMod = res => res.name === 'catnip' ? 0.1 : g.calendar.getWeatherMod(res)
    const forecast = Object.create(g)
    forecast.calendar = calendar
    return g.calcResourcePerTick.call(forecast, 'catnip') + g.getResourcePerTickConvertion('catnip')
  }
  function reserve(id) {
    const n = g.village.getKittens()
    if (id === 'furs') return n ? Math.max(100, n * 5) : 0
    if (id !== 'catnip' || !n) return 0
    const winterTicks = g.calendar.daysPerSeason * g.calendar.ticksPerDay + decisionSeconds * g.ticksPerSecond
    return Math.max(200 + n * 100, -Math.min(0, winterNet()) * winterTicks)
  }
  const available = (id, protect = {}) => Math.max(0, g.resPool.get(id).value - reserve(id) - (protect[id] || 0))
  function canPay(prices) {
    const totals = {}
    for (const p of prices) totals[p.name] = (totals[p.name] || 0) + p.val
    return Object.entries(totals).every(([id, cost]) => available(id) >= cost)
  }
  function craftCopies(id, needed, { surplus = false, protect = {} } = {}) {
    const recipe = g.workshop.crafts.find(c => c.name === id && c.unlocked)
    if (!recipe || needed <= 0) return 0
    const r = g.resPool.get(id), output = 1 + g.getResCraftRatio(id)
    const room = r.maxValue > 0 ? Math.max(0, r.maxValue - r.value) : Infinity
    // 顺手加工避免溢出；定向备料允许最后一份在原版仓容处截断，以便支付贴近仓容的费用。
    const capacity = Number.isFinite(room) ? (surplus ? Math.floor(room / output) : Math.ceil(room / output)) : Infinity
    return Math.max(0, Math.min(100, Math.ceil(needed / output), capacity,
      ...g.workshop.getCraftPrice(recipe).map(p => Math.floor(available(p.name, protect) * (surplus ? KITTENS_BUDGET.consume : 1) / p.val))))
  }
  return { winterNet, reserve, available, canPay, craftCopies }
}
