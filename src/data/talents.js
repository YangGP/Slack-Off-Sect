/** 个人天赋：身份固定；level 表示原天赋成长，开放 Lv.1–Lv.3。 */
export const TALENT_RULES = {
  maxCount: 3, maxLevel: 3, breakthroughChance: 0.1, upgradeChance: 0.4,
  birthCounts: [{ count: 0, weight: 70 }, { count: 1, weight: 25 }, { count: 2, weight: 5 }],
  caps: { cultivation: 0.9, job: 0.9, breakthrough: 0.14, huntSuccess: 0.14, huntYield: 0.9 },
}
export const TALENT_TIERS = [
  { id: 'huang', name: '黄', weight: 60 }, { id: 'xuan', name: '玄', weight: 30 },
  { id: 'di', name: '地', weight: 9 }, { id: 'tian', name: '天', weight: 1 },
]
export const TALENT_TIER_MAP = Object.assign(Object.create(null), Object.fromEntries(TALENT_TIERS.map(tier => [tier.id, tier])))
/** 各品级 Lv.1／Lv.2／Lv.3 数值：Lv.2 为 Lv.1 的 1.5 倍、Lv.3 为 1.8 倍，逐级增量递减。 */
const CULTIVATION_VALUES = {
  huang: [0.1, 0.15, 0.18], xuan: [0.2, 0.3, 0.36], di: [0.35, 0.52, 0.63], tian: [0.5, 0.75, 0.9],
}
const BREAKTHROUGH_VALUES = {
  huang: [0.02, 0.03, 0.04], xuan: [0.04, 0.06, 0.07], di: [0.06, 0.09, 0.11], tian: [0.08, 0.12, 0.14],
}
// 猎杀个人天赋（v0.421）：成功率按百分点（口径同突破天赋），收获按比例（口径同修炼/岗位天赋）。
const HUNT_SUCCESS_VALUES = {
  huang: [0.02, 0.03, 0.04], xuan: [0.04, 0.06, 0.07], di: [0.06, 0.09, 0.11], tian: [0.08, 0.12, 0.14],
}
const HUNT_YIELD_VALUES = {
  huang: [0.1, 0.15, 0.18], xuan: [0.2, 0.3, 0.36], di: [0.35, 0.52, 0.63], tian: [0.5, 0.75, 0.9],
}
const cultivationNames = ['勤修不辍', '修炼奇才', '道心澄明', '天道眷顾']
const breakthroughNames = ['心气沉稳', '行气通畅', '道基稳固', '破境通明']
const huntSuccessNames = ['耳聪目明', '识兽有方', '兽性通明', '天生猎瞳']
const huntYieldNames = ['手快眼疾', '剥取利落', '庖丁之术', '解牛神技']
const jobs = [
  ['farmer', '阵徒', ['引气熟手', '聚气通窍', '气脉亲和', '御气通玄']],
  ['woodcutter', '樵夫', ['识木', '顺纹巧手', '灵木亲和', '木德天成']],
  ['miner', '矿工', ['辨石', '寻脉巧手', '地脉亲和', '山灵共鸣']],
  ['herbalist', '采药人', ['识草', '百草通识', '草木亲和', '百草朝元']],
  ['scholar', '悟道者', ['勤思', '触类旁通', '悟道通明', '明心见性']],
  ['incenseKeeper', '香使', ['迎香', '立愿通心', '愿力亲和', '香火通神']],
]
export const TALENTS = TALENT_TIERS.flatMap((tier, index) => [
  { id: `cultivation_${tier.id}`, name: cultivationNames[index], tier: tier.id, category: 'cultivation',
    values: CULTIVATION_VALUES[tier.id] },
  { id: `breakthrough_${tier.id}`, name: breakthroughNames[index], tier: tier.id, category: 'breakthrough',
    values: BREAKTHROUGH_VALUES[tier.id] },
  { id: `huntSuccess_${tier.id}`, name: huntSuccessNames[index], tier: tier.id, category: 'huntSuccess',
    values: HUNT_SUCCESS_VALUES[tier.id] },
  { id: `huntYield_${tier.id}`, name: huntYieldNames[index], tier: tier.id, category: 'huntYield',
    values: HUNT_YIELD_VALUES[tier.id] },
  ...jobs.map(([jobId, jobName, names]) => ({
    id: `job_${jobId}_${tier.id}`, name: names[index], tier: tier.id, category: 'job', jobId, jobName,
    values: CULTIVATION_VALUES[tier.id],
  })),
])
export const TALENT_MAP = Object.assign(Object.create(null), Object.fromEntries(TALENTS.map(talent => [talent.id, talent])))

/** 取该天赋在指定等级的效果值；等级超出可用档位时按末档裁剪。 */
export function talentValue(meta, level = 1) {
  const index = Math.max(0, Math.min(meta.values.length - 1, (Number(level) | 0) - 1))
  return meta.values[index]
}

