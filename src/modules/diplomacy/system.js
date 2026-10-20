import { withResourceAction, setResourceValue } from '../../game/resourceObservation'
import { DIPLOMACY, DIPLOMACY_SECT_MAP } from './data.js'
import { RESOURCE_MAP } from '@/data/resources'
import { isModuleEnabled } from '@/data/modules'
import { recountDisciples } from '@/data/disciples'
import { addResource, canAfford, payCost, pushLog, activeOf } from '@/game/systems/core'
import { eventResourceRate } from '@/game/systems/events'
import { MONEY_INFINITY, ZERO, ceilMoney, floorMoney, money, moneyAvailable, moneyGt, moneyMax, moneyMin, moneySubtract } from '@/game/decimal'
import { atLeast } from '@/game/numbers'

/**
 * 宗门外交系统（首版：三家宗门、固定汇率 + 机缘骰）。
 *
 * 交易 = 玩家主动发起（在线），按固定汇率付出富余资源、另付信符（与猎杀共用同一池子）换回稀缺资源。
 * 机缘骰用独立随机序列（同猎杀），掉落按产能定价、有保底与仓储份额上限。
 * 规则见 docs/ROADMAP.md D6。
 */

export const DIPLOMACY_SCHEMA_VERSION = 1

/** 每回互市的信符单价（金额域）：静态表里的字面值是 Number，进入金额运算前构造为 Decimal。 */
const WARRANT_COST = money(DIPLOMACY.WARRANT_COST)

/** 派生仓容上限（金额）：无上限用金额哨兵，Number 的 Infinity 不跨域套用。 */
function capacityOf(derived, res) {
  return money(derived?.max?.[res] ?? MONEY_INFINITY)
}

/** 初始外交状态（进存档） */
export function createDiplomacyState() {
  return {
    schemaVersion: DIPLOMACY_SCHEMA_VERSION,
    randomSeed: 1,
    statistics: { trades: 0, fortunes: 0 },
  }
}

/** 存档归一：只保留合法统计与随机序列。 */
export function normalizeDiplomacyState(raw, fresh = createDiplomacyState()) {
  const out = { ...fresh, ...(raw && typeof raw === 'object' ? raw : {}) }
  out.schemaVersion = DIPLOMACY_SCHEMA_VERSION
  out.randomSeed = Number.isSafeInteger(out.randomSeed) && out.randomSeed >= 0 ? out.randomSeed >>> 0 : 1
  out.statistics = {
    trades: Number.isFinite(out.statistics?.trades) && out.statistics.trades >= 0 ? Math.floor(out.statistics.trades) : 0,
    fortunes: Number.isFinite(out.statistics?.fortunes) && out.statistics.fortunes >= 0 ? Math.floor(out.statistics.fortunes) : 0,
  }
  return out
}

/** 独立线性同余随机（与猎杀/事件/收徒互不干扰），序列存于 state.diplomacy.randomSeed。 */
function diplomacyRandom(diplomacy) {
  diplomacy.randomSeed = (Math.imul(diplomacy.randomSeed >>> 0, 1664525) + 1013904223) >>> 0
  return diplomacy.randomSeed / 4294967296
}

export function isDiplomacyUnlocked(state) {
  if (!isModuleEnabled(state, 'diplomacy')) return false
  if (!state.upgrades?.neighborContacts) return false
  return state.realm >= DIPLOMACY.MIN_REALM
}

/** 机缘概率：基础 8%，每座启用中的山门 +1%，封顶 35%。 */
export function fortuneChance(state) {
  const gates = activeOf(state, 'gate')
  return Math.min(DIPLOMACY.FORTUNE_CAP, DIPLOMACY.FORTUNE_BASE + DIPLOMACY.FORTUNE_PER_GATE * gates)
}

/**
 * 单个机缘选项的掉落（预览与结算共用同一算法）：
 *   - { loot }          固定数量；
 *   - { lootRate, floor } 按产能秒数定价，保底不低于 floor，且单次不超过仓储的份额上限。
 * 保底优先于份额上限：仓储很小时 floor 仍成立，实际入库再由 addResource 按仓容截断。
 * 整枚计数的资源向上取整，预览与结算口径一致。
 */
