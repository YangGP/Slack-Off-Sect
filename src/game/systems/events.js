import { withResourceAction, setResourceValue } from '../resourceObservation'
import { isEventInRealm, EVENTS, EVENT_MAP, getEventLevel } from '@/data/events'
import { gameNow, gameRandom, notifyGameEvent } from '../context'
import { CRAFTS, craftTime, craftCost } from '@/data/crafts'
import { isCraftUnlocked, canAfford, clamp, addResource, pushLog } from './core'
import { RECIPE_STATIONS } from '@/data/industry'
import { craftYield } from './craftingRules'
import { RESOURCE_MAP } from '@/data/resources'
import { MONEY_INFINITY, ZERO, ceilMoney, floorMoney, money, moneyAvailable, moneyClamp, moneyGt, moneyMax, moneyMin, moneyToNumber } from '../decimal'
import { CONFIG } from '@/data/config'
import { newDisciple, recountDisciples, SPIRITUAL_ROOT_MAP } from '@/data/disciples'
import { isModuleEnabled } from '@/data/modules'

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
/**
 * 工艺品按原料供给与配方节拍估算产能，不依赖是否勾选自动。
 * 返回的是**金额速率**（每秒产出，Decimal）；配方耗时是秒（Number）、投入是金额，
 * 两者只在换算「每秒可做几份」时短暂相遇，份数按 Number 传递。
 */
export function eventResourceRate(state, derived, res, path = new Set()) {
  // 速率是金额：零值判断与取大值一律走 Decimal（Decimal 对象恒为真，`|| 0` 会出错）。
  const direct = moneyMax(ZERO, derived.rates?.[res] ?? ZERO)
  if (path.has(res)) return direct
  const next = new Set(path).add(res)
  let best = direct
  for (const recipe of CRAFTS) {
    if (recipe.out !== res || !isCraftUnlocked(state, recipe)) continue
    let batches = 1 / craftTime(recipe, derived)
    const station = derived.industrial && RECIPE_STATIONS[recipe.id]
    if (station) batches *= Math.min(1, derived.processingCapacity[station] || 0) * (1 + (derived.craftSpeedByRecipe[recipe.id] || 0))
    for (const [input, amount] of Object.entries(craftCost(derived, recipe))) {
      // 上游每秒能供几份 = 上游速率 ÷ 每份用料；份数是 Number 计数域。
      batches = Math.min(batches, moneyToNumber(eventResourceRate(state, derived, input, next).div(amount)))
    }
    best = moneyMax(best, craftYield(derived, recipe).times(batches))
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
      // 按产能估出的损失上限是金额（存档字段 pendingChoice.herbLoss），钳制在 [0, 80]。
      return { boundedLoss: { herb: moneyClamp(state.pendingChoice?.herbLoss ?? money(20), ZERO, 80) }, peaceSeconds: 300 }
    default:
      return spec
  }
}

export function eventOutcome(state, derived, spec, disasterPercent = spec.disaster?.lossPercent?.[0] || 0) {
  spec = eventEffect(state, derived, spec)
  const rows = []
  const required = {}
  for (const [res, cost] of Object.entries(spec.tradeCost || {})) {
    // cost.floor 是金额下限、cost.seconds 是秒数；按产能折算出的交易用料是金额，全程 Decimal。
    const floorCost = money(cost.floor)
    const amount = moneyMax(floorCost, eventResourceRate(state, derived, res).times(cost.seconds))
    const cap = moneyMax(floorCost, money(derived.max[res] ?? ZERO).times('0.1'))
    const bounded = moneyMin(amount, cap)
    required[res] = RESOURCE_MAP[res]?.integer ? ceilMoney(bounded) : bounded
  }
  const affordable = canAfford(state, required)
  const resources = new Set([
    ...Object.keys(spec.cost || {}), ...Object.keys(spec.costShare || {}), ...Object.keys(required),
    ...(spec.disaster?.resources || []), ...Object.keys(spec.lootRate || {}), ...Object.keys(spec.boundedLoss || {}),
  ])
  for (const res of resources) {
    const integer = RESOURCE_MAP[res]?.integer
    // 整枚计数的资源在损失与奖励口径上先向下取整，与 addResource 的入库口径一致。
    const whole = (amount) => integer ? floorMoney(amount) : amount
    const have = state.resources[res] ?? ZERO
    const fixed = moneyMin(have, whole(money(spec.cost?.[res] ?? 0).plus(required[res] ?? ZERO)))
    const share = whole(have.minus(fixed).times(spec.costShare?.[res] || 0))
    const remaining = have.minus(fixed).minus(share)
    const guard = clamp((derived.disasterGuard || 0) + (derived.disasterGuardByResource?.[res] || 0), 0, 0.8)
    const disaster = spec.disaster?.resources.includes(res)
      ? whole(remaining.times(disasterPercent).times(1 - guard)) : ZERO
    const boundedLoss = whole(moneyMin(remaining, money(spec.boundedLoss?.[res] ?? 0).times(1 - guard)))
    const lost = fixed.plus(share).plus(disaster).plus(boundedLoss)
    // 单次奖励上限是仓容的固定份额；无上限仓容用金额域的哨兵，时间域的 Infinity 不跨域套用。
    const rewardCap = money(derived.max[res] ?? MONEY_INFINITY).times(CONFIG.EVENT_REWARD_STORAGE_SHARE)
    const offered = spec.lootRate?.[res] != null
      ? whole(moneyMin(rewardCap, moneyMax(money(spec.floor?.[res] ?? 0),
        eventResourceRate(state, derived, res).times(spec.lootRate[res])))) : ZERO
    const room = moneyMax(ZERO, money(derived.max[res] ?? MONEY_INFINITY).minus(have.minus(lost)))
    const gained = moneyMin(offered, whole(room))
    rows.push({ res, lost, gained, overflow: offered.minus(gained) })
  }
  const recruits = Math.min(Math.max(0, derived.maxDisciples - state.disciples.total), spec.recruit || 0)
  return { rows, recruits, required, affordable }
}

