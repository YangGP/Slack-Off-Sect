import { REALMS } from '@/data/realms'
import { CURRENT_VERSION } from '@/data/changelog'
import { realmCost } from '@/game/systems/core'
import { ZERO, money } from '@/game/decimal'
import { IS_DEV_PREVIEW, STORAGE_PREFIX } from '@/game/deployment'
import {
  ANALYTICS_SCHEMA_VERSION, bandOf, normalizeAnalytics, realmIdOf,
} from '@/game/analyticsState'

/**
 * 平衡采集的浏览器侧编排：世生命周期、四项时钟、卡点采样与事件发送。
 *
 * - 纯数据与归一化在 `src/game/analyticsState.js`；引擎不依赖 window / gtag。
 * - 这里维护“活动采集者”：只有领头标签页采样与发送；失去领导权时丢弃未提交的采样。
 * - 发送是尽力而为：停用、缺 ID、开发环境未显式开启时整体停用，不补发。
 */

const env = import.meta.env || {}
const MEASUREMENT_ID = String(env.VITE_GA_MEASUREMENT_ID || '').trim()
const IS_DEV = Boolean(env.DEV)
const DEV_OPT_IN = String(env.VITE_GA_DEBUG || '') === '1'
/** 与“是否允许开发环境上报”分开：这个开关只让普通事件带 debug_mode。 */
const FORCE_DEBUG_MODE = String(env.VITE_GA_DEBUG_MODE || '') === '1'

/** 数值配置版本：平衡数值改动时同步更新（与游戏版本独立）。 */
export const BALANCE_VERSION = '2026-10-17.d7.2'

const TICK_MS = 5000
const SAMPLE_MS = 30000
const FLUSH_MS = 300000
/** 超过这个间隔的采样缺口丢弃，不凭末态倒推中间时间。 */
const MAX_SAMPLE_GAP = 60
const LEADER_KEY = `${STORAGE_PREFIX}.analytics.leader`
const SENT_PREFIX = `${STORAGE_PREFIX}.analytics.sent.`
const LEADER_TTL_MS = 12000

const instanceId = randomId('tab')
const buckets = new Map()
let ctx = null
let started = false
let ready = false
let timerId = null
let lastTickAt = 0
let lastSampleAt = 0
let lastSampleRealm = ''
let lastFlushAt = 0
let pendingStart = null
let wasLeader = false
let paused = false

// 传输模块是可选依赖：不允许它被隐私扩展拦截时阻断 store / main 的加载。
const MAX_PENDING_EVENTS = 20
const TRANSPORT_LOAD_TIMEOUT_MS = 15000
const pendingEvents = []
let transport = null
let transportLoading = null
let transportLoadTimer = null
let transportEnabled = false
let transportDebug = false
let transportFailed = false
let transportStatus = 'disabled'
let transportFailure = ''

function notifyTransportStatus(status, reason = '') {
  if (transportStatus === status && transportFailure === reason) return
  transportStatus = status
  transportFailure = reason
  try { ctx?.onStatus?.({ status, reason }) } catch {}
}

function handleTransportStatus(status) {
  if (!transportEnabled || transportFailed) return
  if (status === 'failed') disableFailedTransport()
  else notifyTransportStatus(status)
}

function disableFailedTransport() {
  const wasEnabled = transportEnabled
  transportFailed = true
  transportEnabled = false
  pendingEvents.length = 0
  if (transportLoadTimer !== null) globalThis.clearTimeout(transportLoadTimer)
  transportLoadTimer = null
  try { transport?.setTransportEnabled(false) } catch {}
  markQuality('partial')
  if (wasEnabled) notifyTransportStatus('failed', 'unavailable')
}

function loadTransport() {
  if (transport || transportLoading || transportFailed || !transportEnabled) return
  transportLoadTimer = globalThis.setTimeout(disableFailedTransport, TRANSPORT_LOAD_TIMEOUT_MS)
  transportLoading = import('./ga').then(adapter => {
    // 超时后即使下载完成也不恢复，更不补发已经丢弃的事件。
    if (transportFailed) return
    globalThis.clearTimeout(transportLoadTimer)
    transportLoadTimer = null
    transport = adapter
    const on = transportEnabled && isEnabled()
    adapter.configureTransport({ id: MEASUREMENT_ID, on, debug: transportDebug,
      onStatus: handleTransportStatus })
    if (!on) { pendingEvents.length = 0; return }
    // 事件参数在入队时已捕获，异步加载期间转世/导入不会改写旧世身份。
    while (pendingEvents.length && transportEnabled && isEnabled()) {
      const event = pendingEvents.shift()
      adapter.sendEvent(event.name, event.params)
    }
  }).catch(disableFailedTransport)
}