export function fortuneOptionRewards(state, derived, option) {
  const out = {}
  if (option.loot) {
    for (const [res, amount] of Object.entries(option.loot)) {
      if (RESOURCE_MAP[res]) out[res] = (out[res] ?? ZERO).plus(money(amount))
    }
    return out
  }
  for (const [res, seconds] of Object.entries(option.lootRate || {})) {
    if (!RESOURCE_MAP[res]) continue
    // rate 是每秒产量（金额），seconds 是定价秒数（Number）：乘法在 Decimal 域完成。
    const rate = money(eventResourceRate(state, derived, res))
    const floor = money(option.floor?.[res] ?? ZERO)
    // 份额上限按「有仓容才算份额」：缺失仓容按 0 处理（沿用旧口径），无上限哨兵则是真无上限。
    const share = moneyMax(ZERO, derived?.max?.[res] ?? ZERO).times(DIPLOMACY.FORTUNE_STORAGE_SHARE)
    const bounded = moneyMax(floor, moneyMin(rate.times(seconds), moneyMax(floor, share)))
    out[res] = RESOURCE_MAP[res]?.integer ? ceilMoney(bounded) : bounded
  }
  return out
}

/**
 * 机缘掉落估价（预览用）：把各选项的掉落按资源聚合，取每项最大值。
 * 只读，不消耗随机数。
 */
export function fortuneRewards(state, derived, sect) {
  const out = {}
  for (const option of sect.fortune || []) {
    const picked = fortuneOptionRewards(state, derived, option)
    for (const [res, amount] of Object.entries(picked)) {
      out[res] = moneyMax(out[res] ?? ZERO, amount)
    }
  }
  return out
}

/**
 * 固定回报能否入库：只要有一项能实际收到正数即视为可交易，部分仓容也允许。
 * 整枚计数的资源按向下取整后的实际入库量判断（与 addResource 口径一致）。
 * 机缘是随机项，不计入「保证可收」。
 */
export function hasRoomForGains(state, derived, gains) {
  for (const [res, amount] of Object.entries(gains || {})) {
    if (!RESOURCE_MAP[res]) continue
    const cap = capacityOf(derived, res)
    const have = state.resources[res] ?? ZERO
    const want = money(amount)
    // 无上限仓容时按「能全收」处理，与 addResource 的口径一致。
    const room = cap.isFinite() ? moneyMax(ZERO, moneySubtract(cap, have)) : want
    const actual = RESOURCE_MAP[res].integer ? floorMoney(moneyMin(want, room)) : moneyMin(want, room)
    if (actual.gt(0)) return true
  }
  return false
}

/** 交易预览：汇率、信符余额、机缘概率与期望掉落（不消耗随机数）。 */
export function tradePreview(state, derived, sectId) {
  const sect = DIPLOMACY_SECT_MAP[sectId]
  if (!sect) return null
  const warrant = money(state.resources.warrant ?? ZERO)
  const hasRoom = hasRoomForGains(state, derived, sect.gains)
  let overflow = false
  if (hasRoom) {
    for (const [res, amount] of Object.entries(sect.gains)) {
      if (!RESOURCE_MAP[res]) continue
      // 整枚计数的资源按向上取整后的实际入库量判断溢出，与 addResource 口径一致。
      const want = RESOURCE_MAP[res].integer ? ceilMoney(amount) : money(amount)
      const cap = capacityOf(derived, res)
      const have = state.resources[res] ?? ZERO
      if (cap.isFinite() && moneyGt(have.plus(want), cap)) { overflow = true; break }
    }
  }
  return {
    sect,
    warrantCost: WARRANT_COST,
    warrant,
    warrantEnough: atLeast(warrant, WARRANT_COST),
    affordable: canAfford(state, sect.pays),
    hasRoom,
    overflow,
    fortuneChance: fortuneChance(state),
    fortuneOptions: fortuneRewards(state, derived, sect),
  }
}

