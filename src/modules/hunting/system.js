import { HUNT, HUNT_FIELD_MAP, DEFAULT_HUNT_FIELD } from './data.js'
import { JOBS } from '@/data/jobs'
import { RESOURCE_MAP } from '@/data/resources'
import { REALMS } from '@/data/realms'
import { isModuleEnabled } from '@/data/modules'
import { clamp, pushLog, addResource, activeOf } from '@/game/systems/core'
import { MONEY_INFINITY, ZERO, floorMoney, money, moneyAvailable, moneyFromSave, moneyMin, moneyNonNegative, moneyToCount } from '@/game/decimal'
import { atLeast } from '@/game/numbers'
import { gameNow, withGameContext } from '@/game/context'

/**
 * 妖兽猎杀系统（首轮：山麓）。
 *
 * 一次出征 = 消耗信符 → 派 1~5 名弟子 → 按实际时间推进 → 归队一次性结算兽材。
 * 成员属于「占用状态」：出征期间停止原岗位工作，但仍修炼、累计停留与普通口粮，
 * 也不能被转岗、逐出或再次派往其他任务。规则见 docs/BEAST-SYSTEM.md。
 *
 * 生态关联（警戒/抑制/来袭权重）首轮全部关闭，只保留 fieldState 结构。
 */

export const HUNT_SCHEMA_VERSION = 1

/** 出征信符单价（金额域）：静态表里的字面值是 Number，进入金额运算前构造为 Decimal。 */
const WARRANT_COST = money(HUNT.WARRANT_COST)

/** 兽材小数余量的存档上限：不足一件的部分只保留 [0, 1)。 */
const REMAINDER_CAP = money(0.999999)

/** 静态秒产表（Number 字面值）→ 金额映射。 */
function moneyYieldMap(values) {
  return Object.fromEntries(Object.entries(values || {}).map(([res, amount]) => [res, money(amount)]))
}

/** 初始猎杀状态（进存档） */
export function createHuntingState() {
  return {
    schemaVersion: HUNT_SCHEMA_VERSION,
    nextMissionId: 1,
    // 独立随机序列：猎杀不消耗事件/突破/收徒的随机数，存读档不重抽已结算结果。
    randomSeed: 1,
    missions: {},
    // 各兽材小数累计，范围 [0, 1)；整数入库后只留不足 1 的余量。
    yieldRemainders: {},
    fieldState: {},
    lastOutcome: null,
    statistics: {
      departures: 0,
      completedMissions: 0,
      cancelledMissions: 0,
      successfulHunters: 0,
      failedHunters: 0,
    },
    settings: {
      selectedFieldId: DEFAULT_HUNT_FIELD,
      teamIds: [],
      autoRepeat: false,
    },
  }
}

/** 存档归一：只保留已知猎场、非负有限数值与合法成员列表。 */
export function normalizeHuntingState(raw, fresh = createHuntingState()) {
  const out = { ...fresh, ...(raw && typeof raw === 'object' ? raw : {}) }
  out.schemaVersion = HUNT_SCHEMA_VERSION
  out.nextMissionId = Number.isSafeInteger(out.nextMissionId) && out.nextMissionId > 0 ? out.nextMissionId : 1
  out.randomSeed = Number.isSafeInteger(out.randomSeed) && out.randomSeed >= 0 ? out.randomSeed >>> 0 : 1
  out.yieldRemainders = sanitizeRemainders(out.yieldRemainders)
  out.missions = sanitizeMissions(out.missions)
  out.nextMissionId = Math.max(out.nextMissionId, ...Object.values(out.missions).map(m => m.id + 1))
  out.fieldState = sanitizeFieldState(out.fieldState)
  out.lastOutcome = sanitizeOutcome(out.lastOutcome)
  out.statistics = sanitizeStats(out.statistics)
  out.settings = sanitizeSettings(out.settings)
  return out
}

function sanitizeRemainders(value) {
  const out = {}
  for (const [res, amount] of Object.entries(value || {})) {
    if (!Object.hasOwn(RESOURCE_MAP, res)) continue
    // 余量是金额：零值判断与夹取都走 Decimal（Decimal 对象恒为真，不能用真假判断）。
    const remainder = moneyNonNegative(amount)
    if (remainder.gt(0)) out[res] = moneyMin(remainder, REMAINDER_CAP)
  }
  return out
}

