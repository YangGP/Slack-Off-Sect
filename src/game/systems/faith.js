import { withResourceAction } from '../resourceObservation'
import { ONE, ZERO, money, moneyAvailable, moneyMax } from '../decimal'
import { addResource, canAfford, countOf, payCost, pushLog } from './core'
import { BUILDING_MAP } from '@/data/buildings'
import { UPGRADE_MAP } from '@/data/upgrades'
import { REALMS, realmProductionBase } from '@/data/realms'
import {
  CULTIVATION, CULTIVATION_MAP, DAO_HEART_DIVISOR, FAITH_UPGRADE_MAP, RITUAL_MAP, RITUALS,
  createFaithProgression,
} from '@/data/faith'

const EMPTY_PROGRESSION = createFaithProgression()

/**
 * D7 香火修持系统：凝愿（香火→愿力）、证心（愿力→道心）、本世仪轨与永久道心修持。
 *
 * 纯规则层：报价、校验与结算都用同一组函数；不读写 DOM、不发网络请求。
 * 金额全程 Decimal，等级与门槛是 Number。
 */

/** 只读取本世香火切片：派生重算必须只读，不能在 recompute 里补写状态。 */
export function faithSlice(state) {
  return state.faithProgression || EMPTY_PROGRESSION
}

/** 购买/结算前取可写切片；缺失时补默认值。 */
function mutableSlice(state) {
  if (!state.faithProgression) state.faithProgression = createFaithProgression()
  return state.faithProgression
}

export function learned(state, id) {
  return state.upgrades?.[id] === true
}

export function ritualLevel(state, id) {
  return faithSlice(state).rituals?.[id] | 0
}

export function cultivationLevel(state, id) {
  return faithSlice(state).cultivation?.[id] | 0
}

export function totalDaoHeart(state) {
  return faithSlice(state).totalDaoHeart ?? ZERO
}

/** 凝愿增益 C(n) = min(1, 0.05×(sqrt(1+40n)-1))。 */
export function vowGainFactor(state) {
  const n = cultivationLevel(state, 'vowInsight')
  if (n <= 0) return ZERO
  const raw = money(1 + 40 * n).sqrt().minus(ONE).times(0.05)
  return raw.gt(ONE) ? ONE : raw
}

/** 万民归心：R_effective = 1 + 0.5×(R-1)×(1+min(1,0.10n))。 */
export function realmProductionMultiplier(state, realmMult) {
  const n = cultivationLevel(state, 'realmDevotion')
  return 1 + (realmProductionBase(realmMult) - 1) * (1 + Math.min(1, 0.10 * n))
}

/** 香火同层产出加成：聚香法每级 +30%，大乘愿典 +120%。 */
export function faithRatioBonus(state) {
  // 只统计「本世仪轨」的重复等级；一次性研究（大乘愿典等）由中央 ALL_UPGRADES 效果结算，避免重复计入。
  return ritualLevel(state, 'gatherIncense') * 0.3
}

/** 收愿仪：只放大香火仓容，每级 +25%。 */
export function faithStorageRatio(state) {
  return ritualLevel(state, 'holdVows') * 0.25
}

/** 应劫正愿：只作用于合体/大乘/渡劫（目标 8/9/10），单位是百分点。 */
export const TRIBLUATION_VOW_BONUS = { 8: 0.03, 9: 0.04, 10: 0.05 }
export function tribulationVowBonus(state, targetRealm) {
  const per = TRIBLUATION_VOW_BONUS[targetRealm] || 0
  return per * cultivationLevel(state, 'tribulationVow')
}

/** 护道真意：失败后身死概率相对降低 8%/级，最多 40%。 */
export function deathReduceFactor(state) {
  return 1 - Math.min(0.40, 0.08 * cultivationLevel(state, 'deathInsight'))
}

/** 定神守境：存活失败退境概率相对降低 5%/级，最多 25%。 */
export function regressionReduceFactor(state) {
  return 1 - Math.min(0.25, 0.05 * cultivationLevel(state, 'realmStability'))
}

/** 本世仪轨下一级报价（愿力）；等级上限由调用方先判断。 */
export function ritualCost(state, id) {
  const meta = RITUAL_MAP[id]
  if (!meta) return ZERO
  return money(meta.baseCost).times(money(meta.growth).pow(ritualLevel(state, id)))
}

