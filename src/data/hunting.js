/**
 * 妖兽猎杀：猎场定义与公式参数。
 *
 * 首轮只开放山麓（foothills）；深山、禁地仅保留稳定 ID 与结构，数值待后续策划。
 * 猎杀是一次「消耗猎备 → 派弟子出征 → 归队取得兽材」的任务，不是常驻岗位：
 * 兽材由任务结算产生，不写进 jobs/crafts 的静态产出表，所以来源/去向由本模块声明。
 *
 * 成功率、效率、进阶占比与最终产出的完整公式见 docs/BEAST-SYSTEM.md §4。
 */

/** 通用参数（首轮试调值） */
export const HUNT = {
  /** 每次出征消耗的猎备 */
  PREPARATION_COST: 100,
  /** 单队人数与同时任务数 */
  TEAM_MIN: 1,
  TEAM_MAX: 5,
  MAX_ACTIVE_MISSIONS: 1,
  /** 成功率与增益上限 */
  SUCCESS_FLOOR: 0.35,
  SUCCESS_CAP: 0.99,
  YIELD_BONUS_CAP: 1.0,
  DURATION_REDUCTION_CAP: 0.4,
}

/**
 * 猎场。
 * - entryRealm / minDiscipleRealm / recommendRealm 沿用代码境界下标
 *   （凡体 0、引气 1、炼气 2、筑基 3、金丹 4、元婴 5、化神 6、炼虚 7…）
 * - baseYield / advancedYield 为「基准秒产」，同档骨皮同时按此产出
 * - advancedRatio 为进阶档最少占比（山麓无进阶档）
 */
export const HUNT_FIELDS = [
  {
    id: 'foothills',
    name: '山麓',
    desc: '近山的缓坡与溪谷，普通妖兽出没。皮骨可作起居与护具之料。',
    unlocked: true,
    entryRealm: 3,
    minDiscipleRealm: 0,
    recommendRealm: 3,
    baseDuration: 120,
    successBase: 0.9,
    baseYield: { beastHide: 0.12, beastBone: 0.08 },
    advancedYield: null,
  },
]

export const HUNT_FIELD_MAP = Object.fromEntries(HUNT_FIELDS.map((f) => [f.id, f]))

/** 首轮默认猎场 */
export const DEFAULT_HUNT_FIELD = HUNT_FIELDS[0].id