function configureTransport({ on = false, debug = false } = {}) {
  setTransportDebug(debug)
  setTransportEnabled(on)
}

function setTransportEnabled(on) {
  transportEnabled = on === true && !!MEASUREMENT_ID && !transportFailed
  if (!transportEnabled) {
    pendingEvents.length = 0
    notifyTransportStatus('disabled')
  } else if (!transport) notifyTransportStatus('loading')
  if (transport) {
    try { transport.setTransportEnabled(transportEnabled) } catch { disableFailedTransport() }
  } else if (transportEnabled) loadTransport()
}

function setTransportDebug(on) {
  transportDebug = on === true
  try { transport?.setTransportDebug(transportDebug) } catch { disableFailedTransport() }
}

function sendEvent(name, params) {
  if (!transportEnabled || !isEnabled()) return false
  if (transport) {
    try { return transport.sendEvent(name, params) }
    catch { disableFailedTransport(); return false }
  }
  if (pendingEvents.length >= MAX_PENDING_EVENTS) pendingEvents.shift()
  pendingEvents.push({ name, params: { ...params } })
  return false
}

function randomId(prefix) {
  try {
    const uuid = globalThis.crypto?.randomUUID?.()
    if (uuid) return `${prefix}_${uuid.replace(/-/g, '').slice(0, 20)}`
  } catch {}
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

const mono = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const round = (value, digits = 3) => Number.isFinite(value)
  ? Math.round(value * 10 ** digits) / 10 ** digits : 0

function state() { return ctx?.state }
function derived() { return ctx?.derived }
function meta() { return ctx?.state?.analytics }

/** jsdom / 自动化环境（离线 DOM 与启动检查）不加载真实标签，避免测试里发网络请求。 */
function isAutomatedBrowser() {
  const currentNavigator = typeof window !== 'undefined' ? window.navigator
    : typeof navigator !== 'undefined' ? navigator : null
  if (!currentNavigator) return false
  const ua = currentNavigator.userAgent || ''
  return currentNavigator.webdriver === true || /jsdom/i.test(ua)
}

function isEnabled() {
  if (IS_DEV_PREVIEW) return false
  if (!ctx || isAutomatedBrowser()) return false
  if (transportFailed) return false
  if (!MEASUREMENT_ID) return false
  if (IS_DEV && !DEV_OPT_IN) return false
  return state()?.settings?.analyticsEnabled !== false
}

function isDebug() { return meta()?.quality === 'debug' }
function debugFlag() { return FORCE_DEBUG_MODE || isDebug() }

/* ---------------- 质量标记 ---------------- */

/** 质量只升不降：clean → partial → debug。切换前先把旧质量下的采样余量提交掉。 */
function markQuality(quality) {
  const a = meta()
  if (!a) return
  if (a.quality === 'debug') return
  if (quality === 'debug') { flushBuckets(); a.quality = 'debug'; setTransportDebug(debugFlag()); return }
  if (a.quality === 'clean') { flushBuckets(); a.quality = 'partial' }
}

/** 运行中改数值版本：本世只能算 partial，不能和同版本世直接比提速。 */
function syncBalanceVersion() {
  const a = meta()
  if (!a) return
  if (a.balanceVersion && a.balanceVersion !== BALANCE_VERSION) markQuality('partial')
  a.balanceVersion = BALANCE_VERSION
}

/* ---------------- 领导权与幂等标记 ---------------- */

function isLeader() {
  try {
    const now = Date.now()
    const current = JSON.parse(localStorage.getItem(LEADER_KEY) || 'null')
    if (!current || current.exp < now || current.id === instanceId) {
      localStorage.setItem(LEADER_KEY, JSON.stringify({ id: instanceId, exp: now + LEADER_TTL_MS }))
      return true
    }
    return false
  } catch { return true }
}

/**
 * 离散事件由动作页接管采集权；接管时丢弃“未持有领导权”期间的采样区间，
 * 否则会把其他页负责的时间重复计入。已经持有时不重切基准。
 */
function acquireForEvent() {
  let mine = false
  try {
    const current = JSON.parse(localStorage.getItem(LEADER_KEY) || "null")
    mine = !!current && current.id === instanceId && current.exp > Date.now()
    localStorage.setItem(LEADER_KEY, JSON.stringify({ id: instanceId, exp: Date.now() + LEADER_TTL_MS }))
  } catch {}
  if (!mine) { resetSampling(); buckets.clear() }
  wasLeader = true
  return true
}

function releaseLeadership() {
  try {
    const current = JSON.parse(localStorage.getItem(LEADER_KEY) || 'null')
    if (current?.id === instanceId) localStorage.setItem(LEADER_KEY, JSON.stringify({ id: instanceId, exp: 0 }))
  } catch {}
}

/** 跨标签页幂等：同一世的开局/到达/结束/对比只发一次。 */
function claimOnce(key) {
  try {
    const full = SENT_PREFIX + key
    if (localStorage.getItem(full)) return false
    localStorage.setItem(full, '1')
    return true
  } catch { return true }
}

/* ---------------- 发送入口 ---------------- */

/** 离散事件：允许由动作页接管采集权，接管前先截断采样区间。 */
function emitEvent(name, params) {
  if (!isEnabled()) return false
  acquireForEvent()
  return sendEvent(name, params)
}

/** 采样汇总：只有当前领导者提交，绝不抢锁。 */
function emitSample(name, params) {
  if (!isEnabled() || !isLeader()) return false
  return sendEvent(name, params)
}

function scalar(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') return value
  const amount = money(value ?? 0)
  if (!amount.isFinite()) { markQuality('partial'); return undefined }
  const number = amount.toNumber()
  // 超过安全整数后 Number 已不精确：省略准确数值、保留分档，并把本世标为不完整。
  if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER) {
    markQuality('partial')
    return undefined
  }
  return number
}

