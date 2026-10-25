/**
 * 仙缘修持：跨轮回保留的永久特权商店，仙缘计价。
 *
 * 纯数据层：只放常量、元数据与归一化，不引入引擎、Vue 或网络依赖；
 * 报价与结算在 `src/game/systems/karmaShop.js`，效果由 economy / progression / state 读取。
 *
 * 关键口径：**已修持花掉的仙缘不再计入产出乘区**（karmaMultipliers 只吃余额），
 * 「囤加成 vs 买特权」是本系统的核心决策。
 *
 * 定价采用首价×增长率^已购等级，保留小数；新旧共14项。
 * 买满所需轮数取决于经营策略，尚未完成长期校准。
 */

import { ZERO, moneyNonNegative } from '../game/decimal.js'

export const KARMA_PROGRESSION_VERSION = 1

/**
 * 永久修持条目。effect 为每级数值，规则层按等级线性求和：
 *   buildingDiscount 建筑造价折扣（乘算 (1-discount)，全游戏唯一建筑价格折扣层）
 *   researchInsightDiscount 普通研究直接灵机费用折扣
 *   offlineHours     离线收益上限（小时，与龟息功/定息法同层相加）
 *   storageRatio     有限容量加成（乘在仙缘仓储乘区之上）
 *   startKit         转世开局携带物资 { qi, insight }（每级固定数额）
 *   insightBonus     转世/飞升仙缘结算的独立加成（乘算）
 *   ascendBonus      转世/飞升仙缘加成（与轮回池/因果通感同层相加）
 *   deathKeepBonus   身死保留仙缘比例加成（在 0.5 基础上加百分点）
 */
export const KARMA_PERKS = [
  {
    id: 'foundationEcho', name: '道基共鸣', glyph: '基', baseCost: 8, growth: 1.5, max: 5,
    effect: { buildingDiscount: 0.03 },
    desc: '每级建筑造价 −3%，同层乘算（满级 −15%）。宗门营造与扩建永久减负。',
    needs: {},
  },
  {
    id: 'pastLifeWisdom', name: '宿慧', glyph: '慧', baseCost: 8, growth: 1.5, max: 5,
    effect: { researchInsightDiscount: 0.02 },
    desc: '修真与普通技艺的直接灵机费用每级减少2%，最多10%；不含法宝、香火、配方或破境。',
    needs: {},
  },
  {
    id: 'dreamBreath', name: '梦息', glyph: '息', baseCost: 8, growth: 1.5, max: 5,
    effect: { offlineHours: 2 },
    desc: '每级离线收益上限 +2 小时（满级 +10 小时），与龟息功、定息法同层相加。',
    needs: {},
  },
  {
    id: 'karmaField', name: '因果田', glyph: '田', baseCost: 8, growth: 1.5, max: 4,
    effect: { storageRatio: 0.05 },
    desc: '每级适用资源有限容量 +5%（满级 +20%），乘在仙缘仓储乘区之上。',
    needs: { rebirths: 1 },
  },
  {
    id: 'heirloomRelics', name: '随身遗物', glyph: '遗', baseCost: 8, growth: 1.5, max: 4,
    effect: { startKit: { qi: 40, insight: 15 } },
    desc: '每级转世/飞升/身死后开局携带灵气 40、灵机 15（满级 160/60），让重修第一步不必从零点击。',
    needs: { rebirths: 1 },
  },
  {
    id: 'insightLedger', name: '前世账簿', glyph: '账', baseCost: 12, growth: 1.5, max: 4,
    effect: { insightBonus: 0.08 },
    desc: '每级转世/飞升仙缘结算所得 +8%（满级 +32%），作为独立乘区计算。',
    needs: { rebirths: 1 },
  },
  {
    id: 'samsaraPact', name: '轮回契', glyph: '契', baseCost: 18, growth: 1.5, max: 4,
    effect: { ascendBonus: 0.10 },
    desc: '每级转世/飞升所得仙缘 +10%（满级 +40%），与轮回池、因果通感同层相加。',
    needs: { rebirths: 2 },
  },
  {
    id: 'deathCharm', name: '安魂符', glyph: '魂', baseCost: 12, growth: 1.5, max: 3,
    effect: { deathKeepBonus: 0.04 },
    desc: '每级冲关身死时保留的仙缘 +4 个百分点（满级由 50% 提至 62%），失败也不至于两手空空。',
    needs: {},
  },
  {"id":"constructionLineage","name":"营造法统","glyph":"营","baseCost":120,"growth":2,"max":5,"effect":{"buildingPriceReduction":0.002},"needs":{"ascensions":1},"desc":"地面建筑涨价率每级降低0.002，最低1.05；含灵能阶段，不含小界。"},
  {"id":"artisanLegacy","name":"百工传承","glyph":"百","baseCost":40,"growth":1.8,"max":5,"effect":{"stationCapacityRatio":0.05},"needs":{"bestRealm":4},"desc":"六类既有工位容量比例每级+5%，不赠基础工位。"},
  {"id":"powerCalibration","name":"灵枢调校","glyph":"灵","baseCost":60,"growth":1.8,"max":5,"effect":{"productionEnergyDiscount":0.02},"needs":{"bestRealm":7},"desc":"五类高阶生产设施灵能维护每级减少2%，最多10%。"},
  {"id":"worldMaterialThrift","name":"仙材节用","glyph":"仙","baseCost":80,"growth":1.8,"max":5,"effect":{"worldBuildingDiscount":0.02},"needs":{"worldBlueprint":true},"desc":"小界采集、承载及专属设施建设材料每级减少2%，不含维护和配方。"},
  {"id":"refinementInsight","name":"祭器心得","glyph":"祭","baseCost":30,"growth":1.8,"max":5,"effect":{"refineInsightDiscount":0.03},"needs":{"bestRealm":4},"desc":"法宝祭炼灵机费用每级减少3%，不减炼成或其他材料。"},
  {"id":"archiveWorkflow","name":"典藏工序","glyph":"典","baseCost":30,"growth":1.8,"max":5,"effect":{"knowledgeCraftSpeed":0.1},"needs":{"bestRealm":5},"desc":"道札、道论、阵图自动加工效率每级+10%，不改变每份用料与产出。"},
]

export const KARMA_PERK_MAP = Object.fromEntries(KARMA_PERKS.map(entry => [entry.id, entry]))

export function createKarmaProgression() {
  return {
    version: KARMA_PROGRESSION_VERSION,
    levels: Object.fromEntries(KARMA_PERKS.map(entry => [entry.id, 0])),
    totalSpent: ZERO,
  }
}

function clampLevel(value, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(max, Math.floor(n)))
}

/** 读档归一化：等级夹到上限、未知 id 丢弃、累计投入按金额清洗。 */
export function normalizeKarmaProgression(raw) {
  const base = createKarmaProgression()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const levels = raw.levels && typeof raw.levels === 'object' ? raw.levels : {}
  for (const entry of KARMA_PERKS) base.levels[entry.id] = clampLevel(levels[entry.id], entry.max)
  base.totalSpent = moneyNonNegative(raw.totalSpent)
  return base
}
