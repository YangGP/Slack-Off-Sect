import { JOBS } from '@/data/jobs'
import { isJobUnlocked, pushLog, idleDisciples, canAfford, payCost, arrivalInterval, isManualRecruit } from './core'
import { syncDisciples, recountDisciples, discipleDismissalCost, cultivationRequired, DISCIPLE_GROWTH, DISCIPLE_AIDS, realmBaseChance, newDisciple, cultivateDisciple, SPIRITUAL_ROOT_MAP, RECRUIT_TIER_MAP, recruitCost, recruitRealmRange, rollRecruitRealm, rootBreakthroughBonus } from '@/data/disciples'
import { talentBonus, gainBreakthroughTalent, upgradeTalent, TALENT_MAP } from '@/data/talents'
import { recompute } from './economy'
import { REALMS, BREAKTHROUGH } from '@/data/realms'
import { gameRandom } from '../context'
import { CONFIG } from '@/data/config'

/** 自动分工属于动作结算，不能放在只读重算中；只改有岗位专长且未出征的弟子。 */
export function autoAssignTalentJobs(state) {
  if (!state.upgrades.talentAssignment || state.settings.autoTalentJobs === false) return 0
  const available = new Set(JOBS.filter(job => isJobUnlocked(state, job)).map(job => job.id))
  let changed = 0
  for (const member of state.disciples.members) {
    if (member.onMission) continue
    const entry = member.talents?.find(entry => TALENT_MAP[entry.id]?.category === 'job')
    const talent = TALENT_MAP[entry?.id]
    if (!talent || !available.has(talent.jobId) || member.roleId === talent.jobId) continue
    member.roleId = talent.jobId
    changed++
  }
  if (changed) recountDisciples(state.disciples)
  return changed
}

export function setJob(state, derived, jobId, value) {
  const job = JOBS.find((j) => j.id === jobId)
  if (!job || !isJobUnlocked(state, job) || !Number.isFinite(value)) return
  const jobs = state.disciples.jobs
  const current = jobs[jobId] || 0
  let target = Math.max(0, Math.floor(value))
  const others = JOBS.reduce((sum, j) => (j.id === jobId ? sum : sum + (jobs[j.id] || 0)), 0)
  const free = state.disciples.total - others
  target = Math.min(target, free)
  jobs[jobId] = target
  syncDisciples(state.disciples) // 人数操作在动作边界转换为个体分工
  recountDisciples(state.disciples)
  if (target !== current) {
    pushLog(state, `${job.name} 人数调整为 ${target}`, 'info')
  }
  recompute(state, derived)
}

export function shiftJob(state, derived, jobId, delta) {
  const current = state.disciples.jobs[jobId] || 0
  setJob(state, derived, jobId, current + delta)
}

/** 一键把闲散弟子填进某个职位 */
export function fillJob(state, derived, jobId) {
  const idle = idleDisciples(state)
  if (idle <= 0) return
  setJob(state, derived, jobId, (state.disciples.jobs[jobId] || 0) + idle)
}

export function assignDisciples(state, derived, ids, roleId) {
  if (roleId !== null && !JOBS.some(job => job.id === roleId && isJobUnlocked(state, job))) return false
  const selected = new Set(ids)
  // 出征中的弟子不能转岗，跳过。
  for (const member of state.disciples.members) if (selected.has(member.id) && !member.onMission) member.roleId = roleId
  recountDisciples(state.disciples)
  recompute(state, derived)
  return true
}

export function discipleDismissalPreview(state, ids) {
  const selected = new Set(ids)
  // 出征中的弟子不能逐出。
  const members = state.disciples.members.filter(member => selected.has(member.id) && !member.onMission)
  const qi = members.reduce((total, member) => total + discipleDismissalCost(member, state.realm), 0)
  return { ids: members.map(member => member.id), count: members.length, cost: { qi },
    affordable: Number.isSafeInteger(qi) && canAfford(state, { qi }) }
}

/** 逐出整批支付，费用或人口变化时要求重新确认，不部分执行。 */
export function dismissDisciples(state, derived, ids, quote = null) {
  const preview = discipleDismissalPreview(state, ids)
  if (quote && (preview.cost.qi !== quote.cost.qi || preview.count !== quote.count)) return { dismissed: 0, reason: 'changed' }
  if (!preview.count) return { dismissed: 0, reason: 'empty' }
  if (!preview.affordable) return { dismissed: 0, reason: 'insufficient' }
  payCost(state, preview.cost)
  const selected = new Set(preview.ids)
  state.disciples.members = state.disciples.members.filter(member => !selected.has(member.id))
  recountDisciples(state.disciples)
  pushLog(state, `逐出师门 ${preview.count} 人，支付灵气 ${preview.cost.qi}`, 'info')
  recompute(state, derived)
  return { dismissed: preview.count, cost: preview.cost }
}

