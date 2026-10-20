import { withResourceAction } from '../../game/resourceObservation'
import { setResourceValue } from '../../game/resourceObservation'
import { HUNT, HUNT_FIELD_MAP, DEFAULT_HUNT_FIELD } from './data.js'
import { JOBS } from '@/data/jobs'
import { RESOURCE_MAP } from '@/data/resources'
import { REALMS } from '@/data/realms'
import { isModuleEnabled } from '@/data/modules'
import { talentBonus, hasHuntTalent, TALENT_RULES } from '@/data/talents'
import { clamp, pushLog, addResource, activeOf } from '@/game/systems/core'
import { MONEY_INFINITY, ZERO, ceilMoney, floorMoney, money, moneyAvailable, moneyFromSave, moneyMin, moneyNonNegative, moneyToCount } from '@/game/decimal'
import { atLeast } from '@/game/numbers'
import { gameNow } from '@/game/context'

/**
 * 妖兽猎杀系统（首轮：山麓）。
 *
 * 一次猎杀即时支付信符并结算兽材，成员照常生产。自动执行按独立周期推进。
 * 只有旧档迁移保留已付款任务快照。规则见 docs/BEAST-SYSTEM.md。
 *
 * 生态关联（警戒/抑制/来袭权重）首轮全部关闭，只保留 fieldState 结构。
 */

/**
 * v3：即时结算与周期自动执行；v1／v2 已付款任务在正式加载时按旧快照结算一次。
 */
export const HUNT_SCHEMA_VERSION = 3

/** 出征信符单价（金额域）：静态表里的字面值是 Number，进入金额运算前构造为 Decimal。 */
const WARRANT_COST = money(HUNT.WARRANT_COST)

/** 猎杀收获天赋的个人倍率上限：y = 1 + 天赋加成，封顶 1 + caps.huntYield。 */
const TALENT_YIELD_CAP = TALENT_RULES.caps.huntYield

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
      /** 玩家勾选的加成弟子；手动和定时猎杀共用，普通弟子自动补位。 */
      teamIds: [],
      autoRepeat: false,
      /** 两次自动猎杀之间的间隔秒数；不是弟子占用时长。 */
      autoIntervalSeconds: HUNT.AUTO_INTERVAL_DEFAULT,
      /** 当前间隔内已累计的秒数，始终保持在 [0, interval)。 */
      elapsedSeconds: 0,
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

/** 自动间隔：非法值回默认 60；允许范围 30～3600 秒的整数。 */
function normalizeAutoInterval(value) {
  return Number.isFinite(value)
    ? Math.max(HUNT.AUTO_INTERVAL_MIN, Math.min(HUNT.AUTO_INTERVAL_MAX, Math.floor(value)))
    : HUNT.AUTO_INTERVAL_DEFAULT
}

function sanitizeSettings(value) {
  const fieldId = Object.hasOwn(HUNT_FIELD_MAP, value?.selectedFieldId) ? value.selectedFieldId : DEFAULT_HUNT_FIELD
  const teamIds = (Array.isArray(value?.teamIds) ? value.teamIds : [])
    .filter(id => Number.isSafeInteger(id) && id > 0).slice(0, HUNT.TEAM_MAX)
  const autoIntervalSeconds = normalizeAutoInterval(value?.autoIntervalSeconds)
  const elapsedSeconds = Number.isFinite(value?.elapsedSeconds)
    ? Math.max(0, Math.min(autoIntervalSeconds - 1e-9, value.elapsedSeconds))
    : 0
  return {
    selectedFieldId: fieldId,
    teamIds: [...new Set(teamIds)],
    autoRepeat: value?.autoRepeat === true,
    autoIntervalSeconds,
    elapsedSeconds: value?.autoRepeat === true ? elapsedSeconds : 0,
  }
}

