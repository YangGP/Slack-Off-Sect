/**
 * 建筑可达性审计：从新档开始，保留真实前置、仓储折算、整数造价和重复涨价。
 * 假定已开放来源的资源可攒满，不估算耗时、净产出或玩家购买策略。
 */
import { createInitialState } from '../src/game/state.js'
import * as E from '../src/game/engine.js'
import { BUILDINGS } from '../src/data/buildings.js'
import { ALL_UPGRADES } from '../src/data/upgrades.js'
import { CRAFTS } from '../src/data/crafts.js'
import { JOBS } from '../src/data/jobs.js'
import { REALMS, ASCEND_REALM_INDEX } from '../src/data/realms.js'

const state = createInitialState()
const derived = E.createDerived()
// 开局只能点击吸气；其它资源必须先开放生产或配方。
const sources = new Set(['qi'])
const milestones = []
const fits = (cost) => Object.entries(cost || {}).every(([id, amount]) =>
  sources.has(id) && amount <= derived.max[id] + 1e-9)
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
    const target = Math.max(1, ...[...BUILDINGS, ...ALL_UPGRADES, ...CRAFTS, ...JOBS].flatMap(entry =>
      [entry.needs?.building, ...(entry.needs?.buildings || [])]
        .filter(b => b?.id === building.id).map(b => b.count)))
    if (count >= target && !building.effects.storage && !building.effects.storageAll) continue
    if (!fits(E.buildingCost(state, building.id, 1))) continue
    if (Object.keys(building.upkeep || {}).some(id => !sources.has(id))) continue
    if (building.id === 'hut') state.starterHutBuilt = true
    state.buildings[building.id] = { count: count + 1, on: true }
    for (const id of Object.keys(building.effects.prod || {})) sources.add(id)
    if (!count) milestones.push({ name: building.name, realm: REALMS[state.realm].name })
    refresh()
    changed = true
  }
  if (state.realm < ASCEND_REALM_INDEX && fits(E.realmCost(state, derived, state.realm + 1))) {
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
  deficits: Object.entries(b.cost).filter(([id, n]) => !sources.has(id) || n > derived.max[id])
    .map(([id, n]) => ({ resource: id, cost: n, cap: derived.max[id], source: sources.has(id) })),
}))
console.log(JSON.stringify({ settled, realm: REALMS[state.realm].name, reachable: milestones, blocked }, null, 2))
if (!settled || state.realm < ASCEND_REALM_INDEX || blocked.length) process.exitCode = 1
