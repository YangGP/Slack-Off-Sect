import { BUILDING_MAP } from './buildings.js'

/** 同类建筑只有一套数量；高阶元数据不可原地修改基础表。 */
export const PRODUCTION_STAGES = {
  lumberYard: { name: '灵锯采木场', upgrades: ['spiritSaw'], cost: { plank: 20, steel: 8, arrayBase: 4, crystal: 10 }, priceRatio: 1.25, effects: { ratio: { wood: 0.3 } }, upkeepEnergy: 0.002 },
  quarry: { name: '灵钻矿场', upgrades: ['veinInfuse'], cost: { cutStone: 200, steel: 10, mithril: 2, arrayBase: 6 }, priceRatio: 1.25, effects: { ratio: { rock: 0.35, ore: 0.1, stone: 0.1 } }, upkeepEnergy: 0.003 },
  ironFurnace: { name: '灵能冶铁炉', upgrades: ['spiritSmelting'], cost: { ironMortar: 12, steel: 10, mithril: 3, spiritTalisman: 4 }, priceRatio: 1.3, effects: { prod: { ore: 0.45 } }, upkeep: { rock: 0.6 }, upkeepEnergy: 0.008 },
  spiritQuarry: { name: '灵脉采掘井', upgrades: ['infuseTheory', 'mithrilArt'], cost: { ironMortar: 10, mithril: 5, crystal: 20, spiritTalisman: 4 }, priceRatio: 1.35, effects: {}, secondaryBase: 0.0045, upkeepEnergy: 0.004 },
  herbGarden: { name: '灵能药圃', upgrades: ['spiritCultivation'], cost: { spiritMortar: 12, arrayBase: 6, spiritLiquid: 20, immortalHerb: 4 }, priceRatio: 1.25, effects: { ratio: { herb: 0.3 } }, nurseryCapacity: 2 / 3, upkeepEnergy: 0.003 },
}

const variants = Object.fromEntries(Object.entries(PRODUCTION_STAGES).map(([id, stage]) => {
  const base = BUILDING_MAP[id]
  return [id, { ...base, ...stage, stage: 1, boost: undefined, upkeep: stage.upkeep,
    upkeepQi: undefined, powerMult: 1,
    desc: `${stage.name}持续消耗灵能，效果随实际供给缩放；停用不降级。`,
    needs: { ...base.needs, realm: Math.max(7, base.needs?.realm || 0),
      upgrades: [...new Set([...(base.needs?.upgrades || []), 'poweredProduction', ...stage.upgrades])] } }]
}))

export function buildingMeta(state, id) {
  if (!Object.hasOwn(BUILDING_MAP, id)) return undefined
  return state.buildings?.[id]?.stage === 1 && Object.hasOwn(variants, id) ? variants[id] : BUILDING_MAP[id]
}

export function productionStageReady(state, id) {
  return Object.hasOwn(PRODUCTION_STAGES, id) && state.realm >= 7 && state.upgrades.energyApplication === true &&
    state.upgrades.poweredProduction === true && PRODUCTION_STAGES[id].upgrades.every(u => state.upgrades[u])
}
