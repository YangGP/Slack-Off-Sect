/**
 * 可选模块清单与开关判定。
 *
 * 定位：这里只放「有哪些模块」这一层元数据，**零依赖**，可以被数据层、系统层、
 * 存档层自由引用而不产生循环。模块的具体内容（数据/系统/界面）放在 `src/modules/<id>/`，
 * 由 `src/game/moduleRegistry.js` 聚合挂载。
 *
 * 开关读 `state.settings.modules[<id>]`：缺省用 defaultEnabled（旧档自动按默认值补齐）。
 * 条目上带 `module: '<id>'` 的目录项（资源/岗位/建筑/配方/研究）在模块关闭时统一失效，
 * 判定集中在 core 的解锁函数与 economy 的累加循环里。
 * 需要多个模块任一启用即生效的条目改用 `moduleAny: ['a', 'b']`（例如猎杀与外交共用的信符供给）。
 */
export const MODULES = [
  {
    id: 'hunting',
    name: '妖兽猎杀',
    // 界面标签 id（关闭后若正停留在该页则回退到宗门页）
    tabId: 'hunt',
    desc: '猎场出征、信符与兽材利用。关闭后隐藏猎杀页与相关建筑/岗位/研究；信符供给在「外交」模块启用时保留。',
    defaultEnabled: true,
  },
  {
    id: 'diplomacy',
    name: '宗门外交',
    tabId: 'diplomacy',
    desc: '与邻宗互市：以富余资源换取紧缺物资。关闭后隐藏外交页与相关研究；信符供给在「猎杀」模块启用时保留。',
    defaultEnabled: true,
  },
]

export const MODULE_MAP = Object.fromEntries(MODULES.map((m) => [m.id, m]))

/** 各模块的默认开关（存档初始化与旧档归一化都用它） */
export function defaultModules() {
  return Object.fromEntries(MODULES.map((m) => [m.id, m.defaultEnabled]))
}

/** 模块是否启用：读 settings，缺省回落到 defaultEnabled */
export function isModuleEnabled(state, id) {
  const meta = MODULE_MAP[id]
  if (!meta) return false
  const value = state?.settings?.modules?.[id]
  return value === undefined ? meta.defaultEnabled : value === true
}

/** 目录项是否实际生效：未标记模块恒为真；moduleAny 任一启用即生效；否则看 module 开关 */
export function isEntryEnabled(state, entry) {
  if (entry?.moduleAny) return entry.moduleAny.some((id) => isModuleEnabled(state, id))
  return !entry?.module || isModuleEnabled(state, entry.module)
}

/**
 * 把模块条目按锚点插回目录，保持与拆分前一致的顺序。
 * 同时兼容对象数组（按 item.id）与字符串数组（直接比较元素）。
 */
export function insertAfter(list, anchorId, items, key = 'id') {
  const idx = list.findIndex((item) => (item?.[key] ?? item) === anchorId)
  if (idx < 0) return [...list, ...items]
  return [...list.slice(0, idx + 1), ...items, ...list.slice(idx + 1)]
}
