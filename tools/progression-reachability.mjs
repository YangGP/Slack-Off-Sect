/**
 * 建筑可达性审计：从新档开始，保留真实前置、仓储折算、整数造价和重复涨价。
 * 假定已开放来源的资源可攒满，不估算耗时、净产出或玩家购买策略。
 */
import { createInitialState } from '../src/game/state.js'
import * as E from './engine-fixture.mjs'
import { BUILDINGS } from '../src/data/buildings.js'
import { ALL_UPGRADES } from '../src/data/upgrades.js'
import { CRAFTS } from '../src/data/crafts.js'
import { JOBS } from '../src/data/jobs.js'
import { REALMS, ASCEND_REALM_INDEX } from '../src/data/realms.js'
import { HUNT, HUNT_FIELDS } from '../src/modules/hunting/data.js'
import { DIPLOMACY, DIPLOMACY_SECTS } from '../src/modules/diplomacy/data.js'

export function auditReachability(realmCeiling = ASCEND_REALM_INDEX) {
  if (!Number.isInteger(realmCeiling) || realmCeiling < 0 || realmCeiling > ASCEND_REALM_INDEX) throw Error('境界上限需为 0–10 的整数')
  const state = createInitialState()
  const derived = E.createDerived()
  // 开局只能点击吸气；其它资源必须先开放生产或配方。
  const sources = new Set(['qi'])
  const milestones = []
  const entries = [...BUILDINGS, ...ALL_UPGRADES, ...CRAFTS, ...JOBS]
  const targetCount = building => Math.max(1, ...entries.flatMap(entry =>
    [entry.needs?.building, ...(entry.needs?.buildings || [])]
      .filter(b => b?.id === building.id).map(b => b.count)))
  // 加工品无限仓容使重复扩仓不再有有限不动点；只扩至所有实际前置所需的容量。
  const required = {}
  const requireCost = cost => {
    for (const [id, value] of Object.entries(cost || {})) {
      required[id] = E.moneyMax(required[id] || 0, value)
    }
  }
  for (const entry of [...ALL_UPGRADES, ...CRAFTS, ...REALMS]) requireCost(entry.cost)
  for (const sect of DIPLOMACY_SECTS) requireCost({ ...sect.pays, warrant: DIPLOMACY.WARRANT_COST })
  for (const building of BUILDINGS) {
    for (const [id, value] of Object.entries(building.cost)) {
      requireCost({ [id]: E.money(value).times(E.money(building.priceRatio || 1).pow(targetCount(building) - 1)) })
    }
  }
  const fits = (cost) => Object.entries(cost || {}).every(([id, amount]) =>
    sources.has(id) && E.moneyGte(E.money(derived.max[id]).plus(1e-9), amount))
  const refresh = () => E.recompute(state, derived)
  refresh()

  let settled = false
  for (let pass = 0; pass < 1000; pass++) {
    let changed = false
    for (const job of JOBS) {
      if (derived.maxDisciples > 0 && E.isJobUnlocked(state, job)) {
        for (const output of E.jobOutputs(state, job)) {
          if (sources.has(output.resource)) continue
          sources.add(output.resource)
          changed = true
        }
      }
    }
    for (const recipe of CRAFTS) {
      if (E.isCraftUnlocked(state, recipe) && fits(recipe.cost) && !sources.has(recipe.out)) {
        sources.add(recipe.out)
        changed = true
      }
    }
    // 猎杀是任务来源，不在 jobs/crafts 中：营地、弟子容量与信符齐备后，猎场产物算作已开放来源。
    if (derived.maxDisciples > 0 && sources.has('warrant') && E.moneyGte(derived.max.warrant, HUNT.WARRANT_COST)) {
      for (const field of HUNT_FIELDS) {
        if (!E.isHuntUnlocked(state, field.id)) continue
        for (const res of Object.keys(field.baseYield)) {
          if (sources.has(res)) continue
          sources.add(res)
          changed = true
        }
      }
    }
    // 固定互市产出是稳定来源；随机结缘奖励不计入可达性。
    if (E.isDiplomacyUnlocked(state) && sources.has('warrant') && E.moneyGte(derived.max.warrant, DIPLOMACY.WARRANT_COST)) {
      for (const sect of DIPLOMACY_SECTS) {
        if (!fits(sect.pays)) continue
        for (const [id, amount] of Object.entries(sect.gains)) {
          if (!E.moneyIsPositive(amount) || sources.has(id)) continue
          sources.add(id)
          changed = true
        }
      }
    }
    for (const upgrade of ALL_UPGRADES) {
      if (!state.upgrades[upgrade.id] && E.checkNeeds(state, upgrade.needs) && fits(E.roundCost(upgrade.cost))) {
        state.upgrades[upgrade.id] = true
        refresh()
        changed = true
      }
    }
    for (const building of BUILDINGS) {
      if (!E.checkNeeds(state, building.needs)) continue
      const count = state.buildings[building.id]?.count || 0
      // 首座验证解锁；重复营造只用于扩仓与数量前置，始终保留实际涨价。
      const target = targetCount(building)
      const expandsNeededCapacity = Object.entries(required).some(([id, amount]) =>
        E.moneyLt(derived.max[id], amount) &&
        ((building.effects.storage?.[id] || 0) > 0 ||
          ((building.effects.storageAll || 0) > 0 && E.money(derived.max[id]).isFinite())))
      if (count >= target && !expandsNeededCapacity) continue
      if (!fits(E.buildingCost(state, building.id, 1))) continue
      if (Object.keys(building.upkeep || {}).some(id => !sources.has(id))) continue
      if (building.id === 'hut') state.starterHutBuilt = true
      state.buildings[building.id] = { count: count + 1, on: true }
      for (const id of Object.keys(building.effects.prod || {})) sources.add(id)
      if (!count) milestones.push({ name: building.name, realm: REALMS[state.realm].name })
      refresh()
      changed = true
    }
    if (!changed && state.realm < realmCeiling && fits(E.realmCost(state, derived, state.realm + 1))) {
      state.realm++
      refresh()
      changed = true
    }
    if (!changed) {
      settled = true
      break
    }
  }

  const blocked = BUILDINGS.filter(b => !state.buildings[b.id]?.count).map(b => ({
    name: b.name,
    needs: E.checkNeeds(state, b.needs) ? '已满足' : b.needs,
    deficits: Object.entries(b.cost).filter(([id, n]) => !sources.has(id) || E.moneyLt(derived.max[id], n))
      .map(([id, n]) => ({ resource: id, cost: E.moneyToNumber(n), cap: E.moneyToNumber(derived.max[id]), source: sources.has(id) })),
  }))

  const realmDeficits = Object.entries(E.realmCost(state, derived, state.realm + 1) || {})
    .filter(([id, amount]) => !sources.has(id) || E.moneyLt(derived.max[id], amount))
    .map(([id, amount]) => ({ resource: id, cost: E.moneyToNumber(amount), cap: E.moneyToNumber(derived.max[id]), source: sources.has(id) }))
  const nextRealmCapacity = Object.fromEntries(Object.keys(E.realmCost(state, derived, state.realm + 1) || {}).map(id => [id, E.moneyToNumber(derived.max[id])]))
  return { settled, realm: REALMS[state.realm].name, reachable: milestones, blocked, realmDeficits, nextRealmCapacity, state, derived, sources }
}
