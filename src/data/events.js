/**
 * 随机奇遇 / 天象（对应猫国里的随机事件与天灾）。
 *
 * **三类**（`type` 字段）：
 *   nature  自然环境类 —— 主要影响**全局产出**，有正有负，持续一段时间（`buff`）
 *   sudden  突发事件类 —— 立刻结算：发现遗迹资源 / 顿悟得感悟 / 丢失物资（`lootRate` / `disaster` / `recruit`）
 *   choice  选择类     —— 停下来让玩家选一个：**有所得，也要接受另一面的代价**（收益 > 代价）
 *
 * `kind` 保留作"色调"（good / bad），界面据此上色；`type` 决定机制。
 *
 * 事件只做"声明"，效果由 engine 解释执行：
 *   buff      临时增益（全局或指定资源），可叠加，取总和
 *   lootRate  按"当前每秒产出的多少秒"发放资源，同时给出保底值
 *   disaster  按比例掠夺资源，受 disasterGuard 减免，并记入 stats.disasters
 *   recruit   白捡一名弟子（不超过上限）
 *
 * 选择类的 `options[].effect` 就是一份**小事件声明** —— 上面四种机制原样复用。
 */
export const EVENTS = [
  // ============================================================
  // 自然环境类：主要影响全局产出
  // ============================================================
  {
    id: 'spiritRain',
    type: 'nature',
    name: '灵雨润泽',
    weight: 12,
    kind: 'good',
    text: '一场灵雨落下，草木疯长，全宗吐纳效率大增。',
    buff: { id: 'spiritRain', name: '灵雨润泽', mult: 0.35, duration: 120 },
  },
  {
    id: 'springThunder',
    type: 'nature',
    name: '春雷惊蛰',
    weight: 10,
    kind: 'good',
    text: '第一声春雷滚过山脊，蛰伏的灵机一齐醒了。',
    buff: { id: 'springThunder', name: '春雷惊蛰', mult: 0.25, duration: 240 },
  },
  {
    id: 'purpleQi',
    type: 'nature',
    name: '紫气东来',
    weight: 6,
    kind: 'good',
    minRealm: 5,
    text: '东方紫气三千里，山门一整天都浸在道韵里。',
    buff: { id: 'purpleQi', name: '紫气东来', mult: 0.8, duration: 150 },
  },
  {
    id: 'ancestorBless',
    type: 'nature',
    name: '祖师显灵',
    weight: 8,
    kind: 'good',
    minRealm: 2,
    text: '祖师殿香烟忽然笔直冲天，弟子们心念通明。',
    buff: { id: 'ancestorBless', name: '祖师显灵', mult: 0.6, duration: 90, target: 'insight' },
  },
  {
    id: 'heavenGate',
    type: 'nature',
    name: '天门一线',
    weight: 4,
    kind: 'good',
    minRealm: 8,
    text: '云层裂开一线金光，全宗弟子一夜之间都长了几分道行。',
    buff: { id: 'heavenGate', name: '天门一线', mult: 1.2, duration: 180 },
  },
  {
    id: 'coldWave',
    type: 'nature',
    name: '寒潮',
    weight: 8,
    kind: 'bad',
    text: '寒潮过境，弟子缩在屋里不肯干活。',
    buff: { id: 'coldWave', name: '寒潮', mult: -0.3, duration: 120 },
  },
  {
    id: 'drought',
    type: 'nature',
    name: '旱魃过境',
    weight: 6,
    kind: 'bad',
    minRealm: 1,
    text: '赤地千里，药圃蔫了半畦，连泉水都少了几分灵气。',
    buff: { id: 'drought', name: '旱魃过境', mult: -0.25, duration: 180 },
  },
  {
    id: 'earthTremor',
    type: 'nature',
    name: '地脉微震',
    weight: 5,
    kind: 'bad',
    minRealm: 3,
    text: '地脉轻轻一颤，几处阵法失了准头，产出一时滞涩。',
    buff: { id: 'earthTremor', name: '地脉微震', mult: -0.15, duration: 90 },
  },

  // ============================================================
  // 突发事件类：立刻结算
  // ============================================================
  {
    id: 'pilgrims',
    type: 'sudden',
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
    type: 'sudden',
    name: '游方散修',
    weight: 9,
    kind: 'good',
    text: '一名游方散修路过山门，觉得此处伙食不错，便留下了。',
    recruit: 1,
  },
  {
    id: 'veinSurge',
    type: 'sudden',
    name: '灵脉潮涌',
    weight: 6,
    kind: 'good',
    text: '地下灵脉翻涌，灵气几乎自己往库里钻。',
    lootRate: { qi: 120, stone: 40 },
    floor: { qi: 120, stone: 4 },
  },
  {
    id: 'insightFlash',
    type: 'sudden',
    name: '顿悟',
    weight: 7,
    kind: 'good',
    text: '一名弟子劈柴时忽然愣住，回过神来已悟了一层道理。',
    lootRate: { insight: 150 },
    floor: { insight: 15 },
  },
  {
    id: 'ruinsFound',
    type: 'sudden',
    name: '遗迹现世',
    weight: 5,
    kind: 'good',
    minRealm: 4,
    text: '山腹塌了一角，露出前朝洞府的残门 —— 里面还留着几件东西。',
    lootRate: { artifact: 30, talisman: 60, stone: 200 },
    floor: { artifact: 2, talisman: 4, stone: 60 },
  },
  {
    id: 'scrapScroll',
    type: 'sudden',
    name: '拾得残卷',
    weight: 9,
    kind: 'good',
    minRealm: 2,
    text: '溪边漂来半卷残书，字迹模糊，偏偏那几行正是要害。',
    lootRate: { insight: 60 },
    floor: { insight: 40 },
  },
  {
    id: 'goodHarvest',
    type: 'sudden',
    name: '丰年',
    weight: 9,
    kind: 'good',
    text: '药圃丰年，灵草与灵木都收了个满仓。',
    lootRate: { herb: 100, wood: 100 },
    floor: { herb: 20, wood: 20 },
  },
  {
    id: 'guestSect',
    type: 'sudden',
    name: '道友来访',
    weight: 8,
    kind: 'good',
    minRealm: 4,
    text: '邻宗道友来访，以法器换了些灵草，走时还留了份薄礼。',
    lootRate: { artifact: 20, insight: 60 },
    floor: { artifact: 1, insight: 30 },
  },
  {
    id: 'beastRaid',
    type: 'sudden',
    name: '妖兽侵袭',
    weight: 14,
    kind: 'bad',
    text: '山中妖兽下山劫掠，木料矿材被拖走不少。',
    disaster: { resources: ['wood', 'ore', 'herb'], lossPercent: [0.06, 0.14] },
  },
  {
    id: 'qiTide',
    type: 'sudden',
    name: '灵潮倒卷',
    weight: 8,
    kind: 'bad',
    minRealm: 2,
    text: '灵潮倒卷，库中灵气被冲散了一部分。',
    disaster: { resources: ['qi', 'stone'], lossPercent: [0.05, 0.12] },
  },
  {
    id: 'furnaceFail',
    type: 'sudden',
    name: '丹炉炸炉',
    weight: 7,
    kind: 'bad',
    minRealm: 3,
    text: '丹炉火候失控，炸了半炉丹药。',
    disaster: { resources: ['pill'], lossPercent: [0.1, 0.25] },
  },
  {
    id: 'mountainFlood',
    type: 'sudden',
    name: '山洪',
    weight: 6,
    kind: 'bad',
    minRealm: 2,
    text: '夜雨成洪，冲垮了半条栈道，板材与木料随水而去。',
    disaster: { resources: ['wood', 'plank'], lossPercent: [0.08, 0.16] },
  },

  // ============================================================
  // 选择类：选一个，另一个的代价也要接受（收益 > 代价）
  // ============================================================
  {
    id: 'ancientCave',
    type: 'choice',
    name: '荒山古洞',
    weight: 7,
    kind: 'event',
    minRealm: 3,
    text: '弟子在后山发现一处古洞，洞口符纹尚新，里头不知深浅。',
    options: [
      {
        label: '举宗探洞',
        desc: '洞中石窟颇丰：得法器与感悟；但惊动守洞之物，折损一批灵木。',
        effect: {
          lootRate: { artifact: 24, insight: 900 },
          floor: { artifact: 2, insight: 200 },
          disaster: { resources: ['wood'], lossPercent: [0.12, 0.12] },
        },
      },
      {
        label: '封洞不启',
        desc: '稳妥收场：只在洞口外围采得灵草；为安抚人心，耗去一些香火。',
        effect: { lootRate: { herb: 260 }, floor: { herb: 260 }, costShare: { faith: 0.15 } },
      },
    ],
  },
  {
    id: 'rogueJoins',
    type: 'choice',
    name: '散修投奔',
    weight: 8,
    kind: 'event',
    minRealm: 2,
    text: '一名化神散修在山门外立了三日，说愿入宗为客卿。',
    options: [
      {
        label: '收为客卿',
        desc: '白得一位好手（弟子 +1）；但客卿嘴刁，要耗一批丹药。',
        effect: { recruit: 1, lootRate: { insight: 200 }, floor: { insight: 80 }, costShare: { pill: 0.15 } },
      },
      {
        label: '婉言谢过',
        desc: '不留人，只求他讲一段见闻：得感悟；临别赠灵石作路费。',
        effect: { lootRate: { insight: 400 }, floor: { insight: 400 }, costShare: { stone: 0.08 } },
      },
    ],
  },
  {
    id: 'veinStir',
    type: 'choice',
    name: '灵脉异动',
    weight: 6,
    kind: 'event',
    minRealm: 5,
    text: '地底灵脉忽然躁动，像是被什么牵住了脉头。',
    options: [
      {
        label: '强行引脉',
        desc: '灵气暴涨一大截；但引脉要垫灵石，且震塌了几处仓房。',
        effect: {
          lootRate: { qi: 600 },
          floor: { qi: 2000 },
          disaster: { resources: ['stone'], lossPercent: [0.15, 0.15] },
        },
      },
      {
        label: '稳守阵眼',
        desc: '不急这一时：灵木与灵草受地气滋养而丰；但灵气被压回地底。',
        effect: {
          lootRate: { wood: 300, herb: 200 },
          floor: { wood: 200, herb: 80 },
          disaster: { resources: ['qi'], lossPercent: [0.1, 0.1] },
        },
      },
    ],
  },
  {
    id: 'stoneStele',
    type: 'choice',
    name: '古碑残文',
    weight: 7,
    kind: 'event',
    minRealm: 4,
    text: '溪底冲出一块古碑，残文只剩三行，却隐隐是上古阵法。',
    options: [
      {
        label: '闭门参悟',
        desc: '大有领悟（感悟 +大）；但参悟时耗掉一批符箓试阵。',
        effect: {
          lootRate: { insight: 1200 },
          floor: { insight: 400 },
          disaster: { resources: ['talisman'], lossPercent: [0.2, 0.2] },
        },
      },
      {
        label: '拓印存录',
        desc: '把碑文拓下藏进经阁：得符箓与木板；但拓印要耗感悟。',
        effect: { lootRate: { talisman: 20, plank: 6 }, floor: { talisman: 6, plank: 3 }, costShare: { insight: 0.06 } },
      },
    ],
  },
  {
    id: 'beastCub',
    type: 'choice',
    name: '灵兽幼崽',
    weight: 6,
    kind: 'event',
    minRealm: 6,
    text: '灵兽园外卧着一只受伤的幼兽，见了人也不躲。',
    options: [
      {
        label: '带回医治',
        desc: '幼兽康复后替宗门采药：灵草 +大；但疗伤耗去一批丹药。',
        effect: { lootRate: { herb: 500 }, floor: { herb: 500 }, costShare: { pill: 0.2 } },
      },
      {
        label: '放归山林',
        desc: '不强留：幼兽衔来一株老药作谢（灵草 +小、感悟 +）；但它踏坏了半畦药圃。',
        effect: {
          lootRate: { herb: 60, insight: 300 },
          floor: { herb: 20, insight: 100 },
          disaster: { resources: ['herb'], lossPercent: [0.1, 0.1] },
        },
      },
    ],
  },
  {
    id: 'caravan',
    type: 'choice',
    name: '商队过境',
    weight: 7,
    kind: 'event',
    minRealm: 4,
    text: '一支西行商队在山下歇脚，车上堆着玄铁与灵石。',
    options: [
      {
        label: '以药换铁',
        desc: '换得玄铁与灵石；但灵草被换走一大半。',
        effect: {
          lootRate: { ore: 400, stone: 300 },
          floor: { ore: 100, stone: 80 },
          disaster: { resources: ['herb'], lossPercent: [0.15, 0.15] },
        },
      },
      {
        label: '设卡征税',
        desc: '抽一笔香火与灵石作过路钱；但商队从此绕道，宗门名声受损（灵石小损）。',
        effect: { lootRate: { faith: 900 }, floor: { faith: 300 }, disaster: { resources: ['stone'], lossPercent: [0.05, 0.05] } },
      },
    ],
  },
  {
    id: 'grottoRift',
    type: 'choice',
    name: '洞天裂隙',
    weight: 5,
    kind: 'event',
    minRealm: 8,
    text: '洞天深处裂开一道细缝，缝里透出的气息，既像宝物也像凶险。',
    options: [
      {
        label: '探入裂隙',
        desc: '取得灵器与九转丹这样的好东西；但裂隙反噬，毁掉一批法器。',
        effect: {
          lootRate: { spiritArtifact: 3, nineTurnPill: 4 },
          floor: { spiritArtifact: 1, nineTurnPill: 1 },
          disaster: { resources: ['artifact'], lossPercent: [0.25, 0.25] },
        },
      },
      {
        label: '封缝镇石',
        desc: '用灵符与香火把缝封死：得一批灵符；但香火耗去不少。',
        effect: { lootRate: { spiritTalisman: 6 }, floor: { spiritTalisman: 2 }, disaster: { resources: ['faith'], lossPercent: [0.2, 0.2] } },
      },
    ],
  },
  {
    id: 'thunderTemper',
    type: 'choice',
    name: '以身试劫',
    weight: 6,
    kind: 'event',
    minRealm: 7,
    text: '炼虚之后肉身如虚，长老提议：趁雷雨引一道真雷淬体，成了脱胎换骨，败了也要伤元气。',
    options: [
      {
        label: '引雷淬体',
        desc: '得大量感悟与法器；但淬体要烧丹药补损，香火也要散出去安抚人心。',
        effect: {
          lootRate: { insight: 3000, artifact: 120 },
          floor: { insight: 1500, artifact: 20 },
          costShare: { pill: 0.25, faith: 0.15 },
        },
      },
      {
        label: '稳守不出',
        desc: '不冒这个险：只借着雷气收一批灵草与玄铁；但雷云压境，损耗些灵木。',
        effect: {
          lootRate: { herb: 1200, ore: 900 },
          floor: { herb: 400, ore: 300 },
          disaster: { resources: ['wood'], lossPercent: [0.15, 0.15] },
        },
      },
    ],
  },
  {
    id: 'veinContest',
    type: 'choice',
    name: '夺脉之争',
    weight: 6,
    kind: 'event',
    minRealm: 7,
    text: '邻宗把界碑又往东挪了三里 —— 那边压着一条上好的灵脉。',
    options: [
      {
        label: '据理力争',
        desc: '争回灵脉：灵气与灵石大进；但两家撕破脸，灵木与灵草在争执中被毁去不少。',
        effect: {
          lootRate: { qi: 4000, stone: 1500 },
          floor: { qi: 8000, stone: 400 },
          costShare: { wood: 0.25, herb: 0.25 },
        },
      },
      {
        label: '退让换和',
        desc: '让出三里，换邻宗一批法器与香火；但弟子们心里憋屈（感悟小损）。',
        effect: {
          lootRate: { artifact: 100, faith: 2500 },
          floor: { artifact: 20, faith: 800 },
          disaster: { resources: ['insight'], lossPercent: [0.12, 0.12] },
        },
      },
    ],
  },
  {
    id: 'ancientBattlefield',
    type: 'choice',
    name: '古战场残阵',
    weight: 5,
    kind: 'event',
    minRealm: 8,
    text: '西陲荒漠里翻出一片上古镇场，残阵还在缓缓转动，阵眼里嵌着未熄的器胚。',
    options: [
      {
        label: '拆阵取材',
        desc: '取回灵器与玄钢；但拆阵要用法器试阵，符箓也烧掉一批。',
        effect: {
          lootRate: { spiritArtifact: 12, steel: 400 },
          floor: { spiritArtifact: 3, steel: 80 },
          costShare: { artifact: 0.3, talisman: 0.2 },
        },
      },
      {
        label: '原地封存',
        desc: '不拆，只把阵纹拓回经阁：得大量感悟与符箓；但拓印耗去不少丹药。',
        effect: {
          lootRate: { insight: 6000, talisman: 200 },
          floor: { insight: 3000, talisman: 30 },
          costShare: { pill: 0.2 },
        },
      },
    ],
  },
  {
    id: 'coldPool',
    type: 'choice',
    name: '万载寒潭',
    weight: 5,
    kind: 'event',
    minRealm: 8,
    text: '后山寒潭千年不冻，潭底沉着几枚寒玉 —— 也沉着不知名的东西。',
    options: [
      {
        label: '潜潭取玉',
        desc: '寒玉入炉，炼出九转丹与仙草；但潭水蚀骨，丹药与灵草都折损。',
        effect: {
          lootRate: { nineTurnPill: 20, immortalHerb: 300 },
          floor: { nineTurnPill: 4, immortalHerb: 80 },
          costShare: { pill: 0.25, herb: 0.2 },
        },
      },
      {
        label: '引水入圃',
        desc: '把寒潭水引进药圃：灵草与灵木疯长；但寒气伤了弟子心神（感悟小损）。',
        effect: {
          lootRate: { herb: 2000, wood: 2500 },
          floor: { herb: 600, wood: 800 },
          disaster: { resources: ['insight'], lossPercent: [0.1, 0.1] },
        },
      },
    ],
  },
  {
    id: 'treasureWager',
    type: 'choice',
    name: '以灵宝为注',
    weight: 4,
    kind: 'event',
    minRealm: 9,
    text: '一位域外修士登门，取出一枚封着雷光的珠子，说想赌一场 —— 赌注是灵宝。',
    options: [
      {
        label: '接下这一局',
        desc: '赢得灵宝与一炉湮灭灵能（灵能会逸散，转瞬即逝）；但押上的灵器与九转丹若输了就没了。',
        effect: {
          lootRate: { spiritTreasure: 4, qiEnergy: 300 },
          floor: { spiritTreasure: 1, qiEnergy: 60 },
          costShare: { spiritArtifact: 0.3, nineTurnPill: 0.3 },
        },
      },
      {
        label: '婉拒此局',
        desc: '不赌：只与他对坐论道，得大量感悟；临别以符箓相赠。',
        effect: {
          lootRate: { insight: 12000 },
          floor: { insight: 6000 },
          costShare: { spiritTalisman: 0.2 },
        },
      },
    ],
  },
  {
    id: 'tribulationTrial',
    type: 'choice',
    name: '天劫预演',
    weight: 4,
    kind: 'event',
    minRealm: 10,
    text: '渡劫在即。长老们布下一座小雷池，说可以先把天劫"试"一次 —— 只是试劫也要付代价。',
    options: [
      {
        label: '入池试劫',
        desc: '提前尝过天威：感悟暴涨、香火大盛；但雷池一开，灵石与符箓都要垫进去。',
        effect: {
          lootRate: { insight: 20000, faith: 6000 },
          floor: { insight: 10000, faith: 2000 },
          costShare: { stone: 0.3, spiritTalisman: 0.25 },
        },
      },
      {
        label: '散功固本',
        desc: '不试劫，把一身修为压实：得大量法器与灵器；但丹药与灵草在固本中耗去不少。',
        effect: {
          lootRate: { artifact: 300, spiritArtifact: 20 },
          floor: { artifact: 60, spiritArtifact: 5 },
          costShare: { pill: 0.3, herb: 0.25 },
        },
      },
    ],
  },

]

export const EVENT_MAP = Object.fromEntries(EVENTS.map((e) => [e.id, e]))

/** 三类事件的展示名与说明（界面与文档共用一份口径） */
export const EVENT_TYPES = [
  { id: 'nature', name: '自然环境', hint: '天时地气，主要影响全局产出，有正有负' },
  { id: 'sudden', name: '突发事件', hint: '立刻结算：发现遗迹资源、顿悟得感悟，也可能丢失物资' },
  { id: 'choice', name: '选择', hint: '选一个：有所得，也要接受另一面的代价' },

]

