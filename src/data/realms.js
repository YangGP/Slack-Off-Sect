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
    cost: { insight: 160, qi: 2000, herb: 300, pill: 26, stone: 130 },
  },
  {
    name: '金丹期',
    mult: 2.0,
    desc: '一颗金丹吞入腹，始知我命不由天 —— 结丹高压之下，内观到正负灵荷一闪而逝，第一次「看见」灵气别有构造。',
    // 金丹是「炼体 → 造物」的分界：灵石退役，开始消耗玄铁、法器等工程件。
    // 灵液 / 灵晶要到元婴解锁凝液法、凝晶工艺后才可用，故金丹破境不含它们（避免死锁）。
    // 固定费用按该阶段可达仓储设定，不随玩家当前仓容上涨。
    cost: { insight: 350, qi: 5500, pill: 90, ore: 700, artifact: 70 },
  },
  {
    name: '元婴期',
    mult: 3,
    desc: '元婴出窍，神游百里而肉身不动 —— 神识所及，已能分辨并驱使正负灵子。',
    cost: { insight: 700, qi: 12000, pill: 150, ore: 1600, artifact: 130, steel: 15 },
  },
  {
    name: '化神期',
    mult: 5,
    desc: '神识与灵能场合一：灵子云与场线尽收眼底，山门内外如观掌纹。',
    cost: { insight: 1200, qi: 18000, spiritLiquid: 90, crystal: 35, pill: 260, ore: 3500, artifact: 220, steel: 20 },
  },
  {
    name: '炼虚期',
    mult: 8,
    desc: '炼化虚空，能提取自由灵子、结成灵子束与灵子对 —— 举手投足皆是天地之力。',
    cost: { insight: 2000, qi: 20000, spiritLiquid: 130, crystal: 55, pill: 450, ore: 7500, artifact: 380, steel: 30 },
  },
  {
    name: '合体期',
    mult: 14,
    desc: '与道合真：肉身与天地灵能场共振，人与宗门同呼吸。',
    cost: { insight: 3200, qi: 30000, spiritLiquid: 180, crystal: 80, pill: 750, ore: 16000, artifact: 650, steel: 50 },
  },
  {
    name: '大乘期',
    mult: 24,
    desc: '灵子与灵能场的统一规律已尽在掌中 —— 此界修行之极，再往前便是天。',
    cost: {
      insight: 5000,
      qi: 38000,
      spiritLiquid: 250,
      crystal: 120,
      pill: 1200,
      ore: 34000,
      artifact: 1000,
      steel: 80,
      // 合体已能参悟灵子论并建分灵阵：先掌握离析，再进大乘。
      qiParticle: 20,
    },
  },
  {
    name: '渡劫期',
    mult: 40,
    desc: '体内正负失衡在即，天雷 —— 天地正灵子的极化打击 —— 在头顶盘旋，只等一个正负归一、飞升而去的时机。',
    cost: {
      insight: 8000,
      qi: 45000,
      spiritLiquid: 320,
      crystal: 170,
      pill: 1900,
      ore: 70000,
      artifact: 1400,
      steel: 120,
      // 偏极与湮灭均在大乘开放；飞升前必须实际运转整条产业链。
      yangParticle: 5,
      yinParticle: 5,
      qiEnergy: 15,
    },
  },
]

/**
 * 可「转世」的最低境界下标（化神期）。
 *
 * 参考猫国的分层：重置（领导力）是早期就能做、可反复做的一层，
 * 更高的飞升（道果）才是终极目标。所以门槛放在化神期 ——
 * 参照玩家约 16 小时到，正好是「一天一轮」的节奏（见 docs/EARLY-GAME.md）。
 */
export const REINCARNATE_REALM_INDEX = 6

/** 可飞升的最低境界下标（渡劫期） */
export const ASCEND_REALM_INDEX = REALMS.length - 1

export const MAX_REALM_INDEX = REALMS.length - 1
