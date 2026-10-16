import { CONFIG } from '@/data/config'
import { DAYS_PER_SEASON, DAYS_PER_YEAR, SEASONS } from '@/data/calendar'

/**
 * 长离线「有界近似」的分段与季节折算（纯函数，不读写游戏状态）。
 *
 * 设计约束（见 docs/ENGINEERING.md「离线结算」）：
 * - 步数与离线秒数无关：基础分段数封顶 CONFIG.OFFLINE_MAX_SEGMENTS，
 *   额外只按**初始存档里已有的增益到期时刻**切分，不为过程中生成的任务追加边界；
 * - 越界代价经折算而非穷举：跨季节的长段用「按覆盖时长加权的季节倍率」，
 *   完整年份走全年平均，不足一年的两端按完整的季节区间累加，不逐年、不逐节气循环。
 */

/**
 * 增益到期边界的比较容差（毫秒）。
 * 分段边界由秒折算回毫秒时可能有约 1e-4 ms 的浮点误差；没有这个容差，
 * 刚到期的那一段会「差一点点」仍被判定为未到期，从而把整段时长的加成也算进去。
 */
export const BUFF_BOUNDARY_EPS_MS = 1e-3

/** 超过这个时长改走有界近似；不超过则沿用逐秒精确推进。 */
export function isLongOffline(seconds) {
  return Number.isFinite(seconds) && seconds > CONFIG.OFFLINE_EXACT_AFTER_SECONDS
}

/** 基础分段数：min(上限, ceil(秒))，保证短于上限的近似窗口也至少每段不超过 1 秒。 */
export function offlineSegmentCount(seconds) {
  return Math.max(1, Math.min(CONFIG.OFFLINE_MAX_SEGMENTS, Math.ceil(seconds)))
}

/**
 * 把总时长切成若干段，返回 [{ fromSeconds, toSeconds, seconds }]。
 *
 * 边界 = 基础分段数的等分点 ∪ 初始有效增益的到期时刻 ∪ 总时长；
 * 最后一段吃掉全部浮点余量，各段之和精确等于 seconds。
 */
export function offlineSegments(state, seconds, startAt) {
  const count = offlineSegmentCount(seconds)
  const cuts = new Set()
  for (let index = 1; index < count; index++) cuts.add(index * seconds / count)
  for (const buff of state.buffs || []) {
    const until = Number(buff?.until)
    if (!Number.isFinite(until)) continue
    const offset = (until - startAt) / 1000
    if (offset > 0 && offset < seconds) cuts.add(offset)
  }
  const boundaries = [...cuts].filter(offset => offset > 0 && offset < seconds).sort((a, b) => a - b)
  boundaries.push(seconds)
  const segments = []
  let from = 0
  for (const to of boundaries) {
    const length = to - from
    if (!(length > 0)) continue
    segments.push({ fromSeconds: from, toSeconds: to, seconds: length })
    from = to
  }
  return segments
}

let annualCache = null

/** 全年平均季节倍率：四季等长（各 DAYS_PER_SEASON 天），按天数等权。 */
function annualSeasonRatio() {
  if (annualCache) return annualCache
  const out = {}
  for (const season of SEASONS) {
    for (const [res, value] of Object.entries(season.ratio || {})) {
      out[res] = (out[res] || 0) + value * DAYS_PER_SEASON / DAYS_PER_YEAR
    }
  }
  annualCache = out
  return out
}

/** 把 [from, to) 内跨过的季节区间按实际天数累加；区间不足一年，最多 4 个季节。 */
function accumulateSeasons(from, to, add) {
  let cursor = Math.max(0, from)
  const end = Math.max(cursor, to)
  let guard = 0
  while (cursor < end - 1e-9 && guard++ < 8) {
    const seasonIndex = Math.floor((cursor % DAYS_PER_YEAR) / DAYS_PER_SEASON) % SEASONS.length
    const next = Math.min(end, cursor - (cursor % DAYS_PER_SEASON) + DAYS_PER_SEASON)
    add(next - cursor, SEASONS[seasonIndex].ratio)
    cursor = next
  }
}

/**
 * 一段游戏天数里按覆盖时长加权的季节倍率（{ 资源: 平均比例 }）。
 * 中间经历完整年份的部分一次性按全年平均折算，因此迭代次数与跨度无关。
 */
export function averageSeasonRatio(dayFrom, dayTo) {
  const from = Math.max(0, dayFrom)
  const to = Math.max(from, dayTo)
  const span = to - from
  if (!(span > 0)) return {}
  const total = {}
  const add = (days, ratio) => {
    if (!(days > 0)) return
    for (const [res, value] of Object.entries(ratio || {})) total[res] = (total[res] || 0) + value * days
  }
  const firstYearEnd = Math.min(to, (Math.floor(from / DAYS_PER_YEAR) + 1) * DAYS_PER_YEAR)
  accumulateSeasons(from, firstYearEnd, add)
  const years = Math.max(0, Math.floor((to - firstYearEnd) / DAYS_PER_YEAR))
  if (years > 0) add(years * DAYS_PER_YEAR, annualSeasonRatio())
  accumulateSeasons(firstYearEnd + years * DAYS_PER_YEAR, to, add)
  for (const key of Object.keys(total)) total[key] /= span
  return total
}