function sanitizeStats(value) {
  const fresh = createHuntingState().statistics
  const out = {}
  for (const key of Object.keys(fresh)) {
    out[key] = Number.isFinite(value?.[key]) && value[key] >= 0 ? Math.floor(value[key]) : 0
  }
  return out
}

function sanitizeSettings(value) {
  const fieldId = Object.hasOwn(HUNT_FIELD_MAP, value?.selectedFieldId) ? value.selectedFieldId : DEFAULT_HUNT_FIELD
  const teamIds = (Array.isArray(value?.teamIds) ? value.teamIds : [])
    .filter(id => Number.isSafeInteger(id) && id > 0).slice(0, HUNT.TEAM_MAX)
  return { selectedFieldId: fieldId, teamIds: [...new Set(teamIds)], autoRepeat: value?.autoRepeat === true }
}

function sanitizeMissions(value) {
  const out = {}
  if (!value || typeof value !== 'object') return out
  for (const [id, mission] of Object.entries(value)) {
    if (!mission || typeof mission !== 'object') continue
    const field = Object.hasOwn(HUNT_FIELD_MAP, mission.fieldId) ? HUNT_FIELD_MAP[mission.fieldId] : null
    if (!field || mission.status !== 'active' || mission.formulaVersion !== HUNT_SCHEMA_VERSION) continue
    if (!Number.isSafeInteger(mission.id) || mission.id <= 0 || mission.id >= Number.MAX_SAFE_INTEGER || String(mission.id) !== id) continue
    if (!Number.isFinite(mission.startedAt) || mission.startedAt < 0 ||
        !Number.isFinite(mission.actualDuration) || mission.actualDuration < 1 || mission.actualDuration > field.baseDuration ||
        !Number.isFinite(mission.progressSeconds) || mission.progressSeconds < 0 ||
        !Number.isFinite(mission.support) || mission.support < 1 || mission.support > 1.4 ||
        !Number.isFinite(mission.yieldBonus) || mission.yieldBonus < 1 || mission.yieldBonus > 1 + HUNT.YIELD_BONUS_CAP) continue
    if (!Array.isArray(mission.snapshots) || mission.snapshots.length < HUNT.TEAM_MIN || mission.snapshots.length > HUNT.TEAM_MAX) continue
    const seen = new Set()
    if (mission.snapshots.some(snap => {
      if (!snap || !Number.isSafeInteger(snap.id) || snap.id <= 0 || seen.has(snap.id) ||
          !Number.isInteger(snap.realm) || snap.realm < 0 || snap.realm >= REALMS.length ||
          !Number.isInteger(snap.e) || snap.e < 0 || snap.e > snap.realm ||
          !Number.isFinite(snap.A) || snap.A < 0.25 || snap.A > 2 ||
          !Number.isFinite(snap.p) || snap.p < HUNT.SUCCESS_FLOOR || snap.p > HUNT.SUCCESS_CAP) return true
      seen.add(snap.id)
      return false
    })) continue
    out[id] = {
      id: mission.id, fieldId: field.id, status: 'active', startedAt: mission.startedAt,
      progressSeconds: Math.min(mission.progressSeconds, mission.actualDuration),
      baseDuration: field.baseDuration, actualDuration: mission.actualDuration,
      formulaVersion: HUNT_SCHEMA_VERSION, sectRealm: finiteCount(mission.sectRealm, REALMS.length - 1),
      support: mission.support, successBonus: Number.isFinite(mission.successBonus) ? Math.max(0, mission.successBonus) : 0,
      yieldBonus: mission.yieldBonus, baseYield: moneyYieldMap(field.baseYield), advancedYield: field.advancedYield ? moneyYieldMap(field.advancedYield) : null,
      preparationPaid: WARRANT_COST,
      snapshots: mission.snapshots.map(snap => ({ id: snap.id, name: typeof snap.name === 'string' ? snap.name.slice(0, 40) : `弟子${snap.id}`,
        realm: snap.realm, e: snap.e, A: snap.A, p: snap.p, roleId: JOBS.some(j => j.id === snap.roleId) ? snap.roleId : null })),
    }
    if (Object.keys(out).length >= HUNT.MAX_ACTIVE_MISSIONS) break
  }
  return out
}

