import { isEventInRealm, EVENTS, EVENT_MAP } from '@/data/events'
import { gameNow, gameRandom } from '../context'
import { CRAFTS, craftTime, craftCost } from '@/data/crafts'
import { isCraftUnlocked, canAfford, clamp, addResource, pushLog } from './core'
import { RECIPE_STATIONS } from '@/data/industry'
import { craftYield } from './craftingRules'
import { RESOURCE_MAP } from '@/data/resources'
import { ceilNumber, floorNumber } from '../numbers'
import { CONFIG } from '@/data/config'
import { newDisciple, recountDisciples, SPIRITUAL_ROOT_MAP } from '@/data/disciples'

export function eventEligible(state, event) {
  if (!isEventInRealm(event, state.realm)) return false
  if (event.type === 'choice' && state.pendingChoice) return false
  if (event.threat) {
    const until = Math.max(state.affairs?.beastPeaceUntil || 0, state.affairs?.beastCooldownUntil || 0)
    if (gameNow(state) < until) return false
  }
  return true
}

export function pickEvent(state) {
  // 有未决选择时不再抽到"选择类"，避免玩家回来面对一堆积压的选择
  const pool = EVENTS.filter(
    (e) => eventEligible(state, e),
  )
  if (!pool.length) return null
  const total = pool.reduce((s, e) => s + e.weight, 0)
  let roll = gameRandom(state) * total
  for (const e of pool) {
    roll -= e.weight
    if (roll <= 0) return e
  }
  return pool[pool.length - 1]
}

/**
 * 结算一份"事件效果声明"。三种事件与"选择的其中一个选项"共用这一处，
 * 所以选项里的 lootRate / disaster / buff 与普通事件是同一套机制。
 */
/** 工艺品按原料供给与配方节拍估算产能，不依赖是否勾选自动。 */
export function eventResourceRate(state, derived, res, path = new Set()) {
  const direct = Math.max(0, derived.rates[res] || 0)
  if (path.has(res)) return direct
  const next = new Set(path).add(res)
  let best = direct
  for (const recipe of CRAFTS) {
    if (recipe.out !== res || !isCraftUnlocked(state, recipe)) continue
    let batches = 1 / craftTime(recipe, derived)
    const station = derived.industrial && RECIPE_STATIONS[recipe.id]
    if (station) batches *= Math.min(1, derived.processingCapacity[station] || 0) * (1 + (derived.craftSpeedByRecipe[recipe.id] || 0))
    for (const [input, amount] of Object.entries(craftCost(derived, recipe))) {
      batches = Math.min(batches, eventResourceRate(state, derived, input, next) / amount)
    }
    best = Math.max(best, batches * craftYield(derived, recipe))
  }
  return best
}

/** 预览与结算共用应对规则，设施与库存变化后重新计算。 */
export function eventEffect(state, derived, spec) {
  if (!spec.beastResponse) return spec
  const fixedCost = (cost) => Object.fromEntries(Object.entries(cost).map(([res, floor]) => [res, { floor, seconds: 0 }]))
  switch (spec.beastResponse) {
    case 'fortify':
      return { tradeCost: fixedCost({ arrayBase: 1, talisman: state.upgrades.arrayBasics ? 1 : 2 }), peaceSeconds: 900 }
    case 'drive': {
      const pool = state.buildings.meditationPool
      const rescue = pool?.count > 0 && pool.on !== false
      return { tradeCost: fixedCost({ artifact: 1, pill: rescue ? 1 : 3 }), peaceSeconds: 1800 }
    }
    case 'withdraw':
      return { buff: { id: 'withdrawHerbs', name: '收缩采药', mult: -0.25, target: 'herb', duration: 120 }, peaceSeconds: 600 }
    case 'default':
      return { boundedLoss: { herb: Math.min(80, Math.max(0, state.pendingChoice?.herbLoss ?? 20)) }, peaceSeconds: 300 }
    default:
      return spec
  }
}

