import { normalizeState, createInitialState } from './state'

export const SAVE_KEY = 'slack-off-sect.save.v1'
export const SAVE_VERSION = 1

/** 浏览器才有 localStorage；纯 Node / SSR 环境下退化为“无存档” */
const storage =
  typeof localStorage !== 'undefined'
    ? localStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }

/** 去掉内存专用的临时字段（以 __ 开头的都不进存档） */
function serialize(state) {
  const copy = {}
  for (const k in state) {
    if (k.startsWith('__')) continue
    if (k === 'log') {
      copy.log = state.log.slice(0, 60)
      continue
    }
    copy[k] = state[k]
  }
  copy.lastSaveAt = Date.now()
  copy.version = SAVE_VERSION
  return copy
}

export function saveToStorage(state) {
  try {
    const payload = serialize(state)
    storage.setItem(SAVE_KEY, JSON.stringify(payload))
    state.lastSaveAt = payload.lastSaveAt
    return true
  } catch (err) {
    console.warn('[摸鱼宗门] 存档失败', err)
    return false
  }
}

export function loadFromStorage() {
  try {
    const raw = storage.getItem(SAVE_KEY)
    if (!raw) return null
    return normalizeState(JSON.parse(raw))
  } catch (err) {
    console.warn('[摸鱼宗门] 读档失败', err)
    return null
  }
}

export function clearStorage() {
  try {
    storage.removeItem(SAVE_KEY)
    return true
  } catch (err) {
    return false
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
  if (typeof data !== 'object' || data === null) throw new Error('格式不正确')
  return normalizeState(data)
}

export function freshState() {
  return createInitialState()
}