/** 永久修持下一级报价（道心）。 */
export function cultivationCost(state, id) {
  const meta = CULTIVATION_MAP[id]
  if (!meta) return ZERO
  return money(meta.baseCost).times(money(meta.growth).pow(cultivationLevel(state, id)))
}

/** 聚香法的当前等级上限：未学《祖师香火》时软上限 10，学会后 20。 */
export function ritualCap(state, meta) {
  if (!meta) return 0
  if (meta.unlockUpgrade && !learned(state, meta.unlockUpgrade)) return meta.softCap ?? meta.max
  return meta.max
}

function needUpgrades(needs) {
  if (!needs) return []
  const list = Array.isArray(needs.upgrades) ? [...needs.upgrades] : []
  if (needs.upgrade) list.push(needs.upgrade)
  return [...new Set(list)]
}

function needBuildings(needs) {
  if (!needs) return []
  const list = Array.isArray(needs.buildings) ? [...needs.buildings] : []
  if (needs.building) list.push(needs.building)
  return list
}

/** 香火专属条目与研究共用同一套前置判定（境界／研究／建筑／仪轨等级）。 */
export function faithNeedsMet(state, needs) {
  if (!needs) return true
  if (needs.realm != null && state.realm < needs.realm) return false
  for (const id of needUpgrades(needs)) if (!learned(state, id)) return false
  for (const b of needBuildings(needs)) if (countOf(state, b.id) < (b.count ?? 1)) return false
  for (const [rid, level] of Object.entries(needs.ritual || {})) {
    if (ritualLevel(state, rid) < level) return false
  }
  return true
}

/** 缺失前置的中文说明，供按钮禁用时展示；不参与结算。 */
export function faithNeedsText(state, needs) {
  const out = []
  if (!needs) return out
  if (needs.realm != null && state.realm < needs.realm) {
    out.push('境界达到' + (REALMS[needs.realm]?.name || needs.realm))
  }
  for (const id of needUpgrades(needs)) {
    if (!learned(state, id)) out.push('已学《' + (UPGRADE_MAP[id]?.name || id) + '》')
  }
  for (const b of needBuildings(needs)) {
    if (countOf(state, b.id) < (b.count ?? 1)) {
      out.push((BUILDING_MAP[b.id]?.name || b.id) + ' ≥ ' + (b.count ?? 1) + ' 座')
    }
  }
  for (const [rid, level] of Object.entries(needs.ritual || {})) {
    if (ritualLevel(state, rid) < level) out.push('《' + (RITUAL_MAP[rid]?.name || rid) + '》≥ ' + level + ' 级')
  }
  return out
}

/** 香火页是否可进入：建成山门，或已拥有任何永久道心修持/累计道心。 */
export function faithUnlocked(state) {
  if (countOf(state, 'gate') > 0) return true
  const slice = faithSlice(state)
  if ((slice.totalDaoHeart ?? ZERO).gt(0)) return true
  return Object.values(slice.cultivation || {}).some(level => (level | 0) > 0)
}

export function canCondense(state) {
  return learned(state, 'vowPower') && state.realm >= 4
}

export function canAttest(state) {
  return learned(state, 'vowPower') && state.realm >= 6
}

/** 凝愿：香火 → 愿力。X 为实际投入，产出 X×(1+C(n))。 */
export function condenseVow(state, amount) {
  return withResourceAction(state, { type: 'condenseVow', id: null }, () => {
    if (!canCondense(state)) return { ok: false, reason: '需先学会《凝愿法》，且当前境界至少金丹' }
    let spend
    try { spend = money(amount) } catch { return { ok: false, reason: '投入金额无效' } }
    if (!spend.isFinite() || !spend.gt(0)) return { ok: false, reason: '投入金额无效' }
    const reserve = money(state.settings?.craftReserves?.faith ?? ZERO)
    const available = moneyAvailable(state.resources.faith ?? ZERO, reserve)
    if (spend.gt(available)) return { ok: false, reason: '香火不足（已扣除保留量）' }
    const gain = spend.times(ONE.plus(vowGainFactor(state)))
    payCost(state, { faith: spend })
    addResource(state, 'vow', gain)
    pushLog(state, `凝愿：投入香火 ${spend.toString()}，得愿力 ${gain.toString()}`, 'good')
    return { ok: true, spent: spend, gained: gain }

  })
}

