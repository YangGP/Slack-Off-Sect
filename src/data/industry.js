/** 金丹后的自动加工：容量单位为每秒可完成的基础加工秒数，境界另行提速。 */
export const PROCESSING_STATIONS = [
  { id: 'woodwork', name: '木作工位', buildings: { workshop: 1 } },
  { id: 'forge', name: '炼器工位', buildings: { forge: 1 } },
  { id: 'inscription', name: '刻纹工位', buildings: { talismanHall: 1 } },
  { id: 'alchemy', name: '丹道工位', buildings: { alchemyRoom: 1 } },
  // 基础凝液工位不需要灵晶，避免首座晶核阵依赖自身产物才能开工。
  { id: 'condensation', name: '凝聚工位', baseUpgrade: 'liquidArt', buildings: { crystalArray: 1 } },
  { id: 'nursery', name: '育草工位', buildings: { herbGarden: 1 / 3 } },
]

export const PROCESSING_STATION_MAP = Object.fromEntries(PROCESSING_STATIONS.map(s => [s.id, s]))
export const PROCESSING_MODES = ['normal', 'overload', 'energy']
export const PROCESSING_POWER_COST = { overload: { qi: 10 }, energy: { qiEnergy: 0.1 } }
export const RECIPE_STATIONS = {
  recordDaoNote: 'inscription', compileDaoTreatise: 'inscription', drawArrayDiagram: 'inscription',
  sawPlank: 'woodwork', cutStone: 'woodwork', makePaper: 'woodwork', mixSpiritMortar: 'woodwork', reinforceSpiritMortar: 'woodwork',
  forgeArtifact: 'forge', refineSteel: 'forge', forgeSpiritArtifact: 'forge',
  forgeSpiritTreasure: 'forge', refineMithril: 'forge', smeltArcaneGold: 'forge',
  fuseCrystalSilver: 'forge',
  drawTalisman: 'inscription', assembleArrayBase: 'inscription', drawSpiritTalisman: 'inscription', drawRuneStone: 'inscription',
  refinePill: 'alchemy', condensePill: 'alchemy', refineNineTurnPill: 'alchemy',
  condenseLiquid: 'condensation', condenseCrystal: 'condensation',
  growImmortalHerb: 'nursery',
}

/** 加权分配有限容量；达到速限的配方与暂停配方不会占用剩余容量。 */
export function allocateProcessing(capacity, requests) {
  const allocated = Object.fromEntries(requests.map(r => [r.id, 0]))
  let remaining = Math.max(0, capacity)
  let pending = requests.filter(r => r.demand > 0 && r.weight > 0)
  while (remaining > 1e-9 && pending.length) {
    const weight = pending.reduce((sum, r) => sum + r.weight, 0)
    const saturated = pending.filter(r => r.demand <= remaining * r.weight / weight)
    if (!saturated.length) {
      for (const r of pending) allocated[r.id] = remaining * r.weight / weight
      break
    }
    for (const r of saturated) {
      allocated[r.id] = r.demand
      remaining -= r.demand
    }
    const done = new Set(saturated.map(r => r.id))
    pending = pending.filter(r => !done.has(r.id))
  }
  return allocated
}
