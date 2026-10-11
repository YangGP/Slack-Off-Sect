/**
 * 境界（宗门修为主线）。每次破境消耗资源，永久提升全局产出。
 * 突破到最后一境（渡劫期）之后即可飞升。
 *
 * 各境描述同时记载修士对灵子的认知阶梯（见 docs/SPIRIT-ENERGY.md）：
 * 只知灵气 → 灵子假说 → 金丹内观首证 → 元婴驱使 → 化神见场 → 炼虚取自由灵子。
 */
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
    cost: { insight: 80, qi: 700, herb: 140 },
  },
  {
    name: '筑基期',
    mult: 1.6,
    desc: '道基既立，内视经脉：灵压、灵流、灵阻皆可感。已有人猜想「气」里有更细之物，却拿不出凭据。',
    // 炼气已可炼丹；筑基、金丹、元婴沿用丹药，只递增需求。
    cost: { insight: 160, qi: 2000, pill: 26, herb: 300, stone: 130 },
  },
  {
    name: '金丹期',
    mult: 2.0,
    desc: '一颗金丹吞入腹，始知我命不由天 —— 结丹高压之下，内观到正负灵荷一闪而逝，第一次「看见」灵气别有构造。',
    // 丹药仍是主材料，灵石与符箓作为稳定气机的辅助材料。
    cost: { insight: 350, qi: 5500, pill: 90, stone: 500, talisman: 30 },
  },
  {
    name: '元婴期',
    mult: 2.6,
    desc: '元婴出窍，神游百里而肉身不动 —— 神识所及，已能分辨并驱使正负灵子。',
    cost: { insight: 700, qi: 12000, pill: 180, stone: 1200, talisman: 80 },
  },
  {
    name: '化神期',
    mult: 3.4,
    desc: '神识与灵能场合一：灵子云与场线尽收眼底，山门内外如观掌纹。',
    // 灵晶在元婴开放，先掌握凝聚产业再化神；三境使用同一组材料。
    cost: { insight: 1200, qi: 18000, spiritLiquid: 90, crystal: 35, artifact: 80, arrayBase: 10 },
  },
  {
    name: '炼虚期',
    mult: 4.4,
    desc: '炼化虚空，能提取自由灵子、结成灵子束与灵子对 —— 举手投足皆是天地之力。',
    cost: { insight: 2000, qi: 20000, spiritLiquid: 180, crystal: 100, artifact: 160, arrayBase: 20 },
  },
  {
    name: '合体期',
    mult: 5.8,
    desc: '与道合真：肉身与天地灵能场共振，人与宗门同呼吸。',
    cost: { insight: 3200, qi: 30000, spiritLiquid: 360, crystal: 280, artifact: 320, arrayBase: 40 },
  },
  {
    name: '大乘期',
    mult: 7.5,
    desc: '灵子与灵能场的统一规律已尽在掌中 —— 此界修行之极，再往前便是天。',
    cost: {
      insight: 5000,
      qi: 38000,
      // 合体已能参悟灵子论并建分灵阵：先掌握离析，再进大乘。
      qiParticle: 120,
      // 化神已能铸灵器，合体已能炼玄金；同时验证器物与储灵合金的准备。
      spiritArtifact: 24,
      arcaneGold: 20,
    },
  },
  {
    name: '渡劫期',
    mult: 10,
    desc: '体内正负失衡在即，天雷 —— 天地正灵子的极化打击 —— 在头顶盘旋，只等一个正负归一、飞升而去的时机。',
    cost: {
      insight: 8000,
      qi: 45000,
      // 稳定阵印为主，灵宝与晶银辅助；不额外要求囤积会逸散的灵能。
      ascensionSeal: 300,
      spiritTreasure: 12,
      crystalSilver: 40,
    },
  },
]

/**
 * 可「转世」的最低境界下标（化神期）。
 *
 * 参考猫国的分层：重置（领导力）是早期就能做、可反复做的一层，
 * 更高的飞升（道果）才是终极目标。所以门槛放在化神期 ——
 * 阶段耗时需随产业和机器人策略重新测量，历史结果见 docs/BALANCE.md。
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
  deathRealm: 7,
  deathChance: 0.10,
  deathChanceStep: 0.05,
  stockLoss: 0.02,
  productionLoss: 0.05,
  recoverySeconds: 120,
}

const aid = (name, cost, bonus) => ({ name, cost, bonus })

/** 按目标境界配置。复合方案必须整组支付；ID带境界，旧勾选不会用于新境界。 */
export const BREAKTHROUGH_AIDS = Object.fromEntries(Object.entries({
  1: [
    aid('温养经脉', { qi: 80 }, 0.02),
    aid('灵木引气', { wood: 20 }, 0.02),
    aid('香火祈愿', { faith: 20 }, 0.01),
  ],
  2: [
    aid('灵草洗髓', { herb: 60 }, 0.02),
    aid('灵石稳气', { stone: 20 }, 0.02),
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
    aid('符阵镇劫', { arrayBase: 4, talisman: 20 }, 0.10),
    aid('香火祈愿', { faith: 250 }, 0.07),
  ],
  6: [
    aid('九转养神', { nineTurnPill: 1 }, 0.08),
    aid('晶符凝神', { crystal: 12, spiritTalisman: 4 }, 0.10),
    aid('香火祈愿', { faith: 600 }, 0.07),
  ],
  7: [
    aid('丹草护虚', { nineTurnPill: 2, immortalHerb: 12 }, 0.08),
    aid('灵器锚空', { spiritArtifact: 2, spiritTalisman: 8 }, 0.11),
    aid('香火祈愿', { faith: 1200 }, 0.06),
  ],
  8: [
    aid('九转合真', { nineTurnPill: 4 }, 0.16),
    aid('银器共鸣', { mithril: 12, spiritArtifact: 3 }, 0.24),
    aid('香火祈愿', { faith: 2400 }, 0.10),
  ],
  9: [
    aid('灵子归一', { qiParticle: 40, crystal: 20 }, 0.16),
    aid('玄金护道', { arcaneGold: 8, spiritArtifact: 4 }, 0.26),
    aid('香火祈愿', { faith: 5000 }, 0.08),
  ],
  10: [
    aid('灵宝挡劫', { spiritTreasure: 2, nineTurnPill: 8 }, 0.16),
    aid('阵印封雷', { ascensionSeal: 60, crystalSilver: 12 }, 0.28),
    aid('香火祈愿', { faith: 10000 }, 0.06),
  ],
}).map(([realm, aids]) => [realm, aids.map((entry, index) => ({ ...entry, id: `${realm}:${index}` }))]))