/** 证心：愿力 → 道心，Y/10000，保留已购仪轨与宗门进度。 */
export function attestDaoHeart(state, amount) {
  return withResourceAction(state, { type: 'attestDaoHeart', id: null }, () => {
    if (!canAttest(state)) return { ok: false, reason: '需先学会《凝愿法》，且当前境界至少化神' }
    let spend
    try { spend = money(amount) } catch { return { ok: false, reason: '投入金额无效' } }
    if (!spend.isFinite() || !spend.gt(0)) return { ok: false, reason: '投入金额无效' }
    const available = moneyMax(ZERO, state.resources.vow ?? ZERO)
    if (spend.gt(available)) return { ok: false, reason: '愿力不足' }
    const gain = spend.div(DAO_HEART_DIVISOR)
    payCost(state, { vow: spend })
    addResource(state, 'daoHeart', gain)
    const slice = mutableSlice(state)
    slice.totalDaoHeart = (slice.totalDaoHeart ?? ZERO).plus(gain)
    state.seen.daoHeart = true
    pushLog(state, `证心：投入愿力 ${spend.toString()}，得道心 ${gain.toString()}`, 'good')
    return { ok: true, spent: spend, gained: gain }

  })
}

/** 购买一级本世仪轨（愿力计价）。 */
export function buyRitual(state, id) {
  return withResourceAction(state, { type: 'buyRitual', id: id }, () => {
    const meta = RITUAL_MAP[id]
    if (!meta || !faithNeedsMet(state, meta.needs)) return false
    const slice = mutableSlice(state)
    const level = slice.rituals[id] | 0
    if (level >= ritualCap(state, meta)) return false
    const cost = ritualCost(state, id)
    if (!canAfford(state, { vow: cost })) return false
    payCost(state, { vow: cost })
    slice.rituals[id] = level + 1
    pushLog(state, `《${meta.name}》升至 ${level + 1} 级`, 'good')
    return true

  })
}

/** 购买一级永久道心修持。 */
export function buyCultivation(state, id) {
  return withResourceAction(state, { type: 'buyCultivation', id: id }, () => {
    const meta = CULTIVATION_MAP[id]
    if (!meta || !faithNeedsMet(state, meta.needs)) return false
    const slice = mutableSlice(state)
    const level = slice.cultivation[id] | 0
    if (level >= meta.max) return false
    const cost = cultivationCost(state, id)
    if (!canAfford(state, { daoHeart: cost })) return false
    payCost(state, { daoHeart: cost })
    slice.cultivation[id] = level + 1
    state.seen.daoHeart = true
    pushLog(state, `《${meta.name}》升至 ${level + 1} 级`, 'good')
    return true

  })
}

/** 一次性香火专属条目：中央 map 已登记效果，这里只做购买与前置判定。 */
export function buyFaithUpgrade(state, id) {
  return withResourceAction(state, { type: 'buyFaithUpgrade', id: id }, () => {
    const meta = FAITH_UPGRADE_MAP[id]
    if (!meta || learned(state, id)) return false
    if (!faithNeedsMet(state, meta.needs)) return false
    if (!canAfford(state, meta.cost)) return false
    payCost(state, meta.cost)
    state.upgrades[id] = true
    pushLog(state, `修持《${meta.name}》`, 'good')
    return true

  })
}

/** 供界面与测试使用的报价快照（全部是金额，不做显示格式化）。 */
export function faithQuote(state) {
  return {
    rituals: Object.fromEntries(RITUALS.map(meta => [meta.id, {
      id: meta.id, level: ritualLevel(state, meta.id), cap: ritualCap(state, meta),
      cost: ritualCost(state, meta.id), meta,
    }])),
    cultivation: Object.fromEntries(CULTIVATION.map(meta => [meta.id, {
      id: meta.id, level: cultivationLevel(state, meta.id), cost: cultivationCost(state, meta.id), meta,
    }])),
    vowGainFactor: vowGainFactor(state),
  }
}
