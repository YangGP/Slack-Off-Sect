/** 小界单座设施；维护与分流由同一预算结算，拥有本身不提供被动收益。 */
export const WORLD_RESEARCH = [
  { id: 'worldVeinGuidance', name: '界脉导引', glyph: '界', cost: { insight: 60000, daoTreatise: 8, arrayDiagram: 1 }, effects: {}, needs: { realm: 8, world: 'spirit' }, desc: '首个聚灵采集点之后，开放归元环与通灵枢。' },
  { id: 'marrowSynthesis', name: '澄髓合炼', glyph: '髓', cost: { insight: 120000, daoTreatise: 16, arrayDiagram: 3 }, effects: {}, needs: { realm: 9, world: 'marrow' }, desc: '首个洗髓采集点之后，开放澄髓池与丹髓炉。' },
  { id: 'worldWallTuning', name: '界壁调律', glyph: '壁', cost: { insight: 180000, daoTreatise: 24, arrayDiagram: 5 }, effects: {}, needs: { realm: 9, world: 'guard' }, desc: '首个护道采集点之后，开放镇界碑与协灵阵。' },
]

export const WORLD_FACILITIES = [
  { id: 'returnRing', name: '归元环', world: 'spirit', research: 'worldVeinGuidance', cost: { heavenBrick: 6, mithril: 8, arrayBase: 6 }, desc: '本界灵能维护减少15%（校准后25%），额外支付基础天砖维护的10%。' },
  { id: 'spiritHub', name: '通灵枢', world: 'spirit', research: 'worldVeinGuidance', cost: { heavenBrick: 8, worldBeam: 3, spiritArtifact: 2 }, branch: true, q50: 2.7, limit: 0.2, improved: 0.3, technique: 'spiritDistribution', desc: '分流仙灵力支援凝聚工位容量，上限20%（配流后30%）。' },
  { id: 'marrowPool', name: '澄髓池', world: 'marrow', research: 'marrowSynthesis', cost: { heavenBrick: 15, worldBeam: 4, condensePill: 8, nineTurnPill: 2 }, desc: '清髓额外产出25%（循养后40%）；每有效级每小时另耗灵草1800、灵液7.2，缺料只停强化。' },
  { id: 'marrowFurnace', name: '丹髓炉', world: 'marrow', research: 'marrowSynthesis', cost: { worldBeam: 6, arcaneGold: 8, clearMarrow: 2 }, branch: true, q50: 0.54, limit: 0.2, improved: 0.3, technique: 'marrowTiming', desc: '分流清髓支援所选凝元丹或九转丹自动效率，上限20%（定候后30%）。' },
  { id: 'boundaryStele', name: '镇界碑', world: 'guard', research: 'worldWallTuning', cost: { heavenBrick: 20, worldCore: 2, worldSand: 4 }, branch: true, q50: 0.9, limit: 0.15, improved: 0.25, technique: 'boundaryQuota', desc: '分流镇界砂降低三界原天砖维护，上限15%（定额后25%）；不减归元环附加。' },
  { id: 'cooperativeArray', name: '协灵阵', world: 'guard', research: 'worldWallTuning', cost: { worldBeam: 8, worldCore: 2, crystalSilver: 4, spiritTalisman: 8 }, branch: true, q50: 0.9, limit: 0.1, improved: 0.15, technique: 'cooperativeAccounting', desc: '分流镇界砂降低精舍、洞府、清幽园林、洞天的灵能档维护，上限10%（分账后15%）。' },
]
export const WORLD_FACILITY_MAP = Object.fromEntries(WORLD_FACILITIES.map(f => [f.id, f]))
export const WORLD_LIVING_TARGETS = ['mansion', 'caveDwelling', 'quietGarden', 'grotto']
export const WORLD_TECHNIQUES = [
  ['returnCalibration', '归元校准', 'returnRing', { insight: 30000, daoTreatise: 4, mithril: 6 }, '归元环本界灵能减耗提高至25%。'],
  ['spiritDistribution', '通灵配流', 'spiritHub', { insight: 40000, daoTreatise: 6, worldBeam: 2 }, '通灵枢容量支援上限提高至30%。'],
  ['herbalCirculation', '药液循养', 'marrowPool', { insight: 60000, daoTreatise: 8, nineTurnPill: 4 }, '澄髓池额外产出提高至40%，草液单耗不变。'],
  ['marrowTiming', '丹髓定候', 'marrowFurnace', { insight: 60000, daoTreatise: 8, clearMarrow: 2 }, '丹髓炉配方效率支援上限提高至30%。'],
  ['boundaryQuota', '镇界定额', 'boundaryStele', { insight: 80000, arrayDiagram: 2, worldSand: 6 }, '镇界碑天砖维护减免上限提高至25%。'],
  ['cooperativeAccounting', '协灵分账', 'cooperativeArray', { insight: 80000, arrayDiagram: 2, crystalSilver: 4 }, '协灵阵限定灵能维护减免上限提高至15%。'],
].map(([id, name, facility, cost, desc]) => {
  const f = WORLD_FACILITY_MAP[facility]
  return { id, name, glyph: name[0], cost, effects: {}, desc, effectDesc: desc,
    needs: { realm: f.world === 'spirit' ? 8 : 9, upgrades: [f.research], world: f.world, worldFacility: { world: f.world, id: facility } } }
})

export function normalizeWorldFacilities(raw, world) {
  const result = {}
  let budget = 0
  for (const f of WORLD_FACILITIES.filter(f => f.world === world)) {
    const r = raw?.[f.id]
    const built = r?.built === true
    const requested = built && f.branch && [0.25, 0.5].includes(r?.share) ? r.share : 0
    const share = budget + requested <= 0.5 ? requested : 0
    budget += share
    result[f.id] = { built, on: built && !f.branch && r?.on === true, share,
      ...(f.id === 'marrowFurnace' ? { recipe: ['condensePill', 'refineNineTurnPill'].includes(r?.recipe) ? r.recipe : null } : {}) }
  }
  return result
}
