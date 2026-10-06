/**
 * 境界（宗门修为主线）。每次破境消耗资源，永久提升全局产出。
 * 突破到最后一境（渡劫期）之后即可飞升。
 */
export const REALMS = [
  { name: '凡体', mult: 1.0, desc: '尚未引气入体，与山下凡人无异。', cost: null },
  {
    name: '引气入体',
    mult: 1.15,
    desc: '第一次感到灵气顺着经络游走。',
    cost: { insight: 50, stone: 12 },
  },
  {
    name: '炼气期',
    mult: 1.35,
    desc: '灵气在丹田聚成一小团，勉强算入了门。',
    cost: { insight: 180, stone: 48, herb: 60 },
  },
  {
    name: '筑基期',
    mult: 1.6,
    desc: '道基既立，从此修行如筑屋有地基。',
    cost: { insight: 500, stone: 180, pill: 5 },
  },
  {
    name: '金丹期',
    mult: 2.0,
    desc: '一颗金丹吞入腹，始知我命不由天。',
    cost: { insight: 1500, stone: 540, pill: 18, artifact: 2 },
  },
  {
    name: '元婴期',
    mult: 2.6,
    desc: '元婴出窍，神游百里而肉身不动。',
    cost: { insight: 4000, stone: 1500, pill: 45, artifact: 8, talisman: 20 },
  },
  {
    name: '化神期',
    mult: 3.5,
    desc: '神识如网，覆盖整座山门。',
    cost: { insight: 8000, stone: 3600, pill: 90, artifact: 20, talisman: 50 },
  },
  {
    name: '炼虚期',
    mult: 5.0,
    desc: '炼化虚空，举手投足皆是天地之力。',
    cost: { insight: 12000, stone: 8400, pill: 160, artifact: 40, talisman: 90 },
  },
  {
    name: '合体期',
    mult: 7.5,
    desc: '与道合真，人与宗门同呼吸。',
    cost: { insight: 30000, stone: 21000, pill: 260, artifact: 70, talisman: 150, faith: 3000 },
  },
  {
    name: '大乘期',
    mult: 12,
    desc: '此界修行之极，再往前便是天。',
    cost: { insight: 80000, stone: 54000, pill: 400, artifact: 110, talisman: 240, faith: 9000 },
  },
  {
    name: '渡劫期',
    mult: 20,
    desc: '天雷在头顶盘旋，只等一个飞升的时机。',
    cost: {
      insight: 200000,
      stone: 150000,
      pill: 600,
      artifact: 180,
      talisman: 400,
      faith: 25000,
    },
  },
]

/** 可飞升的最低境界下标（渡劫期） */
export const ASCEND_REALM_INDEX = REALMS.length - 1

export const MAX_REALM_INDEX = REALMS.length - 1
