/**
 * 妖兽猎杀模块 · 数据层（叶子模块：不 import 任何东西）。
 *
 * 猎杀相关内容从核心目录迁出后集中在这里，由核心数据文件静态拼装回
 * `RESOURCES / JOBS / BUILDINGS / CRAFTS / CULTIVATION / TECHNIQUES`，
 * 顺序用锚点插回，保证 `*_MAP` 与展示顺序与拆分前一致。
 *
 * 每条目录项以 module 声明代码归属；猎杀始终启用，研究与境界门槛独立判定。
 *
 * 完整公式见 docs/BEAST-SYSTEM.md §4。
 */

/** 通用参数（首轮试调值） */
export const HUNT = {
  /** 每次出征消耗的信符（与外交交易共用同一资源，见 resources.js 的 warrant） */
  WARRANT_COST: 100,
  /** 单队人数与同时任务数 */
  TEAM_MIN: 1,
  TEAM_MAX: 5,
  MAX_ACTIVE_MISSIONS: 1,
  /** 成功率与增益上限 */
  SUCCESS_FLOOR: 0.35,
  SUCCESS_CAP: 0.99,
  YIELD_BONUS_CAP: 1.0,
  /** 自动猎杀间隔（秒）：建议默认 60，可调 30～3600。 */
  AUTO_INTERVAL_DEFAULT: 60,
  AUTO_INTERVAL_MIN: 30,
  AUTO_INTERVAL_MAX: 3600,
  /** 猎杀信符减耗上限（只用于猎杀，不影响外交）。 */
  COST_REDUCTION_CAP: 0.9,
}

/**
 * 猎场。
 * - entryRealm / minDiscipleRealm / recommendRealm 沿用代码境界下标
 *   （凡体 0、引气 1、炼气 2、筑基 3、金丹 4、元婴 5、化神 6、炼虚 7…）
 * - baseYield / advancedYield 为「基准秒产」，同档骨皮同时按此产出
 * - advancedRatio 为进阶档最少占比（山麓无进阶档）
 */
export const HUNT_FIELDS = [
  {
    id: 'foothills',
    name: '山麓',
    desc: '近山缓坡，皮骨用于起居陈设，偶得内丹帮助弟子修炼。安全猎场。',
    unlocked: true,
    entryRealm: 3,
    minDiscipleRealm: 0,
    recommendRealm: 3,
    baseDuration: 60,
    successBase: 0.9,
    baseYield: { beastHide: 0.24, beastBone: 0.16, innerCore: 0.0005 },
    advancedYield: null,
  },
  { id: 'deepwoods', name: '深山', entryRealm: 4, minDiscipleRealm: 3, recommendRealm: 4, baseDuration: 60, successBase: 0.85,
    baseYield: { beastHide: 0.15, innerCore: 0.002, healingHerb: 0.01 }, injury: 0.03, desc: '内丹与疗养草较多；受伤暂不能再次猎杀，无死亡风险。' },
  { id: 'forbidden', name: '禁地', entryRealm: 6, minDiscipleRealm: 4, recommendRealm: 6, baseDuration: 60, successBase: 0.8,
    baseYield: { beastBone: 0.3, innerCore: 0.003, healingHerb: 0.03 }, injury: 0.05, desc: '常规培养补给产地；受伤暂不能再次猎杀，无死亡风险。' },
  { id: 'spiritGarden', name: '灵兽苑', perk: 'hunt4', entryRealm: 6, minDiscipleRealm: 5, recommendRealm: 6, baseDuration: 60, successBase: 0.85,
    baseYield: { spiritFur: 0.02, beastHide: 0.3, healingHerb: 0.02 }, injury: 0.03, desc: '高级宜居兽材的安全来源，适合长期经营。' },
  { id: 'mysticValley', name: '玄灵谷', perk: 'hunt5', entryRealm: 8, minDiscipleRealm: 6, recommendRealm: 8, baseDuration: 60, successBase: 0.8,
    baseYield: { spiritCore: 0.001, innerCore: 0.003, spiritFur: 0.01 }, injury: 0.06, desc: '高级培养内丹的安全来源，无死亡风险。' },
  { id: 'ancientWilds', name: '荒古境', perk: 'hunt6', entryRealm: 9, minDiscipleRealm: 8, recommendRealm: 9, baseDuration: 60, successBase: 0.85,
    baseYield: { spiritCore: 0.003, spiritFur: 0.04, healingHerb: 0.04 }, injury: 0.08, death: 0.0005,
    desc: '高危：每名弟子每次猎杀0.05%死亡风险，死亡减免不生效；产物均有安全来源。' },
]

export const HUNT_FIELD_MAP = Object.fromEntries(HUNT_FIELDS.map((f) => [f.id, f]))

/** 首轮默认猎场 */
export const DEFAULT_HUNT_FIELD = HUNT_FIELDS[0].id