export function settleEventOutcome(state, derived, spec, text, kind, source) {
  return withResourceAction(state, { type: 'settleEventOutcome', id: kind }, () => {
    const range = spec.disaster?.lossPercent || [0, 0]
    const pct = range[0] + gameRandom(state) * (range[1] - range[0])
    const outcome = eventOutcome(state, derived, spec, pct)
    const parts = []
    // 纪事文案里的金额：到显示边界才转 Number 四舍五入，不参与结算。
    const logAmount = (value) => Math.round(moneyToNumber(value))
    for (const row of outcome.rows) {
      // 损失在 eventOutcome 里已按库存夹过；扣减仍走金额助手的「不足归零」，库存不会变负。
      setResourceValue(state, row.res, moneyAvailable(state.resources[row.res] ?? ZERO, row.lost), { source: 'systems/events.js:settleEventOutcome' })
      if (moneyGt(row.lost, ZERO)) parts.push(`${RESOURCE_MAP[row.res].name} -${logAmount(row.lost)}`)
      const gained = addResource(state, row.res, row.gained, derived.max[row.res])
      if (moneyGt(gained, ZERO)) parts.push(`${RESOURCE_MAP[row.res].name} +${logAmount(gained)}`)
      if (moneyGt(row.overflow, ZERO)) parts.push(`${RESOURCE_MAP[row.res].name} ${logAmount(row.overflow)} 装不下`)
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
      for (let i = 0; i < outcome.recruits; i++) state.disciples.members.push(newDisciple(state.disciples, null, { includeHunting: isModuleEnabled(state, 'hunting') }))
      recountDisciples(state.disciples)
      state.stats.recruits += outcome.recruits
      parts.push(`弟子 +${outcome.recruits}`)
      parts.push(state.disciples.members.slice(-outcome.recruits).map(member => SPIRITUAL_ROOT_MAP[member.spiritualRoot].name).join('、'))
    } else if (spec.recruit) parts.push('居所已满，无法收徒')
    pushLog(state, parts.length ? `${text}（${parts.join('，')}）` : text, kind, source)

  })
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
 * - 选择类：挂成"待决"（state.pendingChoice），由纪事面板或事件弹窗（真实操作后打开）提交，再 resolveChoice
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
      // 按触发时产能估价并封顶，扩仓与囤货不会抬高灾损；灾损上限是金额（20~80）。
      state.pendingChoice.herbLoss = moneyClamp(eventResourceRate(state, derived, 'herb').times(20), 20, 80)
    }
    pushLog(state, `${event.text}【待你决断】`, 'event', event)
    notifyGameEvent(state, {
      kind: 'choice', eventId: event.id, level: getEventLevel(event).id,
      instanceId: `choice:${event.id}:${state.pendingChoice.at}`, at: state.pendingChoice.at,
    })
    return event
  }

  const beforeSeq = state.logSeq || 0
  applyEventEffects(state, derived, event, event.text, event.kind, event)
  // 只取本次结算新增的纪事（id > beforeSeq），同名旧事件不会复用旧文本。
  const settled = state.log.filter(item => item.id > beforeSeq && item.eventId === event.id).sort((a, b) => a.id - b.id)[0]
  notifyGameEvent(state, {
    kind: 'notice', eventId: event.id, level: getEventLevel(event).id,
    title: event.name, text: event.text, summary: settled?.text || event.text,
    instanceId: `notice:${event.id}:${state.stats.eventsSeen}`, at: gameNow(state),
  })
  return event
}

/**
 * 结算一个未决选择（index 为选项下标）：应用所选选项的效果、清空待决、记一笔。
 * 选项的 effect 就是一份小事件声明，与普通事件共用同一套机制。
 */
export function resolveChoice(state, derived, index) {
  return withResourceAction(state, { type: 'resolveChoice', id: null }, () => {
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

  })
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
