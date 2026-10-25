import { Dec, isMoney } from '../../src/game/decimal.js'

/** Lossless runtime codec. Deliberately does not run player-save migrations. */
export function pack(value) {
  if (isMoney(value)) return { $measurement: 'decimal', value: value.toString() }
  if (value === undefined) return { $measurement: 'undefined' }
  if (typeof value === 'number' && !Number.isFinite(value)) return { $measurement: 'number', value: String(value) }
  if (Array.isArray(value)) return value.map(pack)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pack(v)]))
  if (typeof value === 'function') throw Error('Checkpoint contains a function')
  return value
}
export function unpack(value) {
  if (value?.$measurement === 'decimal') return new Dec(value.value)
  if (value?.$measurement === 'undefined') return undefined
  if (value?.$measurement === 'number') return Number(value.value)
  if (Array.isArray(value)) return value.map(unpack)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unpack(v)]))
  return value
}
export const checkpointText = value => JSON.stringify(pack(value))
export const parseCheckpoint = text => unpack(JSON.parse(text))
export function createSeededRandom(seed, saved = null) {
  let current = saved?.state ?? seed >>> 0, calls = saved?.calls ?? 0
  const random = () => { calls++; return ((current = (Math.imul(current, 1664525) + 1013904223) >>> 0) / 0x100000000) }
  random.snapshot = () => ({ state: current, calls })
  return random
}