function sanitizeOutcome(value) {
  if (!value || !Object.hasOwn(HUNT_FIELD_MAP, value.fieldId) || !Number.isFinite(value.at) || value.at < 0) return null
  return { fieldId: value.fieldId, at: value.at, cancelled: value.cancelled === true,
    teamSize: finiteCount(value.teamSize, HUNT.TEAM_MAX),
    successCount: finiteCount(value.successCount, HUNT.TEAM_MAX),
    gains: sanitizeOutcomeAmounts(value.fieldId, value.gains),
    remainders: sanitizeOutcomeAmounts(value.fieldId, value.remainders),
    rows: (Array.isArray(value.rows) ? value.rows : []).filter(row => row && Number.isSafeInteger(row.id))
      .slice(0, HUNT.TEAM_MAX).map(row => ({ id: row.id, name: typeof row.name === 'string' ? row.name.slice(0, 40) : '', success: row.success === true })),
  }
}

/**
 * 战报里的兽材金额：只保留本猎场确实产出的资源，损坏值、负数与空串一律丢弃。
 * 该字段不在 moneyFields 白名单内，写档时按 Decimal 的十进制字符串落地，读档在此还原。
 */
function sanitizeOutcomeAmounts(fieldId, values) {
  const out = {}
  for (const [res, amount] of Object.entries(values || {})) {
    if (!Object.hasOwn(HUNT_FIELD_MAP[fieldId].baseYield, res)) continue
    const gained = moneyFromSave(amount, null)
    if (gained !== null && !gained.isNegative()) out[res] = gained
  }
  return out
}

function finiteCount(value, cap = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) ? Math.max(0, Math.min(cap, Math.floor(value))) : 0
}

function sanitizeFieldState(value) {
  const out = {}
  if (!value || typeof value !== 'object') return out
  for (const [id, entry] of Object.entries(value)) {
    if (!Object.hasOwn(HUNT_FIELD_MAP, id) || !entry || typeof entry !== 'object') continue
    out[id] = Object.fromEntries(['lastHuntAt', 'completedMissions', 'successfulHunters', 'failedHunters']
      .filter(key => Object.hasOwn(entry, key)).map(key => [key, finiteCount(entry[key])]))
  }
  return out
}

/**
 * 读档后按任务重建成员占用标记：任务里记录的成员重新标为出征中并让出岗位。
 * 成员上的 onMission 是运行时字段，不进存档，故每次读档都要重挂。
 */
export function rehydrateHuntOccupancy(state) {
  if (!state?.hunting) return
  const hunting = state.hunting
  const byId = new Map((state.disciples?.members || []).map(m => [m.id, m]))
  for (const member of state.disciples?.members || []) member.onMission = false
  for (const mission of Object.values(hunting.missions || {})) {
    mission.snapshots = mission.snapshots.filter(snap => byId.has(snap.id))
    if (!mission.snapshots.length) { delete hunting.missions[mission.id]; continue }
    for (const snap of mission.snapshots || []) {
      const member = byId.get(snap.id)
      if (!member) continue
      member.onMission = true
      member.roleId = null
    }
  }
  recount(state)
}

/** 独立线性同余随机（与收徒/突破/事件互不干扰），序列存于 state.hunting.randomSeed。 */
function huntRandom(hunting) {
  hunting.randomSeed = (Math.imul(hunting.randomSeed >>> 0, 1664525) + 1013904223) >>> 0
  return hunting.randomSeed / 4294967296
}

export function huntField(fieldId) {
  return HUNT_FIELD_MAP[fieldId] || null
}

/** 当前活动任务（首轮同时至多一个） */
export function activeMission(state) {
  const missions = state?.hunting?.missions || {}
  return Object.values(missions).find(m => m.status === 'active') || null
}

export function isHuntUnlocked(state, fieldId) {
  if (!isModuleEnabled(state, 'hunting')) return false
  const field = HUNT_FIELD_MAP[fieldId]
  if (!field || !state.upgrades?.wildHunting) return false
  if (activeOf(state, 'huntingCamp') <= 0) return false
  return state.realm >= field.entryRealm
}

/** 信符余额（金额）：库存按金额域读取，返回 Decimal 供后续比较与运算。 */
export function warrantBalance(state) {
  return money(state.resources.warrant ?? ZERO)
}

