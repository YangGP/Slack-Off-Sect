import { ZERO, money, moneyMax } from '../decimal'
import { KARMA_PERKS, KARMA_PERK_MAP, createKarmaProgression } from '@/data/karmaShop'
import { REALMS } from '@/data/realms'
import { setResourceValue, withResourceAction } from '../resourceObservation'

const EMPTY_PROGRESSION = createKarmaProgression()

/**
 * 仙缘修持系统：跨轮回保留的永久特权商店，仙缘计价。
 *
 * 纯规则层：报价、校验与购买用同一组函数；不读写 DOM、不发网络请求。
 * 只依赖数据、金额与资源观察层；
 * core / economy / progression 单向依赖本模块（建筑折扣、效果聚合），反向 import 会成环。
 *
 * 关键口径：**已修持花掉的仙缘不再计入产出乘区**（karmaMultipliers 只吃余额），
 * 「囤加成 vs 买特权」是本系统的核心决策。
 */

/** 只读取仙缘修持切片：派生重算必须只读，不能在 recompute 里补写状态。 */
export function karmaSlice(state) {
  return state.karmaProgression || EMPTY_PROGRESSION
}

/** 购买前取可写切片；缺失时补默认值。 */
function mutableSlice(state) {
  if (!state.karmaProgression) state.karmaProgression = createKarmaProgression()
  return state.karmaProgression
}

/** 自愿轮迴数（转世 + 飞升）：身死重修不计入，是商店前置的门槛口径。 */
export function rebirthCount(state) {
  return Math.max(0, Math.floor(state.stats?.reincarnations || 0)) +
    Math.max(0, Math.floor(state.stats?.ascensions || 0))
}

export function perkLevel(state, id) {
  return karmaSlice(state).levels?.[id] | 0
}

/**
 * 永久修持下一级报价（仙缘）：baseCost × growth^level，小数完整保留。
 */
export function perkCost(state, id) {
  if (!Object.hasOwn(KARMA_PERK_MAP, id)) return ZERO
  const meta = KARMA_PERK_MAP[id]
  if (!meta) return ZERO
  return money(meta.baseCost).times(money(meta.growth).pow(perkLevel(state, id)))
}

/** 仙缘修持前置（境界 / 轮迴数），与香火条目共用同一套判定语义。 */
export function karmaNeedsMet(state, needs) {
  if (!needs) return true
  if (needs.realm != null && state.realm < needs.realm) return false
  if (needs.rebirths != null && rebirthCount(state) < needs.rebirths) return false
  return true
}

/** 缺失前置的中文说明，供按钮禁用时展示；不参与结算。 */
export function karmaNeedsText(state, needs) {
  const out = []
  if (!needs) return out
  if (needs.realm != null && state.realm < needs.realm) {
    out.push('境界达到' + (REALMS[needs.realm]?.name || needs.realm))
  }
  if (needs.rebirths != null && rebirthCount(state) < needs.rebirths) {
    out.push('转世/飞升 ≥ ' + needs.rebirths + ' 次')
  }
  return out
}

/** 仙缘页是否可进入：已有仙缘，或经历过任何一次转世/飞升。 */
export function karmaShopUnlocked(state) {
  if (moneyMax(ZERO, state.karma ?? ZERO).gt(0)) return true
  if (KARMA_PERKS.some(meta => perkLevel(state, meta.id) > 0)) return true
  return rebirthCount(state) > 0
}

/**
 * 已购修持的效果聚合（每级数值 × 等级线性求和）。未购买任何条目时全为 0，调用方无需判空。
 * startKit 是结构化效果（{ qi, insight }），由 resetForRebirth 在重修开局单独发放，不在此聚合。
 * 效果只依赖等级快照、不读余额——「花掉的仙缘不计产出」由 karmaMultipliers 的余额口径保证。
 */
export function karmaShopBonuses(state) {
  const out = {
    buildingDiscount: 0,
    karmaRatio: 0,
    offlineHours: 0,
    storageRatio: 0,
    insightBonus: 0,
    ascendBonus: 0,
    deathKeepBonus: 0,
  }
  const levels = karmaSlice(state).levels || {}
  for (const meta of KARMA_PERKS) {
    const level = levels[meta.id] | 0
    if (level <= 0) continue
    for (const [key, per] of Object.entries(meta.effect)) {
      if (typeof per !== 'number') continue
      // 有界比例仍返回 Number，但先按十进制汇总，避免 0.05 × 3 的尾数进入金额乘区。
      out[key] = money(out[key]).plus(money(per).times(level)).toNumber()
    }
  }
  return out
}

/**
 * 购买一级永久仙缘修持。双写扣费：权威余额在顶层 `state.karma`，扣减后显式同步
 * `state.resources.karma` 镜像（不能走 payCost——它只写镜像，会把两套金额拆开）。
 * 成功返回 true；任何校验失败返回 false 且不改动状态。日志由调用方（store action）记录，
 * 本层不 import core，避免与建筑折扣接入形成循环依赖。
 */
export function buyKarmaPerk(state, id) {
  if (!Object.hasOwn(KARMA_PERK_MAP, id)) return false
  return withResourceAction(state, { type: 'buyKarmaPerk', id }, () => buyPerk(state, id))
}

function buyPerk(state, id) {
  const meta = KARMA_PERK_MAP[id]
  if (!meta) return false
  if (!karmaNeedsMet(state, meta.needs)) return false
  const level = perkLevel(state, id)
  if (level >= meta.max) return false
  const cost = perkCost(state, id)
  const balance = moneyMax(ZERO, state.karma ?? ZERO)
  if (balance.lt(cost)) return false
  const slice = mutableSlice(state)
  state.karma = balance.minus(cost)
  setResourceValue(state, 'karma', state.karma, { source: 'karmaShop:purchase' })
  slice.levels[id] = level + 1
  slice.totalSpent = moneyMax(ZERO, slice.totalSpent ?? ZERO).plus(cost)
  return true
}

/** 供界面与测试使用的报价快照（金额不做显示格式化，结构对齐 faithQuote）。 */
export function karmaShopQuote(state) {
  return {
    perks: Object.fromEntries(KARMA_PERKS.map(meta => [meta.id, {
      id: meta.id, level: perkLevel(state, meta.id), cost: perkCost(state, meta.id), meta,
    }])),
    rebirths: rebirthCount(state),
  }
}
