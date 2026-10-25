import { withResourceAction } from '../resourceObservation'
import { JOBS } from '@/data/jobs'
import { isJobUnlocked, pushLog, idleDisciples, canAfford, payCost, arrivalInterval, isManualRecruit, realmCost } from './core'
import { syncDisciples, recountDisciples, discipleDismissalCost, cultivationRequired, DISCIPLE_GROWTH, DISCIPLE_AIDS, realmBaseChance, newDisciple, cultivateDisciple, SPIRITUAL_ROOT_MAP, RECRUIT_TIER_MAP, recruitCost, recruitRealmRange, rollRecruitRealm, rootBreakthroughBonus } from '@/data/disciples'
import { talentBonus, gainBreakthroughTalent, upgradeTalent, TALENT_MAP } from '@/data/talents'
import { recompute } from './economy'
import { REALMS, BREAKTHROUGH } from '@/data/realms'
import { gameRandom } from '../context'
import { CONFIG } from '@/data/config'
import { isModuleEnabled } from '@/data/modules'
import { ONE, ZERO, money, moneyEq, moneyLt, moneyMax, moneySubtract, moneySum } from '../decimal'
import { SAMSARA, daoLevel, discipleSpeed, rememberDisciple, invitationCapacity } from '@/data/samsara'
import { cultivationRate } from '@/data/disciples'

/** 资源和培养名额有限时，手动批量与自动操作均优先重点弟子。 */
function trainingOrder(members) {
  return [...members].sort((a, b) => (b.focus === true ? 1 : 0) - (a.focus === true ? 1 : 0) || a.id - b.id)
}

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
  if (state.challenge?.active) return { ids: [], count: 0, cost: { qi: ZERO }, affordable: false, reason: '全员挑战中不能逐出' }
  const selected = new Set(ids)
  // 出征中的弟子不能逐出。
  const members = state.disciples.members.filter(member => selected.has(member.id) && !member.onMission)
  // 逐出费用是金额：逐人按精确小数求和，够不够由 canAfford 的 Decimal 比较判定。
  const qi = moneySum(members.map(member => discipleDismissalCost(member, state.realm)))
  return { ids: members.map(member => member.id), count: members.length, cost: { qi },
    affordable: canAfford(state, { qi }) }
}

/** 逐出整批支付，费用或人口变化时要求重新确认，不部分执行。 */
export function dismissDisciples(state, derived, ids, quote = null) {
  return withResourceAction(state, { type: 'dismissDisciples', id: null }, () => {
    const preview = discipleDismissalPreview(state, ids)
    if (quote && (!moneyEq(preview.cost.qi, quote.cost.qi) || preview.count !== quote.count)) return { dismissed: 0, reason: 'changed' }
    if (!preview.count) return { dismissed: 0, reason: 'empty' }
    if (!preview.affordable) return { dismissed: 0, reason: 'insufficient' }
    payCost(state, preview.cost)
    const selected = new Set(preview.ids)
    for (const member of state.disciples.members) if (selected.has(member.id)) rememberDisciple(state, member, '逐出师门')
    state.disciples.members = state.disciples.members.filter(member => !selected.has(member.id))
    recountDisciples(state.disciples)
    pushLog(state, `逐出师门 ${preview.count} 人，支付灵气 ${preview.cost.qi}`, 'info')
    recompute(state, derived)
    return { dismissed: preview.count, cost: preview.cost }

  })
}

export function discipleBreakthroughPreview(state, member) {
  const target = member.realm + 1
  const required = cultivationRequired(member.realm)
  // 破境费用按成长系数精确缩放，允许小于 1 的材料费用。
  const cost = Object.fromEntries(Object.entries(REALMS[target]?.cost || {}).map(([id, amount]) =>
    [id, money(amount).times(DISCIPLE_GROWTH.costFactor)]))
  const baseChance = Math.min(BREAKTHROUGH.chanceCap, realmBaseChance(target) * DISCIPLE_GROWTH.successFactor +
    Math.max(0, state.realm - target) * DISCIPLE_GROWTH.guidance + talentBonus(member, 'breakthrough') +
    rootBreakthroughBonus(member) / 100 + (member.aidBonus || 0))
  const chance = Math.min(BREAKTHROUGH.chanceCap, 1 - (1 - baseChance) * Math.pow(0.93, daoLevel(state, 'breakthrough')))
  const status = target >= REALMS.length ? '已至最高境界' : member.cooldown > 0 ? '突破调息中' :
    member.cultivation < required ? '修炼中' : target > state.realm ? '受宗门境界限制' : '待突破'
  return { target, required, cost, chance, status, ready: status === '待突破', affordable: canAfford(state, cost) }
}