export function huntTeamMax(state) {
  return HUNT.TEAM_MAX
}

/** 可选出征成员：存在且未在出征中 */
export function huntableMembers(state) {
  return (state.disciples?.members || []).filter(m => !m.onMission)
}

/** 每名成员的战场快照与效率/成功率（公式见 BEAST-SYSTEM.md §4）。 */
export function evaluateTeam(state, derived, fieldId, teamIds) {
  const field = HUNT_FIELD_MAP[fieldId]
  if (!field) return []
  const sect = state.realm
  const support = 1 + 0.1 * clamp(sect - field.entryRealm, 0, 4)
  const successBonus = derived?.huntSuccessBonus || 0
  const byId = new Map((state.disciples?.members || []).map(m => [m.id, m]))
  const seen = new Set()
  const rows = []
  for (const id of teamIds || []) {
    const member = byId.get(id)
    if (!member || seen.has(id) || member.onMission) continue
    seen.add(id)
    const e = Math.min(member.realm, sect)
    const A = 2 ** clamp((e - field.recommendRealm) / 2, -2, 1)
    const p = clamp(
      field.successBase + 0.06 * (e - field.recommendRealm) + 0.02 * clamp(sect - field.entryRealm, 0, 3) + successBonus,
      HUNT.SUCCESS_FLOOR,
      HUNT.SUCCESS_CAP,
    )
    rows.push({ id: member.id, name: member.name, realm: member.realm, e, A, p, support })
  }
  return rows
}

/** 出征预览：预计成功人数与期望兽材（不消耗随机数）。 */
export function huntPreview(state, derived, fieldId, teamIds) {
  const field = HUNT_FIELD_MAP[fieldId]
  if (!field) return null
  const rows = evaluateTeam(state, derived, fieldId, teamIds)
  const support = rows[0]?.support ?? (1 + 0.1 * clamp(state.realm - field.entryRealm, 0, 4))
  const duration = huntDuration(field, derived?.huntDurationReduction || 0)
  const gain = 1 + Math.min(HUNT.YIELD_BONUS_CAP, derived?.huntYieldBonus || 0)
  const expectedZ = rows.reduce((sum, row) => sum + row.A * (row.p + 0.2 * (1 - row.p)), 0)
  const expectedSuccess = rows.reduce((sum, row) => sum + row.p, 0)
  const expectedGains = {}
  for (const [res, base] of Object.entries(field.baseYield || {})) {
    // base 是金额，duration / support / expectedZ / gain 是 Number：乘法在 Decimal 域完成。
    expectedGains[res] = money(base).times(field.baseDuration).times(support).times(expectedZ).times(gain)
  }
  return { field, rows, duration, expectedSuccess, expectedGains, prepEnough: atLeast(warrantBalance(state), WARRANT_COST) }
}

export function huntDuration(field, durationReduction = 0) {
  const reduction = Math.min(HUNT.DURATION_REDUCTION_CAP, Math.max(0, durationReduction))
  return Math.max(1, Math.ceil(field.baseDuration * (1 - reduction)))
}

/** 出征前校验：猎场/设施/境界/成员/信符都满足才允许出发。 */
export function canDepart(state, derived, fieldId, teamIds) {
  if (!isModuleEnabled(state, 'hunting')) return { ok: false, reason: '猎杀模块已关闭' }
  const field = HUNT_FIELD_MAP[fieldId]
  if (!field) return { ok: false, reason: '未知猎场' }
  if (!state.upgrades?.wildHunting) return { ok: false, reason: '尚未掌握《山野猎法》' }
  if (activeOf(state, 'huntingCamp') <= 0) return { ok: false, reason: '需要启用中的猎杀营地' }
  if (state.realm < field.entryRealm) return { ok: false, reason: '宗门境界不足' }
  if (activeMission(state)) return { ok: false, reason: '已有出征任务在进行' }
  const rows = evaluateTeam(state, derived, fieldId, teamIds)
  if (rows.length < HUNT.TEAM_MIN) return { ok: false, reason: '请选择至少 1 名弟子' }
  if (rows.length > HUNT.TEAM_MAX) return { ok: false, reason: `每队最多 ${HUNT.TEAM_MAX} 人` }
  if (!atLeast(warrantBalance(state), WARRANT_COST)) return { ok: false, reason: `信符不足 ${HUNT.WARRANT_COST}` }
  return { ok: true }
}

