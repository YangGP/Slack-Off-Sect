/**
 * 制作配方（对应猫国的 craft 表：花资源换 1 个成品，可被 craftBonus 放大）。
 * 产出的小数部分会累计到 state.craftProgress，攒满就多给一个。
 *
 * `time` 是「连续」制作时每做一份要花多少秒：
 *   点「制作」是瞬发的（点一下立刻出一份，见 §7）；
 *   点「连续」则是下一个长期活儿 —— 按这个节奏一份一份出，直到材料或仓储用尽。
 */
export const CRAFTS = [
  {
    id: 'condenseStone',
    name: '凝气成石',
    out: 'stone',
    amount: 1,
    cost: { qi: 45 },
    time: 0.5,
    desc: '把稀薄灵气压成一枚灵石。宗门早期的硬通货全靠它。',
    unlocked: true,
  },
  {
    id: 'refinePill',
    name: '采药制丹',
    out: 'pill',
    amount: 1,
    cost: { herb: 25, qi: 60 },
    time: 2,
    desc: '灵草入炉，文武火各三遍，成丹一枚。',
    needs: { building: { id: 'alchemyRoom', count: 1 } },
  },
  {
    id: 'sawPlank',
    name: '刨木成板',
    out: 'plank',
    amount: 1,
    cost: { wood: 175 },
    time: 1.5,
    desc: '百工坊的匠人把灵木解成板材、刨平上蜡。一百七十五根原木才出一方好板 —— 殿宇梁柱全指着它。',
    // 会解板的是「木作器械」，不是百工坊 —— 否则百工坊（用木板下料）永远盖不起来
    needs: { upgrades: ['woodworking'] },
  },
  {
    id: 'drawTalisman',
    name: '朱砂符箓',
    out: 'talisman',
    amount: 1,
    cost: { wood: 40, qi: 60 },
    time: 2,
    desc: '以灵木为纸、朱砂为墨，画一张能镇妖的符。',
    needs: { building: { id: 'talismanHall', count: 1 } },
  },
  {
    id: 'forgeArtifact',
    name: '淬炼法器',
    out: 'artifact',
    amount: 1,
    cost: { ore: 50, stone: 12 },
    time: 3,
    desc: '玄铁千锤，灵石点睛，始成一器。',
    needs: { building: { id: 'forge', count: 1 } },
  },
  {
    id: 'refineSteel',
    name: '淬玄成钢',
    out: 'steel',
    amount: 1,
    cost: { ore: 20, stone: 30 },
    time: 4,
    desc: '玄铁入炉，反复折叠锻打，杂质随火星飞尽。',
    needs: { building: { id: 'forge', count: 1 } },
  },
  {
    id: 'growImmortalHerb',
    name: '培育仙草',
    out: 'immortalHerb',
    amount: 1,
    cost: { herb: 60, qi: 200 },
    time: 5,
    desc: '引灵泉灌溉，一株灵草要养到叶上凝露才算是仙草。',
    needs: { building: { id: 'herbGarden', count: 3 } },
  },
  {
    id: 'refineNineTurnPill',
    name: '九转炼丹',
    out: 'nineTurnPill',
    amount: 1,
    cost: { pill: 10, immortalHerb: 2, qi: 300 },
    time: 6,
    desc: '九转丹炉里火候九变，一炉只出数枚。',
    needs: { upgrade: 'alchemyCauldron' },
  },
  {
    id: 'drawSpiritTalisman',
    name: '描灵符',
    out: 'spiritTalisman',
    amount: 1,
    cost: { talisman: 12, faith: 300 },
    time: 5,
    desc: '以香火研墨、朱砂立骨，落笔时那一线气机不能断。',
    needs: { building: { id: 'talismanHall', count: 1 } },
  },
  {
    id: 'forgeSpiritArtifact',
    name: '铸灵器',
    out: 'spiritArtifact',
    amount: 1,
    cost: { artifact: 8, steel: 3 },
    time: 8,
    desc: '玄钢为骨、法器为魂 —— 铸成之日，器物自己会鸣。',
    needs: { building: { id: 'forge', count: 1 } },
  },
  {
    id: 'forgeSpiritTreasure',
    name: '铸灵宝',
    out: 'spiritTreasure',
    amount: 1,
    cost: { spiritArtifact: 2, nineTurnPill: 2, spiritTalisman: 3 },
    time: 12,
    // 组合型进阶：三条支线（器 / 丹 / 符）在这里汇成一件
    desc: '灵器为骨、九转丹为髓、灵符为纹。三样齐备，才算一件灵宝。',
    needs: { upgrades: ['artifactLore'] },
  },
]

export const CRAFT_MAP = Object.fromEntries(CRAFTS.map((c) => [c.id, c]))

/** 配方的单件耗时（秒），缺省 1 秒 */
export function craftTime(recipe) {
  return recipe && recipe.time > 0 ? recipe.time : 1
}
