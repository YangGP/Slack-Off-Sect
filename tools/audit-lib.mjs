/**
 * 资源流量审计的库版本：跑一段模拟，量出某资源的进项 / 出项 / 存量 / 门槛到达时间。
 * 供 tools/resource-audit.mjs（命令行报告）与一次性对照实验复用。
 *
 * 支持「假设性改动」：只在本次运行里改数据对象，跑完还原，不落盘。
 */
import { createInitialState } from '../src/game/state.js'
import * as E from '../src/game/engine.js'
import { createBot } from './player-bot.mjs'
import { RESOURCES, RESOURCE_MAP } from '../src/data/resources.js'
import { CRAFTS, CRAFT_MAP } from '../src/data/crafts.js'
import { REALMS } from '../src/data/realms.js'
import { BUILDINGS } from '../src/data/buildings.js'
import { ALL_UPGRADES } from '../src/data/upgrades.js'
import { JOBS } from '../src/data/jobs.js'

/**
 * @param {object} opts
 * @param {string} opts.resId 要审计的资源
 * @param {number} opts.hours 模拟小时数
 * @param {object} [opts.patches] 假设性改动
 * @param {number} [opts.patches.craftQi] 凝气成石的灵气成本
 * @param {number} [opts.patches.baseMax] 该资源基础上限
 * @param {Array}  [opts.patches.prods]   [{ buildingId, res, value }]
 * @param {number} [opts.patches.realmFactor] 破境花费倍数
 * @param {number} [opts.patches.upgradeFactor] 参悟（修真/技艺/法宝）对该资源的花费倍数
 * @param {number} [opts.patches.jobFactor] 产出该资源的职位的基础产出倍数
 * @param {boolean}[opts.patches.autoCraft] 直接视作已解锁自动制作（给想验的场合用）
 * @param {number[]} [opts.thresholds] 关注的门槛
 */
export function auditResource({ resId = 'stone', hours = 8, patches = {}, thresholds = [150, 600, 900, 1500, 2500, 6000, 14000, 35000] } = {}) {
  const RES = RESOURCES.find((r) => r.id === resId)
  if (!RES) throw new Error('未知资源：' + resId)

  // ---- 套用假设性改动，并记下还原动作 ----
  const restores = []
  if (patches.craftQi != null) {
    const old = CRAFT_MAP.condenseStone.cost.qi
    CRAFT_MAP.condenseStone.cost.qi = patches.craftQi
    restores.push(() => (CRAFT_MAP.condenseStone.cost.qi = old))
  }
  if (patches.baseMax != null) {
    const old = RESOURCE_MAP[resId].baseMax
    RESOURCE_MAP[resId].baseMax = patches.baseMax
    restores.push(() => (RESOURCE_MAP[resId].baseMax = old))
  }
  for (const p of patches.prods || []) {
    const b = BUILDINGS.find((x) => x.id === p.buildingId)
    b.effects.prod = b.effects.prod || {}
    const had = Object.prototype.hasOwnProperty.call(b.effects.prod, p.res)
    const old = b.effects.prod[p.res]
    b.effects.prod[p.res] = p.value
    restores.push(() => {
      if (had) b.effects.prod[p.res] = old
      else delete b.effects.prod[p.res]
    })
  }
  if (patches.upgradeFactor != null) {
    const olds = []
    for (const u of ALL_UPGRADES) {
      if (u.cost && u.cost[resId]) {
        olds.push([u, u.cost[resId]])
        u.cost[resId] = Math.round(u.cost[resId] * patches.upgradeFactor)
      }
    }
    restores.push(() => {
      for (const [u, v] of olds) u.cost[resId] = v
    })
  }
  if (patches.jobFactor != null) {
    const olds = []
    for (const j of JOBS) {
      if (j.resource === resId) {
        olds.push([j, j.base])
        j.base = j.base * patches.jobFactor
      }
    }
    restores.push(() => {
      for (const [j, v] of olds) j.base = v
    })
  }
  if (patches.realmFactor != null) {
    const olds = []
    for (const r of REALMS) {
      if (r.cost && r.cost[resId]) {
        olds.push([r, r.cost[resId]])
        r.cost[resId] = Math.round(r.cost[resId] * patches.realmFactor)
      }
    }
    restores.push(() => {
      for (const [r, v] of olds) r.cost[resId] = v
    })
  }

  try {
    return run({ resId, hours, thresholds, forceAutoCraft: !!patches.autoCraft })
  } finally {
    for (const undo of restores.reverse()) undo()
  }
}

function run({ resId, hours, thresholds, forceAutoCraft }) {
  const RES = RESOURCES.find((r) => r.id === resId)
  const TOTAL = Math.round(hours * 3600)
  const DECISION_EVERY = 5

  const state = createInitialState()
  const derived = E.createDerived()
  if (forceAutoCraft) state.upgrades.intuition = true // 只为验证自动制作的效果
  E.recompute(state, derived)
  const bot = createBot(state, derived)

  const sampleEvery = Math.max(60, Math.floor(TOTAL / 40))
  const samples = []
  const craftCostQi = CRAFTS.filter((c) => c.out === resId).reduce((s, c) => s + (c.cost.qi || 0), 0)
  const reached = new Map()
  let qiSpentOnCrafting = 0
  let blocked = 0
  let ticked = 0
  // 累计获得（产出 + 制作）：产出型靠速率累加，制作型靠 crafted 计数
  let income = 0

  for (let t = 1; t <= TOTAL; t++) {
    const before = state.stats.crafted[resId] || 0
    E.tick(state, derived, 1, { events: true })
    income += Math.max(0, derived.rates[resId] || 0)
    if (t % DECISION_EVERY === 0) bot.act()
    if (t % 300 === 0) E.recompute(state, derived)
    const after = state.stats.crafted[resId] || 0
    if (after > before) qiSpentOnCrafting += (after - before) * craftCostQi

    const cap = derived.max[resId]
    if (Number.isFinite(cap)) {
      ticked++
      if ((state.resources[resId] || 0) >= cap - 1e-6) blocked++
    }
    for (const th of thresholds) {
      if (!reached.has(th) && (state.resources[resId] || 0) >= th) reached.set(th, t)
    }
    if (t % sampleEvery === 0 || t === TOTAL) {
      samples.push({
        t,
        amount: state.resources[resId] || 0,
        cap: derived.max[resId],
        crafted: after,
        income,
        netQi: derived.netQi,
        qiRate: derived.rates.qi,
        realm: REALMS[state.realm].name,
        disciples: state.disciples.total,
        built: state.stats.buildingsBuilt,
      })
    }
  }

  // 产出来源快照（在最终状态下取）
  const prodSources = (derived.sources[resId] || []).map((s) => ({
    label: s.label,
    count: s.count,
    value: s.value,
  }))

  return {
    res: RES,
    hours,
    samples,
    reached,
    thresholds,
    blockedRatio: ticked ? blocked / ticked : 0,
    qiSpentOnCrafting,
    income,
    craftCount: state.stats.craftCount,
    craftedTotal: state.stats.crafted[resId] || 0,
    totalQi: state.stats.totalQi,
    prodSources,
    final: samples[samples.length - 1],
    state,
    derived,
  }
}

/** 秒 -> 「x小时y分」 */
export function fmtDur(s) {
  if (s == null) return '—'
  return `${Math.floor(s / 3600)}小时${Math.floor((s % 3600) / 60)}分`
}