/**
 * 出发：原子扣信符、占用成员、保存快照。
 * 连续点击不会重复支付或派出（同一成员已带 onMission 会被 evaluateTeam 过滤）。
 */
export function departHunt(state, derived, { fieldId, teamIds } = {}) {
  const hunting = state.hunting
  const fid = fieldId || hunting.settings.selectedFieldId
  const ids = teamIds || hunting.settings.teamIds
  const check = canDepart(state, derived, fid, ids)
  if (!check.ok) return { ok: false, reason: check.reason }

  const field = HUNT_FIELD_MAP[fid]
  const rows = evaluateTeam(state, derived, fid, ids)
  const byId = new Map(state.disciples.members.map(m => [m.id, m]))
  const snapshots = rows.map(row => ({
    id: row.id,
    name: row.name,
    realm: row.realm,
    e: row.e,
    A: row.A,
    p: row.p,
    roleId: byId.get(row.id)?.roleId || null,
  }))

  const id = hunting.nextMissionId++
  const startedAt = gameNow(state)
  const mission = {
    id,
    fieldId: fid,
    status: 'active',
    startedAt,
    progressSeconds: 0,
    baseDuration: field.baseDuration,
    actualDuration: huntDuration(field, derived?.huntDurationReduction || 0),
    formulaVersion: HUNT_SCHEMA_VERSION,
    sectRealm: state.realm,
    support: 1 + 0.1 * clamp(state.realm - field.entryRealm, 0, 4),
    successBonus: derived?.huntSuccessBonus || 0,
    yieldBonus: 1 + Math.min(HUNT.YIELD_BONUS_CAP, derived?.huntYieldBonus || 0),
    baseYield: moneyYieldMap(field.baseYield),
    advancedYield: field.advancedYield ? moneyYieldMap(field.advancedYield) : null,
    snapshots,
    preparationPaid: WARRANT_COST,
  }

  state.resources.warrant = moneyAvailable(state.resources.warrant ?? ZERO, WARRANT_COST)
  for (const snap of snapshots) {
    const member = byId.get(snap.id)
    if (!member) continue
    member.onMission = true
    member.roleId = null
  }
  recount(state)
  hunting.missions[id] = mission
  hunting.statistics.departures += 1
  hunting.settings.selectedFieldId = fid
  hunting.settings.teamIds = snapshots.map(s => s.id)
  pushLog(state, `出征山麓：${snapshots.length} 名弟子持 ${HUNT.WARRANT_COST} 枚信符入山`, 'event')
  return { ok: true, mission }
}

/** 取消：立即归队，不发半程兽材、不退信符、不回滚已发生的猎场活动。 */
export function cancelHunt(state, derived, missionId = null) {
  const mission = missionId ? state.hunting.missions[missionId] : activeMission(state)
  if (!mission || mission.status !== 'active') return { ok: false }
  releaseMembers(state, mission)
  delete state.hunting.missions[mission.id]
  state.hunting.statistics.cancelledMissions += 1
  state.hunting.lastOutcome = { fieldId: mission.fieldId, at: gameNow(state), cancelled: true, gains: {} }
  recount(state)
  pushLog(state, `猎杀任务取消，弟子归队（不退信符）`, 'bad')
  return { ok: true }
}

function releaseMembers(state, mission) {
  const byId = new Map(state.disciples.members.map(m => [m.id, m]))
  for (const snap of mission.snapshots || []) {
    const member = byId.get(snap.id)
    if (!member) continue
    member.onMission = false
    const jobValid = snap.roleId && JOBS.some(j => j.id === snap.roleId)
    member.roleId = jobValid ? snap.roleId : null
  }
}

function recount(state) {
  state.disciples.total = state.disciples.members.length
  for (const job of JOBS) state.disciples.jobs[job.id] = 0
  for (const member of state.disciples.members) {
    if (member.roleId && Object.hasOwn(state.disciples.jobs, member.roleId)) state.disciples.jobs[member.roleId]++
  }
}