/** 单次突破结算：预览与实付同一入口；手动批量与自动突破共用，保证两处行为一致。返回是否成功。 */
function settleDiscipleBreakthrough(state, member, preview, random) {
  payCost(state, preview.cost)
  // 累计灵气消耗是金额：逐次精确累加，不做安全整数截断。
  member.totalQiConsumed = money(member.totalQiConsumed ?? ZERO).plus(preview.cost.qi ?? ZERO)
  // 本次尝试已结算，消耗待生效的个人护道（无论成败）。
  member.aidBonus = 0
  if (random() < preview.chance) {
    member.realm++
    member.cultivation = 0
    const talent = gainBreakthroughTalent(state.disciples, member, undefined, { includeHunting: isModuleEnabled(state, 'hunting') })
    if (talent) pushLog(state, `${member.name}突破后领悟天赋【${TALENT_MAP[talent.id].name}】`, 'good')
    const upgraded = upgradeTalent(state.disciples, member)
    if (upgraded) pushLog(state, `${member.name}突破后天赋【${TALENT_MAP[upgraded.id].name}】提升至 Lv.${upgraded.level}`, 'good')
    return true
  }
  // 首版只损失本境修为与材料，不引入个人死亡或永久停滞；20% 重修损失是自动重试的天然节流。
  member.cultivation *= 1 - DISCIPLE_GROWTH.failureLoss
  member.cooldown = DISCIPLE_GROWTH.cooldown
  return false
}

/**
 * 手动突破（单人或批量）：批量逐人扣料，缺料或触宗门材料保留即停止、不超支；单人手动不受保留限制。
 * 首版只损失本境修为与材料，不引入个人死亡或永久停滞。
 */
export function breakthroughDisciples(state, derived, ids, random = () => gameRandom(state)) {
  return withResourceAction(state, { type: 'breakthroughDisciples', id: null }, () => {
    const selected = new Set(ids)
    // 宗门破境材料保留：批量突破不得动用「当前宗门下一境破境材料」——扣完本次费用后，
    // 共享资源仍须 ≥ 宗门下一境该项（只检查本次费用实际包含的资源，已低于保留量时不在本动作修复）。
    // 单人手动突破不受限（玩家显式操作）；关闭开关后批量也不受限。
    const reserve = derived.discipleTrainingUnlocked && ids.length > 1 && state.settings?.sectBreakthroughReserve !== false
      ? realmCost(state, derived, state.realm + 1) || {} : {}
    const result = { success: 0, failed: 0, skipped: 0, insufficient: false, reserved: 0 }
    for (const member of trainingOrder(state.disciples.members)) {
      if (!selected.has(member.id)) continue
      const preview = discipleBreakthroughPreview(state, member)
      if (!preview.ready) { result.skipped++; continue }
      if (!preview.affordable) { result.insufficient = true; break }
      if (Object.entries(reserve).some(([id, amount]) => Object.hasOwn(preview.cost, id) &&
        moneyLt(moneySubtract(state.resources[id] ?? ZERO, preview.cost[id]), money(amount)))) { result.reserved++; break }
      if (settleDiscipleBreakthrough(state, member, preview, random)) result.success++
      else result.failed++
    }
    autoAssignTalentJobs(state)
    if (result.success || result.failed) pushLog(state, `弟子突破：成功 ${result.success} 人，失败 ${result.failed} 人${result.insufficient ? '，材料不足，已停止' : ''}${result.reserved ? '，已保留宗门破境材料' : ''}`, result.failed ? 'info' : 'good')
    recompute(state, derived)
    return result

  })
}

/**
 * 自动突破：在线与有效离线共用；推进器按修满和调息边界调用。
 * 默认关闭、经《因材施教》解锁；重点名单优先、按个体记录顺序结算，保证可复现。
 * 缺料、触宗门材料保留或击穿灵气底线即跳过并等待（不停止后续人选），不超支、不进负债、不自动降级目标；
 * 预留规则优先于自动突破。不主动使用个人护道；已预付的护道随共用结算入口自然生效。
 */
