/** 每个游戏实例独立的时钟与随机源，不写入存档。 */
const contexts = new WeakMap()
const counters = new WeakMap()

export function gameNow(state) {
  // 独立引擎调用也延续已推进的时间；注入时钟的运行实例自行控制现实时间。
  return contexts.get(state)?.now?.() ?? Math.max(Date.now(), state.lastTickAt || 0)
}

export function gameRandom(state) {
  return (contexts.get(state)?.random ?? Math.random)()
}

/** 离线中间步骤只计算经济数值，界面来源与解锁明细在结算结束时统一补齐。 */
export function economyDetailsEnabled(state) {
  return contexts.get(state)?.economyDetails !== false
}

/**
 * 有界近似的离线分段会把跨季节的长段折算成「按覆盖时长加权的季节倍率」，
 * 由这里覆盖 recompute 默认取用的当前节气倍率；在线与逐秒精确路径恒为 null。
 */
export function seasonRatioOverride(state) {
  return contexts.get(state)?.seasonRatio || null
}

export function setGameContext(state, context) {
  contexts.set(state, context)
}

/** 运行层事件通知：只对 live 实例回调，引擎本身不依赖 DOM。 */
export function notifyGameEvent(state, payload) {
  const ctx = contexts.get(state)
  if (!ctx || ctx.live !== true || typeof ctx.onEvent !== 'function') return
  ctx.onEvent(payload)
}

/** 同步模拟期间临时覆盖时钟；异常时也恢复原实例上下文。 */
export function withGameContext(state, context, run) {
  const previous = contexts.get(state)
  contexts.set(state, { ...previous, ...context })
  try {
    return run()
  } finally {
    if (previous) contexts.set(state, previous)
    else contexts.delete(state)
  }
}

export function runtimeCounters(state) {
  if (!counters.has(state)) counters.set(state, { achievementSeconds: 0 })
  return counters.get(state)
}

export function resetRuntimeCounters(state) {
  counters.delete(state)
}
