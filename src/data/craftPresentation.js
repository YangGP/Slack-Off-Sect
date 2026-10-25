/** 炼制页展示分类；不改变引擎中的配方顺序与工位分配。 */
export const CRAFT_GROUPS = [
  { id: 'conversion', name: '基础转化', outputs: ['wood', 'stone', 'spiritLiquid'] },
  { id: 'construction', name: '土木材料', outputs: ['plank', 'cutStone', 'spiritMortar', 'ironMortar'] },
  { id: 'knowledge', name: '典籍阵图', outputs: ['paper', 'daoNote', 'daoTreatise', 'arrayDiagram'] },
  { id: 'alchemy', name: '丹药灵草', outputs: ['immortalHerb', 'pill', 'condensePill', 'nineTurnPill', 'huntSupply'] },
  { id: 'artifacts', name: '符箓法器', outputs: ['talisman', 'spiritTalisman', 'artifact', 'spiritArtifact', 'spiritTreasure', 'arrayBase', 'runeStone', 'ascensionSeal'] },
  { id: 'metals', name: '灵矿合金', outputs: ['steel', 'crystal', 'mithril', 'arcaneGold', 'crystalSilver'] },
  { id: 'worlds', name: '世界仙材', outputs: ['heavenBrick', 'worldBeam', 'worldCore'] },
]

const outputOrder = new Map(CRAFT_GROUPS.flatMap((group, groupIndex) =>
  group.outputs.map((output, index) => [output, { group: group.id, order: groupIndex * 100 + index } ])))

export const craftGroup = recipe => outputOrder.get(recipe.out)?.group || 'other'
export const craftDisplayOrder = recipe => outputOrder.get(recipe.out)?.order ?? Number.MAX_SAFE_INTEGER