export function eventOutcome(state, derived, spec, disasterPercent = spec.disaster?.lossPercent?.[0] || 0) {
  spec = eventEffect(state, derived, spec)
  const rows = []
  const required = {}
  for (const [res, cost] of Object.entries(spec.tradeCost || {})) {
    const amount = Math.max(cost.floor, eventResourceRate(state, derived, res) * cost.seconds)
    const bounded = Math.min(amount, Math.max(cost.floor, (derived.max[res] || 0) * 0.1))
    required[res] = RESOURCE_MAP[res]?.integer ? ceilNumber(bounded) : bounded
  }
  const affordable = canAfford(state, required)
  const resources = new Set([
    ...Object.keys(spec.cost || {}), ...Object.keys(spec.costShare || {}), ...Object.keys(required),
    ...(spec.disaster?.resources || []), ...Object.keys(spec.lootRate || {}), ...Object.keys(spec.boundedLoss || {}),
  ])
  for (const res of resources) {
    const integer = RESOURCE_MAP[res]?.integer
    const whole = (amount) => integer ? floorNumber(amount) : amount
    const have = state.resources[res] || 0
    const fixed = Math.min(have, whole((spec.cost?.[res] || 0) + (required[res] || 0)))
    const share = whole((have - fixed) * (spec.costShare?.[res] || 0))
    const remaining = have - fixed - share
    const guard = clamp((derived.disasterGuard || 0) + (derived.disasterGuardByResource?.[res] || 0), 0, 0.8)
    const disaster = spec.disaster?.resources.includes(res)
      ? whole(remaining * disasterPercent * (1 - guard)) : 0
    const bounded = whole(Math.min(remaining, (spec.boundedLoss?.[res] || 0) * (1 - guard)))
    const lost = fixed + share + disaster + bounded
    const rewardCap = (derived.max[res] ?? Infinity) * CONFIG.EVENT_REWARD_STORAGE_SHARE
    const offered = spec.lootRate?.[res] != null
      ? whole(Math.min(rewardCap, Math.max(spec.floor?.[res] || 0, eventResourceRate(state, derived, res) * spec.lootRate[res]))) : 0
    const room = Math.max(0, (derived.max[res] ?? Infinity) - (have - lost))
    const gained = Math.min(offered, whole(room))
    rows.push({ res, lost, gained, overflow: offered - gained })
  }
  const recruits = Math.min(Math.max(0, derived.maxDisciples - state.disciples.total), spec.recruit || 0)
  return { rows, recruits, required, affordable }
}

export function settleEventOutcome(state, derived, spec, text, kind, source) {
  const range = spec.disaster?.lossPercent || [0, 0]
  const pct = range[0] + gameRandom(state) * (range[1] - range[0])
  const outcome = eventOutcome(state, derived, spec, pct)
  const parts = []
  for (const row of outcome.rows) {
    state.resources[row.res] = (state.resources[row.res] || 0) - row.lost
    if (row.lost > 0) parts.push(`${RESOURCE_MAP[row.res].name} -${Math.round(row.lost)}`)
    const gained = addResource(state, row.res, row.gained, derived.max[row.res])
    if (gained > 0) parts.push(`${RESOURCE_MAP[row.res].name} +${Math.round(gained)}`)
    if (row.overflow > 0) parts.push(`${RESOURCE_MAP[row.res].name} ${Math.round(row.overflow)} 装不下`)
  }
  if (spec.disaster || spec.boundedLoss) {
    state.stats.disasters += 1
    if (derived.disasterGuard > 0) parts.push(`大阵挡下 ${Math.round(derived.disasterGuard * 100)}%`)
    for (const row of outcome.rows) {
      const extra = derived.disasterGuardByResource?.[row.res] || 0
      if (extra > 0 && (spec.disaster?.resources.includes(row.res) || spec.boundedLoss?.[row.res])) {
        const total = clamp((derived.disasterGuard || 0) + extra, 0, 0.8)
        parts.push(`${RESOURCE_MAP[row.res].name}符阵护持合计 ${Math.round(total * 100)}%`)
      }
    }
  }
  if (outcome.recruits > 0) {
    for (let i = 0; i < outcome.recruits; i++) state.disciples.members.push(newDisciple(state.disciples))
    recountDisciples(state.disciples)
    state.stats.recruits += outcome.recruits
    parts.push(`弟子 +${outcome.recruits}`)
    parts.push(state.disciples.members.slice(-outcome.recruits).map(member => SPIRITUAL_ROOT_MAP[member.spiritualRoot].name).join('、'))
  } else if (spec.recruit) parts.push('居所已满，无法收徒')
  pushLog(state, parts.length ? `${text}（${parts.join('，')}）` : text, kind, source)
}