function commonFrom(record, realmId) {
  return {
    game_version: CURRENT_VERSION,
    balance_version: BALANCE_VERSION,
    schema_version: ANALYTICS_SCHEMA_VERSION,
    save_id: record.saveId,
    run_id: record.runId,
    run_index: record.runIndex,
    realm_id: realmId,
    cohort: record.cohort,
    data_quality: record.quality,
    start_karma_band: record.karmaBand,
    start_dao_band: record.daoBand,
  }
}

function syncTransport() {
  const on = isEnabled()
  setTransportEnabled(on)
  setTransportDebug(debugFlag())
  if (!on) buckets.clear()
}

function sendRunStart(reason) {
  const a = meta()
  const s = state()
  if (!a || !s) return
  pendingStart = reason
  if (!isEnabled()) {
    // 停用期间开始的世没有完整起点：标记已处理、绝不补发，并降级为 partial。
    a.startSent = true
    pendingStart = null
    markQuality('partial')
    return
  }
  if (!claimOnce(`start:${a.runId}`)) { a.startSent = true; pendingStart = null; return }
  // 先算金额：超出安全范围会把本世降为 partial，公共字段必须用降级后的质量。
  const startKarma = scalar(s.karma)
  const startDao = scalar(s.dao)
  emitEvent('run_start', {
    ...commonFrom(a, realmIdOf(s.realm)),
    start_reason: reason,
    start_karma: startKarma,
    start_dao: startDao,
  })
  a.startSent = true
  pendingStart = null
}

/* ---------------- 生命周期 ---------------- */

export function initAnalytics({ state: gameState, derived: gameDerived, restored = false, debug = false,
  onStatus = null } = {}) {
  if (IS_DEV_PREVIEW) return false
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (!gameState || !gameDerived) return false
  ctx = { state: gameState, derived: gameDerived, onStatus }
  if (isAutomatedBrowser()) return false
  if (started) { syncBalanceVersion(); return true }
  gameState.analytics = normalizeAnalytics(gameState.analytics)
  ensureIdentity(restored, debug)
  configureTransport({ id: MEASUREMENT_ID, on: isEnabled(), debug: debugFlag() })
  attach()
  ready = false
  if (!meta().startSent) pendingStart = restored ? null : 'new_game'
  return true
}

