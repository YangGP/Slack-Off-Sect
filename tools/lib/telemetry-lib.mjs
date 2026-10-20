/**
 * 数值平衡遥测：采集与聚合的纯数据逻辑，供 balance-telemetry.mjs 使用。
 *
 * 口径（与 tools/README.md「数值平衡遥测」一致）：
 * - 逐秒累计每资源：贴满（占用率 ≥ 99.9% 上限）、低库存（< 10% 上限）、入不敷出（净额 < 0）的时长；
 *   贴满时的正净额按秒积分作为浪费量（引擎超上限只停增收，逐秒口径下为上界估计）；
 * - 建筑供给降载（derived.buildingSupply < 1）按建筑累计受阻时长与平均供给比例；
 * - 以上指标同时按宗门境界分段，观察各阶段瓶颈迁移；
 * - 周期采样保存全资源快照；cap 为 null 表示无限仓储，不参与贴满/低库存判定；
 * - skipIds（noProduction 资源）不参与秒级缺口/溢出判定，仍保留采样。
 */
import { ZERO, MONEY_INFINITY, moneyToNumber } from '../../src/game/decimal.js'

const SUPPLY_EPS = 1e-9

function blankResource() {
  return {
    seconds: 0, fullSeconds: 0, wasted: 0, starvedSeconds: 0, lowStockSeconds: 0,
    rateSum: 0, expenseSum: 0, netSum: 0, haveSum: 0, netMin: Infinity, netMax: -Infinity,
  }
}

function blankBuilding() {
  return { seconds: 0, blockedSeconds: 0, supplySum: 0 }
}

export function createTelemetry(options = {}) {
  const {
    resourceIds = [],
    skipIds = new Set(),
    lowStockRatio = 0.1,
    fullRatio = 0.999,
  } = options
  const num = moneyToNumber
  const phases = []
  let currentPhase = null
  const samples = []
  const firstSeen = {}
  const timeline = { realms: [], researches: [], buildings: [], population: [] }
  let invalidSeconds = 0

  /** 逐秒观察：在每次引擎 tick 之后调用。 */
  function observeSecond(state, derived, dt, elapsed) {
    // 境界变化（含身死回退、转世重修）即开新段；同一境界的多次经历不合并。
    if (!currentPhase || currentPhase.realm !== state.realm) {
      currentPhase = { realm: state.realm, fromSecond: elapsed - dt, toSecond: elapsed, resources: new Map(), buildings: new Map() }
      phases.push(currentPhase)
    }
    const phase = currentPhase
    phase.toSecond = elapsed
    for (const id of resourceIds) {
      const have = num(state.resources[id] ?? ZERO)
      const rate = num(derived.rates[id] ?? ZERO)
      const expense = num(derived.expense?.[id] ?? ZERO)
      const net = num(derived.net?.[id] ?? ZERO)
      if (![have, rate, expense, net].every(Number.isFinite)) {
        invalidSeconds++
        continue
      }
      const cap = num(derived.max[id] ?? MONEY_INFINITY)
      if (firstSeen[id] === undefined && have > 0) firstSeen[id] = elapsed
      // 未激活时不累计低库存时长；永久货币仅保留快照，不参与生产瓶颈指标。
      if (skipIds.has(id)) continue
      let agg = phase.resources.get(id)
      if (!agg) {
        if (have === 0 && rate === 0 && expense === 0 && net === 0) continue
        agg = blankResource()
        phase.resources.set(id, agg)
      }
      agg.seconds += dt
      agg.rateSum += rate * dt
      agg.expenseSum += expense * dt
      agg.netSum += net * dt
      agg.haveSum += have * dt
      if (net < agg.netMin) agg.netMin = net
      if (net > agg.netMax) agg.netMax = net
      if (Number.isFinite(cap) && cap > 0 && !skipIds.has(id)) {
        const util = have / cap
        if (util >= fullRatio) {
          agg.fullSeconds += dt
          if (net > 0) agg.wasted += net * dt
        } else if (util < lowStockRatio) {
          agg.lowStockSeconds += dt
        }
      }
      if (net < 0) agg.starvedSeconds += dt
    }
    const supply = derived.buildingSupply ?? {}
    for (const id in supply) {
      const building = state.buildings[id]
      if (!building || building.count <= 0 || building.on === false) continue
      const ratio = supply[id]
      if (!Number.isFinite(ratio)) continue
      let agg = phase.buildings.get(id)
      if (!agg) {
        agg = blankBuilding()
        phase.buildings.set(id, agg)
      }
      agg.seconds += dt
      agg.supplySum += ratio * dt
      if (ratio < 1 - SUPPLY_EPS) agg.blockedSeconds += dt
    }
  }

  /** 周期采样：全资源快照 + 调用方组装的全局摘要（extra 原样保存）。 */
  function observeSample(state, derived, elapsed, extra) {
    const row = []
    for (const id of resourceIds) {
      const have = num(state.resources[id] ?? ZERO)
      const cap = num(derived.max[id] ?? MONEY_INFINITY)
      const rate = num(derived.rates[id] ?? ZERO)
      const expense = num(derived.expense?.[id] ?? ZERO)
      const net = num(derived.net?.[id] ?? ZERO)
      const capped = Number.isFinite(cap) && cap > 0
      row.push([
        round(have), Number.isFinite(cap) ? round(cap) : null, round(rate), round(expense), round(net),
        capped ? round(have / cap, 4) : null,
      ])
    }
    samples.push({ t: +(elapsed / 3600).toFixed(3), realm: state.realm, ...extra, res: row })
  }

  function noteBreakthrough(atSecond, fromRealm, toRealm, cost, outcome) {
    timeline.realms.push({ atSecond, fromRealm, toRealm, cost, outcome })
  }

  function noteResearch(atSecond, id, cost) {
    timeline.researches.push({ atSecond, id, cost })
  }

  function noteBuilding(atSecond, id, count) {
    timeline.buildings.push({ atSecond, id, count })
  }

  function notePopulation(atSecond, total) {
    timeline.population.push({ atSecond, total })
  }

  function finish(elapsed) {
    const mergedResources = new Map()
    const buildingMerged = new Map()
    for (const phase of phases) {
      for (const [id, agg] of phase.resources) {
        let target = mergedResources.get(id)
        if (!target) {
          target = blankResource()
          mergedResources.set(id, target)
        }
        accumulateResource(target, agg)
      }
      for (const [id, agg] of phase.buildings) {
        let target = buildingMerged.get(id)
        if (!target) {
          target = blankBuilding()
          buildingMerged.set(id, target)
        }
        target.seconds += agg.seconds
        target.blockedSeconds += agg.blockedSeconds
        target.supplySum += agg.supplySum
      }
    }
    const phaseList = phases.map((phase) => ({
      realm: phase.realm,
      fromSecond: phase.fromSecond,
      toSecond: phase.toSecond,
      resources: Object.fromEntries([...phase.resources].map(([id, agg]) => [id, finalizeResource(agg)])),
      buildings: Object.fromEntries([...phase.buildings].map(([id, agg]) => [id, finalizeBuilding(agg)])),
    }))
    return {
      totalSeconds: elapsed,
      invalidSeconds,
      firstSeen,
      timeline,
      samples,
      phases: phaseList,
      total: {
        resources: Object.fromEntries([...mergedResources].map(([id, agg]) => [id, finalizeResource(agg)])),
        buildings: Object.fromEntries([...buildingMerged].map(([id, agg]) => [id, finalizeBuilding(agg)])),
      },
    }
  }

  return { observeSecond, observeSample, noteBreakthrough, noteResearch, noteBuilding, notePopulation, finish }
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null
  return +value.toFixed(digits)
}