function sanitizeMissions(value) {
  const out = {}
  if (!value || typeof value !== 'object') return out
  for (const [id, mission] of Object.entries(value)) {
    if (!mission || typeof mission !== 'object') continue
    const field = Object.hasOwn(HUNT_FIELD_MAP, mission.fieldId) ? HUNT_FIELD_MAP[mission.fieldId] : null
    const legacy = mission.formulaVersion === 1 && mission.fieldId === 'foothills'
    if (!field || mission.status !== 'active' || (!legacy && mission.formulaVersion !== 2)) continue
    // v1 只开放山麓；使用已知旧规则重建，不能信任存档自带的掉落数值。
    const baseDuration = legacy ? 120 : field.baseDuration
    const baseYield = legacy ? { beastHide: 0.12, beastBone: 0.08 } : field.baseYield
    if (!Number.isSafeInteger(mission.id) || mission.id <= 0 || mission.id >= Number.MAX_SAFE_INTEGER || String(mission.id) !== id) continue
    if (!Number.isFinite(mission.startedAt) || mission.startedAt < 0 ||
        !Number.isFinite(mission.actualDuration) || mission.actualDuration < 1 || mission.actualDuration > baseDuration ||
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
      baseDuration, actualDuration: mission.actualDuration,
      formulaVersion: mission.formulaVersion, sectRealm: finiteCount(mission.sectRealm, REALMS.length - 1),
      support: mission.support, successBonus: Number.isFinite(mission.successBonus) ? Math.max(0, mission.successBonus) : 0,
      yieldBonus: mission.yieldBonus, baseYield: moneyYieldMap(baseYield), advancedYield: field.advancedYield ? moneyYieldMap(field.advancedYield) : null,
      preparationPaid: WARRANT_COST,
      snapshots: mission.snapshots.map(snap => ({ id: snap.id, name: typeof snap.name === 'string' ? snap.name.slice(0, 40) : `弟子${snap.id}`,
        realm: snap.realm, e: snap.e, A: snap.A, p: snap.p,
        y: !legacy && Number.isFinite(snap.y) && snap.y >= 1 && snap.y <= 1 + TALENT_YIELD_CAP ? snap.y : 1,
        roleId: JOBS.some(j => j.id === snap.roleId) ? snap.roleId : null })),
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
  hunting.settings.teamIds = hunting.settings.teamIds.filter(id => byId.has(id))
  // 只清洗成员关联，不发奖、不抽随机数；正式加载或推进前再迁移。
  for (const member of state.disciples?.members || []) member.onMission = false
  for (const mission of Object.values(hunting.missions)) {
    mission.snapshots = mission.snapshots.filter(snap => byId.has(snap.id))
    if (!mission.snapshots.length) delete hunting.missions[mission.id]
  }
}

/** 独立线性同余随机（与收徒/突破/事件互不干扰），序列存于 state.hunting.randomSeed。 */
function huntRandom(hunting) {
  hunting.randomSeed = (Math.imul(hunting.randomSeed >>> 0, 1664525) + 1013904223) >>> 0
  return hunting.randomSeed / 4294967296
}

export function huntField(fieldId) {
  return HUNT_FIELD_MAP[fieldId] || null
}

/** 当前活动任务（仅旧档迁移读取；新规则不再创建任务）。 */
export function activeMission(state) {
  const missions = state?.hunting?.missions || {}
  return Object.values(missions).find(m => m.status === 'active') || null
}

/**
 * 旧档已付款任务迁移：按原快照立即结算一次，恢复岗位并删除任务。
 * 反复调用时 missions 已为空，不会重复发奖；normalize 只保留任务，不调用本函数。
 */
export function migrateLegacyHunts(state, derived = null) {
  const hunting = state?.hunting
  if (!hunting) return false
  const missions = Object.values(hunting.missions || {}).filter(m => m?.status === 'active')
  if (!missions.length) return false
  if (!derived?.max) throw new Error('旧猎杀任务迁移需要有效仓容')
  for (const mission of missions) {
    // 旧档任务可能尚未重挂占用；结算前标记，确保按快照恢复原岗位。
    const byId = new Map((state.disciples?.members || []).map(m => [m.id, m]))
    for (const snap of mission.snapshots || []) {
      const member = byId.get(snap.id)
      if (member) member.onMission = true
    }
    settleMission(state, derived, mission, { autoRepeat: false })
  }
  hunting.missions = {}
  hunting.settings.elapsedSeconds = 0
  if (!isModuleEnabled(state, 'hunting')) deactivateHunting(state)
  return true
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

/** 猎杀专属减耗后的单次费用（金额取整、至少 1）；不影响外交。 */
export function huntCost(derived) {
  const reduction = Math.min(HUNT.COST_REDUCTION_CAP, Math.max(0, derived?.huntCostReduction || 0))
  return Math.max(1, moneyToCount(ceilMoney(money(HUNT.WARRANT_COST).times(1 - reduction))))
}

export function warrantCost(derived) {
  return money(huntCost(derived))
}

export function huntTeamMax(state) {
  return HUNT.TEAM_MAX
}

/** 可选出征成员：即时猎杀不占用岗位，所有存在弟子都可被选。 */
export function huntableMembers(state) {
  return state.disciples?.members || []
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
    if (!member || seen.has(id) || member.realm < (field.minDiscipleRealm || 0)) continue
    seen.add(id)
    const e = Math.min(member.realm, sect)
    const A = 2 ** clamp((e - field.recommendRealm) / 2, -2, 1)
    // 个人猎杀天赋：huntSuccess 加成功率百分点，huntYield 加个人收获倍率 y。
    const p = clamp(
      field.successBase + 0.06 * (e - field.recommendRealm) + 0.02 * clamp(sect - field.entryRealm, 0, 3) + successBonus
        + talentBonus(member, 'huntSuccess'),
      HUNT.SUCCESS_FLOOR,
      HUNT.SUCCESS_CAP,
    )
    const y = 1 + talentBonus(member, 'huntYield')
    rows.push({ id: member.id, name: member.name, realm: member.realm, e, A, p, y, support })
  }
  return rows
}

/**
 * 推荐阵容：按真实期望贡献 A×y×(p+0.2(1-p)) 降序、同分按 ID 升序，最多 5 人。
 * 只返回推荐结果，不写入玩家名单；玩家点击“推荐阵容”后才改名单。
 */
export function autoPickTeam(state, derived, fieldId) {
  const field = HUNT_FIELD_MAP[fieldId]
  if (!field) return []
  const candidates = huntableMembers(state).filter(m => m.realm >= (field.minDiscipleRealm || 0))
  const rows = evaluateTeam(state, derived, fieldId, candidates.map(m => m.id))
  rows.sort((a, b) =>
    b.A * b.y * (b.p + 0.2 * (1 - b.p)) - a.A * a.y * (a.p + 0.2 * (1 - a.p)) || a.id - b.id)
  return rows.slice(0, HUNT.TEAM_MAX).map(row => row.id)
}

/** 所选加成弟子优先，普通弟子按期望贡献补足；未勾选的加成弟子不自动加入。 */
export function resolveHuntTeam(state, derived, fieldId) {
  const field = HUNT_FIELD_MAP[fieldId]
  if (!field) return []
  const members = new Map(huntableMembers(state).filter(member => member.realm >= (field.minDiscipleRealm || 0))
    .map(member => [member.id, member]))
  const selected = [...new Set(state.hunting?.settings?.teamIds || [])]
    .filter(id => members.has(id) && hasHuntTalent(members.get(id))).slice(0, HUNT.TEAM_MAX)
  const ordinary = autoPickTeam({ ...state, disciples: { ...state.disciples,
    members: [...members.values()].filter(member => !hasHuntTalent(member)) } }, derived, fieldId)
  return [...selected, ...ordinary].slice(0, HUNT.TEAM_MAX)
}

/** 出征预览：预计成功人数与期望兽材（不消耗随机数）。 */
export function huntPreview(state, derived, fieldId, teamIds) {
  const field = HUNT_FIELD_MAP[fieldId]
  if (!field) return null
  const rows = evaluateTeam(state, derived, fieldId, teamIds ?? resolveHuntTeam(state, derived, fieldId))
  const support = rows[0]?.support ?? (1 + 0.1 * clamp(state.realm - field.entryRealm, 0, 4))
  const duration = huntDuration(field)
  const gain = 1 + Math.min(HUNT.YIELD_BONUS_CAP, derived?.huntYieldBonus || 0)
  const expectedZ = rows.reduce((sum, row) => sum + row.A * row.y * (row.p + 0.2 * (1 - row.p)), 0)
  const expectedSuccess = rows.reduce((sum, row) => sum + row.p, 0)
  const expectedGains = {}
  for (const [res, base] of Object.entries(field.baseYield || {})) {
    // base 是金额，duration / support / expectedZ / gain 是 Number：乘法在 Decimal 域完成。
    expectedGains[res] = money(base).times(field.baseDuration).times(support).times(expectedZ).times(gain)
  }
  return { field, rows, duration, expectedSuccess, expectedGains, prepEnough: atLeast(warrantBalance(state), warrantCost(derived)) }
}

/** 旧档/工具兼容：即时猎杀不再有时长，保留单次基准时长。 */
export function huntDuration(field) {
  return field.baseDuration
}

/** 出征前校验：猎场/设施/境界/成员/信符都满足才允许出发。 */
export function canDepart(state, derived, fieldId, teamIds) {
  if (!isModuleEnabled(state, 'hunting')) return { ok: false, reason: '猎杀模块已关闭' }
  const field = HUNT_FIELD_MAP[fieldId]
  if (!field) return { ok: false, reason: '未知猎场' }
  if (!state.upgrades?.wildHunting) return { ok: false, reason: '尚未掌握《山野猎法》' }
  if (activeOf(state, 'huntingCamp') <= 0) return { ok: false, reason: '需要启用中的执符堂' }
  if (state.realm < field.entryRealm) return { ok: false, reason: '宗门境界不足' }
  const rows = evaluateTeam(state, derived, fieldId, teamIds ?? resolveHuntTeam(state, derived, fieldId))
  if (rows.length < HUNT.TEAM_MIN) return { ok: false, reason: '没有可出征的弟子' }
  if (rows.length > HUNT.TEAM_MAX) return { ok: false, reason: `每队最多 ${HUNT.TEAM_MAX} 人` }
  if (!atLeast(warrantBalance(state), warrantCost(derived))) return { ok: false, reason: `信符不足 ${huntCost(derived)}` }
  return { ok: true }
}

/**
 * 即时猎杀：校验、扣信符、逐人判定、掉落入库、统计更新一次完成。
 * 不占用成员、不清空 roleId、不创建任务；手动成功会重置自动计时。
 */
export function departHunt(state, derived, { fieldId, teamIds, resetTimer = true } = {}) {
  return withResourceAction(state, { type: 'departHunt', id: fieldId }, () => {
    const hunting = state.hunting
    const fid = fieldId || hunting.settings.selectedFieldId
    const ids = teamIds ?? resolveHuntTeam(state, derived, fid)
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
      y: row.y,
      roleId: byId.get(row.id)?.roleId || null,
    }))
    const cost = warrantCost(derived)
    setResourceValue(state, "warrant", moneyAvailable(state.resources.warrant ?? ZERO, cost), { source: 'hunting/system.js:departHunt' })
    hunting.statistics.departures += 1
    hunting.settings.selectedFieldId = fid
    if (resetTimer) hunting.settings.elapsedSeconds = 0

    const mission = {
      id: hunting.nextMissionId++,
      fieldId: fid,
      status: 'active',
      startedAt: gameNow(state),
      progressSeconds: 0,
      baseDuration: field.baseDuration,
      actualDuration: 0,
      formulaVersion: HUNT_SCHEMA_VERSION,
      sectRealm: state.realm,
      support: 1 + 0.1 * clamp(state.realm - field.entryRealm, 0, 4),
      successBonus: derived?.huntSuccessBonus || 0,
      yieldBonus: 1 + Math.min(HUNT.YIELD_BONUS_CAP, derived?.huntYieldBonus || 0),
      baseYield: moneyYieldMap(field.baseYield),
      advancedYield: field.advancedYield ? moneyYieldMap(field.advancedYield) : null,
      snapshots,
      preparationPaid: cost,
    }
    const outcome = settleMission(state, derived, mission, { autoRepeat: false })
    recount(state)
    return { ok: true, mission, outcome }

  })
}