export function autoBreakthroughStep(state, derived, random = () => gameRandom(state)) {
  if (state.settings?.autoBreakthrough !== true) return { success: 0, failed: 0, skipped: 0 }
  const capSetting = state.settings.autoBreakthroughCap
  const cap = capSetting === 'sect' || !Number.isInteger(capSetting)
    ? state.realm : Math.max(0, Math.min(state.realm, capSetting))
  const scopeAll = state.settings.autoBreakthroughScope === 'all'
  const reserve = state.settings.sectBreakthroughReserve !== false
    ? realmCost(state, derived, state.realm + 1) || {} : {}
  const qiFloor = money(derived.upkeep).times(state.settings?.trainingQiFloorSeconds || 0)
  const result = { success: 0, failed: 0, skipped: 0 }
  // 执行顺序：先重点名单，再按个体记录顺序（§2.2.1）。
  const candidates = trainingOrder(state.disciples.members)
  for (const member of candidates) {
    if (!scopeAll && member.focus !== true) continue
    if (member.realm + 1 > cap) continue
    if (member.cooldown > 0 || member.cultivation < cultivationRequired(member.realm)) continue
    const preview = discipleBreakthroughPreview(state, member)
    if (!preview.ready) continue
    if (!preview.affordable) { result.skipped++; continue }
    if (Object.entries(reserve).some(([id, amount]) => Object.hasOwn(preview.cost, id) &&
      moneyLt(moneySubtract(state.resources[id] ?? ZERO, preview.cost[id]), money(amount)))) { result.skipped++; continue }
    // 突破费用中的灵气不得击穿培养预算的灵气底线（§2.2.2）。
    if (preview.cost.qi && moneyLt(moneySubtract(state.resources.qi ?? ZERO, preview.cost.qi), qiFloor)) { result.skipped++; continue }
    if (settleDiscipleBreakthrough(state, member, preview, random)) result.success++
    else result.failed++
  }
  if (result.success || result.failed) {
    autoAssignTalentJobs(state)
    pushLog(state, `自动突破：成功 ${result.success} 人，失败 ${result.failed} 人`, result.failed ? 'info' : 'good')
    recompute(state, derived)
  }
  return result
}

/** 一个离线段内按个人修满/调息边界推进；最多64个边界，不按秒循环。 */
export function advanceDiscipleGrowth(state, derived, seconds) {
  let remaining = seconds
  const speed = discipleSpeed(state), loyaltySpeed = 1 + daoLevel(state, 'loyalty') * 0.25
  const auto = derived.autoDiscipleBreakthroughUnlocked && state.settings.autoBreakthrough === true
  if (auto && seconds > 1) autoBreakthroughStep(state, derived)
  for (let step = 0; remaining > 1e-7 && step < 64; step++) {
    let slice = remaining
    if (auto && remaining > 1) {
      for (const member of state.disciples.members) {
        if (member.realm >= state.realm || (state.settings.autoBreakthroughScope !== 'all' && !member.focus)) continue
        const cap = state.settings.autoBreakthroughCap
        if (Number.isInteger(cap) && member.realm + 1 > cap) continue
        const required = cultivationRequired(member.realm)
        if (member.cooldown > 0) slice = Math.min(slice, member.cooldown)
        else if (member.cultivation < required) {
          const rate = cultivationRate(member, derived.trainingActive && !member.onMission) * speed
          if (rate > 0) slice = Math.min(slice, (required - member.cultivation) / rate)
        }
      }
    }
    // 避免浮点误差产生零长步；修满后通过同一结算入口校验全部保留量。
    slice = Math.max(Math.min(remaining, slice), Math.min(remaining, 1e-6))
    for (const member of state.disciples.members) cultivateDisciple(member, slice, derived.trainingActive && !member.onMission, speed, loyaltySpeed)
    remaining -= slice
    if (auto) autoBreakthroughStep(state, derived)
  }
  if (remaining > 0) for (const member of state.disciples.members) cultivateDisciple(member, remaining, derived.trainingActive && !member.onMission, speed, loyaltySpeed)
  if ((state.invitations ?? 3) < invitationCapacity(state)) {
    state.invitationTimer = (state.invitationTimer || 0) + seconds
    const gained = Math.floor(state.invitationTimer / SAMSARA.invitationSeconds)
    state.invitations = Math.min(invitationCapacity(state), (state.invitations || 0) + gained)
    state.invitationTimer %= SAMSARA.invitationSeconds
  } else state.invitationTimer = 0
}

/**
 * 弟子自动前来：有空房就会陆续来人，不需要手动招募。
 * 每 arrivalInterval(derived) 秒来一名；住满则清零计时，扩建后重新开始算。
 * 离线推演时只计数不写日志，由 simulateOffline 汇总一条。
 * @returns {number} 本次来了几名
 */