function attach() {
  if (started) return
  started = true
  if (window.__slackOffAnalyticsTimer) window.clearInterval(window.__slackOffAnalyticsTimer)
  if (window.__slackOffAnalyticsVisibility) document.removeEventListener('visibilitychange', window.__slackOffAnalyticsVisibility)
  if (window.__slackOffAnalyticsPagehide) window.removeEventListener('pagehide', window.__slackOffAnalyticsPagehide)
  window.__slackOffAnalyticsVisibility = onVisibility
  document.addEventListener('visibilitychange', onVisibility)
  const onPagehide = () => { if (isLeader()) flushBuckets() }
  window.__slackOffAnalyticsPagehide = onPagehide
  window.addEventListener('pagehide', onPagehide)
  timerId = window.setInterval(tick, TICK_MS)
  window.__slackOffAnalyticsTimer = timerId
  lastTickAt = mono()
  lastFlushAt = lastTickAt
}

function detach() {
  if (timerId !== null && typeof window !== 'undefined') window.clearInterval(timerId)
  timerId = null
  started = false
  ready = false
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility)
    if (window.__slackOffAnalyticsVisibility === onVisibility) window.__slackOffAnalyticsVisibility = null
  }
  if (typeof window !== 'undefined' && window.__slackOffAnalyticsPagehide) {
    window.removeEventListener('pagehide', window.__slackOffAnalyticsPagehide)
    window.__slackOffAnalyticsPagehide = null
  }
}

/** 初始化/离线结算完成、主循环真正开始后再启用前台计时与采样。 */
export function markReady() {
  if (!ctx) return false
  // 已经在运行：重复 start 不能反复重切采样基准。
  if (ready) { syncTransport(); return true }
  if (!started) attach()
  ready = true
  paused = false
  syncTransport()
  resetSampling()
  // 初始化期间不算前台：就绪时重设前台时钟基准。
  resetFrontClock()
  if (!meta().startSent && pendingStart) sendRunStart(pendingStart)
  return true
}

/** 停止游戏时配对停用：不再计时/采样/发送，并丢弃未提交的余量。 */
export function stopAnalytics() {
  buckets.clear()
  pendingStart = null
  paused = false
  detach()
  setTransportEnabled(false)
  releaseLeadership()
  wasLeader = false
}

/** 离线/长间隔追赶结算期间暂停前台计时与采样。 */
export function pauseSampling() {
  paused = true
  buckets.clear()
  resetFrontClock()
}

/** 结算完成后恢复；重设采样基准，不补记加载期间的前台时间。 */
export function resumeSampling() {
  if (!ready) return
  paused = false
  resetSampling()
  // 暂停期间不累计前台时间，恢复后从当前时刻重新计时。
  resetFrontClock()
}

function ensureIdentity(restored, debug) {
  const a = meta()
  const s = state()
  if (!a.saveId) a.saveId = randomId('save')
  if (!a.runId) {
    a.runId = randomId('run')
    a.runIndex = 1
    a.cohort = restored ? 'legacy' : 'fresh'
    a.quality = debug ? 'debug' : restored || !isEnabled() ? 'partial' : 'clean'
    a.startAt = Date.now()
    a.startSent = restored
    a.simS = 0
    a.offlineS = 0
    a.frontS = 0
    a.karmaBand = bandOf(s.karma)
    a.daoBand = bandOf(s.dao)
    a.firstReach = {}
    a.bestRealm = s.realm | 0
    a.attempts = {}
    a.balanceVersion = BALANCE_VERSION
    return
  }
  syncBalanceVersion()
  if (!a.startAt) a.startAt = Date.now()
  // 已知的停用缺口：本次加载时采集没有开启，本世不能继续保持 clean。
  if (debug) markQuality('debug')
  else if (!isEnabled()) markQuality('partial')
}

/* ---------------- 时钟与采样 ---------------- */

export function noteAdvance(seconds, offline = false) {
  const a = meta()
  // 结算时钟与前台采样分开：离线加载期间的真实结算也要计入本世推进秒数。
  if (!a || !Number.isFinite(seconds) || seconds <= 0) return
  a.simS = round(a.simS + seconds)
  if (offline) a.offlineS = round(a.offlineS + seconds)
}

/** 离线/长间隔追赶成功结算后调用；取消或失败不调用。 */
export function noteOfflineSettled(seconds) {
  noteAdvance(seconds, true)
}

