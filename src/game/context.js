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

export function setGameContext(state, context) {
  contexts.set(state, context)
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
