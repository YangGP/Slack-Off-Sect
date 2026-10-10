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
    // 搬迁自宗门页的手动按钮：现在它就是炼制页里的一条普通配方，
    // 于是"点一下立刻出一份"（制作是瞬发的）、满仓自动停下、连同自动炼制一并免费得到。
    id: 'growWood',
    name: '催生灵木',
    out: 'wood',
    amount: 1,
    tier: 1,
    primary: ['qi'],
    cost: { qi: 5 },
    time: 1,
    // 定价口径：樵夫 0.15 灵木/秒 vs 阵徒 0.6 灵气/秒 → 劳动平价是 4 灵气/灵木。
    // 与「点石成灵」取同一条溢价（1.25×）→ 收 5 灵气。早期写过 10，等于 2.5 倍溢价，
    // 比雇樵夫贵一倍多，会让这个入口变成陷阱（见文档的汇率表）。
    desc: '以灵气催动山中木芽，开局即可使用：每份消耗灵气 5，得灵木 1；仓满时自然停下。',
  },

  {
    id: 'infuseStone',
    name: '点石成灵',
    out: 'stone',
    amount: 1,
    tier: 1,
    primary: ['rock'],
    cost: { rock: 3, qi: 15 },
    time: 3,
    desc: '从三块石材中筛选、切出易于存气的矿料，再灌入灵气制成一枚灵石。需采矿场提供石材，每份消耗矿石3与灵气15。',
    needs: { building: { id: 'quarry', count: 1 } },
  },
  {
    id: 'condenseLiquid',
    name: '凝气成液',
    out: 'spiritLiquid',
    amount: 1,
    tier: 1,
    primary: ['qi'],
    cost: { qi: 150 },
    time: 3,
    desc: '灵气受压凝成灵液，压在玉瓶里十年不散 —— 这是灵气第一种存得住的形态。',
    needs: { upgrades: ['liquidArt'] },
  },
  {
    id: 'refinePill',
    name: '采药制丹',
    out: 'pill',
    amount: 1,
    tier: 1,
    primary: ['herb'],
    cost: { herb: 100, qi: 60 },
    time: 2,
    desc: '灵草入炉，文武火各三遍，成丹一枚。',
    needs: { building: { id: 'alchemyRoom', count: 1 } },
  },
  {
    id: 'sawPlank',
    name: '刨木成板',
    out: 'plank',
    amount: 1,
    tier: 1,
    primary: ['wood'],
    cost: { wood: 175 },
    time: 1.5,
    desc: '百工坊的匠人把一百七十五根灵木解成板材、刨平上蜡，精选一方好板，殿宇梁柱全指着它。',
    // 会解板的是「木作器械」，不是百工坊 —— 否则百工坊（用木板下料）永远盖不起来
    needs: { upgrades: ['woodworking'] },
  },
  {
    id: 'drawTalisman',
    name: '绘制符箓',
    out: 'talisman',
    amount: 1,
    tier: 1,
    primary: ['wood'],
    // 符箓的本质是「符文」：以灵木等材料承托、灵气为墨绘成，绘在不同材料上便是不同品阶（见描灵符）。
    cost: { wood: 125, qi: 60 },
    time: 2,
    desc: '以灵木为纸、灵气为墨，绘下一道符文。符文不变，换个材料承托便是更高阶的符。',
    needs: { building: { id: 'talismanHall', count: 1 } },
  },
  {
    id: 'forgeArtifact',
    name: '淬炼法器',
    out: 'artifact',
    amount: 1,
    tier: 1,
    primary: ['ore'],
    cost: { ore: 125, stone: 12 },
    time: 3,
    desc: '玄铁千锤，灵石点睛，始成一器。',
    needs: { building: { id: 'forge', count: 1 } },
  },
  {
    id: 'assembleArrayBase',
    name: '组装阵基',
    out: 'arrayBase',
    amount: 1,
    tier: 2,
    primary: ['plank', 'talisman'],
    cost: { plank: 25, talisman: 25, ore: 100 },
    time: 4,
    desc: '二十五方木板搭骨、二十五张符箓定纹，百份玄铁铆合成一座阵基。用于讲经堂、静心池与护山大阵。',
    needs: { realm: 4, upgrades: ['arrayAssembly'], building: { id: 'talismanHall', count: 1 } },
  },
  {
    id: 'refineSteel',
    name: '淬玄成钢',
    out: 'steel',
    amount: 1,
    tier: 1,
    primary: ['ore'],
    cost: { ore: 100, qi: 120 },
    time: 4,
    desc: '玄铁入炉，反复折叠锻打，杂质随火星飞尽。',
    needs: { upgrades: ['steelWorking'], building: { id: 'forge', count: 1 } },
  },
  {
    id: 'condenseCrystal',
    name: '凝气结晶',
    out: 'crystal',
    amount: 1,
    tier: 1,
    primary: ['spiritLiquid'],
    cost: { spiritLiquid: 3, talisman: 10 },
    time: 5,
    desc: '以十张符箓定住气机，三瓶灵液凝成稳定晶核。用于晶核聚灵阵、观星台与高级阵法。',
    needs: { realm: 5, upgrades: ['crystalCraft'], building: { id: 'talismanHall', count: 1 } },
  },
  {
    id: 'growImmortalHerb',
    name: '培育仙草',
    out: 'immortalHerb',
    amount: 1,
    tier: 1,
    primary: ['herb'],
    cost: { herb: 100, spiritLiquid: 2 },
    time: 5,
    desc: '以灵液浇灌，一株灵草要养到叶上凝露才算是仙草。',
    needs: { building: { id: 'herbGarden', count: 3 } },
  },
  {
    id: 'refineNineTurnPill',
    name: '九转炼丹',
    out: 'nineTurnPill',
    amount: 1,
    tier: 2,
    primary: ['pill'],
    cost: { pill: 100, immortalHerb: 5, qi: 500 },
    time: 6,
    desc: '九转丹炉里火候九变，一炉只出数枚。',
    needs: { upgrade: 'alchemyCauldron' },
  },
  {
    id: 'drawSpiritTalisman',
    name: '描灵符',
    out: 'spiritTalisman',
    amount: 1,
    tier: 2,
    primary: ['talisman'],
    cost: { talisman: 100, faith: 500 },
    time: 5,
    desc: '同一道符文，改绘在香火凝成的灵墨上，便成了灵符 —— 符文不变，材料升级。',
    needs: { building: { id: 'talismanHall', count: 1 } },
  },
  {
    id: 'forgeSpiritArtifact',
    name: '铸灵器',
    out: 'spiritArtifact',
    amount: 1,
    tier: 2,
    primary: ['artifact'],
    cost: { artifact: 100, steel: 25 },
    time: 8,
    desc: '玄钢为骨、法器为魂 —— 铸成之日，器物自己会鸣。',
    needs: { building: { id: 'forge', count: 1 } },
  },
  {
    id: 'forgeSpiritTreasure',
    name: '铸灵宝',
    out: 'spiritTreasure',
    amount: 1,
    tier: 3,
    primary: ['spiritArtifact', 'nineTurnPill', 'spiritTalisman'],
    cost: { spiritArtifact: 25, nineTurnPill: 25, spiritTalisman: 50 },
    time: 12,
    // 组合型进阶：三条支线（器 / 丹 / 符）在这里汇成一件
    desc: '灵器为骨、九转丹为髓、灵符为纹。三样齐备，才算一件灵宝。',
    needs: { upgrades: ['artifactLore'] },
  },

]

export const CRAFT_MAP = Object.fromEntries(CRAFTS.map((c) => [c.id, c]))

export const DEFAULT_QUICK_CRAFTS = ['infuseStone', 'refinePill', 'sawPlank']
export const ADVANCED_CRAFT_OUTPUTS = ['spiritLiquid', 'arrayBase', 'steel', 'crystal', 'immortalHerb', 'nineTurnPill', 'spiritTalisman', 'spiritArtifact', 'spiritTreasure']

export function normalizeQuickCrafts(ids) {
  if (!Array.isArray(ids)) return [...DEFAULT_QUICK_CRAFTS]
  return [...new Set(ids.filter(id => typeof id === 'string' && Object.hasOwn(CRAFT_MAP, id)))]
}

/** 配方的单件耗时（秒），缺省 1 秒 */
export function craftTime(recipe, derived) {
  const time = recipe && recipe.time > 0 ? recipe.time : 1
  return time / Math.max(1, derived?.craftSpeed || 1)
}