export function applyEventEffects(state, derived, spec, text, kind, source) {
  return applyEventBody(state, derived, spec, text, kind, source)
}

/** 原有的事件主体（buff / lootRate / disaster / 其余） */
export function applyEventBody(state, derived, event, text, kind, source) {
  event = eventEffect(state, derived, event)
  if (event.buff) {
    const b = event.buff
    const until = gameNow(state) + (b.duration || 60) * 1000
    const existing = state.buffs.find((x) => x.id === b.id)
    if (existing) {
      existing.until = until
      existing.mult = b.mult
    } else {
      state.buffs.push({ id: b.id, name: b.name || event.name, mult: b.mult, target: b.target || null, until })
    }
  }

  settleEventOutcome(state, derived, event, text, kind, source)
  if (event.peaceSeconds) {
    state.affairs ||= { beastPeaceUntil: 0, beastCooldownUntil: 0 }
    state.affairs.beastPeaceUntil = gameNow(state) + event.peaceSeconds * 1000
    state.affairs.beastCooldownUntil = gameNow(state) + Math.max(1200, event.peaceSeconds) * 1000
    pushLog(state, `药圃恢复安宁，${event.peaceSeconds / 60}分钟内妖兽不再窥伺；同类事务最早二十分钟后再来。`, 'good', source)
  }

  return event
}

/**
 * 触发一个事件。
 * - 自然环境类 / 突发事件类：立刻结算（applyEventEffects）
 * - 选择类：挂成"待决"（state.pendingChoice），等玩家在纪事面板里挑一个，再 resolveChoice
 */
export function fireEvent(state, derived, ev = null) {
  const event = ev || pickEvent(state)
  if (!event) return null
  // 显式触发也遵守新事务的境界和冷却，既有调试事件保留原行为。
  if (event.threat && !eventEligible(state, event)) return null
  if (event.type === 'choice' && state.pendingChoice) return null
  if (event.type !== 'choice' && !eventOutcome(state, derived, event).affordable) return null
  state.nextEventAt = gameNow(state) +
    (CONFIG.EVENT_MIN_GAP + gameRandom(state) * (CONFIG.EVENT_MAX_GAP - CONFIG.EVENT_MIN_GAP)) * 1000
  state.stats.eventsSeen = (state.stats.eventsSeen || 0) + 1

  if (event.type === 'choice') {
    state.pendingChoice = { id: event.id, at: gameNow(state) }
    if (event.threat) {
      state.pendingChoice.deadline = gameNow(state) + event.responseSeconds * 1000
      // 按触发时产能估价并封顶，扩仓与囤货不会抬高灾损。
      state.pendingChoice.herbLoss = Math.min(80, Math.max(20, eventResourceRate(state, derived, 'herb') * 20))
    }
    pushLog(state, `${event.text}【待你决断】`, 'event', event)
    return event
  }

  applyEventEffects(state, derived, event, event.text, event.kind, event)
  return event
}

/**
 * 结算一个未决选择（index 为选项下标）：应用所选选项的效果、清空待决、记一笔。
 * 选项的 effect 就是一份小事件声明，与普通事件共用同一套机制。
 */
export function resolveChoice(state, derived, index) {
  const pending = state.pendingChoice
  if (!pending) return null
  const event = EVENT_MAP[pending.id]
  if (event?.threat && gameNow(state) >= pending.deadline) {
    return settleExpiredThreat(state, derived)
  }
  const opt = event?.options?.[index]
  if (!event || !opt) return null
  if (!eventOutcome(state, derived, opt.effect || {}).affordable) return null
  state.stats.choicesMade = (state.stats.choicesMade || 0) + 1
  applyEventEffects(
    state,
    derived,
    opt.effect || {},
    `${event.name}·${opt.label}：${opt.desc}`,
    'event',
    event,
  )
  state.pendingChoice = null
  return event
}

/** 已有威胁到期只结算一次；离线期间不抽取新的事务。 */
export function settleExpiredThreat(state, derived) {
  const pending = state.pendingChoice
  const event = EVENT_MAP[pending?.id]
  if (!event?.threat || gameNow(state) < pending.deadline) return null
  applyEventEffects(state, derived, { beastResponse: 'default' }, `${event.name}：处理期已过，弟子依现有阵法守住山门。`, 'bad', event)
  state.pendingChoice = null
  return event
}
