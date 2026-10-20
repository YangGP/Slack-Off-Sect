import { withResourceAction } from '../resourceObservation'
import { UPGRADE_MAP } from '@/data/upgrades'
import { recompute } from './economy'
import { isUpgradeUnlocked, canAfford, pushLog, payCost, isTreasureForged, refineCost, treasureLevel, treasureMult, realmCost } from './core'
import { BREAKTHROUGH, BREAKTHROUGH_AIDS, REALMS, ASCEND_REALM_INDEX, REINCARNATE_REALM_INDEX } from '@/data/realms'
import { realmBaseChance } from '@/data/disciples'
import { gameRandom, gameNow } from '../context'
import { resetForRebirth } from '../state'
import { ONE, ZERO, floorMoney, money, moneyGt, moneyMax, moneyMin } from '../decimal'
import { RESOURCE_MAP } from '@/data/resources'
import { FAITH_UPGRADE_MAP } from '@/data/faith'
import { CONFIG } from '@/data/config'
import { autoAssignTalentJobs } from './disciples'
import { deathReduceFactor, regressionReduceFactor, tribulationVowBonus } from './faith'
import { karmaShopBonuses } from './karmaShop'

export function toggleUpkeepUpgrade(state, derived, id) {
  return withResourceAction(state, { type: 'toggleUpkeepUpgrade', id: id }, () => {
    const up = UPGRADE_MAP[id]
    if (!up?.upkeep || !state.upgrades[id]) return false
    state.upgradeEnabled ||= {}
    state.upgradeEnabled[id] = state.upgradeEnabled[id] === false
    recompute(state, derived)
    return true

  })
}

export function research(state, derived, id) {
  return withResourceAction(state, { type: 'research', id: id }, () => {
    const up = UPGRADE_MAP[id]
    if (!up || state.upgrades[id] || !isUpgradeUnlocked(state, up)) return false
    if (FAITH_UPGRADE_MAP[id]) {
      pushLog(state, '《' + up.name + '》需在香火页以愿力修持。', 'bad')
      return false
    }
    if (!canAfford(state, up.cost)) {
      pushLog(state, `推演《${up.name}》的材料不足。`, 'bad')
      return false
    }
    payCost(state, up.cost)
    state.upgrades[id] = true
    autoAssignTalentJobs(state)
    pushLog(state, `参悟《${up.name}》`, 'good')
    recompute(state, derived)
    return true

  })
}

/** 祭炼一次：付钱、等级 +1、重算 */
export function refineTreasure(state, derived, id) {
  return withResourceAction(state, { type: 'refineTreasure', id: id }, () => {
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

  })
}

/**
 * 预览与支付使用同一份报价，辅助材料不受破境折扣影响。
 *
 * D7：后期三档的成功率上限、应劫正愿加成，以及失败后的身死／退境／保境
 * 三个互斥条件概率都在这里一次算出，实际判定直接复用。
 */
export function breakthroughPreview(state, derived, options = {}) {
  const rules = BREAKTHROUGH
  const target = state.realm + 1
  const tribulation = state.realm >= rules.tribulationRealm
  const baseChance = realmBaseChance(target)
  const availableAids = BREAKTHROUGH_AIDS[target] || []
  const aids = availableAids.filter(aid => options[aid.id] === true)
  const cost = { ...(realmCost(state, derived, target) || {}) }
  for (const aid of aids) {
    for (const [res, amount] of Object.entries(aid.cost)) cost[res] = (cost[res] ?? ZERO).plus(money(amount))
  }
  const aidBonus = aids.reduce((sum, aid) => sum + aid.bonus, 0)
  const vowBonus = tribulationVowBonus(state, target)
  const chanceCap = rules.lateChanceCaps[target] ?? rules.chanceCap
  const chance = Math.min(chanceCap, baseChance + aidBonus + vowBonus)
  // 身死减免：本次选中的护道 deathReduce 之和 + 已学技艺的 tribulationSafety（被动）。
  const baseDeath = state.realm >= rules.deathRealm ? (rules.deathChances[state.realm] || 0) : 0
  const deathReduce = aids.reduce((sum, aid) => sum + (aid.deathReduce || 0), 0) + Math.max(0, derived?.tribulationSafety || 0)
  const deathOnFailure = Math.max(0, baseDeath - deathReduce) * deathReduceFactor(state)
  // 退境只在“存活失败”里发生：先扣除身死，再按定神守境相对降低。
  const regressionOnFailure = state.realm >= rules.regressionRealm
    ? Math.max(0, 1 - deathOnFailure) * regressionReduceFactor(state)
    : 0
  const holdOnFailure = Math.max(0, 1 - deathOnFailure - regressionOnFailure)
  const maxChance = Math.min(chanceCap,
    baseChance + availableAids.reduce((sum, aid) => sum + aid.bonus, 0) + vowBonus)
  return {
    baseChance, chance, maxChance, availableAids, cost, tribulation, vowBonus, chanceCap,
    deathOnFailure, regressionOnFailure, holdOnFailure,
    regressionRisk: (1 - chance) * regressionOnFailure,
    deathRisk: (1 - chance) * deathOnFailure,
    holdRisk: (1 - chance) * holdOnFailure,
    deathKeepRatio: 0.5 + karmaShopBonuses(state).deathKeepBonus,
    deathKarma: floorMoney(reincarnationGain(state, derived).times(money(0.5 + karmaShopBonuses(state).deathKeepBonus))),
  }
}

