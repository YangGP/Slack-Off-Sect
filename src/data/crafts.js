/**
 * 制作配方（对应猫国的 craft 表：花资源换 1 个成品，可被 craftBonus 放大）。
 * 产出直接按 Decimal 数量入库，小数不再等到凑整。
 *
 * `time` 是「连续」制作时每做一份要花多少秒：
 *   点「制作」是瞬发的（点一下立刻出一份，见 §7）；
 *   点「连续」则是下一个长期活儿 —— 按这个节奏一份一份出，直到材料或仓储用尽。
 */
import { insertAfter } from './modules.js'
import { ONE, money } from '../game/decimal.js'
import { registerStaticMoneyCache } from '../game/staticMoneyCache.js'
import { HUNT_CRAFTS, HUNT_CRAFT_ANCHOR } from '../modules/hunting/data.js'

const CORE_CRAFTS = [
  {
    id: 'recordDaoNote', name: '记录道札', out: 'daoNote', amount: 1, tier: 1,
    primary: ['insight', 'paper'], cost: { insight: 100, paper: 2 }, time: 4,
    desc: '以灵纸为书写载体，将研读与试验所得整理成可保存的道札。',
    needs: { realm: 4, upgrades: ['preachArt', 'paperArt'] },
  },
  {
    id: 'compileDaoTreatise', name: '汇编道论', out: 'daoTreatise', amount: 1, tier: 2,
    primary: ['daoNote', 'insight'], cost: { daoNote: 20, insight: 1500, paper: 2 }, time: 8,
    desc: '交互核验道札中的记录，将零散认识整理为可复用的理论，装订成册。',
    needs: { realm: 5, upgrades: ['preachArt', 'crystalTheory', 'paperArt'] },
  },
  {
    id: 'drawArrayDiagram', name: '绘制阵图', out: 'arrayDiagram', amount: 1, tier: 3,
    primary: ['daoTreatise', 'insight'], cost: { daoTreatise: 10, insight: 6000, talisman: 5, paper: 10 }, time: 12,
    desc: '以道论验算阵位，在灵纸上起稿定形，再用符箓标定纹路，绘成可直接施工的工程阵图。',
    needs: { realm: 6, upgrades: ['crystalTheory', 'compositeRune', 'astrologyArt', 'paperArt'] },
  },
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
    desc: '以灵气催动山中木芽，开局即可使用：基础口径为每份消耗灵气 5、得灵木 1，实际用料与产出按当前加成结算；仓满时自然停下。',
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
    desc: '从石材中筛选、切出易于存气的矿料，再灌入灵气制成灵石。需采矿场提供石材；基础口径为每份消耗矿石 3 与灵气 15，实际用料与产出按加成结算。',
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
    // 依标准计量并掌握凝气化液（《凝气化液》）后才凝得出合格灵液；凝聚工位另由《凝液法》提供。
    needs: { upgrades: ['qiLiquid'] },
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
    // 二级丹：补一/三品之间的断层（见 docs/MATERIAL-RESEARCH.md §1.2/§1.4）。
    id: 'condensePill',
    name: '凝元炼丹',
    out: 'condensePill',
    amount: 1,
    tier: 2,
    primary: ['pill'],
    cost: { pill: 20, immortalHerb: 2, qi: 300 },
    time: 4,
    desc: '以丹药为基、仙草引元，文武再炼三遍，凝成二品凝元丹。',
    needs: { realm: 5, upgrades: ['alchemyEssence'], building: { id: 'alchemyRoom', count: 1 } },
  },
  {
    id: 'cutStone',
    name: '压制石材',
    out: 'cutStone',
    amount: 1,
    tier: 1,
    primary: ['rock'],
    cost: { rock: 4, qi: 2 },
    time: 2,
    desc: '顺着石纹下凿，再以灵气施压定形，压成可砌基垒墙的石材；碎料回炉仍能再压。',
    needs: { upgrades: ['quarryArt'] },
  },
  {
    id: 'makePaper',
    name: '抄造灵纸',
    out: 'paper',
    amount: 1,
    tier: 1,
    primary: ['wood'],
    cost: { wood: 30, qi: 10 },
    time: 1.5,
    desc: '灵木沤浆、抄帘、压榨、晾干，得纸一张。记事、成册、起稿与刻符都从这张纸开始。',
    needs: { realm: 3, upgrades: ['paperArt'] },
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
    desc: '百工坊的匠人把灵木解成板材、刨平上蜡，精选一方好板，殿宇梁柱全指着它。基础用料为 175 灵木，实际用料与产出按加成结算。',
    // 会解板的是「木作器械」，不是百工坊 —— 否则百工坊（用木板下料）永远盖不起来
    needs: { upgrades: ['woodworking'] },
  },
  {
    id: 'drawTalisman',
    name: '刻制符箓',
    out: 'talisman',
    amount: 1,
    tier: 1,
    primary: ['paper'],
    // 符文是技术，符箓先以灵纸起稿定形；高阶灵符改用金属载体。
    cost: { paper: 4, qi: 60 },
    time: 2,
    desc: '在灵纸上起稿定形、刻入简单符文，再注入灵气固化为可携带的符箓。',
    needs: { building: { id: 'talismanHall', count: 1 }, upgrades: ['paperArt'] },
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
    primary: ['plank', 'ore'],
    cost: { plank: 10, ore: 100, qi: 300 },
    time: 4,
    desc: '木板搭骨、玄铁固结，刻入导灵纹与固形纹，再注入灵气成阵基。基础口径为木板 10、玄铁 100、灵气 300，实际用料与产出按加成结算；用于讲经堂、静心池与护山大阵。',
    needs: { realm: 4, upgrades: ['arrayAssembly'], building: { id: 'talismanHall', count: 1 } },
  },
  {
    id: 'drawRuneStone',
    name: '绘制灵纹',
    out: 'runeStone',
    amount: 1,
    tier: 2,
    primary: ['cutStone', 'paper'],
    cost: { cutStone: 2, paper: 1, qi: 40 },
    time: 4,
    desc: '在灵纸上起稿定形，再按样把导灵纹刻进石材，制成能承托阵纹的营造构件。',
    needs: { realm: 6, upgrades: ['buildingCode', 'paperArt'] },
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
    cost: { spiritLiquid: 3, qi: 300, mithril: 0.01 },
    time: 5,
    desc: '以固形纹约束结晶边界，灵液与灵气在秘银催引下凝成稳定晶核。基础口径为灵液 3、灵气 300、秘银 0.01；用于晶核凝炼阵、观星台与高级阵法。',
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
    needs: { building: { id: 'herbGarden', count: 1 } },
  },
  {
    id: 'refineNineTurnPill',
    name: '九转炼丹',
    out: 'nineTurnPill',
    amount: 1,
    tier: 2,
    primary: ['pill'],
    cost: { condensePill: 20, immortalHerb: 5, qi: 500 },
    time: 6,
    desc: '丹鼎里火候九变，一炉只出数枚。',
    // 解锁由法宝改为「研究 + 建筑」：去掉 upgrade: alchemyCauldron（见 docs/MATERIAL-RESEARCH.md §1.4）。
    // 境界门槛取化神（realm 6，待校准）：使目标炼虚(7) 的护道可在化神备齐三品丹，
    // 与「三品丹用于炼虚～渡劫护道」的定位一致（原稿建议 7 会和护道用法冲突）。
    needs: { realm: 6, upgrades: ['alchemyEssence'], building: { id: 'pillFurnace', count: 1 } },
  },
  {
    id: 'drawSpiritTalisman',
    name: '铭刻灵符',
    out: 'spiritTalisman',
    amount: 1,
    tier: 2,
    primary: ['steel', 'spiritLiquid'],
    cost: { steel: 2, spiritLiquid: 2, paper: 2, qi: 300, faith: 200 },
    time: 5,
    desc: '先在灵纸上起稿定形，再将纳灵纹铭刻在玄钢符牌上，以灵液注灵，承托更强气机；香火中的稳定意念辅助定纹，成就灵符。',
    // 原理节点承接精研，不回锁首份灵符配方与旧档自动产线。
    needs: { realm: 5, upgrades: ['capacityRune', 'paperArt'], building: { id: 'talismanHall', count: 1 } },
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
    desc: '玄钢加固器身，将导灵与纳灵组成的复合符文刻入法器内部，铸成能自行运转气机的灵器。',
    needs: { realm: 6, upgrades: ['compositeRune'], building: { id: 'forge', count: 1 } },
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

  {
    id: 'mixSpiritMortar',
    name: '拌制混灵土',
    out: 'spiritMortar',
    amount: 1,
    tier: 2,
    cost: { stone: 60, spiritLiquid: 4 },
    time: 4,
    desc: '将灵石现场磨成粉末，与灵液拌合固化，制成一份混灵土。',
    needs: { realm: 5, upgrades: ['spiritMortarArt'] },
  },
  {
    id: 'reinforceSpiritMortar',
    name: '浇筑玄铁混灵土',
    out: 'ironMortar',
    amount: 1,
    tier: 2,
    cost: { spiritMortar: 4, ore: 50 },
    time: 5,
    desc: '将玄铁骨架埋入混灵土，浇筑成能承受大型建筑负荷的结构件。',
    needs: { realm: 6, upgrades: ['ironMortarArt'] },
  },
  {
    id: 'refineMithril',
    name: '提炼秘银',
    out: 'mithril',
    amount: 1,
    tier: 2,
    cost: { rock: 300, qi: 150 },
    time: 6,
    desc: '从矿石中分离储灵金属，以灵气检验和精炼，取得秘银。',
    needs: { realm: 7, upgrades: ['mithrilArt'] },
  },
  {
    id: 'smeltArcaneGold',
    name: '熔炼玄金',
    out: 'arcaneGold',
    amount: 1,
    tier: 2,
    cost: { spiritLiquid: 8, ore: 100, mithril: 4 },
    time: 8,
    desc: '以灵液浸炼玄铁与秘银，稳定合金内部的气机通路，得到玄金。',
    needs: { realm: 8, upgrades: ['arcaneGoldArt'] },
  },
  {
    id: 'fuseCrystalSilver',
    name: '复合晶银',
    out: 'crystalSilver',
    amount: 1,
    tier: 2,
    cost: { crystal: 8, mithril: 4 },
    time: 10,
    desc: '以秘银承托灵晶结构，稳定晶体与金属的界面，制成精密晶银。',
    needs: { realm: 9, upgrades: ['crystalSilverArt'] },
  },
  {
    id: 'condenseAscensionSeal',
    name: '固结飞升阵印',
    out: 'ascensionSeal',
    amount: 1,
    fixedYield: true,
    tier: 3,
    cost: { qiEnergy: 80, mithril: 2, spiritTalisman: 1 },
    time: 120,
    desc: '用持续湮灭所得的灵能固结秘银与灵符，每份得到一枚稳定阵印；制作增产不增加阵印数量。可手动或自动炼制。',
    needs: { realm: 8, upgrades: ['annihilationArt'], building: { id: 'annihilationFurnace', count: 1 } },
  },
]

