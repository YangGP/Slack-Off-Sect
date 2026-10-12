/** 个人天赋：身份固定；level 预留原天赋成长，首版只开放 Lv.1。 */
export const TALENT_RULES = {
  maxCount: 3, maxLevel: 1, breakthroughChance: 0.1,
  birthCounts: [{ count: 0, weight: 70 }, { count: 1, weight: 25 }, { count: 2, weight: 5 }],
  caps: { cultivation: 0.5, job: 0.5, breakthrough: 0.08 },
}
export const TALENT_TIERS = [
  { id: 'huang', name: '黄', weight: 60 }, { id: 'xuan', name: '玄', weight: 30 },
  { id: 'di', name: '地', weight: 9 }, { id: 'tian', name: '天', weight: 1 },
]
export const TALENT_TIER_MAP = Object.assign(Object.create(null), Object.fromEntries(TALENT_TIERS.map(tier => [tier.id, tier])))
const cultivationNames = ['勤修不辍', '修炼奇才', '道心澄明', '天道眷顾']
const breakthroughNames = ['心气沉稳', '行气通畅', '道基稳固', '破境通明']
const jobs = [
  ['farmer', '阵徒', ['引气熟手', '聚气通窍', '气脉亲和']],
  ['woodcutter', '樵夫', ['识木', '顺纹巧手', '灵木亲和']],
  ['miner', '矿工', ['辨石', '寻脉巧手', '地脉亲和']],
  ['herbalist', '采药人', ['识草', '百草通识', '草木亲和']],
  ['scholar', '悟道者', ['勤思', '触类旁通', '悟道通明']],
  ['incenseKeeper', '香使', ['迎香', '立愿通心', '愿力亲和']],
]
export const TALENTS = TALENT_TIERS.flatMap((tier, index) => [
  { id: `cultivation_${tier.id}`, name: cultivationNames[index], tier: tier.id, category: 'cultivation',
    bonus: [0.1, 0.2, 0.35, 0.5][index], description: `个人修炼速度 +${[10, 20, 35, 50][index]}%` },
  { id: `breakthrough_${tier.id}`, name: breakthroughNames[index], tier: tier.id, category: 'breakthrough',
    bonus: [0.02, 0.04, 0.06, 0.08][index], description: `个人突破成功率 +${[2, 4, 6, 8][index]} 个百分点` },
  ...(index < 3 ? jobs.map(([jobId, jobName, names]) => ({
    id: `job_${jobId}_${tier.id}`, name: names[index], tier: tier.id, category: 'job', jobId,
    bonus: [0.1, 0.2, 0.35][index], description: `本人担任${jobName}时岗位产出 +${[10, 20, 35][index]}%`,
  })) : []),
])
export const TALENT_MAP = Object.assign(Object.create(null), Object.fromEntries(TALENTS.map(talent => [talent.id, talent])))

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
    bonus += meta.bonus
  }
  return Math.min(TALENT_RULES.caps[category] || 0, bonus)
}

export function rollTalent(talents, random) {
  if (talents.length >= TALENT_RULES.maxCount) return null
  const owned = new Set(talents.map(entry => TALENT_MAP[entry.id]?.category))
  const candidates = TALENTS.filter(meta => !owned.has(meta.category))
  const tiers = TALENT_TIERS.filter(tier => candidates.some(meta => meta.tier === tier.id))
  if (!tiers.length) return null
  const tier = weighted(tiers, random)
  const pool = candidates.filter(meta => meta.tier === tier.id)
  const meta = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
  return { id: meta.id, level: 1 }
}

export function birthTalents(random) {
  const count = weighted(TALENT_RULES.birthCounts, random).count
  const talents = []
  for (let index = 0; index < count; index++) {
    const talent = rollTalent(talents, random)
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

export function talentMatches(member, filter) {
  if (filter === 'all') return true
  if (filter === 'none') return !member.talents?.length
  return (member.talents || []).some(entry => {
    const meta = TALENT_MAP[entry.id]
    return meta && (meta.category === filter || `job:${meta.jobId}` === filter)
  })
}