export function recruitArrivals(state, derived, dt, { silent = false } = {}) {
  if (dt <= 0) return 0
  if (state.challenge?.active) { state.arrivalTimer = 0; return 0 }
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
    const realm = rollRecruitRealm(state.disciples, RECRUIT_TIER_MAP.small, state.realm, daoLevel(state, 'recruitment'))
    const member = newDisciple(state.disciples, null, { realm, includeHunting: isModuleEnabled(state, 'hunting') })
    cultivateDisciple(member, Math.min(dt, timer - i * interval), false, discipleSpeed(state), 1 + daoLevel(state, 'loyalty') * 0.25)
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
  // 报价是金额：数据表里的字面值是 Number，进金额域前统一构造为 Decimal。
  const cost = Object.fromEntries(Object.entries(recruitCost(tier, state.realm)).map(([res, amount]) => [res, money(amount)]))
  const range = recruitRealmRange(tier, state.realm, daoLevel(state, 'recruitment'))
  const risk = derived.leaveChance > 0
  const full = !risk && state.disciples.total >= derived.maxDisciples
  const blockReason = state.challenge?.active ? 'challenge' : (state.invitations ?? 3) < 1 ? 'invitation' : risk ? 'risk' : full ? 'full' : null
  return { tierId, tier, cost, realmMin: range.min, realmMax: range.max,
    realmRangeText: range.min === range.max ? REALMS[range.min]?.name || '凡体'
      : `${REALMS[range.min]?.name || '凡体'}～${REALMS[range.max]?.name || '凡体'}`,
    ready: !blockReason, blockReason,
    status: blockReason === 'challenge' ? '全员挑战只补员' : blockReason === 'invitation' ? '礼聘机会恢复中' : risk ? '宜居度不足，暂缓招募' : full ? '居所已满' : '可招募',
    affordable: canAfford(state, cost) }
}

/** 主动招募一名弟子：满员／离开风险／未解锁或付不起则不执行、不扣料。 */
export function recruitDisciple(state, derived, tierId) {
  return withResourceAction(state, { type: 'recruitDisciple', id: tierId }, () => {
    if (!isManualRecruit(state, derived)) return { recruited: 0, reason: 'locked' }
    const preview = recruitPreview(state, derived, tierId)
    if (!preview) return { recruited: 0, reason: 'unknown' }
    if (preview.blockReason) return { recruited: 0, reason: preview.blockReason }
    if (!preview.affordable) return { recruited: 0, reason: 'insufficient' }
    payCost(state, preview.cost)
    state.invitations = Math.max(0, (state.invitations ?? 3) - 1)
    const realm = rollRecruitRealm(state.disciples, preview.tier, state.realm, daoLevel(state, 'recruitment'))
    const member = newDisciple(state.disciples, null, { realm, quality: preview.tier, includeHunting: isModuleEnabled(state, 'hunting') })
    state.disciples.members.push(member)
    autoAssignTalentJobs(state)
    recountDisciples(state.disciples)
    state.stats.recruits += 1
    pushLog(state, `礼聘${preview.tier.name}：${member.name}入我山门（${REALMS[member.realm].name}·${SPIRITUAL_ROOT_MAP[member.spiritualRoot].name}）`, 'good')
    recompute(state, derived)
    return { recruited: 1, member, cost: preview.cost }

  })
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
  // 材料是金额：数据表里是 Number，预览与实付共用同一份 Decimal 报价。
  const cost = meta
    ? Object.fromEntries(Object.entries(meta.cost).map(([res, amount]) => [res, money(amount).times(1 - 0.02 * daoLevel(state, 'personalAidThrift'))]))
    : {}
  return { target, cost, bonus: meta?.bonus || 0, pending: (member.aidBonus || 0) > 0,
    available: !!meta, affordable: meta ? canAfford(state, cost) : false }
}

/** 为指定弟子预付个人护道材料；已护道或到顶者跳过，材料不足即停止、不超支。 */
export function applyDiscipleAid(state, derived, ids) {
  return withResourceAction(state, { type: 'applyDiscipleAid', id: null }, () => {
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

  })
}

/**
 * 开关传功：只记录在个体上，速率与灵气开销在重算时按境界结算。
 * 人数上限在开关时校验（setMentored 是唯一开启入口）：达上限后本次及后续开启被拒绝，
 * 批量操作到上限即停；人数仅因逐出／流失减少，不自动补位、不擅自改动玩家分配。
 */
export function setMentored(state, derived, ids, value) {
  const selected = new Set(ids)
  const on = value === true
  const limit = Number.isFinite(state.settings?.mentorLimit) ? Math.max(0, state.settings.mentorLimit) : 20
  let current = state.disciples.members.reduce((sum, member) => sum + (member.mentored === true ? 1 : 0), 0)
  let changed = 0
  for (const member of trainingOrder(state.disciples.members)) {
    if (!selected.has(member.id) || (member.mentored === true) === on) continue
    if (on && current >= limit) break
    member.mentored = on
    changed++
    if (on) current++
  }
  recompute(state, derived)
  return changed
}

/**
 * 重点名单：仅作排序与执行依据（自动突破优先结算重点人选），不改变产出、口粮、概率或费用。
 * 纯组织性标记，无经济影响，不需重算经济；随保存、导出与离线副本保留，旧档默认非重点。
 */
export function setDiscipleFocus(state, derived, ids, value) {
  const selected = new Set(ids)
  const on = value === true
  let changed = 0
  for (const member of state.disciples.members) {
    if (selected.has(member.id) && (member.focus === true) !== on) { member.focus = on; changed++ }
  }
  return changed
}