function tick() {
  if (!ctx || !ready || paused) return
  syncBalanceVersion()
  const now = mono()
  const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
  if (!visible) {
    lastTickAt = now
    if (wasLeader) { buckets.clear(); releaseLeadership() }
    wasLeader = false
    return
  }
  const leader = isLeader()
  if (leader && !wasLeader) resetSampling()
  if (!leader && wasLeader) { buckets.clear(); resetSampling() }
  wasLeader = leader
  if (lastTickAt) {
    const delta = (now - lastTickAt) / 1000
    // 5 秒一跳；超过 30 秒的缺口不补，避免休眠后虚增前台时间。
    if (delta > 0 && delta <= 30) meta().frontS = round(meta().frontS + delta)
  }
  lastTickAt = now
  if (!leader) return
  if (!meta().startSent && pendingStart) sendRunStart(pendingStart)
  if (lastSampleAt && now - lastSampleAt >= SAMPLE_MS) sampleBottleneck(now)
  if (now - lastFlushAt >= FLUSH_MS) flushBuckets()
}

function onVisibility() {
  if (document.visibilityState === 'hidden') {
    if (isLeader()) flushBuckets()
    buckets.clear()
    releaseLeadership()
    wasLeader = false
    lastTickAt = mono()
    return
  }
  lastTickAt = mono()
  resetSampling()
}

function resetSampling() {
  lastSampleAt = mono()
  lastSampleRealm = state() ? realmIdOf(state().realm) : ''
}

/** 前台计时与卡点采样分开：只有就绪/暂停恢复/世切换边界才重设前台基准。 */
function resetFrontClock() {
  lastTickAt = mono()
}

/** 卡点分类：capacity → resource → ready → terminal，顺序固定。 */
function classifyBottleneck() {
  const s = state()
  const d = derived()
  const next = s.realm + 1
  if (!REALMS[next]) return { type: 'terminal', res: 'none' }
  const cost = realmCost(s, d, next) || {}
  let capacity = null
  let resource = null
  for (const [res, raw] of Object.entries(cost)) {
    const need = money(raw)
    if (!need.gt(0)) continue
    const have = s.resources?.[res] ?? ZERO
    if (have.gte(need)) continue
    const ratio = 1 - have.div(need).toNumber()
    const cap = d.max?.[res]
    const byCapacity = cap && cap.isFinite() && cap.lt(need)
    const candidate = { res, ratio }
    if (byCapacity) { if (!capacity || better(candidate, capacity)) capacity = candidate }
    else if (!resource || better(candidate, resource)) resource = candidate
  }
  if (capacity) return { type: 'capacity', res: capacity.res }
  if (resource) return { type: 'resource', res: resource.res }
  return { type: 'ready', res: 'none' }
}

function better(a, b) {
  return a.ratio > b.ratio || (a.ratio === b.ratio && a.res < b.res)
}

function sampleBottleneck(now) {
  const a = meta()
  if (!a || !isEnabled()) { resetSampling(); return }
  const currentRealm = realmIdOf(state().realm)
  const delta = lastSampleAt ? (now - lastSampleAt) / 1000 : 0
  // 区间内换过境界就无法可靠归属：丢弃这一段，从现在重新观测。
  if (lastSampleRealm && lastSampleRealm !== currentRealm) { resetSampling(); return }
  lastSampleAt = now
  lastSampleRealm = currentRealm
  if (!(delta > 0) || delta > MAX_SAMPLE_GAP) return
  const cls = classifyBottleneck()
  const key = `${currentRealm}|${cls.type}|${cls.res}`
  buckets.set(key, (buckets.get(key) || 0) + delta)
}

/** 按「当时境界 + 类别 + 资源」汇总发送；时间占比只用 observed_s，不用事件条数。 */
function flushBuckets() {
  if (!started || !buckets.size) return
  lastFlushAt = mono()
  if (!isEnabled() || !isLeader()) { buckets.clear(); return }
  const a = meta()
  for (const [key, seconds] of buckets) {
    const [realmId, type, res] = key.split('|')
    emitSample('bottleneck_sample', {
      ...commonFrom(a, realmId),
      blocker_type: type,
      resource_id: res,
      observed_s: round(seconds),
    })
    buckets.delete(key)
  }
}

/** 状态将被整体替换（导入/清档/转世）：先用旧身份提交余量，再清空采样基准。 */
export function beforeStateReplace() {
  if (!ctx) return
  flushBuckets()
  buckets.clear()
  resetSampling()
}

/** 境界即将变化（突破判定前）：旧境界余量先提交，采样基准重切。 */
export function beforeRealmChange() {
  if (!ctx) return
  flushBuckets()
  resetSampling()
}

