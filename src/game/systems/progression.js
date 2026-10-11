import { UPGRADE_MAP } from '@/data/upgrades'
import { recompute } from './economy'
import { isUpgradeUnlocked, canAfford, pushLog, payCost, isTreasureForged, refineCost, treasureLevel, treasureMult, realmCost } from './core'
import { BREAKTHROUGH, BREAKTHROUGH_AIDS, REALMS, ASCEND_REALM_INDEX, REINCARNATE_REALM_INDEX } from '@/data/realms'
import { realmBaseChance } from '@/data/disciples'
import { gameRandom, gameNow } from '../context'
import { resetForRebirth } from '../state'
import { floorNumber } from '../numbers'
import { RESOURCE_MAP } from '@/data/resources'
import { CONFIG } from '@/data/config'

export function toggleUpkeepUpgrade(state, derived, id) {
  const up = UPGRADE_MAP[id]
  if (!up?.upkeep || !state.upgrades[id]) return false
  state.upgradeEnabled ||= {}
  state.upgradeEnabled[id] = state.upgradeEnabled[id] === false
  recompute(state, derived)
  return true
}

export function research(state, derived, id) {
  const up = UPGRADE_MAP[id]
  if (!up || state.upgrades[id] || !isUpgradeUnlocked(state, up)) return false
  if (!canAfford(state, up.cost)) {
    pushLog(state, `推演《${up.name}》的材料不足。`, 'bad')
    return false
  }
  payCost(state, up.cost)
  state.upgrades[id] = true
  pushLog(state, `参悟《${up.name}》`, 'good')
  recompute(state, derived)
  return true
}

/** 祭炼一次：付钱、等级 +1、重算 */
export function refineTreasure(state, derived, id) {
  if (!isTreasureForged(state, id)) return 0
  const cost = refineCost(state, id)
  if (!cost || !canAfford(state, cost)) return 0
  payCost(state, cost)
  if (!state.treasureLevels) state.treasureLevels = {}
  state.treasureLevels[id] = treasureLevel(state, id) + 1
  recompute(state, derived)
  pushLog(
    state,
    `${UPGRADE_MAP[id].name} 祭炼至 ${state.treasureLevels[id]} 级（效果 ×${treasureMult(state, UPGRADE_MAP[id]).toFixed(2)}）`,
    'good',
  )
  return state.treasureLevels[id]
}

/** 预览与支付使用同一份报价，辅助材料不受破境折扣影响。 */
export function breakthroughPreview(state, derived, options = {}) {
  const rules = BREAKTHROUGH
  const tribulation = state.realm >= rules.tribulationRealm
  const baseChance = realmBaseChance(state.realm + 1)
  const availableAids = BREAKTHROUGH_AIDS[state.realm + 1] || []
  const aids = availableAids.filter(aid => options[aid.id] === true)
  const cost = { ...(realmCost(state, derived, state.realm + 1) || {}) }
  for (const aid of aids) {
    for (const [res, amount] of Object.entries(aid.cost)) cost[res] = (cost[res] || 0) + amount
  }
  const chance = Math.min(rules.chanceCap, baseChance + aids.reduce((sum, aid) => sum + aid.bonus, 0))
  const deathOnFailure = state.realm >= rules.deathRealm ? (rules.deathChances[state.realm] || 0) : 0
  const regressionOnFailure = state.realm >= rules.regressionRealm ? 1 - deathOnFailure : 0
  const maxChance = Math.min(rules.chanceCap, baseChance + availableAids.reduce((sum, aid) => sum + aid.bonus, 0))
  return { baseChance, chance, maxChance, availableAids, cost, tribulation, deathOnFailure, regressionOnFailure,
    regressionRisk: (1 - chance) * regressionOnFailure, deathRisk: (1 - chance) * deathOnFailure,
    deathKarma: Math.floor(reincarnationGain(state, derived) / 2) }
}

