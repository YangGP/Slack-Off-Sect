/**
 * 妖兽猎杀模块 · 数据层（叶子模块：不 import 任何东西）。
 *
 * 猎杀相关内容从核心目录迁出后集中在这里，由核心数据文件静态拼装回
 * `RESOURCES / JOBS / BUILDINGS / CRAFTS / CULTIVATION / TECHNIQUES`，
 * 顺序用锚点插回，保证 `*_MAP` 与展示顺序与拆分前一致。
 *
 * 每条目录项带 `module: 'hunting'`：模块关闭时，core 的解锁函数与 economy
 * 的累加循环会据此让它们失效（见 src/data/modules.js、src/game/moduleRegistry.js）。
 *
 * 完整公式见 docs/BEAST-SYSTEM.md §4。
 */

/** 通用参数（首轮试调值） */
export const HUNT = {
  /** 每次出征消耗的猎备 */
  PREPARATION_COST: 100,
  /** 单队人数与同时任务数 */
  TEAM_MIN: 1,
  TEAM_MAX: 5,
  MAX_ACTIVE_MISSIONS: 1,
  /** 成功率与增益上限 */
  SUCCESS_FLOOR: 0.35,
  SUCCESS_CAP: 0.99,
  YIELD_BONUS_CAP: 1.0,
  DURATION_REDUCTION_CAP: 0.4,
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
    desc: '近山的缓坡与溪谷，普通妖兽出没。皮骨可作起居与护具之料。',
    unlocked: true,
    entryRealm: 3,
    minDiscipleRealm: 0,
    recommendRealm: 3,
    baseDuration: 120,
    successBase: 0.9,
    baseYield: { beastHide: 0.12, beastBone: 0.08 },
    advancedYield: null,
  },
]

export const HUNT_FIELD_MAP = Object.fromEntries(HUNT_FIELDS.map((f) => [f.id, f]))

/** 首轮默认猎场 */
export const DEFAULT_HUNT_FIELD = HUNT_FIELDS[0].id

// ============================================================
// 目录贡献（由核心数据文件拼装）
// ============================================================

/** 资源：猎备、灵兽皮、灵兽骨（禁区/深山材料待实现） */
export const HUNT_RESOURCES = [
  {
    id: 'huntPreparation',
    name: '猎备',
    glyph: '备',
    color: '#d8b98a',
    baseMax: 0,
    // 仓容完全独立：不套通用扩仓（比例为 0），也不乘仙缘仓储倍率（isolatedStorage）。
    storageWeight: 0,
    isolatedStorage: true,
    desc: '弓弩、干粮、缚兽索——猎妖师在营地备下的行装。每趟出征消耗 100，仓容由猎杀营地单独提供。',
    module: 'hunting',
  },
  {
    id: 'beastHide',
    name: '灵兽皮',
    glyph: '皮',
    color: '#d0a878',
    baseMax: 0,
    integer: true,
    desc: '山麓妖兽的皮，柔韧耐磨。可作暖裘居室的衬垫与护具。',
    module: 'hunting',
  },
  {
    id: 'beastBone',
    name: '灵兽骨',
    glyph: '骨',
    color: '#e0d6c2',
    baseMax: 0,
    integer: true,
    desc: '妖兽的骨，含灵气而不易碎。可炼器，也可入建材。',
    module: 'hunting',
  },
]

/** 资源插回锚点：保持拆分前位于「灵草」之后 */
export const HUNT_RESOURCE_ANCHOR = 'herb'

/** 岗位：猎妖师（末尾追加，拆分前即在 JOBS 末尾） */
export const HUNT_JOBS = [
  {
    id: 'huntPlanner',
    name: '猎妖师',
    glyph: '猎',
    desc: '在营地打理弓弩、干粮与缚兽索，为出征备下猎备。不产兽材——兽材由出征任务带回。',
    resource: 'huntPreparation',
    base: 0.2,
    needs: { building: { id: 'huntingCamp', count: 1 } },
    module: 'hunting',
  },
]

