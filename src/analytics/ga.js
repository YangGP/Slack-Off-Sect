/**
 * GA4 网页标签适配器：只负责加载 gtag.js、维护有界发送队列，不做业务判断。
 *
 * 加载状态机：idle → loading → ready / failed。
 * - 只有 ready 才把事件交给 gtag；loading 期间只进本模块的有界队列（最多 20 条）。
 * - “页面里已有 gtag 函数 / 已有 script 标签”都不是就绪证据：要等脚本 load 事件、
 *   或 google_tag_manager 出现，超时即 failed。
 * - failed 永久停用，不循环重试；关闭采集只丢弃本模块待发事件，不清第三方 dataLayer。
 */

const MAX_QUEUE = 20
const LOAD_TIMEOUT_MS = 15000
const READY_POLL_MS = 500
const queue = []
let measurementId = ''
let enabled = false
let debugMode = false
let loadState = 'idle'
let loadTimer = null
let readyPoll = null
let configured = false
let onStatus = null
// 每次完整页面加载、每个目标只记一次，不随游戏读档、页签或采集开关重置。
const pageViewsSent = new Set()

function notifyStatus(status) {
  try { onStatus?.(status) } catch {}
}

function browserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function gtagReady() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function'
}

function clearWaiters() {
  if (loadTimer !== null) globalThis.clearTimeout(loadTimer)
  if (readyPoll !== null) globalThis.clearInterval(readyPoll)
  loadTimer = null
  readyPoll = null
}

/** 目标衡量 ID 只配置一次，避免重复 page_view；所有路径都走这里。 */
function ensureConfig() {
  if (!enabled || !measurementId || configured || !browserReady() || !gtagReady()) return
  window.gtag('config', measurementId, { send_page_view: false })
  configured = true
}

function sendPageView() {
  if (!enabled || loadState !== 'ready' || !browserReady() || !gtagReady() ||
      !measurementId || pageViewsSent.has(measurementId)) return
  ensureConfig()
  const params = {
    send_to: measurementId,
    page_title: document.title,
    // 不把查询参数或片段中的存档、调试参数等带入访问记录。
    page_location: window.location.origin + window.location.pathname,
  }
  if (debugMode) params.debug_mode = true
  window.gtag('event', 'page_view', params)
  // 只代表已交给标签，不表示GA4服务端确认收件。
  pageViewsSent.add(measurementId)
}

function flush() {
  if (!enabled || loadState !== 'ready') return
  sendPageView()
  while (queue.length) {
    const item = queue.shift()
    window.gtag('event', item.name, item.params)
  }
}

function markReady() {
  if (loadState === 'ready') return
  clearWaiters()
  loadState = 'ready'
  ensureConfig()
  if (enabled) notifyStatus('ready')
  flush()
}

function markFailed() {
  const wasEnabled = enabled
  clearWaiters()
  loadState = 'failed'
  queue.length = 0
  enabled = false
  if (wasEnabled) notifyStatus('failed')
}

/** 等待“已有安装”真正就绪：脚本 load 事件或 google_tag_manager 出现，都可作为证据。 */
function waitForExistingTag(existing) {
  loadState = 'loading'
  if (existing) {
    existing.addEventListener?.('load', markReady)
    existing.addEventListener?.('error', markFailed)
  }
  const check = () => {
    if (typeof window !== 'undefined' && window.google_tag_manager) markReady()
  }
  check()
  if (loadState !== 'ready') {
    readyPoll = globalThis.setInterval(check, READY_POLL_MS)
    loadTimer = globalThis.setTimeout(markFailed, LOAD_TIMEOUT_MS)
  }
}

function loadTag() {
  if (!browserReady()) return false
  if (loadState === 'ready') { flush(); return true }
  if (loadState === 'failed') return false
  // 已在等待：保持 loading，不因“又看到函数/脚本”跳到 ready。
  if (loadState === 'loading') return true
  window.dataLayer ||= []
  const hadGtag = gtagReady()
  if (!hadGtag) window.gtag = function gtag() { window.dataLayer.push(arguments) }
  const existing = document.querySelector('script[src*="googletagmanager.com/gtag/js"]')
  if (existing) {
    // 页面已有 Google tag：复用脚本，但必须补一次本游戏 ID 的 config（复用脚本不等于复用目标）。
    ensureConfig()
    waitForExistingTag(existing)
    return true
  }
  if (hadGtag) {
    // 有 gtag 函数但没有可见脚本（可能被拦截或由其他代码注入）：同样等证据。
    ensureConfig()
    waitForExistingTag(null)
    return true
  }
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
  script.dataset.ga4MeasurementId = measurementId
  script.addEventListener('load', markReady)
  script.addEventListener('error', markFailed)
  document.head.appendChild(script)
  window.gtag('js', new Date())
  ensureConfig()
  window.__slackOffGaId = measurementId
  loadState = 'loading'
  loadTimer = globalThis.setTimeout(markFailed, LOAD_TIMEOUT_MS)
  return true
}

/** 事件参数只接受扁平原始值；Decimal 等对象必须由调用方先转成有限 Number。 */
function sanitize(params) {
  const out = {}
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string') out[key] = value.slice(0, 100)
    else if (typeof value === 'boolean') out[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
  }
  return out
}

export function configureTransport({ id, on = false, debug = false, onStatus: listener = null } = {}) {
  onStatus = typeof listener === 'function' ? listener : null
  const nextId = String(id || '').trim()
  if (nextId !== measurementId) configured = false
  measurementId = nextId
  debugMode = debug === true
  if (on !== true || !measurementId) { enabled = false; queue.length = 0; return false }
  if (loadState === 'failed') { enabled = false; notifyStatus('failed'); return false }
  enabled = true
  notifyStatus(loadState === 'ready' ? 'ready' : 'loading')
  return loadTag()
}

export function setTransportEnabled(on) {
  if (on !== true || !measurementId) { enabled = false; queue.length = 0; return }
  // 失败是永久状态：重新开启也不能把 enabled 设回 true。
  if (loadState === 'failed') { enabled = false; notifyStatus('failed'); return }
  enabled = true
  notifyStatus(loadState === 'ready' ? 'ready' : 'loading')
  if (loadState === 'idle') loadTag()
  else if (loadState === 'ready') flush()
}

export function setTransportDebug(on) {
  debugMode = on === true
}

export function sendEvent(name, params) {
  if (!name) return false
  const payload = sanitize(params)
  if (debugMode) payload.debug_mode = true
  // 显式路由到本模块配置的媒体资源，避免沿页面已有标签的默认目标发到其他 ID。
  if (measurementId) payload.send_to = measurementId
  if (!enabled) {
    // 本地调试适配器：明确开启调试但不发送时只打印，绝不发网络请求。
    if (debugMode && typeof console !== 'undefined') console.debug('[ga4]', name, payload)
    return false
  }
  if (loadState === 'idle') loadTag()
  if (loadState === 'ready' && gtagReady()) {
    ensureConfig()
    sendPageView()
    window.gtag('event', name, payload)
    return true
  }
  if (loadState === 'loading') {
    if (queue.length >= MAX_QUEUE) queue.shift()
    queue.push({ name, params: payload })
  }
  return false
}
