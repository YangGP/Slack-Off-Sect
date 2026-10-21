import { normalizeState, createInitialState } from './state'
import { SAVE_VERSION, SAVE_FIELDS, isRecord } from './saveSchema'
import { ZERO, moneyNonNegative } from './decimal'
import { cloneRuntime } from './clone'
import { encodeMoneyFields } from './moneyFields'
import { D7_RULESET } from '@/data/faith'
import { STORAGE_PREFIX } from './deployment'

export { SAVE_VERSION, D7_RULESET }

/** D7 新代专用键；旧键只作为原始备份读取，永不被本代覆盖。 */
export const SAVE_KEY = `${STORAGE_PREFIX}.save.d7.v1`
export const LEGACY_SAVE_KEY = `${STORAGE_PREFIX}.save.v1`
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
  copy.ruleset = D7_RULESET
  return encodeMoneyFields(copy)
}

/** 规则代际不符一律拒绝；不能在 normalizeState / 离线结算之前放行。 */
function assertRuleset(data) {
  if (!isRecord(data)) throw new Error('格式不正确')
  if (data.ruleset !== D7_RULESET) throw new Error('存档不属于当前规则代际')
}

/** 存储适配器可由浏览器、内存或测试夹具提供；错误保护按实例隔离。 */
export function createSaveRepository({ storage = browserStorage, now = () => Date.now(), warn = console.warn } = {}) {
  let loadError = ''
  const target = () => typeof storage === 'function' ? storage() : storage
  return {
    get loadError() { return loadError },
    allowRecovery() { loadError = '' },
    /** 旧键仍是原始载荷：只读，用于导出与提示，不参与本代加载。 */
    legacyPayload() {
      try { return target().getItem(LEGACY_SAVE_KEY) } catch { return null }
    },
    legacyOnly() {
      try {
        if (target().getItem(SAVE_KEY)) return false
        return !!target().getItem(LEGACY_SAVE_KEY)
      } catch { return false }
    },
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
        const data = JSON.parse(raw)
        assertRuleset(data)
        const restored = restoreSave(data, { now: now(), allowRecovery: false })
        loadError = ''
        return restored
      } catch (error) {
        loadError = error?.message || '无法读取本地存档'
        warn('[摸鱼宗门] 读档失败', error)
        return null
      }
    },
    /** 只删除当前新代键；旧键备份保留。 */
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

/** 导入：base64 或原始 JSON 都可以；异代存档直接拒绝。 */
export function parseImport(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new Error('内容为空')
  let json = trimmed
  if (!trimmed.startsWith('{')) {
    json = decodeURIComponent(atob(trimmed))
  }
  const data = JSON.parse(json)
  assertRuleset(data)
  return restoreSave(data, { allowRecovery: false })
}

/**
 * 浏览器加载/导入使用 allowRecovery: false：结构冲突必须抛错并保留原档。
 * 默认 allowRecovery: true 仅保留给显式工具入口，此时未知版本或结构冲突只继承仙缘和道果。
 * 规则代际由调用方（load / parseImport）先行校验；这里不再处理异代。
 */
export function restoreSave(data, { now = Date.now(), allowRecovery = true } = {}) {
  if (!isRecord(data)) throw new Error('格式不正确')
  const restoreStrict = () => {
    if (data.version != null && (!Number.isInteger(data.version) || data.version < 1 || data.version > SAVE_VERSION)) {
      throw new Error('存档版本无法兼容')
    }
    const version = Number.isInteger(data.version) ? data.version : 0
    const preferMembers = version >= 2 && Array.isArray(data.disciples?.members)
    return normalizeState(data, { now, preferMembers })
  }
  // 浏览器加载/导入走 allowRecovery=false：结构冲突必须冒泡到读档失败保护，不能静默重开。
  if (!allowRecovery) return restoreStrict()
  try {
    return restoreStrict()
  } catch (error) {
    const state = createInitialState(now)
    // 结构冲突时只继承永久货币：按金额域安全解码，不经 Number 或 MAX_SAFE_INTEGER 夹取。
    // 恢复分支绕过 validateState，必须在这里做非负清洗，否则 '-5' 会让仙缘变负（旧 safeNumber 会夹到 0）。
    state.karma = moneyNonNegative(data.karma ?? data.resources?.karma, ZERO)
    state.dao = moneyNonNegative(data.dao ?? data.resources?.dao, ZERO)
    state.resources.karma = state.karma
    state.resources.dao = state.dao
    state.__recoveryNotice = `旧存档无法完整兼容，已保留仙缘 ${state.karma.toString()} 与道果 ${state.dao.toString()}，其余进度重新开始。`
    return state
  }
}
