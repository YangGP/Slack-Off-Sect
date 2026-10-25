/**
 * 境界（宗门修为主线）。每次破境消耗资源，本世内提升全局产出；退境、转世或飞升后按对应规则重算。
 * 突破到最后一境（渡劫期）之后即可飞升。
 *
 * 各境描述同时记载修士对灵子的认知阶梯（见 docs/SPIRIT-ENERGY.md）：
 * 只知灵气 → 灵子之猜 → 金丹内观首证 → 元婴驱使 → 化神观势 → 炼虚取自由灵子。
 */
import { CONFIG } from './config.js'

/** 宗门全局生产与基础口粮共用；个人修炼和加工速度不使用此折减。 */
export const realmProductionBase = mult => 1 + (mult - 1) * CONFIG.REALM_PRODUCTION_BONUS_RATIO

export const REALMS = [
  { name: '凡体', mult: 1.0, desc: '尚未引气入体，与山下凡人无异 —— 只识风水地气，不识灵气。', cost: null },
  {
    name: '引气入体',
    mult: 1.15,
    desc: '第一次感到灵气顺着经络游走。',
    cost: { insight: 40, qi: 250 },
  },
  {
    name: '炼气期',
    mult: 1.35,
    desc: '灵气在丹田聚成一小团，勉强算入了门 —— 此时仍把灵气当作一团连续的「气」。',
    // 灵草留在丹药制作与可选护道中，不再直接重复收费。
    cost: { qi: 900, insight: 80 },
  },
  {
    name: '筑基期',
    mult: 1.6,
    desc: '道基既立，内视经脉：灵压、灵流、灵阻皆可感。已有人猜想「气」里有更细之物，却拿不出凭据。',
    // 灵气、悟性与固基丹药；原草药投入并入丹药。
    cost: { qi: 2600, insight: 160, pill: 30 },
  },
  {
    name: '金丹期',
    mult: 2.0,
    desc: '一颗金丹吞入腹，始知我命不由天 —— 结丹高压之下，内观到正负灵荷一闪而逝，第一次「看见」灵气别有构造。',
    // 丹药养丹、符箓定气，不再直接收营造用灵石。
    cost: { qi: 7000, insight: 350, pill: 100, talisman: 40 },
  },
  {
    name: '元婴期',
    mult: 2.6,
    desc: '元婴出窍，神游百里而肉身不动 —— 神识所及，已能分辨并驱使正负灵子。',
    // 金丹可自产的灵液、道札、丹药与阵基；不要求元婴才开放的凝元丹。
    cost: { spiritLiquid: 1000, daoNote: 240, pill: 400, arrayBase: 80 },
  },
  {
    name: '化神期',
    mult: 3.4,
    desc: '神识与灵能合一：灵子之云、之波、之势尽收眼底，山门内外如观掌纹。',
    // 以灵液承接原凝聚与分子动力预算，道论承接灵机和道札；凝元丹、灵符均在元婴可产。
    cost: { spiritLiquid: 64000, daoTreatise: 96, condensePill: 600, spiritTalisman: 300 },
  },
  {
    name: '炼虚期',
    mult: 4.4,
    desc: '炼化虚空，能提取自由灵子、结成灵子束与灵子对 —— 举手投足皆是天地之力。',
    // 化神可准备阵图、九转丹与灵器；不再同时收道论、法器等下级材料。
    cost: { spiritLiquid: 96000, arrayDiagram: 18, nineTurnPill: 60, spiritArtifact: 120 },
  },
  {
    name: '合体期',
    mult: 5.8,
    desc: '与道合真：肉身与天地灵能共振，人与宗门同呼吸。',
    // 沿用炼虚的四类准备并增加数量，不叠加新矿物和下级材料。
    cost: { spiritLiquid: 144000, arrayDiagram: 36, nineTurnPill: 120, spiritArtifact: 240 },
  },
  {
    name: '大乘期',
    mult: 7.5,
    desc: '灵子与灵能的运化之则已尽在掌中 —— 此界修行之极，再往前便是天。',
    // 合体可采聚仙灵力、固结阵印；由灵器与阵印承接器物和储灵合金准备。
    cost: { immortalForce: 6000, arrayDiagram: 52, spiritArtifact: 480, ascensionSeal: 600 },
  },
  {
    name: '渡劫期',
    mult: 10,
    desc: '体内正负失衡在即，天雷 —— 天地之力贯穿失衡之躯 —— 在头顶盘旋，只等一个正负归一、飞升而去的时机。',
    // 终局保留仙灵力、灵宝和阵印主账单，道论与灵机并入阵图；晶银回归合成和设施用途。
    cost: { immortalForce: 30000, arrayDiagram: 70, spiritTreasure: 360, ascensionSeal: 9000 },
  },
]

