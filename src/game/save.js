import { normalizeState, createInitialState } from './state'
import { SAVE_VERSION, SAVE_FIELDS, isRecord, safeNumber } from './saveSchema'

export { SAVE_VERSION }

export const SAVE_KEY = 'slack-off-sect.save.v1'
const emptyStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const browserStorage = () => typeof localStorage !== 'undefined' ? localStorage : emptyStorage

/** 存档白名单只包含持久状态，运行时上下文不会进入序列化。 */
export function serialize(state, now = Date.now()) {
  const copy = Object.fromEntries(SAVE_FIELDS.filter(key => key in state).map(key => [key,
    key === 'log' ? state.log.slice(0, 60) : state[key],
  ]))
  copy.lastSaveAt = now
  copy.version = SAVE_VERSION
  return copy
}

/** 存储适配器可由浏览器、内存或测试夹具提供；错误保护按实例隔离。 */
export function createSaveRepository({ storage = browserStorage, now = () => Date.now(), warn = console.warn } = {}) {
  let loadError = ''
  const target = () => typeof storage === 'function' ? storage() : storage
  return {
    get loadError() { return loadError },
    allowRecovery() { loadError = '' },
    save(state) {
      if (loadError) return false
      try {
        const payload = serialize(state, now())
        target().setItem(SAVE_KEY, JSON.stringify(payload))
        state.lastSaveAt = payload.lastSaveAt
        return true
      } catch (error) {
        warn('[摸鱼宗门] 存档失败', error)
        return false
      }
    },
    load() {
      try {
        const raw = target().getItem(SAVE_KEY)
        if (!raw) return null
        const restored = restoreSave(JSON.parse(raw), { now: now() })
        loadError = ''
        return restored
      } catch (error) {
        loadError = error?.message || '无法读取本地存档'
        warn('[摸鱼宗门] 读档失败', error)
        return null
      }
    },
    clear() {
      try {
        target().removeItem(SAVE_KEY)
        loadError = ''
        return true
      } catch { return false }
    },
  }
}

// 保留已有工具的函数入口；实例化本身不会读取存储。
const defaultRepository = createSaveRepository()
export let saveLoadError = ''
export function allowSaveAfterRecovery() { defaultRepository.allowRecovery(); saveLoadError = '' }
export function saveToStorage(state) { return defaultRepository.save(state) }
export function loadFromStorage() {
  const state = defaultRepository.load()
  saveLoadError = defaultRepository.loadError
  return state
}
export function clearStorage() {
  const ok = defaultRepository.clear()
  saveLoadError = defaultRepository.loadError
  return ok
}

/** 导出为便于复制粘贴的 base64 文本 */
export function exportSave(state) {
  const json = JSON.stringify(serialize(state))
  return btoa(encodeURIComponent(json))
}

export function exportJson(state) {
  return JSON.stringify(serialize(state), null, 2)
}

/** 导入：base64 或原始 JSON 都可以 */
export function parseImport(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new Error('内容为空')
  let json = trimmed
  if (!trimmed.startsWith('{')) {
    json = decodeURIComponent(atob(trimmed))
  }
  const data = JSON.parse(json)
  return restoreSave(data)
}

export function freshState() {
  return createInitialState()
}

/** 旧档尽量完整恢复；未知版本或结构冲突只继承仙缘和道果。 */
export function restoreSave(data, { now = Date.now() } = {}) {
  if (!isRecord(data)) throw new Error('格式不正确')
  try {
    if (data.version != null && (!Number.isInteger(data.version) || data.version < 1 || data.version > SAVE_VERSION)) {
      throw new Error('存档版本无法兼容')
    }
    return normalizeState(data, { now, preferMembers: data.version === SAVE_VERSION && Array.isArray(data.disciples?.members) })
  } catch (error) {
    const state = createInitialState(now)
    state.karma = safeNumber(data.karma ?? data.resources?.karma)
    state.dao = Math.floor(safeNumber(data.dao ?? data.resources?.dao))
    state.resources.karma = state.karma
    state.resources.dao = state.dao
    state.__recoveryNotice = `旧存档无法完整兼容，已保留仙缘 ${state.karma} 与道果 ${state.dao}，其余进度重新开始。`
    return state
  }
}