/** 推进活动任务；到达时长即结算。返回是否有结算发生。 */
export function advanceHunt(state, derived, dt) {
  if (!(dt > 0) || !state.hunting) return false
  let changed = false
  for (const mission of Object.values(state.hunting.missions)) {
    if (mission.status !== 'active') continue
    mission.progressSeconds += dt
    if (mission.progressSeconds + 1e-9 >= mission.actualDuration) {
      const completedAt = gameNow(state) + dt * 1000
      withGameContext(state, { now: () => completedAt }, () => settleMission(state, derived, mission))
      changed = true
    }
  }
  return changed
}

/**
 * 归队结算：逐人判定成功，按 T_base 与快照倍率计算兽材，整数入库、小数累计。
 * `autoRepeat: false` 用于长离线的有界快进 —— 它自己统一处理后续批次与末趟，
 * 否则这里的「立即再出发」会把队员再次标记为出征，让快进拿不到队伍与剩余时长。
 */
export function settleMission(state, derived, mission, { autoRepeat = true } = {}) {
  const hunting = state.hunting
  const rows = []
  let successCount = 0
  let effectiveContribution = 0
  for (const snap of mission.snapshots) {
    const success = huntRandom(hunting) < snap.p
    if (success) successCount++
    // 山麓无进阶档：全部计入普通档；失败保底 0.20。
    const Z = success ? 1 : 0.2
    rows.push({ id: snap.id, name: snap.name, success })
    effectiveContribution += snap.A * Z
  }
  const gains = {}
  const remainders = {}
  for (const [res, base] of Object.entries(mission.baseYield || {})) {
    // base 与余量是金额，baseDuration / support / contribution / yieldBonus 是 Number。
    const y = money(base)
      .times(mission.baseDuration)
      .times(mission.support)
      .times(effectiveContribution)
      .times(mission.yieldBonus)
    const total = money(hunting.yieldRemainders[res] ?? ZERO).plus(y)
    const whole = floorMoney(total)
    hunting.yieldRemainders[res] = total.minus(whole)
    remainders[res] = hunting.yieldRemainders[res]
    if (whole.gt(0)) {
      gains[res] = addResource(state, res, whole, derived?.max?.[res] ?? MONEY_INFINITY)
    } else {
      gains[res] = ZERO
    }
  }

  hunting.statistics.completedMissions += 1
  hunting.statistics.successfulHunters += successCount
  hunting.statistics.failedHunters += rows.length - successCount

  const field = HUNT_FIELD_MAP[mission.fieldId]
  const fieldState = hunting.fieldState[mission.fieldId] || {}
  fieldState.lastHuntAt = gameNow(state)
  fieldState.completedMissions = (fieldState.completedMissions || 0) + 1
  fieldState.successfulHunters = (fieldState.successfulHunters || 0) + successCount
  fieldState.failedHunters = (fieldState.failedHunters || 0) + (rows.length - successCount)
  hunting.fieldState[mission.fieldId] = fieldState

  releaseMembers(state, mission)
  delete hunting.missions[mission.id]
  hunting.lastOutcome = {
    fieldId: mission.fieldId,
    at: gameNow(state),
    cancelled: false,
    successCount,
    teamSize: rows.length,
    rows,
    gains,
    remainders,
  }
  recount(state)

  const gainText = Object.entries(gains)
    .filter(([, amount]) => amount.gt(0))
    .map(([res, amount]) => `${RESOURCE_MAP[res]?.name || res} ×${amount}`)
    .join('、')
  pushLog(
    state,
    `猎杀归队（${field?.name || mission.fieldId}）：${rows.length} 人成功 ${successCount} 人${gainText ? '，猎获 ' + gainText : '，暂无整数入库'}`,
    successCount > 0 ? 'good' : 'bad',
  )

  // 自动重复：归队、恢复岗位、下一次扣点与占用在同一结算边界处理。
  // 离线的有界快进自己负责后续批次与末趟，因此显式关掉这里的副作用（见 advanceOfflineHunt）。
  if (autoRepeat && hunting.settings.autoRepeat) autoRepeatDepart(state, derived, mission.fieldId)
  return { gains, successCount, teamSize: rows.length }
}

function autoRepeatDepart(state, derived, fieldId) {
  const ids = state.hunting.settings.teamIds || []
  const check = canDepart(state, derived, fieldId, ids)
  if (!check.ok) return false
  return departHunt(state, derived, { fieldId, teamIds: ids }).ok
}

