/**
 * D7 香火修持：愿力兑换、本世仪轨与永久道心修持。
 *
 * 纯数据层：只放常量、元数据与归一化，不引入引擎、Vue 或网络依赖；
 * 报价与结算在 `src/game/systems/faith.js`，效果由 economy / progression 读取。
 */

import { ZERO, money, moneyMax } from '../game/decimal.js'

/** 规则代际：旧键存档一律不进入本代加载路径。 */
export const D7_RULESET = 'd7.1'
export const FAITH_PROGRESSION_VERSION = 1
/** 证心兑换：10000 愿力 → 1 道心。 */
export const DAO_HEART_DIVISOR = 10000

/** 本世仪轨：多级、愿力计价，转世/飞升/身死时清空。 */
export const RITUALS = [
  {
    id: 'gatherIncense', name: '聚香法', glyph: '香', baseCost: 200, growth: 1.6, max: 20,
    desc: '每级香火资源产出 +30%，同层相加。未学《祖师香火》时最多 10 级。',
    needs: { realm: 4, upgrade: 'vowPower' }, unlockUpgrade: 'ancestorIncense', softCap: 10,
  },
  {
    id: 'holdVows', name: '收愿仪', glyph: '仪', baseCost: 200, growth: 1.6, max: 10,
    desc: '每级香火总仓容 +25%，同层相加，只作用于香火。',
    needs: { realm: 4, upgrade: 'vowPower' },
  },
]

/** 永久道心修持：跨轮回保留，道心计价。 */
export const CULTIVATION = [
  { id: 'vowInsight', name: '凝愿真解', glyph: '解', baseCost: 1, growth: 2, max: 10,
    desc: '每级提高凝愿所得愿力：C(n)=min(1, 0.05×(sqrt(1+40n)-1))。', needs: { realm: 6, upgrade: 'vowPower' } },
  { id: 'realmDevotion', name: '万民归心', glyph: '归', baseCost: 1, growth: 2, max: 10,
    desc: '每级强化当前宗门境界的生产奖励 10%。', needs: { realm: 6, upgrade: 'vowPower' } },
  { id: 'tribulationVow', name: '应劫正愿', glyph: '劫', baseCost: 1, growth: 2, max: 5,
    desc: '每级提高合体／大乘／渡劫成功率 3／4／5 个百分点。', needs: { realm: 6, upgrade: 'vowPower' } },
  { id: 'deathInsight', name: '护道真意', glyph: '护', baseCost: 2, growth: 2, max: 5,
    desc: '每级相对降低失败后身死概率 8%，最多 40%。', needs: { realm: 7, upgrade: 'vowPower' } },
  { id: 'realmStability', name: '定神守境', glyph: '定', baseCost: 2, growth: 2, max: 5,
    desc: '每级相对降低存活失败退境概率 5%，最多 25%。', needs: { realm: 7, upgrade: 'vowPower' } },
]

/** 一次性专属条目：仍在中央 UPGRADE_MAP 中，界面归香火页。 */
export const FAITH_UPGRADES = [
  {
    id: 'incenseRite', name: '迎香礼', glyph: '礼', kind: 'faith', page: 'faith',
    cost: { vow: 150 },
    desc: '山门迎香的礼数。香使岗位产出 +35%。',
    effectDesc: '因此香使收得更稳：香使岗位产出 +35%。',
    effects: { jobRatio: { incenseKeeper: 0.35 } },
    needs: { realm: 4, upgrades: ['vowPower'], ritual: { gatherIncense: 1 }, building: { id: 'gate', count: 3 } },
  },
  {
    id: 'ancestorIncense', name: '祖师香火', glyph: '祖', kind: 'faith', page: 'faith',
    cost: { vow: 900 },
    desc: '祖师殿的香火不断，可将聚香法推至 11～20 级。',
    effectDesc: '因此聚香法可继续精研（11～20 级），不再额外提供产出加成。',
    effects: {},
    note: '开放聚香法 11～20 级',
    needs: { realm: 5, upgrades: ['vowPower', 'incenseStudy'], ritual: { gatherIncense: 10 } },
  },
  {
    id: 'greatVowScripture', name: '大乘愿典', glyph: '典', kind: 'faith', page: 'faith',
    cost: { vow: 6000 },
    desc: '以愿力写就的大乘典籍。香火资源产出 +120%，与聚香法同层相加。',
    effectDesc: '因此香火产出再进一大步：香火资源产出 +120%。',
    effects: { ratio: { faith: 1.2 } },
    needs: { realm: 9, upgrades: ['mahayanaArt'] },
  },
  {
    id: 'vowGuard', name: '愿力护道', glyph: '愿', kind: 'faith', page: 'faith',
    cost: { insight: 12000, faith: 6000 },
    desc: '以愿力护持道体、消解天威。本世突破失败后的身死概率降低 5 个百分点，最低为 0%。',
    effectDesc: '学会后本世常驻生效，无需逐次投入；突破失败后的身死概率降低 5 个百分点，最低为 0%。',
    effects: { tribulationSafety: 0.05 },
    needs: { realm: 9, upgrades: ['vowPower'] },
  },
]

export const RITUAL_MAP = Object.fromEntries(RITUALS.map(entry => [entry.id, entry]))
export const CULTIVATION_MAP = Object.fromEntries(CULTIVATION.map(entry => [entry.id, entry]))
export const FAITH_UPGRADE_MAP = Object.fromEntries(FAITH_UPGRADES.map(entry => [entry.id, entry]))

export function createFaithProgression() {
  return {
    version: FAITH_PROGRESSION_VERSION,
    rituals: Object.fromEntries(RITUALS.map(entry => [entry.id, 0])),
    cultivation: Object.fromEntries(CULTIVATION.map(entry => [entry.id, 0])),
    totalDaoHeart: ZERO,
  }
}

function clampLevel(value, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(max, Math.floor(n)))
}

/** 读档归一化：等级夹到上限、未知 id 丢弃、累计道心按金额清洗。 */
export function normalizeFaithProgression(raw) {
  const base = createFaithProgression()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const rituals = raw.rituals && typeof raw.rituals === 'object' ? raw.rituals : {}
  const cultivation = raw.cultivation && typeof raw.cultivation === 'object' ? raw.cultivation : {}
  for (const entry of RITUALS) base.rituals[entry.id] = clampLevel(rituals[entry.id], entry.max)
  for (const entry of CULTIVATION) base.cultivation[entry.id] = clampLevel(cultivation[entry.id], entry.max)
  base.totalDaoHeart = moneyMax(ZERO, money(raw.totalDaoHeart ?? ZERO))
  return base
}
