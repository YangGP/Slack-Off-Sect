/**
 * 随机奇遇 / 天象（对应猫国里的随机事件与天灾）。
 * 事件只做“声明”，真正的效果由 engine 解释执行：
 *   buff      临时增益（全局或指定资源），可叠加，取总和
 *   lootRate  按“当前每秒产出的多少秒”发放资源，同时给出保底值
 *   disaster  按比例掠夺资源，受 disasterGuard 减免，并记入 stats.disasters
 *   recruit   白捡一名弟子（不超过上限）
 */
export const EVENTS = [
  {
    id: 'spiritRain',
    name: '灵雨润泽',
    weight: 12,
    kind: 'good',
    text: '一场灵雨落下，草木疯长，全宗吐纳效率大增。',
    buff: { id: 'spiritRain', name: '灵雨润泽', mult: 0.35, duration: 120 },
  },
  {
    id: 'ancestorBless',
    name: '祖师显灵',
    weight: 8,
    kind: 'good',
    minRealm: 2,
    text: '祖师殿香烟忽然笔直冲天，弟子们心念通明。',
    buff: { id: 'ancestorBless', name: '祖师显灵', mult: 0.6, duration: 90, target: 'insight' },
  },
  {
    id: 'pilgrims',
    name: '香客云集',
    weight: 10,
    kind: 'good',
    minRealm: 1,
    text: '山下庙会，香客挤满石阶，香油钱收了一箩筐。',
    lootRate: { faith: 90 },
    floor: { faith: 30 },
  },
  {
    id: 'wanderer',
    name: '游方散修',
    weight: 9,
    kind: 'good',
    text: '一名游方散修路过山门，觉得此处伙食不错，便留下了。',
    recruit: 1,
  },
  {
    id: 'veinSurge',
    name: '灵脉潮涌',
    weight: 6,
    kind: 'good',
    text: '地下灵脉翻涌，灵气几乎自己往库里钻。',
    lootRate: { qi: 120, stone: 40 },
    floor: { qi: 120, stone: 4 },
  },
  {
    id: 'insightFlash',
    name: '顿悟',
    weight: 7,
    kind: 'good',
    text: '一名弟子劈柴时忽然愣住，回过神来已悟了一层道理。',
    lootRate: { insight: 150 },
    floor: { insight: 15 },
  },
  {
    id: 'beastRaid',
    name: '妖兽侵袭',
    weight: 14,
    kind: 'bad',
    text: '山中妖兽下山劫掠，木料矿材被拖走不少。',
    disaster: { resources: ['wood', 'ore', 'herb'], lossPercent: [0.06, 0.14] },
  },
  {
    id: 'qiTide',
    name: '灵潮倒卷',
    weight: 8,
    kind: 'bad',
    minRealm: 2,
    text: '灵潮倒卷，库中灵气被冲散了一部分。',
    disaster: { resources: ['qi', 'stone'], lossPercent: [0.05, 0.12] },
  },
  {
    id: 'furnaceFail',
    name: '丹炉炸炉',
    weight: 7,
    kind: 'bad',
    minRealm: 3,
    text: '丹炉火候失控，炸了半炉丹药。',
    disaster: { resources: ['pill'], lossPercent: [0.1, 0.25] },
  },
  {
    id: 'guestSect',
    name: '道友来访',
    weight: 8,
    kind: 'good',
    minRealm: 4,
    text: '邻宗道友来访，以法器换了些灵草，走时还留了份薄礼。',
    lootRate: { artifact: 20, insight: 60 },
    floor: { artifact: 1, insight: 30 },
  },
  {
    id: 'coldWave',
    name: '寒潮',
    weight: 6,
    kind: 'bad',
    text: '寒潮过境，弟子缩在屋里不肯干活。',
    buff: { id: 'coldWave', name: '寒潮', mult: -0.3, duration: 120 },
  },
  {
    id: 'goodHarvest',
    name: '丰年',
    weight: 9,
    kind: 'good',
    text: '药圃丰年，灵草与灵木都收了个满仓。',
    lootRate: { herb: 100, wood: 100 },
    floor: { herb: 20, wood: 20 },
  },
  {
    id: 'heavenGate',
    name: '天门一线',
    weight: 4,
    kind: 'event',
    minRealm: 8,
    text: '云层裂开一线金光，全宗弟子一夜之间都长了几分道行。',
    buff: { id: 'heavenGate', name: '天门一线', mult: 1.2, duration: 180 },
  },
]

export const EVENT_MAP = Object.fromEntries(EVENTS.map((e) => [e.id, e]))