/**
 * 多趟批量结算的期望与**上界**估值（离线批量与界面上限共用同一口径）。
 *
 * 逐趟抽签的期望贡献是 `A × (p + 0.2 × (1 − p))`（失败保底 0.20），
 * 上限是所有成员全部成功（Z = 1）。批量结算用期望值，因此收益必然落在 [期望, 上限] 之间，
 * 回归检查据此断言「不得超过按规则可完成趟数对应的奖励上界」。
 */
export function huntBatchGainEstimate(field, rows, derived, trips = 1) {
  const support = rows[0]?.support ?? 1
  const yieldBonus = 1 + Math.min(HUNT.YIELD_BONUS_CAP, derived?.huntYieldBonus || 0)
  const expectedZ = rows.reduce((sum, row) => sum + row.A * (row.p + 0.2 * (1 - row.p)), 0)
  const maximumZ = rows.reduce((sum, row) => sum + row.A, 0)
  const scale = trips * support * yieldBonus * field.baseDuration
  // base 是金额；scale 与 factor（期望/上限贡献）是 Number，逐项在 Decimal 域相乘。
  const scaleBy = factor => Object.fromEntries(Object.entries(field.baseYield || {})
    .map(([res, base]) => [res, money(base).times(scale).times(factor)]))
  return {
    trips,
    support,
    yieldBonus,
    expected: scaleBy(expectedZ),
    maximum: scaleBy(maximumZ),
    expectedSuccess: Math.min(rows.length, rows.reduce((sum, row) => sum + row.p, 0)) * trips,
  }
}

/**
 * 长离线的有界快进（有界近似，见 docs/ENGINEERING.md「离线结算」）。
 *
 * - 已有已付费任务按实际剩余时长推进：到期在**真实归队时刻**结算一次并释放成员，未到期只推进进度；
 *   结算时抑制 `settleMission` 的即时再出发，由本函数统一处理后续批次，剩余时长不会被吞掉。
 * - 之后的自动重复按「整趟数」一次估算，趟数同时受任务时长与信符存量封顶，
 *   奖励用当段快照的成功率期望代替逐趟抽签，不逐趟循环、不重复扣首趟费用；
 * - 最后不足一趟的时长落成**一次已扣费的活动任务**，不把批量趟数变成下次在线的待补算队列。
 *
 * 除「已有已付费的那一趟」外，所有批次与末趟都必须先通过 `canDepart` 的统一出征条件
 * （模块开关、研究、营地、境界、队伍、占用与信符），批量分支不能自己放宽资格。
 *
 * 与在线逐秒推进的差异是有意的：后续批次的随机序列与逐趟结果不同，
 * 但总奖励不超过「按规则可完成趟数」对应的期望上界，统计、兽材余量与成员占用保持自洽。
 * 批量批次不写 lastOutcome：它是单趟战报的结构，多趟汇总会与存档校验口径冲突。
 */
