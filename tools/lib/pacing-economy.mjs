/** 当前经营快照的边际报价：不把独立产能或满仓增产换算成实际回本。 */
import * as E from '../../src/game/engine.js'
import { craftCost } from '../../src/data/crafts.js'
import { gameNow, setGameContext } from '../../src/game/context.js'
import { createInitialState } from '../../src/game/state.js'

const investmentIds = [
  'steelBatching', 'artifactBatching', 'spiritArtifactBatching', 'pillBatching', 'condensePillBatching', 'nineTurnBatching',
  'mahayanaArt', 'energyCore', 'earthEssence', 'flowField',
]
const facilityIds = ['alchemyRoom', 'pillFurnace', 'forge', 'workshop', 'library', 'scriptureArchive', 'observatory',
  'mansion', 'warehouse', 'arcaneVault', 'grotto', 'caveDwelling', 'heavenTower',
  'splitArray', 'polarizeArray', 'annihilationFurnace', 'harvestPlatform', 'immortalArray', 'karmaPool']
const numbers = map => Object.fromEntries(Object.entries(map || {}).map(([id, value]) => [id, E.moneyToNumber(value)]))
const difference = (after, before) => Object.fromEntries([...new Set([...Object.keys(after || {}), ...Object.keys(before || {})])]
  .filter(id => !E.money(after?.[id]).eq(before?.[id] || 0))
  .map(id => [id, E.money(after?.[id]).minus(before?.[id] || 0)])
  .filter(([, value]) => !value.isZero()).map(([id, value]) => [id, E.moneyToNumber(value)]))

export function economyAssessment(state, derived) {
  // 研究/设施的增量在副本上求，绝不回写玩家状态、费用或已学字段。
  const quote = (kind, id) => {
    const meta = kind === 'upgrade' ? E.UPGRADE_MAP[id] : E.BUILDING_MAP[id]
    if (!meta) return null
    const learned = kind === 'upgrade' ? !!state.upgrades[id] : E.countOf(state, id) > 0
    const unlocked = kind === 'upgrade' ? E.isUpgradeUnlocked(state, meta) : E.isBuildingUnlocked(state, meta)
    // 无前置的假想增量没有决策价值；已拥有者仍可看边际贡献。
    if (!learned && !unlocked) return { kind, id, status: 'locked', name: meta.name }
    const copy = E.cloneRuntime(state), changed = E.createDerived()
    setGameContext(copy, { now: () => gameNow(state), random: () => { throw Error('边际报价不得抽签') } })
    const cost = kind === 'upgrade' ? meta.cost : E.buildingCost(state, id, 1)
    if (kind === 'upgrade') {
      if (learned) delete copy.upgrades[id]
      else copy.upgrades[id] = true
    } else {
      // 已建状态评价再扩一座，而非移除：保留真实增长报价与供给竞争。
      copy.buildings[id] = { ...(copy.buildings[id] || {}), count: E.countOf(state, id) + 1,
        on: state.buildings[id]?.on ?? true }
    }
    E.recompute(copy, changed)
    const before = kind === 'upgrade' && learned ? changed : derived
    const after = kind === 'upgrade' && learned ? derived : changed
    const netBefore = Object.fromEntries(E.RESOURCES.map(res => [res.id, E.resourceFlow(before, res.id).net]))
    const netAfter = Object.fromEntries(E.RESOURCES.map(res => [res.id, E.resourceFlow(after, res.id).net]))
    const capBlocked = Object.entries(cost).filter(([res, amount]) => E.moneyGt(amount, derived.max[res])).map(([res]) => res)
    return { kind, id, name: meta.name, status: kind === 'upgrade' && learned ? 'learned-marginal' : 'next-investment',
      cost: numbers(cost), capBlocked, affordable: E.canAfford(state, cost),
      productionDelta: difference(after.rates, before.rates), netDelta: difference(netAfter, netBefore),
      capacityDelta: difference(after.max, before.max),
      recipeEfficiencyDelta: difference(after.craftSpeedByRecipe, before.craftSpeedByRecipe),
      upkeepDelta: E.moneyToNumber(E.money(after.upkeep).minus(before.upkeep)),
      maxDisciplesDelta: after.maxDisciples - before.maxDisciples,
      // 每种资源分别计算净增产回收该资源投入的时间；异种资源不能直接相加。
      ownResourcePaybackSeconds: Object.fromEntries(Object.entries(cost).map(([res, amount]) => {
        const delta = E.money(netAfter[res]).minus(netBefore[res] || 0)
        return [res, delta.gt(0) ? E.moneyToNumber(E.money(amount).div(delta)) : null]
      })),
      boundary: '固定当前人口/库存/季节；供给会随经营变化；null表示该资源无直接净增产，不代表无法回本' }
  }
  return {
    investments: [...new Set([...investmentIds, ...E.ALL_UPGRADES.filter(u => state.upgrades[u.id] &&
      (u.effects?.craftBonusByResource || u.effects?.craftSpeedByRecipe || u.effects?.buildingStorageRatio ||
        u.effects?.ratio || u.effects?.ratioAll || u.effects?.storageRatio)).map(u => u.id)])]
      .map(id => quote('upgrade', id)).concat(facilityIds.map(id => quote('building', id))).filter(Boolean),
    recipes: E.CRAFTS.filter(recipe => E.isCraftUnlocked(state, recipe)).map(recipe => ({ id: recipe.id, out: recipe.out,
      inputCost: numbers(craftCost(derived, recipe)), yield: E.moneyToNumber(E.craftYield(derived, recipe)),
      efficiency: 1 + (derived.craftSpeedByRecipe[recipe.id] || 0),
      plan: E.processingPlan(state, derived)[recipe.id] || null,
      bottleneck: E.processingBottleneck(state, derived, recipe.id),
      boundary: '效率只影响自动/订单节拍；本测量中的玩家即时制作不享受此加速' })),
    nextRealm: Object.entries(E.breakthroughPreview(state, derived).cost).map(([id, cost]) => ({ id,
      cost: E.moneyToNumber(cost), stock: E.moneyToNumber(state.resources[id]), cap: E.moneyToNumber(derived.max[id]),
      capacityBlocked: E.moneyGt(cost, derived.max[id]), shortage: E.moneyToNumber(E.moneyMax(0, E.money(cost).minus(state.resources[id]))),
      net: E.moneyToNumber(derived.net[id]),
      capUtilization: E.moneyIsPositive(derived.max[id]) ? E.moneyToNumber(E.money(cost).div(derived.max[id])) : null })),
    boundary: '静态边际报价，不是自然投资回本或完整首飞的替代；加工共享工位和原料，不能累加各配方独立产能' }
}