/** 取消已不存在；保留空入口兼容旧调用。 */
export function cancelHunt() {
  return { ok: false, reason: '即时猎杀无需召回' }
}

function releaseMembers(state, mission) {
  const byId = new Map(state.disciples.members.map(m => [m.id, m]))
  for (const snap of mission.snapshots || []) {
    const member = byId.get(snap.id)
    if (!member || !member.onMission) continue
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

/** 在线周期执行；旧档任务已在正式加载／推进入口结算。 */
export function advanceHunt(state, derived, dt) {
  if (!(dt > 0) || !state.hunting) return false
  const settings = state.hunting.settings
  if (!settings.autoRepeat) return false
  const interval = normalizeAutoInterval(settings.autoIntervalSeconds)
  settings.autoIntervalSeconds = interval
  settings.elapsedSeconds = Math.max(0, Math.min(interval - 1e-9, Number(settings.elapsedSeconds) || 0)) + dt
  let changed = false
  while (settings.elapsedSeconds + 1e-9 >= interval) {
    settings.elapsedSeconds = Math.max(0, settings.elapsedSeconds - interval)
    const result = departHunt(state, derived, {
      fieldId: settings.selectedFieldId,
      resetTimer: false,
    })
    if (!result.ok) break
    changed = true
  }
  return changed
}

/**
 * 归队结算：逐人判定成功，按 T_base 与快照倍率计算兽材，整数入库、小数累计。
 * `autoRepeat: false` 用于长离线的有界快进 —— 它自己统一处理后续批次与末趟，
 * 否则这里的「立即再出发」会把队员再次标记为出征，让快进拿不到队伍与剩余时长。
 */
export function settleMission(state, derived, mission, { autoRepeat = true } = {}) {
  return withResourceAction(state, { type: 'settleMission', id: mission?.fieldId }, () => {
    const hunting = state.hunting
    const rows = []
    let successCount = 0
    let effectiveContribution = 0
    for (const snap of mission.snapshots) {
      const success = huntRandom(hunting) < snap.p
      if (success) successCount++
      // 山麓无进阶档：全部计入普通档；失败保底 0.20。y 为个人收获天赋倍率（旧档快照缺失时按 1）。
      const Z = success ? 1 : 0.2
      rows.push({ id: snap.id, name: snap.name, success })
      effectiveContribution += snap.A * (snap.y ?? 1) * Z
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
      `猎杀（${field?.name || mission.fieldId}）：${rows.length} 人成功 ${successCount} 人${gainText ? '，猎获 ' + gainText : '，暂无整数入库'}`,
      successCount > 0 ? 'good' : 'bad',
    )

    return { gains, successCount, teamSize: rows.length }

  })
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
  const expectedZ = rows.reduce((sum, row) => sum + row.A * row.y * (row.p + 0.2 * (1 - row.p)), 0)
  const maximumZ = rows.reduce((sum, row) => sum + row.A * row.y, 0)
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
 * （模块开关、研究、执符堂、境界、队伍、占用与信符），批量分支不能自己放宽资格。
 *
 * 与在线逐秒推进的差异是有意的：后续批次的随机序列与逐趟结果不同，
 * 但总奖励不超过「按规则可完成趟数」对应的期望上界，统计、兽材余量与成员占用保持自洽。
 * 批量批次不写 lastOutcome：它是单趟战报的结构，多趟汇总会与存档校验口径冲突。
 */
export function advanceOfflineHunt(state, derived, dt, ctx = {}) {
  return withResourceAction(state, { type: 'advanceOfflineHunt', id: state.hunting?.fieldId }, () => {
    if (!(dt > 0) || !state.hunting) return false
    const changed = false
    const hunting = state.hunting
    const settings = hunting.settings
    if (!settings.autoRepeat) return false
    const interval = normalizeAutoInterval(settings.autoIntervalSeconds)
    settings.autoIntervalSeconds = interval
    const total = Math.max(0, Number(settings.elapsedSeconds) || 0) + dt
    const periods = Math.floor((total + 1e-9) / interval)
    settings.elapsedSeconds = total - periods * interval
    if (periods <= 0) return changed

    const fieldId = HUNT_FIELD_MAP[settings.selectedFieldId] ? settings.selectedFieldId : DEFAULT_HUNT_FIELD
    const field = HUNT_FIELD_MAP[fieldId]
    const ids = resolveHuntTeam(state, derived, fieldId)
    if (!field || !canDepart(state, derived, fieldId, ids).ok) return changed
    const cost = warrantCost(derived)
    const affordable = moneyToCount(warrantBalance(state).div(cost))
    const trips = Math.max(0, Math.min(periods, affordable))
    if (trips <= 0) return changed

    const rows = evaluateTeam(state, derived, fieldId, ids)
    const estimate = huntBatchGainEstimate(field, rows, derived, trips)
    for (const [res, y] of Object.entries(estimate.expected)) {
      const sum = money(hunting.yieldRemainders[res] ?? ZERO).plus(y)
      const whole = floorMoney(sum)
      hunting.yieldRemainders[res] = sum.minus(whole)
      if (whole.gt(0)) addResource(state, res, whole, derived?.max?.[res] ?? MONEY_INFINITY)
    }
    setResourceValue(state, "warrant", moneyAvailable(state.resources.warrant ?? ZERO, cost.times(trips)), { source: 'hunting/system.js:advanceOfflineHunt' })
    const hunters = rows.length * trips
    const successes = Math.max(0, Math.min(hunters, Math.round(estimate.expectedSuccess)))
    hunting.statistics.departures += trips
    hunting.statistics.completedMissions += trips
    hunting.statistics.successfulHunters += successes
    hunting.statistics.failedHunters += hunters - successes
    const fieldState = hunting.fieldState[field.id] || {}
    fieldState.lastHuntAt = gameNow(state) + dt * 1000
    fieldState.completedMissions = (fieldState.completedMissions || 0) + trips
    fieldState.successfulHunters = (fieldState.successfulHunters || 0) + successes
    fieldState.failedHunters = (fieldState.failedHunters || 0) + hunters - successes
    hunting.fieldState[field.id] = fieldState
    if (ctx.stats) ctx.stats.huntBatches += 1
    return true

  })
}

/** 设置：猎场 / 名单 / 自动重复（立即保存由调用方负责）。 */
export function setHuntField(state, fieldId) {
  if (!HUNT_FIELD_MAP[fieldId]) return false
  state.hunting.settings.selectedFieldId = fieldId
  return true
}

export function setHuntTeam(state, teamIds) {
  const existing = new Set((state.disciples?.members || []).map(member => member.id))
  state.hunting.settings.teamIds = sanitizeSettings({ ...state.hunting.settings, teamIds }).teamIds.filter(id => existing.has(id))
  return true
}

export function setHuntAutoRepeat(state, value) {
  const next = value === true
  if (next !== state.hunting.settings.autoRepeat) state.hunting.settings.elapsedSeconds = 0
  state.hunting.settings.autoRepeat = next
  return true
}

/** 设置自动间隔；改间隔后从 0 计时，不立即执行。 */
export function setHuntAutoInterval(state, value) {
  state.hunting.settings.autoIntervalSeconds = normalizeAutoInterval(value)
  state.hunting.settings.elapsedSeconds = 0
  return true
}

/** 推荐阵容只返回候选，不写玩家名单。 */
export function recommendHuntTeam(state, derived) {
  return autoPickTeam(state, derived, state.hunting.settings.selectedFieldId)
}

/** 下一次自动猎杀的期限；关闭、没有弟子或旧档待迁移时返回 Infinity。 */
export function nextHuntDeadline(state, now) {
  const hunting = state?.hunting
  if (!hunting?.settings?.autoRepeat) return Infinity
  if (!huntableMembers(state).length) return Infinity
  if (Object.values(hunting.missions || {}).some(m => m.status === 'active')) return Infinity
  const interval = normalizeAutoInterval(hunting.settings.autoIntervalSeconds)
  const elapsed = Math.max(0, Math.min(interval - 1e-9, Number(hunting.settings.elapsedSeconds) || 0))
  return now + (interval - elapsed) * 1000
}

/** 停用不结算旧任务；保留已付款快照供正式加载迁移，清除定时与占用。 */
export function deactivateHunting(state) {
  const hunting = state.hunting
  if (!hunting) return
  hunting.settings.autoRepeat = false
  hunting.settings.elapsedSeconds = 0
  for (const member of state.disciples?.members || []) {
    member.onMission = false
    // 执符使为猎杀与外交共用：外交仍启用时保留岗位，避免读档清空共享供给。
    if (member.roleId === 'huntPlanner' && !isModuleEnabled(state, 'diplomacy')) member.roleId = null
  }
  recount(state)
  rehydrateHuntOccupancy(state)
}