/** 建筑：猎杀营地、暖裘居室 */
export const HUNT_BUILDINGS = [
  {
    id: 'huntingCamp',
    name: '猎杀营地',
    glyph: '猎',
    group: 'hunt',
    cost: { wood: 500, rock: 200, stone: 60 },
    priceRatio: 1.35,
    desc: '扎在近山处的营寨，弓箭、缚索与兽栏一应俱全。猎妖师在此备猎，也是出征的起点。',
    // 猎备仓容单独配置，不套通用仓储加成；兽皮兽骨按普通材料计容。
    effects: { storage: { huntPreparation: 300, beastHide: 200, beastBone: 150 } },
    needs: { realm: 3, upgrades: ['wildHunting'] },
    module: 'hunting',
  },
  {
    id: 'warmFurChamber',
    name: '暖裘居室',
    glyph: '裘',
    group: 'living',
    cost: { wood: 300, rock: 100, beastHide: 40, beastBone: 20 },
    priceRatio: 1.35,
    desc: '以兽皮为壁、兽骨为架的保暖陈设。不增加住额，靠持续供给兽皮维持暖意。',
    effects: { habitability: 4 },
    upkeep: { beastHide: 0.1 },
    needs: { realm: 3, upgrades: ['wildHunting'], building: { id: 'logHouse', count: 1 } },
    module: 'hunting',
  },
]

/** 建筑插回锚点：保持拆分前位于「药圃」之后 */
export const HUNT_BUILDING_ORDER_ANCHOR = 'herbGarden'

/** 建筑分组：猎杀 */
export const HUNT_BUILDING_GROUP = { id: 'hunt', name: '猎杀', hint: '营地、猎备与兽材' }

/** 配方：兽骨炼器 */
export const HUNT_CRAFTS = [
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

/** 修真研究：山野猎法、兽材加工（属 CULTIVATION，末尾追加） */
export const HUNT_UPGRADES = [
  {
    id: 'wildHunting',
    name: '山野猎法',
    glyph: '猎',
    cost: { insight: 300, wood: 200, stone: 30 },
    desc: '循兽迹、辨兽性，定下设伏与合围的门道。可营建猎杀营地，并布置暖裘居室。',
    effects: { unlockBuildings: ['huntingCamp', 'warmFurChamber'] },
    note: '解锁建筑：猎杀营地、暖裘居室',
    effectDesc: '因此敢入山猎兽：有了稳定的兽材来源。',
    // 承草木（灵植术）与起居（引泉净水）两线：研究可先掌握，实际应用仍需筑基与木屋等条件。
    needs: { upgrades: ['herbStudy', 'waterSanitation'] },
    module: 'hunting',
  },
  {
    id: 'beastMaterialArt',
    name: '兽材加工',
    glyph: '兽',
    cost: { insight: 1500, beastHide: 40, beastBone: 40 },
    desc: '熟皮硝骨、按纹取料，兽材才堪堪可用。开启《兽骨炼器》，为御寒灵裘备料。',
    effects: { unlockBuildings: [] },
    note: '开启配方：兽骨炼器',
    // 承接山野猎法与炼器术：兽骨入炉成器，兽皮另走起居与护具。
    needs: { upgrades: ['wildHunting', 'forgeArt'] },
    module: 'hunting',
  },
]

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
    desc: '踏石无声，翻山如履平地。猎杀时长 −10%。',
    effects: { huntDurationReduction: 0.1 },
    needs: { upgrades: ['wildHunting'] },
    module: 'hunting',
  },
  {
    id: 'huntLogistics',
    name: '筹猎章',
    glyph: '筹',
    cost: { insight: 350, wood: 300 },
    desc: '把弓弩、干粮、缚索列成册子，行前清点不遗漏。猎妖师备猎速度 +25%。',
    effects: { jobRatio: { huntPlanner: 0.25 } },
    needs: { upgrades: ['wildHunting'] },
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
