/**
 * 宗门外交 —— 数据（对标猫国外交：把过剩资源换成卡脖子的稀缺资源）。
 *
 * 首版三家宗门、固定汇率 + 机缘骰、主动交易、纯交换无纵深。
 * 交易不付冷却，改与猎杀共用「信符」（warrant）：每回互市消耗 50 枚，
 * 备猎与互市抢同一份凭信（来源：执符使岗位）。
 * 方案与决策见 docs/ROADMAP.md D6。
 */

/** 全局参数：信符为单一旋钮，后续按实测调整。 */
export const DIPLOMACY = {
  /** 每回互市消耗的信符（与猎杀出征共用同一资源，见 resources.js 的 warrant）。 */
  WARRANT_COST: 50,
  /** 机缘骰基础概率。 */
  FORTUNE_BASE: 0.08,
  /** 每座山门（启用中）加的概率。 */
  FORTUNE_PER_GATE: 0.01,
  /** 机缘概率上限。 */
  FORTUNE_CAP: 0.35,
  /** 机缘掉落按产能定价时，单次最多给仓储的份额（同事件奖励口径）。 */
  FORTUNE_STORAGE_SHARE: 0.2,
  /** 机缘产出按产能秒数定价的秒数。 */
  FORTUNE_RATE_SECONDS: 120,
  /** 开放境界：筑基起（3），与《山野猎法》看齐；实际还受《邻宗往来》研究与山门约束。 */
  MIN_REALM: 3,
}

export const DIPLOMACY_SECTS = [
  {
    id: 'herbValley',
    name: '药泉谷',
    glyph: '泉',
    desc: '谷中医药汤泉常年不冷，缺的是灵草入药。愿以灵石换灵草。',
    pays: { herb: 300 },
    gains: { stone: 25 },
    fortune: [
      { lootRate: { insight: 120 }, floor: { insight: 40 } },
      { loot: { immortalHerb: 2 } },
    ],
  },
  {
    id: 'ironMountain',
    name: '黑铁山',
    glyph: '铁',
    desc: '以矿立宗，炉火昼夜不熄，柴薪却年年见底。愿以灵石玄铁换灵木。',
    pays: { wood: 600 },
    gains: { stone: 30, ore: 20 },
    fortune: [
      { lootRate: { insight: 120 }, floor: { insight: 40 } },
      { loot: { steel: 2 } },
    ],
  },
  {
    id: 'sumeruTemple',
    name: '须弥寺',
    glyph: '寺',
    desc: '古刹香火鼎盛，收拢念力却少门路。愿以灵石换香火。',
    pays: { faith: 150 },
    gains: { stone: 20 },
    fortune: [
      { lootRate: { insight: 120 }, floor: { insight: 40 } },
      { loot: { spiritTalisman: 1 } },
    ],
  },
  {
    // 秘银的炼虚前唯一稳定来源：定价偏高，只换不回，防止用基础资源套利。
    id: 'silverGorge',
    name: '银溪谷',
    glyph: '银',
    desc: '谷中银脉丰而炉火弱，缺的是砌炉的灵石与锻炉的玄铁。愿以秘银换料。',
    pays: { ore: 500, stone: 300 },
    gains: { mithril: 3 },
    fortune: [
      { lootRate: { insight: 120 }, floor: { insight: 40 } },
      { loot: { mithril: 1 } },
    ],
  },
  {
    // 灵晶的少量补充渠道：定价刻意偏高且受信符限流，不能替代凝晶产线。
    id: 'starCliff',
    name: '星崖观',
    glyph: '星',
    desc: '观星炼晶，晶核成色极稳，却少灵机推演与香火定纹。愿以灵晶换道札与香火。',
    pays: { insight: 900, faith: 120 },
    gains: { crystal: 10 },
    fortune: [
      { lootRate: { insight: 120 }, floor: { insight: 40 } },
      { loot: { crystal: 5 } },
    ],
  },
]

export const DIPLOMACY_SECT_MAP = Object.fromEntries(DIPLOMACY_SECTS.map((s) => [s.id, s]))
