import * as system from './system.js'

/**
 * 「宗门外交」模块描述符（**不含 Vue**，可被游戏层/存档层安全引用）。
 *
 * 交易为主动触发、无占时任务：不需要 advance / nextDeadline / rehydrate，
 * 也不设冷却字段，读档后可直接继续交易。
 */
export default {
  id: 'diplomacy',
  /** 存档切片键：state.diplomacy */
  saveKey: 'diplomacy',
  createState: system.createDiplomacyState,
  normalizeState: system.normalizeDiplomacyState,
  deactivate: system.deactivateDiplomacy,
}
