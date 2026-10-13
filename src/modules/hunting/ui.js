import HuntPanel from './HuntPanel.vue'

/**
 * 「妖兽猎杀」模块的界面贡献（标签 + 面板）。
 * **只由组件层引入**（App.vue / TabNav.vue 经 src/modules/uiRegistry.js 汇总），
 * 游戏层与存档层不引用本文件，避免 Vue 依赖倒灌进引擎。
 */
export default {
  id: 'hunting',
  /** 标签插在「炼制」之后，保持与拆分前一致的顺序 */
  tab: { id: 'hunt', name: '猎杀', after: 'craft' },
  panel: HuntPanel,
}