/* ---------------- 事件 ---------------- */

export function noteRealmReached() {
  const s = state()
  const a = meta()
  if (!s || !a) return
  const id = realmIdOf(s.realm)
  a.bestRealm = Math.max(a.bestRealm, s.realm | 0)
  if (a.firstReach[id]) return
  const entry = {
    simS: round(a.simS),
    wallS: wallSeconds(a),
    frontS: round(a.frontS),
    offlineS: round(a.offlineS),
  }
  a.firstReach[id] = entry
  // 新世起点（凡体）由 run_start 表示，不另发 realm_reached。
  if (s.realm <= 0 || !isEnabled()) return
  if (!claimOnce(`realm:${a.runId}:${id}`)) return
  emitEvent('realm_reached', {
    ...commonFrom(a, id),
    run_wall_s: entry.wallS,
    run_sim_s: entry.simS,
    run_front_s: entry.frontS,
    run_offline_s: entry.offlineS,
  })
  maybeRebirthCompare(a, id, entry)
}

function maybeRebirthCompare(a, id, current) {
  const previous = a.lastRun
  if (!previous || previous.quality !== 'clean' || a.quality !== 'clean') return
  if (previous.balanceVersion !== BALANCE_VERSION) return
  const old = previous.firstReach?.[id]
  if (!old || !(old.simS > 0) || !(current.simS > 0)) return
  if (!claimOnce(`compare:${a.runId}:${id}`)) return
  emitEvent('rebirth_compare', {
    ...commonFrom(a, id),
    previous_run_id: previous.runId,
    previous_end_reason: previous.endReason,
    previous_sim_s: old.simS,
    current_sim_s: current.simS,
    speedup_ratio: round(old.simS / current.simS),
    previous_wall_s: old.wallS,
    current_wall_s: current.wallS,
  })
}

export function noteBreakthrough({ sourceRealm, targetRealm, result, preview, aidCount = 0, aidMask = '' }) {
  const a = meta()
  if (!a) return
  const targetId = realmIdOf(targetRealm)
  a.attempts[targetId] = (a.attempts[targetId] || 0) + 1
  const attemptNo = a.attempts[targetId]
  // 先判断这条尝试是否与另一页重复：冲突样本必须在任何 realm_reached / 对比事件之前降级，
  // 否则已经发出的 clean 事件无法追溯。
  const duplicate = isEnabled() && !claimOnce(['attempt', a.runId, targetId, attemptNo].join(':'))
  if (duplicate) markQuality('partial')
  // 无论是否重复，真实状态都必须更新：成功升境照常记录本世首次到达与最高境界。
  if (result === 'success') noteRealmReached()
  // 只抑制重复的结果事件；元数据已经更新完毕。
  if (!isEnabled() || duplicate) return
  emitEvent('breakthrough_result', {
    ...commonFrom(a, realmIdOf(sourceRealm)),
    target_realm_id: targetId,
    result,
    success_prob: round(preview?.chance),
    death_prob: round(preview?.deathRisk),
    regression_prob: round(preview?.regressionRisk),
    aid_count: aidCount,
    aid_mask: aidMask,
    attempt_no: attemptNo,
  })
}

function wallSeconds(record) {
  const a = record || meta()
  const elapsed = (Date.now() - a.startAt) / 1000
  if (!Number.isFinite(elapsed) || elapsed < 0) { markQuality('partial'); return 0 }
  return round(elapsed)
}

/** 重置前抓取旧世摘要；重置确认后由 endRun / beginRun 组合发送。 */
export function captureRun() {
  const a = meta()
  const s = state()
  if (!a || !s) return null
  return {
    saveId: a.saveId,
    runId: a.runId,
    runIndex: a.runIndex,
    cohort: a.cohort,
    quality: a.quality,
    karmaBand: a.karmaBand,
    daoBand: a.daoBand,
    balanceVersion: a.balanceVersion,
    simS: round(a.simS),
    offlineS: round(a.offlineS),
    frontS: round(a.frontS),
    bestRealm: Math.max(a.bestRealm, s.realm | 0),
    realm: s.realm | 0,
    wallS: wallSeconds(a),
    firstReach: JSON.parse(JSON.stringify(a.firstReach || {})),
  }
}