export function breakthrough(state, derived, options = {}, random = () => gameRandom(state)) {
  const next = REALMS[state.realm + 1]
  if (!next) return false
  const preview = breakthroughPreview(state, derived, options)
  const { cost } = preview
  if (!canAfford(state, cost)) {
    pushLog(state, '破境所需资源不足，强冲只会伤及道基。', 'bad')
    return false
  }
  payCost(state, cost)
  if (random() >= preview.chance) {
    if (preview.deathOnFailure > 0 && random() < preview.deathOnFailure) {
      const name = REALMS[state.realm].name
      resetForRebirth(state, preview.deathKarma, 'death')
      pushLog(state, `自【${name}】冲关失败，身死道消，强制重开；本次仙缘减半，获得 ${preview.deathKarma} 点。`, 'bad')
    } else if (preview.tribulation) {
      const lost = []
      for (const res of Object.keys(next.cost)) {
        if (res === 'insight' || res === 'qi') continue
        const amount = Math.min(state.resources[res] || 0, floorNumber((state.resources[res] || 0) * BREAKTHROUGH.stockLoss))
        if (amount > 0) {
          payCost(state, { [res]: amount })
          lost.push(`${RESOURCE_MAP[res].name} ${amount}`)
        }
      }
      const injury = { id: 'breakthroughInjury', name: '渡劫调养', mult: -BREAKTHROUGH.productionLoss,
        target: null, until: gameNow(state) + BREAKTHROUGH.recoverySeconds * 1000 }
      state.buffs = state.buffs.filter(b => b.id !== injury.id)
      state.buffs.push(injury)
      if (preview.regressionOnFailure > 0) state.realm -= 1
      const realmOutcome = preview.regressionOnFailure > 0 ? `退回【${REALMS[state.realm].name}】` : '境界不变'
      pushLog(state, `冲击【${next.name}】失败，材料不退回，${realmOutcome}；全局产出降低5%，持续120秒${lost.length ? `；额外损失 ${lost.join('、')}` : '；无额外库存损失'}。`, 'bad')
    } else {
      pushLog(state, `冲击【${next.name}】失败，材料不退回，境界不变，无额外惩罚。`, 'bad')
    }
    recompute(state, derived)
    return false
  }
  state.realm += 1
  state.stats.bestRealm = Math.max(state.stats.bestRealm, state.realm)
  pushLog(state, `天地异象，成功突破至【${next.name}】`, 'realm')
  recompute(state, derived)
  return true
}

/** 本世**存下**的灵机（走 addResource，会被仓储上限截断；仙缘公式用的是它） */
export function lifeInsightOf(state) {
  return Math.max(0, state.stats?.lifeInsight || 0)
}

/**
 * 飞升的唯一条件：**渡劫期**。
 *
 * 转世不是门槛 —— 它是达成飞升的**正常游玩途径**：每一世带着仙缘重来、
 * 跑得更快，几世之后冲渡劫期最省力。但愿意一世硬磨到底的玩家，
 * 同样可以飞升（见 CONFIG.ASCEND_TURNS_REFERENCE 与 docs/DESIGN.md §8.2）。
 */
export function canAscend(state) {
  return state.realm >= ASCEND_REALM_INDEX
}

/** 已经转世过几次 */
export function reincarnationsDone(state) {
  return Math.max(0, state.stats?.reincarnations || 0)
}

/** 转世的门槛：化神期（比飞升早得多） */
export function canReincarnate(state) {
  return state.realm >= REINCARNATE_REALM_INDEX
}

/**
 * 仙缘结算公式（转世与飞升共用）：
 *   sqrt(本世累计灵机 ÷ 2000) × (1 + 境界 × 0.3) × (1 + 飞升加成)
 * 于是「越晚结算越值钱」是自动的：化神期约 22 点、渡劫期约 197 点。
 */
export function settleKarma(state, derived, allowed) {
  const insight = Math.max(0, state.stats.lifeInsight || 0)
  const base = Math.sqrt(insight / 2000)
  const realmFactor = 1 + state.realm * 0.3
  const daoBonus = 1 + Math.max(0, state.dao || 0) * CONFIG.DAO_KARMA_GAIN_BONUS
  const gain = base * realmFactor * (1 + derived.ascendBonus) * daoBonus
  return Math.max(allowed ? 1 : 0, Math.floor(gain))
}

export function ascensionGain(state, derived) {
  return settleKarma(state, derived, canAscend(state))
}

/** 转世能拿多少仙缘（同一公式，门槛更低所以到手更少） */
export function reincarnationGain(state, derived) {
  return settleKarma(state, derived, canReincarnate(state))
}
