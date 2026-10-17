import { normalizeState, createInitialState } from './state'
import { SAVE_VERSION, SAVE_FIELDS, isRecord } from './saveSchema'
import { ZERO, floorMoney, moneyNonNegative } from './decimal'
import { cloneRuntime } from './clone'
import { encodeMoneyFields } from './moneyFields'

export { SAVE_VERSION }

export const SAVE_KEY = 'slack-off-sect.save.v1'
const emptyStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const browserStorage = () => typeof localStorage !== 'undefined' ? localStorage : emptyStorage

/**
 * 存档白名单只包含持久状态，运行时上下文不会进入序列化。
 * 返回的是**独立的普通数据**（深拷贝，不暴露状态的嵌套引用）；
 * 金额字段按白名单转十进制字符串，控制域继续是 JSON number。
 */
export function serialize(state, now = Date.now()) {
  const copy = Object.fromEntries(SAVE_FIELDS.filter(key => key in state).map(key => [key,
    key === 'log' ? cloneRuntime(state.log.slice(0, 60)) : cloneRuntime(state[key]),
  ]))
  copy.lastSaveAt = now
  copy.version = SAVE_VERSION
  return encodeMoneyFields(copy)
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

/** 旧档尽量完整恢复；未知版本或结构冲突只继承仙缘和道果。 */
export function restoreSave(data, { now = Date.now() } = {}) {
  if (!isRecord(data)) throw new Error('格式不正确')
  try {
    if (data.version != null && (!Number.isInteger(data.version) || data.version < 1 || data.version > SAVE_VERSION)) {
      throw new Error('存档版本无法兼容')
    }
    const version = Number.isInteger(data.version) ? data.version : 0
    // v2 起个体成员就是权威数据：升到 v3 不能因为版本号判断变化而重建弟子。
    const preferMembers = version >= 2 && Array.isArray(data.disciples?.members)
    return normalizeState(data, { now, preferMembers })
  } catch (error) {
    const state = createInitialState(now)
    // 结构冲突时只继承永久货币：按金额域安全解码，不经 Number 或 MAX_SAFE_INTEGER 夹取。
    // 恢复分支绕过 validateState，必须在这里做非负清洗，否则 '-5' 会让仙缘变负（旧 safeNumber 会夹到 0）。
    state.karma = moneyNonNegative(data.karma ?? data.resources?.karma, ZERO)
    state.dao = floorMoney(moneyNonNegative(data.dao ?? data.resources?.dao, ZERO))
    state.resources.karma = state.karma
    state.resources.dao = state.dao
    state.__recoveryNotice = `旧存档无法完整兼容，已保留仙缘 ${state.karma.toString()} 与道果 ${state.dao.toString()}，其余进度重新开始。`
    return state
  }
}