/** 发送旧世 run_end，并把摘要留作下一世对比；调用前先 captureRun()。 */
export function endRun(snapshot, { reason, karmaGain = 0, daoGain = 0 } = {}) {
  const a = meta()
  if (!snapshot || !a) return
  // 先转换上报金额：超出安全范围会降级本世质量，结束事件与上一世摘要都要用降级后的值。
  const karma = scalar(karmaGain)
  const dao = scalar(daoGain)
  const record = { ...snapshot, quality: a.quality }
  if (isEnabled() && claimOnce(`end:${snapshot.runId}`)) {
    emitEvent('run_end', {
      ...commonFrom(record, realmIdOf(record.realm)),
      end_reason: reason,
      best_realm_id: realmIdOf(record.bestRealm),
      run_wall_s: record.wallS,
      run_sim_s: record.simS,
      run_front_s: record.frontS,
      run_offline_s: record.offlineS,
      karma_gain: karma,
      dao_gain: dao,
    })
  }
  a.lastRun = {
    runId: record.runId,
    endReason: reason,
    bestRealm: record.bestRealm,
    simS: record.simS,
    wallS: record.wallS,
    quality: record.quality,
    balanceVersion: record.balanceVersion,
    firstReach: record.firstReach,
  }
}

/** 新世开始：换 run_id、清本世观测；采集停用或调试打开时不得标 clean。 */
export function beginRun(reason, { debug = false } = {}) {
  const a = meta()
  const s = state()
  if (!a || !s) return
  a.runId = randomId('run')
  a.runIndex = (Number.isInteger(a.runIndex) ? a.runIndex : 1) + 1
  a.cohort = 'fresh'
  a.quality = debug ? 'debug' : isEnabled() ? 'clean' : 'partial'
  a.startAt = Date.now()
  a.startSent = false
  a.simS = 0
  a.offlineS = 0
  a.frontS = 0
  a.firstReach = {}
  a.attempts = {}
  a.bestRealm = s.realm | 0
  a.karmaBand = bandOf(s.karma)
  a.daoBand = bandOf(s.dao)
  a.balanceVersion = BALANCE_VERSION
  buckets.clear()
  resetSampling()
  syncTransport()
  sendRunStart(reason)
}

/** 手动清档：新 save_id，从第一世重新计数。 */
export function startFreshSave({ debug = false } = {}) {
  const a = meta()
  if (!a) return
  a.saveId = randomId('save')
  a.runIndex = 0
  a.lastRun = null
  beginRun('new_game', { debug })
}

/** 导入/回档：重建分析身份，不补发 run_start，本世标 partial 并中断对比链。 */
export function noteImport({ debug = false } = {}) {
  const a = meta()
  const s = state()
  if (!a || !s) return
  flushBuckets()
  a.saveId = randomId('save')
  a.runId = randomId('run')
  a.runIndex = (Number.isInteger(a.runIndex) ? a.runIndex : 1) + 1
  a.cohort = 'imported'
  a.quality = debug ? 'debug' : 'partial'
  a.startAt = Date.now()
  a.startSent = true
  a.simS = 0
  a.offlineS = 0
  a.frontS = 0
  a.firstReach = {}
  a.attempts = {}
  a.bestRealm = s.realm | 0
  a.karmaBand = bandOf(s.karma)
  a.daoBand = bandOf(s.dao)
  a.balanceVersion = BALANCE_VERSION
  a.lastRun = null
  buckets.clear()
  resetSampling()
  syncTransport()
}

/** 设置开关：立即同步发送层；关闭只丢弃本模块待发事件，并标记本世已观测不完整。 */
export function setAnalyticsEnabled(on) {
  if (on !== true) {
    buckets.clear()
    markQuality('partial')
  }
  syncTransport()
  if (on === true && !isEnabled()) {
    const reason = !MEASUREMENT_ID ? 'unconfigured'
      : IS_DEV && !DEV_OPT_IN ? 'development' : 'unavailable'
    notifyTransportStatus('failed', reason)
  }
}

/** 调试动作一旦在本世使用过，就永久标 debug（关闭调试不能洗白）。 */
export function markDebug() {
  markQuality('debug')
}

export function analyticsStatus() {
  return {
    configured: !!MEASUREMENT_ID,
    development: IS_DEV,
    devOptIn: DEV_OPT_IN,
    enabled: isEnabled(),
    quality: meta()?.quality || 'partial',
    ready,
    transportStatus,
  }
}
