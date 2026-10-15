import { createInitialState } from '../../src/game/state.js'
import { setGameContext } from '../../src/game/context.js'

export const AUDIT_EPOCH = 1800000000000

/** 固定开局、弟子种子和随机流，时钟由模拟步数推进，避免跑得快慢影响结果。 */
export function createAuditContext(seed = 1) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('种子需为 uint32 整数')
  const state = createInitialState(AUDIT_EPOCH)
  let now = AUDIT_EPOCH, randomState = seed
  setGameContext(state, {
    now: () => now,
    random: () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 0x100000000),
  })
  return { state, advance(seconds) { const startAt = now; now += seconds * 1000; return startAt } }
}