// ============================================================
// 目录贡献（由核心数据文件拼装）
// ============================================================

/** 资源：灵兽皮、灵兽骨（信符已抽成核心资源；禁区/深山材料待实现） */
export const HUNT_RESOURCES = [
  ...[
    ['innerCore', '内丹', '丹', '直接补指定弟子的本境修为，不能越境。'],
    ['spiritCore', '灵髓内丹', '髓', '高级修为物品，仍受宗门境界上限限制。'],
    ['spiritFur', '灵绒', '绒', '高级起居陈设的建设与维护材料。'],
    ['healingHerb', '疗养草', '药', '可合成猎杀补给，降低受伤率。'],
    ['huntSupply', '护身药散', '散', '启用补给后，每名出征弟子消耗一份，本次受伤概率减半；不降低死亡率。'],
  ].map(([id, name, glyph, desc]) => ({ id, name, glyph, desc, color: '#b3c78a', baseMax: Infinity, noProduction: true, module: 'hunting' })),
  {
    id: 'beastHide',
    name: '灵兽皮',
    glyph: '皮',
    color: '#d0a878',
    baseMax: 0,
    desc: '山麓妖兽的皮，柔韧耐磨，可作暖裘居室衬垫。',
    module: 'hunting',
  },
  {
    id: 'beastBone',
    name: '灵兽骨',
    glyph: '骨',
    color: '#e0d6c2',
    baseMax: 0,
    desc: '妖兽的骨，含灵气而不易碎。可炼器，也可入建材。',
    module: 'hunting',
  },
]

/** 资源插回锚点：保持拆分前位于「灵草」之后 */
export const HUNT_RESOURCE_ANCHOR = 'herb'

/** 岗位：执符使（核心岗位，产信符供猎杀与外交共用；模块关闭时随目录项失效） */
export const HUNT_JOBS = [
  {
    id: 'huntPlanner',
    name: '执符使',
    glyph: '符',
    desc: '在执符堂刻符牌、开凭信：入山猎妖、拜访邻宗都要用它。不产兽材——兽材由出征任务带回。',
    resource: 'warrant',
    base: 0.2,
    needs: { building: { id: 'huntingCamp', count: 1 } },
    moduleAny: ['hunting', 'diplomacy'],
  },
]

/** 建筑：执符堂、暖裘居室 */
export const HUNT_BUILDINGS = [
  { id: 'spiritFurCourt', name: '灵绒静舍', glyph: '绒', group: 'living', cost: { spiritFur: 30, cutStone: 200, plank: 100 }, priceRatio: 1.4,
    desc: '以灵绒布置静舍，每座宜居度+12；持续消耗灵绒，不增加住额。', effects: { habitability: 12 }, upkeep: { spiritFur: 0.002 }, needs: { realm: 6 }, module: 'hunting' },
  {
    id: 'huntingCamp',
    name: '执符堂',
    glyph: '符',
    group: 'hunt',
    cost: { wood: 500, cutStone: 50, stone: 60 },
    priceRatio: 1.35,
    desc: '临山而设的堂口，执符使在此开具宗门差遣凭信，入山猎妖与邻宗互市都从这里起行。',
    // 信符仓容单独配置，不套通用仓储加成；兽皮兽骨按普通材料计容。
    effects: { storage: { warrant: 300, beastHide: 200, beastBone: 150 } },
    needs: { realm: 3, upgrades: ['quarryArt', 'wildHunting'] },
    moduleAny: ['hunting', 'diplomacy'],
  },
  {
    id: 'warmFurChamber',
    name: '暖裘居室',
    glyph: '裘',
    group: 'living',
    cost: { wood: 300, cutStone: 25, beastHide: 40, beastBone: 20 },
    priceRatio: 1.35,
    desc: '以兽皮为壁、兽骨为架的保暖陈设。不增加住额，靠持续供给兽皮维持暖意。',
    effects: { habitability: 4 },
    upkeep: { beastHide: 0.1 },
    needs: { realm: 3, upgrades: ['quarryArt', 'wildHunting'], building: { id: 'logHouse', count: 1 } },
    module: 'hunting',
  },
]

/** 建筑显示锚点：猎杀设施接在香火之后，位于阵道之前。 */
export const HUNT_BUILDING_ORDER_ANCHOR = 'ancestorHall'

/** 建筑分组：猎杀 */
export const HUNT_BUILDING_GROUP = { id: 'hunt', name: '猎杀', hint: '执符堂、信符与兽材' }