function accumulateResource(target, agg) {
  target.seconds += agg.seconds
  target.fullSeconds += agg.fullSeconds
  target.wasted += agg.wasted
  target.starvedSeconds += agg.starvedSeconds
  target.lowStockSeconds += agg.lowStockSeconds
  target.rateSum += agg.rateSum
  target.expenseSum += agg.expenseSum
  target.netSum += agg.netSum
  target.haveSum += agg.haveSum
  target.netMin = Math.min(target.netMin, agg.netMin)
  target.netMax = Math.max(target.netMax, agg.netMax)
}

function finalizeResource(agg) {
  const n = agg.seconds || 1
  return {
    seconds: agg.seconds,
    fullSeconds: agg.fullSeconds,
    wasted: round(agg.wasted),
    starvedSeconds: agg.starvedSeconds,
    lowStockSeconds: agg.lowStockSeconds,
    avgRate: round(agg.rateSum / n),
    avgExpense: round(agg.expenseSum / n),
    avgNet: round(agg.netSum / n),
    netMin: round(agg.netMin),
    netMax: round(agg.netMax),
    avgHave: round(agg.haveSum / n),
  }
}

function finalizeBuilding(agg) {
  const n = agg.seconds || 1
  return { seconds: agg.seconds, blockedSeconds: agg.blockedSeconds, avgSupply: round(agg.supplySum / n, 4) }
}

/** 未激活资源（全程无产出、无消耗、无库存）不参与排名，避免占位噪音。 */
function isActive(agg) {
  return agg.avgRate !== 0 || agg.avgExpense !== 0 || agg.avgHave > 0
}

/** 缺口排名：低库存与入不敷出时长占比加权（各占一半）。 */
export function rankDeficit(resources, limit = 5) {
  return Object.entries(resources)
    .filter(([, agg]) => agg.seconds > 0 && isActive(agg))
    .map(([id, agg]) => ({
      id,
      lowPct: round(agg.lowStockSeconds / agg.seconds, 4),
      starvedPct: round(agg.starvedSeconds / agg.seconds, 4),
      avgNet: agg.avgNet,
    }))
    .filter((row) => row.lowPct > 0 || row.starvedPct > 0)
    .sort((a, b) => (b.lowPct + b.starvedPct) - (a.lowPct + a.starvedPct))
    .slice(0, limit)
}

/** 溢出排名：浪费量优先，贴满时长并列参考。 */
export function rankOverflow(resources, limit = 5) {
  return Object.entries(resources)
    .filter(([, agg]) => agg.seconds > 0 && isActive(agg))
    .map(([id, agg]) => ({
      id,
      fullPct: round(agg.fullSeconds / agg.seconds, 4),
      wasted: agg.wasted,
    }))
    .filter((row) => row.fullPct > 0)
    .sort((a, b) => (b.wasted - a.wasted) || (b.fullPct - a.fullPct))
    .slice(0, limit)
}