/**
 * 可「转世」的最低境界下标（化神期）。
 *
 * 轮回分层：转世（仙缘）是较早就能做、可反复做的一层，
 * 更高的飞升（道果）才是终极目标。所以门槛放在化神期 ——
 * 阶段耗时需随当前产业和机器人策略重新测量。
 */
export const REINCARNATE_REALM_INDEX = 6

/** 可飞升的最低境界下标（渡劫期） */
export const ASCEND_REALM_INDEX = REALMS.length - 1

export const MAX_REALM_INDEX = REALMS.length - 1

/** 风险按冲关前的境界划分，概率加成为百分点。 */
export const BREAKTHROUGH = {
  earlyChance: 0.95,
  goldenCoreChance: 0.70,
  lateBaseChances: { 8: 0.20, 9: 0.15, 10: 0.10 }, // 按目标境界：合体、大乘、渡劫
  tribulationRealm: 4,
  tribulationChance: 0.60,
  chanceDrop: 0.05,
  chanceCap: 0.99,
  // D7：后期三档的满配上限（基础 + 材料护道 + 应劫正愿 5 级）。
  lateChanceCaps: { 8: 0.70, 9: 0.65, 10: 0.60 },
  deathRealm: 4,
  regressionRealm: 7,
  deathChances: { 4: 0.01, 5: 0.02, 6: 0.03, 7: 0.10, 8: 0.15, 9: 0.20 }, // 按冲关前境界，失败后身死概率
  stockLoss: 0.02,
  productionLoss: 0.05,
  recoverySeconds: 120,
}

const aid = (name, cost, bonus, extra) => ({ name, cost, bonus, ...(extra || {}) })

/** 按目标境界配置，每组只收一种资源；ID带境界，旧勾选不会用于新境界。 */
export const BREAKTHROUGH_AIDS = Object.fromEntries(Object.entries({
  1: [
    aid('温养经脉', { qi: 80 }, 0.02),
    aid('凝神悟道', { insight: 20 }, 0.02),
    aid('香火祈愿', { faith: 20 }, 0.01),
  ],
  2: [
    aid('灵草洗髓', { herb: 60 }, 0.02),
    aid('灵气稳脉', { qi: 160 }, 0.02),
    aid('香火祈愿', { faith: 40 }, 0.02),
  ],
  3: [
    aid('丹药固基', { pill: 6 }, 0.02),
    aid('符箓镇脉', { talisman: 4 }, 0.02),
    aid('香火祈愿', { faith: 80 }, 0.03),
  ],
  4: [
    aid('仙草养丹', { immortalHerb: 3 }, 0.06),
    aid('法器护丹', { artifact: 6 }, 0.06),
    aid('香火祈愿', { faith: 120 }, 0.08),
  ],
  5: [
    aid('仙草护婴', { immortalHerb: 8 }, 0.08),
    aid('阵基镇劫', { arrayBase: 8 }, 0.10),
    aid('香火祈愿', { faith: 250 }, 0.07),
  ],
  6: [
    // 元婴～化神档由三品丹迁到二级丹「凝元丹」（见 docs/CRAFT-PROGRESSION.md#材料研究与兼容，最小自洽迁移）。
    aid('凝元养神', { condensePill: 10 }, 0.08),
    aid('灵符凝神', { spiritTalisman: 6 }, 0.10),
    aid('香火祈愿', { faith: 600 }, 0.07),
  ],
  7: [
    aid('九转护虚', { nineTurnPill: 3 }, 0.08),
    aid('灵器锚空', { spiritArtifact: 3 }, 0.11),
    aid('香火祈愿', { faith: 1200 }, 0.06),
  ],
  8: [
    aid('九转合真', { nineTurnPill: 4 }, 0.10),
    aid('灵器共鸣', { spiritArtifact: 4 }, 0.15),
    aid('香火祈愿', { faith: 2400 }, 0.10),
  ],
  9: [
    aid('九转归一', { nineTurnPill: 6 }, 0.10),
    aid('灵器护道', { spiritArtifact: 6 }, 0.12),
    aid('香火祈愿', { faith: 5000 }, 0.08),
  ],
  10: [
    aid('灵宝挡劫', { spiritTreasure: 3 }, 0.08),
    aid('阵印封雷', { ascensionSeal: 100 }, 0.11),
    // 「香火祈愿」升级为「立愿应劫」：渡劫唯一的香火护道，既提高成功率、又降低失败后身死概率（见 §2.3）。
    // id 仍为 10:2（数组下标不变），旧档勾选不失效。数额与 deathReduce 待校准。
    aid('立愿应劫', { faith: 20000 }, 0.06, { deathReduce: 0.10 }),
  ],
}).map(([realm, aids]) => [realm, aids.map((entry, index) => ({ ...entry, id: `${realm}:${index}` }))]))