/** 配方：兽骨炼器 */
export const HUNT_CRAFTS = [
  { id: 'makeHuntSupply', name: '调配护身药散', out: 'huntSupply', amount: 1, tier: 1, cost: { healingHerb: 2, herb: 20 }, time: 5,
    needs: { realm: 4, upgrades: ['wildHunting'] }, desc: '减少本次猎杀受伤风险，不影响死亡风险。', module: 'hunting' },
  {
    id: 'forgeArtifactBone',
    name: '兽骨炼器',
    out: 'artifact',
    amount: 1,
    tier: 1,
    primary: ['beastBone'],
    cost: { beastBone: 40, ore: 100, stone: 12 },
    time: 3,
    desc: '以兽骨为筋、玄铁为体、灵石点睛，炼出一件更耐用的法器，与《淬炼法器》共用成品。',
    needs: { realm: 4, upgrades: ['beastMaterialArt', 'forgeArt'], building: { id: 'forge', count: 1 } },
    module: 'hunting',
  },
]

/** 配方插回锚点：保持拆分前位于「原淬炼法器」之后 */
export const HUNT_CRAFT_ANCHOR = 'forgeArtifact'

/** 修真研究：山野猎法、兽材加工（属 CULTIVATION，按锚点插回原位） */
export const HUNT_UPGRADES = [
  {
    id: 'wildHunting',
    name: '山野猎法',
    glyph: '猎',
    cost: { insight: 700 },
    desc: '循兽迹、辨兽性，定下设伏与合围的门道。可营建执符堂，并布置暖裘居室；执符堂开出的信符也供邻宗互市使用。',
    effects: { unlockBuildings: ['huntingCamp', 'warmFurChamber'] },
    note: '解锁建筑：执符堂、暖裘居室',
    effectDesc: '因此敢入山猎兽：有了稳定的兽材来源，信符也可供互市。',
    // 承草木（灵植术）与起居（引泉净水）两线：研究可先掌握，实际应用仍需筑基与木屋等条件。
    needs: { upgrades: ['herbStudy', 'waterSanitation'] },
    moduleAny: ['hunting', 'diplomacy'],
  },
  {
    id: 'beastMaterialArt',
    name: '兽材加工',
    glyph: '兽',
    cost: { insight: 2600, beastHide: 40, beastBone: 40 },
    desc: '熟皮硝骨、按纹取料，兽材才堪堪可用。开启《兽骨炼器》，为御寒灵裘备料。',
    effects: { unlockBuildings: [] },
    note: '开启配方：兽骨炼器',
    // 掌握淬玄工艺后再研究兽骨入炉成器，兽皮另走起居与护具。
    needs: { upgrades: ['wildHunting', 'forgeArt', 'steelWorking'] },
    module: 'hunting',
  },
]

/**
 * 修真研究插回锚点：与分段拆分前的展示位置一致——
 * 山野猎法在「宗门制度」段（引泉净水之后），兽材加工在「工艺与规制」段（石作规制之后）。
 * 研究列表按数据顺序展示，锚点保证删除分段后两个节点不掉到页面底部。
 */
export const HUNT_UPGRADE_ANCHORS = {
  wildHunting: 'waterSanitation',
  beastMaterialArt: 'stoneWorks',
}

/** 技艺：识踪诀、踏山步、筹猎章、剥取法（属 TECHNIQUES） */
export const HUNT_TECHNIQUES = [
  {
    id: 'beastTracking',
    name: '识踪诀',
    glyph: '踪',
    cost: { insight: 250, wood: 200, stone: 20 },
    desc: '辨足迹与兽息，先发制兽。猎杀成功率 +5 个百分点。',
    effects: { huntSuccessBonus: 0.05 },
    needs: { upgrades: ['wildHunting'] },
    module: 'hunting',
  },
  {
    id: 'mountainStep',
    name: '踏山步',
    glyph: '踏',
    cost: { insight: 200, stone: 20 },
    desc: '踏石无声，翻山如履平地。猎杀信符消耗 −10%，不改变外交费用。',
    effects: { huntCostReduction: 0.1 },
    needs: { upgrades: ['beastTracking'] },
    module: 'hunting',
  },
  {
    id: 'huntLogistics',
    name: '筹猎章',
    glyph: '筹',
    cost: { insight: 350, wood: 300 },
    desc: '把弓弩、干粮、缚索列成册子，行前清点不遗漏。执符使开符速度 +25%。',
    effects: { jobRatio: { huntPlanner: 0.25 } },
    needs: { upgrades: ['mountainStep'] },
    module: 'hunting',
  },
  {
    id: 'skinning',
    name: '剥取法',
    glyph: '剥',
    cost: { insight: 700, beastHide: 30, beastBone: 20 },
    desc: '下刀循纹理，皮骨不损分毫。猎杀收获 +15%。',
    effects: { huntYieldBonus: 0.15 },
    needs: { upgrades: ['beastMaterialArt'] },
    module: 'hunting',
  },
]

/** 技艺插回锚点：保持拆分前位于「坐忘功」之后 */
export const HUNT_TECHNIQUE_ANCHOR = 'zuowangArt'
