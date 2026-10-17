import { REALMS } from '@/data/realms'
import { money } from './decimal'

/**
 * GA4 平衡采集的**持久元数据**（纯数据层：不依赖 window、gtag，也不发网络请求）。
 *
 * 这里只保存「本世观测」的最小摘要：世标识、时钟累计、首次到达表、尝试次数，
 * 以及上一世的摘要（只保留一世，供相邻世对比）。所有字段都会进存档白名单，
 * 由 validateState 归一到已知形状；旧档缺失时补默认值并标 partial。
 */

export const ANALYTICS_SCHEMA_VERSION = 1

export const COHORTS = ['fresh', 'legacy', 'imported']
export const QUALITIES = ['clean', 'partial', 'debug']
export const END_REASONS = ['reincarnation', 'ascension', 'death']
export const START_REASONS = ['new_game', 'reincarnation', 'ascension', 'death']

/** 境界 id 是稳定字符串：r00 凡体 …… r10 渡劫。 */
export function realmIdOf(index) {
  const i = Number.isInteger(index) && index >= 0 && index < REALMS.length ? index : 0
  return `r${String(i).padStart(2, '0')}`
}

/** 仙缘/道果分档：0、1_9、10_99、100_999、1000_plus。 */
export function bandOf(value) {
  const amount = money(value ?? 0)
  if (amount.lte(0)) return '0'
  if (amount.lt(10)) return '1_9'
  if (amount.lt(100)) return '10_99'
  if (amount.lt(1000)) return '100_999'
  return '1000_plus'
}

const REALM_IDS = REALMS.map((_, index) => realmIdOf(index))

function finiteSeconds(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 1000) / 1000) : fallback
}

function finiteCount(value, fallback = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isInteger(value) ? Math.max(0, Math.min(max, value)) : fallback
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.length <= 64 ? value : fallback
}

/** 首次到达表：只保留合法境界 id 与四项秒数。 */
export function normalizeFirstReach(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const id of REALM_IDS) {
    const entry = raw[id]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    out[id] = {
      simS: finiteSeconds(entry.simS),
      wallS: finiteSeconds(entry.wallS),
      frontS: finiteSeconds(entry.frontS),
      offlineS: finiteSeconds(entry.offlineS),
    }
  }
  return out
}

function normalizeAttempts(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const id of REALM_IDS) {
    const value = raw[id]
    if (Number.isInteger(value) && value > 0) out[id] = Math.min(1000000, value)
  }
  return out
}

/** 上一世摘要：只保留相邻世对比需要的字段，不无限保存历史。 */
export function normalizeLastRun(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const endReason = END_REASONS.includes(raw.endReason) ? raw.endReason : 'death'
  return {
    runId: text(raw.runId),
    endReason,
    bestRealm: finiteCount(raw.bestRealm, 0, REALMS.length - 1),
    simS: finiteSeconds(raw.simS),
    wallS: finiteSeconds(raw.wallS),
    quality: QUALITIES.includes(raw.quality) ? raw.quality : 'partial',
    balanceVersion: text(raw.balanceVersion),
    firstReach: normalizeFirstReach(raw.firstReach),
  }
}

/** 分析身份与观测状态的默认值；旧档缺失时也用它补齐。 */
export function createAnalyticsState() {
  return {
    schema: ANALYTICS_SCHEMA_VERSION,
    saveId: '',
    runId: '',
    runIndex: 1,
    cohort: 'fresh',
    quality: 'clean',
    startAt: 0,
    startSent: false,
    simS: 0,
    offlineS: 0,
    frontS: 0,
    karmaBand: '0',
    daoBand: '0',
    balanceVersion: '',
    firstReach: {},
    bestRealm: 0,
    attempts: {},
    lastRun: null,
  }
}

export function normalizeAnalytics(raw) {
  const base = createAnalyticsState()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  return {
    schema: ANALYTICS_SCHEMA_VERSION,
    saveId: text(raw.saveId),
    runId: text(raw.runId),
    runIndex: finiteCount(raw.runIndex, 1, 1000000) || 1,
    cohort: COHORTS.includes(raw.cohort) ? raw.cohort : 'legacy',
    quality: QUALITIES.includes(raw.quality) ? raw.quality : 'partial',
    startAt: Number.isFinite(raw.startAt) ? Math.max(0, raw.startAt) : 0,
    startSent: raw.startSent === true,
    simS: finiteSeconds(raw.simS),
    offlineS: finiteSeconds(raw.offlineS),
    frontS: finiteSeconds(raw.frontS),
    karmaBand: text(raw.karmaBand, '0'),
    daoBand: text(raw.daoBand, '0'),
    balanceVersion: text(raw.balanceVersion),
    firstReach: normalizeFirstReach(raw.firstReach),
    bestRealm: finiteCount(raw.bestRealm, 0, REALMS.length - 1),
    attempts: normalizeAttempts(raw.attempts),
    lastRun: normalizeLastRun(raw.lastRun),
  }
}
