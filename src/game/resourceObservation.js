import { gameNow, getGameContext, withGameContext } from './context'

/** Optional, instance-local measurement. No observer or IO exists in ordinary games. */
export function setResourceValue(state, id, value, detail = {}) {
  const before = state.resources[id]
  state.resources[id] = value
  const context = getGameContext(state)
  if (context?.resourceObserver) {
    context.resourceObserver.mutation({ id, before, after: value, at: gameNow(state),
      action: context.resourceAction || null, detail: typeof detail === 'function' ? detail() : detail })
  }
  return value
}

export function replaceResourceValues(state, values, detail = {}) {
  const before = state.resources
  state.resources = values
  const context = getGameContext(state)
  if (context?.resourceObserver) {
    for (const id of new Set([...Object.keys(before), ...Object.keys(values)])) {
      context.resourceObserver.mutation({ id, before: before[id], after: values[id], at: gameNow(state),
        action: context.resourceAction || null, detail })
    }
  }
  return values
}

/** A zero-net engine settlement can still have modeled gross production and upkeep. */
export function observeResourceModel(state, id, detail) {
  const context = getGameContext(state)
  if (context?.resourceObserver) context.resourceObserver.mutation({ id,
    before: state.resources[id], after: state.resources[id], at: gameNow(state),
    action: context.resourceAction || null, detail: detail() })
}

export function withResourceAction(state, detail, run) {
  const context = getGameContext(state)
  if (!context?.resourceObserver) return run()
  const action = context.resourceObserver.begin({ ...detail, at: gameNow(state), parent: context.resourceAction || null })
  return withGameContext(state, { resourceAction: action }, () => {
    try {
      const result = run()
      const outcome = result && typeof result === 'object'
        ? { ok: result.ok ?? null, made: result.made?.toString(), count: result.count?.toString() }
        : result
      context.resourceObserver.end(action, { ok: true, result: outcome })
      return result
    } catch (error) {
      context.resourceObserver.end(action, { ok: false, error: String(error?.message || error) })
      throw error
    }
  })
}