export function advanceOfflineHunt(state, derived, dt, ctx = {}) {
  if (!(dt > 0) || !state.hunting) return false
  let now = Number.isFinite(ctx.startAt) ? ctx.startAt : gameNow(state)
  let remaining = dt
  let changed = false

  const mission = activeMission(state)
  if (mission) {
    const left = Math.max(0, mission.actualDuration - mission.progressSeconds)
    if (left > remaining) {
      mission.progressSeconds += remaining
      return false
    }
    remaining = Math.max(0, remaining - left)
    now += left * 1000
    // 已付费的这一趟允许按原规则完成；即时再出发交给下面的统一批次处理。
    withGameContext(state, { now: () => now }, () => settleMission(state, derived, mission, { autoRepeat: false }))
    changed = true
  }

  const hunting = state.hunting
  if (!hunting.settings.autoRepeat) return changed
  const fieldId = mission?.fieldId || hunting.settings.selectedFieldId
  const field = HUNT_FIELD_MAP[fieldId]
  if (!field) return changed
  const ids = hunting.settings.teamIds || []
  // 批量出征与末趟共用在线出征条件：研究、营地、境界、队伍、占用与信符都先过一遍。
  if (!canDepart(state, derived, fieldId, ids).ok) return changed
  const rows = evaluateTeam(state, derived, fieldId, ids)

  const duration = huntDuration(field, derived?.huntDurationReduction || 0)
  // 趟数同时受剩余时长与信符存量封顶：存量换算成整枚趟数是循环/批量数量，走 moneyToCount。
  const affordable = moneyToCount(warrantBalance(state).div(WARRANT_COST))
  const trips = Math.max(0, Math.min(Math.floor((remaining + 1e-9) / duration), affordable))
  if (trips > 0) {
    const estimate = huntBatchGainEstimate(field, rows, derived, trips)
    for (const [res, y] of Object.entries(estimate.expected)) {
      const total = money(hunting.yieldRemainders[res] ?? ZERO).plus(y)
      const whole = floorMoney(total)
      hunting.yieldRemainders[res] = total.minus(whole)
      if (whole.gt(0)) addResource(state, res, whole, derived?.max?.[res] ?? MONEY_INFINITY)
    }
    state.resources.warrant = moneyAvailable(state.resources.warrant ?? ZERO, WARRANT_COST.times(trips))
    const hunters = rows.length * trips
    const successes = Math.max(0, Math.min(hunters, Math.round(estimate.expectedSuccess)))
    hunting.statistics.departures += trips
    hunting.statistics.completedMissions += trips
    hunting.statistics.successfulHunters += successes
    hunting.statistics.failedHunters += hunters - successes
    const fieldState = hunting.fieldState[field.id] || {}
    fieldState.lastHuntAt = now + trips * duration * 1000
    fieldState.completedMissions = (fieldState.completedMissions || 0) + trips
    fieldState.successfulHunters = (fieldState.successfulHunters || 0) + successes
    fieldState.failedHunters = (fieldState.failedHunters || 0) + hunters - successes
    hunting.fieldState[field.id] = fieldState
    remaining -= trips * duration
    now += trips * duration * 1000
    changed = true
    if (ctx.stats) ctx.stats.huntBatches += 1
  }

  // 尾段：不足一趟的时长落成**一次已扣费的活动任务**（恰好用完时按 0 进度出发），
  // 与在线的即时再出发一致，不把批量趟数变成下次在线的待补算队列。
  if (atLeast(warrantBalance(state), WARRANT_COST)) {
    const departed = withGameContext(state, { now: () => now }, () => departHunt(state, derived, { fieldId: field.id, teamIds: ids }))
    if (departed.ok) {
      if (remaining > 1e-9) departed.mission.progressSeconds = remaining
      changed = true
    }
  }
  return changed
}

/** 设置：猎场 / 名单 / 自动重复（立即保存由调用方负责）。 */
export function setHuntField(state, fieldId) {
  if (!HUNT_FIELD_MAP[fieldId]) return false
  state.hunting.settings.selectedFieldId = fieldId
  return true
}

export function setHuntTeam(state, teamIds) {
  state.hunting.settings.teamIds = sanitizeSettings({ selectedFieldId: state.hunting.settings.selectedFieldId, teamIds, autoRepeat: state.hunting.settings.autoRepeat }).teamIds
  return true
}

export function setHuntAutoRepeat(state, value) {
  state.hunting.settings.autoRepeat = value === true
  return true
}

/** 任务期限由剩余进度计算，兼容读档后重新开始的现实时间轴。 */
export function nextHuntDeadline(state, now) {
  let earliest = Infinity
  for (const mission of Object.values(state?.hunting?.missions || {})) {
    if (mission.status !== 'active') continue
    const remaining = Math.max(0, mission.actualDuration - mission.progressSeconds)
    const endAt = now + remaining * 1000
    if (endAt > now && endAt < earliest) earliest = endAt
  }
  return earliest
}

/** 停用只取消活动任务、释放占用，保留历史、余量、随机序列与队伍偏好。 */
export function deactivateHunting(state) {
  const hunting = state.hunting
  if (!hunting) return
  for (const mission of Object.values(hunting.missions || {})) {
    if (mission.status === 'active') releaseMembers(state, mission)
  }
  hunting.missions = {}
  for (const member of state.disciples?.members || []) {
    member.onMission = false
    // 执符使为猎杀与外交共用：外交仍启用时保留岗位，避免读档清空共享供给。
    if (member.roleId === 'huntPlanner' && !isModuleEnabled(state, 'diplomacy')) member.roleId = null
  }
  recount(state)
}
