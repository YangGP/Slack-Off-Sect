import hunting from './hunting/ui.js'

/**
 * 已注册可选模块的界面贡献（标签 + 面板）汇总，供组件层遍历。
 * 这是 game 层 moduleRegistry 的「界面版」：game 层保持无 Vue，Vue 只在这里出现。
 */
export const MODULE_UI = [hunting]