export function discipleBreakthroughPreview(state, member) {
  const target = member.realm + 1
  const required = cultivationRequired(member.realm)
  const cost = Object.fromEntries(Object.entries(REALMS[target]?.cost || {}).map(([id, amount]) =>
    [id, Math.max(1, Math.ceil(amount * DISCIPLE_GROWTH.costFactor))]))
  const chance = Math.min(BREAKTHROUGH.chanceCap, realmBaseChance(target) * DISCIPLE_GROWTH.successFactor +
    Math.max(0, state.realm - target) * DISCIPLE_GROWTH.guidance + talentBonus(member, 'breakthrough') +
    rootBreakthroughBonus(member) / 100 + (member.aidBonus || 0))
  const status = target >= REALMS.length ? '已至最高境界' : member.cooldown > 0 ? '突破调息中' :
    member.cultivation < required ? '修炼中' : target > state.realm ? '受宗门境界限制' : '待突破'
  return { target, required, cost, chance, status, ready: status === '待突破', affordable: canAfford(state, cost) }
}

/** 首版只损失本境修为与材料，不引入个人死亡或永久停滞。 */
export function breakthroughDisciples(state, derived, ids, random = () => gameRandom(state)) {
  const selected = new Set(ids)
  const result = { success: 0, failed: 0, skipped: 0, insufficient: false }
  for (const member of state.disciples.members) {
    if (!selected.has(member.id)) continue
    const preview = discipleBreakthroughPreview(state, member)
    if (!preview.ready) { result.skipped++; continue }
    if (!preview.affordable) { result.insufficient = true; break }
    payCost(state, preview.cost)
    member.totalQiConsumed = Math.min(Number.MAX_SAFE_INTEGER, (member.totalQiConsumed || 0) + (preview.cost.qi || 0))
    // 本次尝试已结算，消耗待生效的个人护道（无论成败）。
    member.aidBonus = 0
    if (random() < preview.chance) {
      member.realm++
      member.cultivation = 0
      result.success++
      const talent = gainBreakthroughTalent(state.disciples, member)
      if (talent) pushLog(state, `${member.name}突破后领悟天赋【${TALENT_MAP[talent.id].name}】`, 'good')
      const upgraded = upgradeTalent(state.disciples, member)
      if (upgraded) pushLog(state, `${member.name}突破后天赋【${TALENT_MAP[upgraded.id].name}】提升至 Lv.${upgraded.level}`, 'good')
    } else {
      member.cultivation *= 1 - DISCIPLE_GROWTH.failureLoss
      member.cooldown = DISCIPLE_GROWTH.cooldown
      result.failed++
    }
  }
  autoAssignTalentJobs(state)
  if (result.success || result.failed) pushLog(state, `弟子突破：成功 ${result.success} 人，失败 ${result.failed} 人${result.insufficient ? '，材料不足，已停止' : ''}`, result.failed ? 'info' : 'good')
  recompute(state, derived)
  return result
}

/**
 * 弟子自动前来：有空房就会陆续来人，不需要手动招募。
 * 每 arrivalInterval(derived) 秒来一名；住满则清零计时，扩建后重新开始算。
 * 离线推演时只计数不写日志，由 simulateOffline 汇总一条。
 * @returns {number} 本次来了几名
 */
export function recruitArrivals(state, derived, dt, { silent = false } = {}) {
  if (dt <= 0) return 0
  // 主动招募模式：停止免费来人，切回自动后重新计时（见 docs/DISCIPLE-PROGRESSION.md §2.5）。
  if (isManualRecruit(state, derived)) {
    state.arrivalTimer = 0
    return 0
  }
  if (derived.leaveChance > 0 || state.disciples.total >= derived.maxDisciples) {
    state.arrivalTimer = 0
    return 0
  }
  const timer = (state.arrivalTimer || 0) + dt
  const interval = arrivalInterval(derived)
  // 一次调用内宜居度不变，离开风险只由当前宜居度定死一个人口上限，
  // 因此可一次算完本轮该来几名，避免「每来一人就全量重算」在长离线里叠加成主要开销。
  const margin = CONFIG.HABITABILITY_LEAVE_MARGIN
  const safeTotal = Math.max(margin, Math.floor(margin + derived.habitability) + 1)
  const room = Math.max(0, Math.min(Math.floor(derived.maxDisciples), safeTotal) - state.disciples.total)
  const arrived = Math.max(0, Math.min(Math.floor(timer / interval), room))
  state.arrivalTimer = timer - arrived * interval
  for (let i = 1; i <= arrived; i++) {
    const member = newDisciple(state.disciples)
    cultivateDisciple(member, Math.min(dt, timer - i * interval))
    state.disciples.members.push(member)
  }
  if (arrived > 0) {
    autoAssignTalentJobs(state)
    recountDisciples(state.disciples)
    state.stats.recruits += arrived
    if (!silent) {
      const newcomers = state.disciples.members.slice(-arrived)
      const roots = newcomers.map(member => SPIRITUAL_ROOT_MAP[member.spiritualRoot].name).join('、')
      pushLog(state, `${arrived === 1 ? '一名' : arrived + '名'}弟子慕名而来（${roots}；门中现有 ${state.disciples.total} 人）`, 'good')
    }
    recompute(state, derived)
  }
  // 住满了就把计时清零：扩建之后重新开始算，不会立刻蹦出一个人
  if (derived.leaveChance > 0 || state.disciples.total >= derived.maxDisciples) state.arrivalTimer = 0
  return arrived
}