/** 核心配方 + 猎杀模块贡献的配方，按锚点插回保持原顺序 */
export const CRAFTS = insertAfter(CORE_CRAFTS, HUNT_CRAFT_ANCHOR, HUNT_CRAFTS)

export const CRAFT_MAP = Object.fromEntries(CRAFTS.map((c) => [c.id, c]))

export const DEFAULT_QUICK_CRAFTS = ['growWood', 'infuseStone', 'refinePill', 'sawPlank', 'makePaper', 'cutStone']
export const ADVANCED_CRAFT_OUTPUTS = ['daoNote', 'daoTreatise', 'arrayDiagram', 'paper', 'spiritLiquid', 'arrayBase', 'steel', 'cutStone', 'runeStone', 'crystal', 'immortalHerb', 'condensePill', 'nineTurnPill', 'spiritTalisman', 'spiritArtifact', 'spiritTreasure', 'spiritMortar', 'ironMortar', 'mithril', 'arcaneGold', 'crystalSilver', 'ascensionSeal']

export function normalizeQuickCrafts(ids) {
  if (!Array.isArray(ids)) return [...DEFAULT_QUICK_CRAFTS]
  return [...new Set(ids.filter(id => typeof id === 'string' && Object.hasOwn(CRAFT_MAP, id)))]
}

