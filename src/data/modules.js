/**
 * 功能模块清单与接入判定。
 *
 * 定位：这里只放「有哪些模块」这一层元数据，**零依赖**，可以被数据层、系统层、
 * 存档层自由引用而不产生循环。模块的具体内容（数据/系统/界面）放在 `src/modules/<id>/`，
 * 由 `src/game/moduleRegistry.js` 聚合挂载。
 *
 * 猎杀与外交始终启用；module/moduleAny 仅表示代码归属，不提供玩法开关。
 * 旧档 settings.modules 中的 false 不再影响功能接入。
 * 需要多个模块任一启用即生效的条目改用 `moduleAny: ['a', 'b']`（例如猎杀与外交共用的信符供给）。
 */
export const MODULES = [
  {
    id: 'hunting',
    name: '妖兽猎杀',
    // 界面标签 id（关闭后若正停留在该页则回退到宗门页）
    tabId: 'hunt',
    desc: '猎场出征、信符与兽材利用。',
    defaultEnabled: true,
  },
  {
    id: 'diplomacy',
    name: '宗门外交',
    tabId: 'diplomacy',
    desc: '与邻宗互市，以富余资源换取紧缺物资。',
    defaultEnabled: true,
  },
]

export const MODULE_MAP = Object.fromEntries(MODULES.map((m) => [m.id, m]))

/** 各模块的默认开关（存档初始化与旧档归一化都用它） */
export function defaultModules() {
  return Object.fromEntries(MODULES.map((m) => [m.id, m.defaultEnabled]))
}

/** 已注册模块始终接入；旧存档中的关闭标记不再生效。 */
export function isModuleEnabled(state, id) {
  return Object.hasOwn(MODULE_MAP, id)
}

/** 目录项是否归属于已注册模块；未标记归属的核心条目始终生效。 */
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
