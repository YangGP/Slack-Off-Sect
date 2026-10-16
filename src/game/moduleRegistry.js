import hunting from '@/modules/hunting/index.js'
import diplomacy from '@/modules/diplomacy/index.js'
import { isModuleEnabled } from '@/data/modules'

/**
 * 可选模块注册表（游戏层，**不含 Vue**）。
 *
 * 主循环、存档与状态初始化都通过这里按「已注册模块」挂载，核心不再直接 import 任何
 * 具体模块的内部实现。模块描述符见 `src/modules/<id>/index.js`；界面贡献见 `src/modules/<id>/ui.js`。
 *
 * 注意依赖方向：本文件可以 import 模块，模块内部的系统代码只能 import 核心的系统/数据，
 * 不能反向 import 本文件，否则会形成环（架构检查会验证）。
 */
export const MODULE_DESCRIPTORS = [hunting, diplomacy]

export const MODULE_DESCRIPTOR_MAP = Object.fromEntries(MODULE_DESCRIPTORS.map((m) => [m.id, m]))

/** 各模块的存档切片键（供 SAVE_FIELDS / 结构校验动态追加） */
export function moduleSaveKeys() {
  return MODULE_DESCRIPTORS.map((m) => m.saveKey)
}

/** 初始状态里的模块切片：{ hunting: {...} } */
export function initialModuleState() {
  const out = {}
  for (const m of MODULE_DESCRIPTORS) out[m.saveKey] = m.createState()
  return out
}

/**
 * 归一化各模块的存档切片。
 * 无论开关状态均保留合法历史与偏好；关闭模块的活动任务由重挂阶段召回，
 * 以便恢复任务快照中的原岗位，而不是在读取切片时丢弃所有信息。
 */
export function normalizeModuleSlices(rawState, freshState) {
  const out = {}
  for (const m of MODULE_DESCRIPTORS) {
    out[m.saveKey] = m.normalizeState(rawState?.[m.saveKey], freshState?.[m.saveKey])
  }
  return out
}

/** 读档后重挂启用模块，召回停用模块的活动任务。 */
export function rehydrateModules(state) {
  for (const m of MODULE_DESCRIPTORS) {
    if (!isModuleEnabled(state, m.id)) { m.deactivate?.(state); continue }
    m.rehydrate?.(state)
  }
}

/** 转世/飞升时重置模块切片为本世初始值 */
export function resetModules(state, fresh) {
  for (const m of MODULE_DESCRIPTORS) state[m.saveKey] = fresh[m.saveKey]
}

/** 推进所有已启用模块；返回是否有结算发生（供调用方决定是否重算派生数据） */
export function runModuleTicks(state, derived, dt) {
  let changed = false
  for (const m of MODULE_DESCRIPTORS) {
    if (!isModuleEnabled(state, m.id)) continue
    if (m.advance?.(state, derived, dt)) changed = true
  }
  return changed
}

/**
 * 长离线的有界近似推进：模块可选实现 `advanceOffline(state, derived, dt, ctx)`，
 * 自己负责把整段时长批量结算（例如猎杀按可完成趟数估算），而不是逐次调用 `advance`。
 * 未实现该钩子的模块在离线段内不推进 —— 与「离线不新增随机事件」的现行约定一致。
 */
export function runModuleOfflineTicks(state, derived, dt, ctx = {}) {
  let changed = false
  for (const m of MODULE_DESCRIPTORS) {
    if (!isModuleEnabled(state, m.id)) continue
    if (m.advanceOffline?.(state, derived, dt, ctx)) changed = true
  }
  return changed
}

/** 最近一个模块期限（毫秒，> now），无则 Infinity；主循环据此切步 */
export function nextModuleDeadline(state, now) {
  let earliest = Infinity
  for (const m of MODULE_DESCRIPTORS) {
    if (!isModuleEnabled(state, m.id)) continue
    const at = m.nextDeadline?.(state, now)
    if (at > now && at < earliest) earliest = at
  }
  return earliest
}

/** 停用某模块时的清理（关闭开关调用） */
export function deactivateModule(state, id) {
  const m = MODULE_DESCRIPTOR_MAP[id]
  m?.deactivate?.(state)
}