/** 配方的单件耗时（秒），缺省 1 秒 */
export function craftTime(recipe, derived) {
  const time = recipe && recipe.time > 0 ? recipe.time : 1
  return time / Math.max(1, derived?.craftSpeed || 1)
}

/** 手动调速只改变常驻自动节拍，事件产能估价仍使用境界基础节拍。 */
export function autoCraftTime(recipe, derived) {
  return craftTime(recipe, derived) / Math.max(1, derived?.autoCraftSpeeds?.[recipe.id] || 1)
}

/**
 * 配方基础用料（金额）：静态表里的字面值是 Number，进入经济运算时统一构造为 Decimal，
 * 并按配方缓存一次，避免热循环里反复构造。返回的对象只读共享。
 * 工具原地改表后必须调用 `invalidateStaticMoneyCaches()`，否则同一配方会继续用旧报价。
 */
let BASE_COST_CACHE = new WeakMap()
registerStaticMoneyCache(() => { BASE_COST_CACHE = new WeakMap() })
function baseCost(recipe) {
  let cached = BASE_COST_CACHE.get(recipe)
  if (!cached) {
    cached = Object.fromEntries(Object.entries(recipe.cost || {}).map(([res, amount]) => [res, money(amount)]))
    BASE_COST_CACHE.set(recipe, cached)
  }
  return cached
}

/** 节料改变每份投入，手动、自动、事件估价与界面共用。固定阵印不参与节料。 */
export function craftCost(derived, recipe) {
  const base = baseCost(recipe)
  const saving = recipe.fixedYield ? 0 : Math.min(0.5, Math.max(0, derived?.craftCostReduction?.[recipe.id] || 0))
  if (!saving) return base
  const factor = ONE.minus(saving)
  return Object.fromEntries(Object.entries(base).map(([res, amount]) => {
    const reduced = amount.times(factor)
    return [res, reduced]
  }))
}