/** 富料、单配方、普通驱动的效率边际实验；明确不代表自然投资回本。 */
export function measureSpecialization(seconds = 600) {
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 3600) throw Error('加工观察秒数需为60～3600整数')
  const targets = investmentIds.slice(0, 6)
  return { seconds, boundary: '受控富料夹具：已有其他研究，单配方自动加工，非自然开局；研究真实扣费后隔离出货，不估算异种资源总回本',
    rows: targets.map(id => {
      const upgrade = E.UPGRADE_MAP[id]
      const recipeId = Object.keys(upgrade.effects.craftSpeedByRecipe)[0]
      const recipe = E.CRAFT_MAP[recipeId]
      const run = buy => {
        let now = Date.UTC(2026, 9, 18)
        const state = createInitialState(now), derived = E.createDerived()
        setGameContext(state, { now: () => now, random: () => 0.5 })
        state.realm = 9
        for (const entry of E.ALL_UPGRADES) if (entry.id !== id) state.upgrades[entry.id] = true
        for (const building of E.BUILDINGS) state.buildings[building.id] = { count: 1, on: true }
        for (const buildingId of ['warehouse', 'granary', 'arcaneVault', 'grotto']) state.buildings[buildingId].count = 1000
        state.settings.recruitMode = 'manual'
        state.settings.craftReservePercent = 0
        E.recompute(state, derived)
        for (const res of E.RESOURCES) if (Number.isFinite(res.baseMax) || E.CRAFTS.some(recipe => recipe.out === res.id)) state.resources[res.id] = E.money(10000000)
        E.recompute(state, derived) // 两组都按补料后的供给计算，避免仅购买组因 research 重算而恢复设施加成。
        const cost = { ...upgrade.cost }
        if (buy && !E.research(state, derived, id)) throw Error(`专精实验无法真实购买：${id}`)
        state.resources[recipe.out] = E.ZERO
        const beforeCraft = numbers(state.resources)
        E.craft(state, derived, recipeId)
        if (!state.resources[recipe.out].gt(beforeCraft[recipe.out])) throw Error(`专精实验无法实际手动出货：${recipeId}`)
        const manual = { output: E.moneyToNumber(state.resources[recipe.out].minus(beforeCraft[recipe.out])),
          inputs: Object.fromEntries(Object.keys(craftCost(derived, recipe)).map(res => [res,
            E.moneyToNumber(E.money(beforeCraft[res]).minus(state.resources[res]))])) }
        // 清空旧成品，仅统计随后600秒的自动出货；其他原料保留为受控富料。
        state.resources[recipe.out] = E.ZERO
        state.craftProgress[recipeId] = E.ZERO
        state.settings.autoCraftOn = true
        state.autoCraft[recipeId] = true
        state.settings.autoCraftSpeeds[recipeId] = 1
        for (const station of Object.keys(derived.processingCapacity)) state.settings.processingModes[station] = 'normal'
        E.recompute(state, derived)
        const plan = E.processingPlan(state, derived)[recipeId]
        if (!plan || plan.work <= 0) throw Error(`专精实验无有效工位：${recipeId}`)
        const initialInputs = Object.fromEntries(Object.keys(craftCost(derived, recipe)).map(res => [res, state.resources[res]]))
        for (let t = 0; t < seconds; t += 5) {
          const dt = Math.min(5, seconds - t), startAt = now
          now += dt * 1000
          E.tick(state, derived, dt, { startAt, events: false, cacheEconomy: true, economyDetails: false })
        }
        if (Object.values(state.resources).some(value => !value.isFinite() || value.isNegative())) throw Error('专精实验产生非法库存')
        const timer = state.craftTimers[recipeId] || { made: 0, t: 0 }
        return { efficiency: 1 + (derived.craftSpeedByRecipe[recipeId] || 0), work: plan.work,
          output: E.moneyToNumber(state.resources[recipe.out]), batches: timer.made, partialProcessingSeconds: timer.t,
          inputNetDecrease: Object.fromEntries(Object.entries(initialInputs).map(([res, amount]) =>
            [res, E.moneyToNumber(amount.minus(state.resources[res]))])), manual, paid: buy ? numbers(cost) : {} }
      }
      const before = run(false), after = run(true)
      return { id, name: upgrade.name, recipeId, before, after,
        theoreticalSpeedRatio: after.efficiency / before.efficiency,
        actualOutputRatio: before.output > 0 ? after.output / before.output : null }
    }) }
}