/** 按等级生成效果说明，与配置值同步，供详情提示展示。 */
export function talentDescription(meta, level = 1) {
  const value = Math.round(talentValue(meta, level) * 100)
  if (meta.category === 'breakthrough') return `个人突破成功率 +${value} 个百分点`
  if (meta.category === 'job') return `本人担任${meta.jobName}时岗位产出 +${value}%`
  if (meta.category === 'huntSuccess') return `本人猎杀成功率 +${value} 个百分点`
  if (meta.category === 'huntYield') return `本人猎杀收获 +${value}%`
  return `个人修炼速度 +${value}%`
}

function weighted(items, random) {
  let roll = random() * items.reduce((sum, item) => sum + item.weight, 0)
  for (const item of items) {
    if (roll < item.weight) return item
    roll -= item.weight
  }
  return items.at(-1)
}

export function normalizeTalents(talents) {
  const result = [], categories = new Set()
  for (const entry of Array.isArray(talents) ? talents : []) {
    const meta = TALENT_MAP[entry?.id]
    if (!meta || categories.has(meta.category)) continue
    categories.add(meta.category)
    result.push({ id: meta.id, level: Number.isSafeInteger(entry.level)
      ? Math.max(1, Math.min(TALENT_RULES.maxLevel, entry.level)) : 1 })
    if (result.length >= TALENT_RULES.maxCount) break
  }
  return result
}

export function talentBonus(member, category, jobId = member.roleId) {
  if (!member.talents?.length) return 0
  let bonus = 0
  const seen = new Set()
  for (const entry of member.talents || []) {
    const meta = TALENT_MAP[entry?.id]
    if (!meta || meta.category !== category || seen.has(meta.id) || (category === 'job' && meta.jobId !== jobId)) continue
    seen.add(meta.id)
    bonus += talentValue(meta, entry.level)
  }
  return Math.min(TALENT_RULES.caps[category] || 0, bonus)
}

export function rollTalent(talents, random, tierWeights = null) {
  if (talents.length >= TALENT_RULES.maxCount) return null
  const owned = new Set(talents.map(entry => TALENT_MAP[entry.id]?.category))
  const candidates = TALENTS.filter(meta => !owned.has(meta.category))
  if (!candidates.length) return null
  // 招募礼聘等场景可传入替代品级权重，使高品级更容易出现；未传时沿用基础权重。
  const tiers = TALENT_TIERS.filter(tier => candidates.some(meta => meta.tier === tier.id))
    .map(tier => ({ ...tier, weight: tierWeights?.[tier.id] ?? tier.weight }))
  const total = tiers.reduce((sum, tier) => sum + tier.weight, 0)
  const tier = total > 0 ? weighted(tiers, random) : weighted(
    TALENT_TIERS.filter(item => candidates.some(meta => meta.tier === item.id)), random)
  const pool = candidates.filter(meta => meta.tier === tier.id)
  const meta = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
  return { id: meta.id, level: 1 }
}

/** 入宗天赋；quality 可传 { tierWeights, countWeights } 调整品级与条数分布（主动招募）。 */
export function birthTalents(random, quality = null) {
  const counts = quality?.countWeights
    ? TALENT_RULES.birthCounts.map((entry, index) => ({ ...entry, weight: quality.countWeights[index] ?? 0 }))
    : TALENT_RULES.birthCounts
  const count = weighted(counts, random).count
  const talents = []
  for (let index = 0; index < count; index++) {
    const talent = rollTalent(talents, random, quality?.tierWeights || null)
    if (talent) talents.push(talent)
  }
  return talents
}

export function talentRandom(data) {
  data.talentSeed = (Math.imul(data.talentSeed ?? ((data.rootSeed ?? 1) ^ 0x6d2b79f5), 1664525) + 1013904223) >>> 0
  return data.talentSeed / 4294967296
}

export function gainBreakthroughTalent(data, member, random = () => talentRandom(data)) {
  member.talents ||= []
  if (member.talents.length >= TALENT_RULES.maxCount || random() >= TALENT_RULES.breakthroughChance) return null
  const talent = rollTalent(member.talents, random)
  if (talent) member.talents.push(talent)
  return talent
}

/** 成功突破后提升一条未满级天赋：等级最低者优先，同级取获取顺序最早；无候选时不判定、不消耗随机数。 */
export function upgradeTalent(data, member, random = () => talentRandom(data)) {
  const candidates = (member.talents || []).filter(entry => (entry.level || 1) < TALENT_RULES.maxLevel)
  if (!candidates.length) return null
  if (random() >= TALENT_RULES.upgradeChance) return null
  const target = candidates.reduce((lowest, entry) => (entry.level || 1) < (lowest.level || 1) ? entry : lowest)
  target.level = (target.level || 1) + 1
  return target
}

export function talentMatches(member, filter) {
  if (filter === 'all') return true
  if (filter === 'none') return !member.talents?.length
  return (member.talents || []).some(entry => {
    const meta = TALENT_MAP[entry.id]
    return meta && (meta.category === filter || `job:${meta.jobId}` === filter)
  })
}

/** 是否持有猎杀天赋（huntSuccess／huntYield 任一），供猎杀自动组队识别「天生猎手」优先人选。 */
export function hasHuntTalent(member) {
  return (member?.talents || []).some(entry => {
    const meta = TALENT_MAP[entry?.id]
    return meta && (meta.category === 'huntSuccess' || meta.category === 'huntYield')
  })
}