export function breakthrough(state, derived, options = {}, random = () => gameRandom(state)) {
  return withResourceAction(state, { type: 'breakthrough', id: state.realm + 1 }, () => {
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
      // 失败后只掷一次均匀随机数：先判身死，再判存活退境，其余为保境。
      // 没有任何风险时不再消耗随机数，保持与旧规则相同的抽取次数。
      const fate = preview.deathOnFailure > 0 || preview.regressionOnFailure > 0 ? random() : Infinity
      if (preview.deathOnFailure > 0 && fate < preview.deathOnFailure) {
        const name = REALMS[state.realm].name
        resetForRebirth(state, preview.deathKarma, 'death')
        pushLog(state, `自【${name}】冲关失败，身死道消，强制重开；本次仙缘保留 ${Math.round(preview.deathKeepRatio * 100)}%，获得 ${preview.deathKarma} 点。`, 'bad')
      } else {
        const lost = []
        if (preview.tribulation) {
          for (const res of Object.keys(next.cost)) {
            if (res === 'insight' || res === 'qi') continue
            // 渡劫失败按库存比例没收：比例是有界 Number，库存与损失是金额。
            const have = state.resources[res] ?? ZERO
            const amount = moneyMin(have, floorMoney(have.times(BREAKTHROUGH.stockLoss)))
            if (moneyGt(amount, ZERO)) {
              payCost(state, { [res]: amount })
              lost.push(`${RESOURCE_MAP[res].name} ${amount}`)
            }
          }
          const injury = { id: 'breakthroughInjury', name: '渡劫调养', mult: -BREAKTHROUGH.productionLoss,
            target: null, until: gameNow(state) + BREAKTHROUGH.recoverySeconds * 1000 }
          state.buffs = state.buffs.filter(b => b.id !== injury.id)
          state.buffs.push(injury)
        }
        const regress = preview.regressionOnFailure > 0 &&
          fate < preview.deathOnFailure + preview.regressionOnFailure
        if (regress) state.realm -= 1
        const realmOutcome = regress ? `退回【${REALMS[state.realm].name}】` : '境界不变'
        if (preview.tribulation) {
          pushLog(state, `冲击【${next.name}】失败，材料不退回，${realmOutcome}；全局产出降低5%，持续120秒${lost.length ? `；额外损失 ${lost.join('、')}` : '；无额外库存损失'}。`, 'bad')
        } else {
          pushLog(state, `冲击【${next.name}】失败，材料不退回，${realmOutcome}，无额外惩罚。`, 'bad')
        }
      }
      recompute(state, derived)
      return false
    }
    state.realm += 1
    state.stats.bestRealm = Math.max(state.stats.bestRealm, state.realm)
    pushLog(state, `天地异象，成功突破至【${next.name}】`, 'realm')
    recompute(state, derived)
    return true

  })
}

/** 本世**存下**的灵机（走 addResource，会被仓储上限截断；仙缘公式用的是它）——金额 */
export function lifeInsightOf(state) {
  return moneyMax(ZERO, state.stats?.lifeInsight ?? ZERO)
}

/** 飞升的唯一条件：**渡劫期**。 */
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
 *   sqrt(本世累计灵机 ÷ 2000) × (1 + 境界 × 0.3) × (1 + 飞升加成) × (1 + 前世账簿修持)
 * 前世账簿直接提高仙缘结算所得，与道果的仙缘加成各自独立乘区。
 */
export function settleKarma(state, derived, allowed) {
  const insight = moneyMax(ZERO, state.stats?.lifeInsight ?? ZERO)
  const base = insight.div(2000).sqrt()
  const realmFactor = money(1 + state.realm * 0.3)
  const daoBonus = ONE.plus(moneyMax(ZERO, state.dao ?? ZERO).times(CONFIG.DAO_KARMA_GAIN_BONUS))
  const ledgerBonus = ONE.plus(karmaShopBonuses(state).insightBonus)
  const gain = base.times(realmFactor).times(ONE.plus(derived.ascendBonus || 0)).times(daoBonus).times(ledgerBonus)
  return moneyMax(allowed ? ONE : ZERO, floorMoney(gain))
}

export function ascensionGain(state, derived) {
  return settleKarma(state, derived, canAscend(state))
}

/** 转世能拿多少仙缘（同一公式，门槛更低所以到手更少） */
export function reincarnationGain(state, derived) {
  return settleKarma(state, derived, canReincarnate(state))
}