/** 主动招募预览：礼聘档位的花费、起点境界区间与可招募状态（见 docs/DISCIPLE-PROGRESSION.md §2.5）。 */
export function recruitPreview(state, derived, tierId) {
  const tier = RECRUIT_TIER_MAP[tierId]
  if (!tier) return null
  const cost = recruitCost(tier, state.realm)
  const range = recruitRealmRange(tier, state.realm)
  const risk = derived.leaveChance > 0
  const full = !risk && state.disciples.total >= derived.maxDisciples
  const blockReason = risk ? 'risk' : full ? 'full' : null
  return { tierId, tier, cost, realmMin: range.min, realmMax: range.max,
    realmRangeText: range.min === range.max ? REALMS[range.min]?.name || '凡体'
      : `${REALMS[range.min]?.name || '凡体'}～${REALMS[range.max]?.name || '凡体'}`,
    ready: !blockReason, blockReason,
    status: risk ? '宜居度不足，暂缓招募' : full ? '居所已满' : '可招募',
    affordable: canAfford(state, cost) }
}

/** 主动招募一名弟子：满员／离开风险／未解锁或付不起则不执行、不扣料。 */
export function recruitDisciple(state, derived, tierId) {
  if (!isManualRecruit(state, derived)) return { recruited: 0, reason: 'locked' }
  const preview = recruitPreview(state, derived, tierId)
  if (!preview) return { recruited: 0, reason: 'unknown' }
  if (preview.blockReason) return { recruited: 0, reason: preview.blockReason }
  if (!preview.affordable) return { recruited: 0, reason: 'insufficient' }
  payCost(state, preview.cost)
  const realm = rollRecruitRealm(state.disciples, preview.tier, state.realm)
  const member = newDisciple(state.disciples, null, { realm, quality: preview.tier })
  state.disciples.members.push(member)
  autoAssignTalentJobs(state)
  recountDisciples(state.disciples)
  state.stats.recruits += 1
  pushLog(state, `礼聘${preview.tier.name}：${member.name}入我山门（${REALMS[member.realm].name}·${SPIRITUAL_ROOT_MAP[member.spiritualRoot].name}）`, 'good')
  recompute(state, derived)
  return { recruited: 1, member, cost: preview.cost }
}

export function clearJobs(state, derived) {
  for (const member of state.disciples.members) member.roleId = null
  recountDisciples(state.disciples)
  recompute(state, derived)
}

/** 个人护道预览：按目标境界的材料与加成，以及是否已护道。 */
export function discipleAidPreview(state, member) {
  const target = member.realm + 1
  const meta = DISCIPLE_AIDS[target]
  const cost = meta ? { ...meta.cost } : {}
  return { target, cost, bonus: meta?.bonus || 0, pending: (member.aidBonus || 0) > 0,
    available: !!meta, affordable: meta ? canAfford(state, cost) : false }
}

/** 为指定弟子预付个人护道材料；已护道或到顶者跳过，材料不足即停止、不超支。 */
export function applyDiscipleAid(state, derived, ids) {
  const selected = new Set(ids)
  const result = { applied: 0, skipped: 0, insufficient: false }
  for (const member of state.disciples.members) {
    if (!selected.has(member.id)) continue
    if (member.aidBonus > 0) { result.skipped++; continue }
    const preview = discipleAidPreview(state, member)
    if (!preview.available) { result.skipped++; continue }
    if (!preview.affordable) { result.insufficient = true; break }
    payCost(state, preview.cost)
    member.aidBonus = preview.bonus
    result.applied++
  }
  recompute(state, derived)
  return result
}

/** 开关传功：只记录在个体上，速率与灵气开销在重算时按境界结算。 */
export function setMentored(state, derived, ids, value) {
  const selected = new Set(ids)
  const on = value === true
  let changed = 0
  for (const member of state.disciples.members) {
    if (selected.has(member.id) && (member.mentored === true) !== on) { member.mentored = on; changed++ }
  }
  recompute(state, derived)
  return changed
}
