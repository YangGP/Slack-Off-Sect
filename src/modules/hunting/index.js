import * as system from './system.js'

/**
 * 「妖兽猎杀」模块描述符（**不含 Vue**，可被游戏层/存档层安全引用）。
 *
 * 注册表按这里的接口挂载：state 初始化/归一化/重挂/重置、tick 钩子、期限切步、停用清理。
 * 界面（标签与面板）单独放在 ./ui.js，只由 App.vue / TabNav.vue 引入，
 * 避免「注册表 → 模块 → 界面组件 → store → state → 注册表」的循环依赖。
 */
export default {
  id: 'hunting',
  /** 存档切片键：state.hunting */
  saveKey: 'hunting',
  createState: system.createHuntingState,
  normalizeState: system.normalizeHuntingState,
  rehydrate: system.rehydrateHuntOccupancy,
  advance: system.advanceHunt,
  nextDeadline: system.nextHuntDeadline,
  deactivate: system.deactivateHunting,
}