/**
 * 发起交易：校验解锁/材料/信符 → 扣信符与材料、给回报、骰机缘、记统计。
 * 连续点击不会重复结算（先扣资源再入账，原子性由调用顺序保证）。
 */
export function tradeWithSect(state, derived, sectId) {
  return withResourceAction(state, { type: 'tradeWithSect', id: sectId }, () => {
    const sect = DIPLOMACY_SECT_MAP[sectId]
    if (!sect) return { ok: false, reason: '未知宗门' }
    if (!isDiplomacyUnlocked(state)) return { ok: false, reason: '尚未与邻宗建立往来' }
    if (!atLeast(state.resources.warrant ?? ZERO, WARRANT_COST)) return { ok: false, reason: `信符不足 ${DIPLOMACY.WARRANT_COST}` }
    if (!canAfford(state, sect.pays)) return { ok: false, reason: '材料不足' }
    if (!hasRoomForGains(state, derived, sect.gains)) return { ok: false, reason: '仓储已满' }

    setResourceValue(state, "warrant", moneyAvailable(state.resources.warrant ?? ZERO, WARRANT_COST), { source: 'diplomacy/system.js:tradeWithSect' })
    payCost(state, sect.pays)
    const gains = {}
    for (const [res, amount] of Object.entries(sect.gains)) {
      gains[res] = addResource(state, res, amount, capacityOf(derived, res))
    }

    // 机缘骰：命中则在候选里随机选一档（独立随机序列）。
    let fortune = null
    const options = sect.fortune || []
    if (options.length && diplomacyRandom(state.diplomacy) < fortuneChance(state)) {
      const option = options[Math.floor(diplomacyRandom(state.diplomacy) * options.length) % options.length]
      const picked = fortuneOptionRewards(state, derived, option)
      for (const [res, amount] of Object.entries(picked)) {
        const added = addResource(state, res, amount, capacityOf(derived, res))
        if (added.gt(0)) {
          fortune = fortune || {}
          fortune[res] = (fortune[res] ?? ZERO).plus(added)
        }
      }
    }

    state.diplomacy.statistics.trades += 1
    if (fortune) state.diplomacy.statistics.fortunes += 1

    const gainText = Object.entries(gains)
      .filter(([, amount]) => amount.gt(0))
      .map(([res, amount]) => `${RESOURCE_MAP[res]?.name || res} ×${amount}`)
      .join('、')
    const fortuneText = fortune
      ? Object.entries(fortune).map(([res, amount]) => `${RESOURCE_MAP[res]?.name || res} ×${amount}`).join('、')
      : ''
    pushLog(state, `与${sect.name}互市：付出${Object.keys(sect.pays).map(r => RESOURCE_MAP[r]?.name || r).join('、')}与信符 ${DIPLOMACY.WARRANT_COST} 枚，得 ${gainText}${fortuneText ? `；机缘得 ${fortuneText}` : ''}`, 'good')

    return { ok: true, gains, fortune }

  })
}

/**
 * 模块停用钩子：外交关闭时，若猎杀仍启用则保留猎杀规划者；
 * 否则仅清除 huntPlanner 岗位的成员并重算弟子。
 */
export function deactivateDiplomacy(state) {
  if (isModuleEnabled(state, 'hunting')) return
  const members = state.disciples?.members
  if (Array.isArray(members)) {
    for (const member of members) {
      if (member?.roleId === 'huntPlanner') member.roleId = null
    }
  }
  recountDisciples(state.disciples)
}

/** 界面提示：信符充足、材料齐全且固定回报有仓容时返回该宗名（供角标）。 */
export function tradeAvailable(state, derived) {
  if (!isDiplomacyUnlocked(state)) return null
  if (!atLeast(state.resources.warrant ?? ZERO, WARRANT_COST)) return null
  return Object.keys(DIPLOMACY_SECT_MAP).find(id => {
    const sect = DIPLOMACY_SECT_MAP[id]
    if (!canAfford(state, sect.pays)) return false
    return hasRoomForGains(state, derived, sect.gains)
  }) || null
}
