import DiplomacyPanel from './DiplomacyPanel.vue'

/**
 * 「宗门外交」模块的界面贡献（标签 + 面板）。
 * **只由组件层引入**（App.vue / TabNav.vue 经 src/modules/uiRegistry.js 汇总）。
 */
export default {
  id: 'diplomacy',
  /** 标签插在「猎杀」之后（若猎杀关闭则自动追加到末尾） */
  tab: { id: 'diplomacy', name: '外交', after: 'hunt' },
  panel: DiplomacyPanel,
}
