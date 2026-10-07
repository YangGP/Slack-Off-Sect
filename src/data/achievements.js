/**
 * 成就。达成后永久生效（飞升也不清空），每条成就默认提供 +2% 全局产出。
 * check(state) 返回 true 即达成，engine 每帧检查一次。
 */
/**
 * 每条成就的全局产出加成。
 *
 * **2026 暂定为 0**：成就的奖励要重新设计（改成"给规则 / 给解锁"而不是单纯加数字），
 * 在那之前先不提供全局加成 —— 所以这里留成旋钮而不是删掉逻辑，
 * 重新设计时改这一个数就能恢复（引擎与界面都会跟着走）。
 */
export const ACHIEVEMENT_REWARD = 0

export const ACHIEVEMENTS = [
  {
    id: 'firstHut',
    name: '立锥之地',
    glyph: '锥',
    desc: '建成第一间茅屋。',
    check: (s) => (s.buildings.hut?.count ?? 0) >= 1,
  },
  {
    id: 'hutTen',
    name: '茅屋十间',
    glyph: '屋',
    desc: '建成 10 间茅屋。',
    check: (s) => (s.buildings.hut?.count ?? 0) >= 10,
  },
  {
    id: 'disciples10',
    name: '弟子满堂',
    glyph: '堂',
    desc: '宗门弟子达到 10 人。',
    check: (s) => s.disciples.total >= 10,
  },
  {
    id: 'disciples30',
    name: '门庭若市',
    glyph: '市',
    desc: '宗门弟子达到 30 人。',
    check: (s) => s.disciples.total >= 30,
  },
  {
    id: 'disciples80',
    name: '三千门客',
    glyph: '客',
    desc: '宗门弟子达到 80 人。',
    check: (s) => s.disciples.total >= 80,
  },
  {
    id: 'qi10k',
    name: '灵气万缕',
    glyph: '缕',
    desc: '累计获得 1 万灵气。',
    check: (s) => s.stats.totalQi >= 1e4,
  },
  {
    id: 'qi1m',
    name: '灵潮涌动',
    glyph: '潮',
    desc: '累计获得 100 万灵气。',
    check: (s) => s.stats.totalQi >= 1e6,
  },
  {
    id: 'stone100',
    name: '囊中百石',
    glyph: '囊',
    desc: '累计凝成 100 枚灵石。',
    check: (s) => (s.stats.crafted.stone ?? 0) >= 100,
  },
  {
    id: 'pill100',
    name: '丹成一炉',
    glyph: '炉',
    desc: '累计炼出 100 枚丹药。',
    check: (s) => (s.stats.crafted.pill ?? 0) >= 100,
  },
  {
    id: 'artifact50',
    name: '法器百炼',
    glyph: '炼',
    desc: '累计炼出 50 件法器。',
    check: (s) => (s.stats.crafted.artifact ?? 0) >= 50,
  },
  {
    id: 'talisman100',
    name: '符满山门',
    glyph: '满',
    desc: '累计画出 100 张符箓。',
    check: (s) => (s.stats.crafted.talisman ?? 0) >= 100,
  },
  {
    id: 'library5',
    name: '藏经千卷',
    glyph: '卷',
    desc: '建成 5 座藏经阁。',
    check: (s) => (s.buildings.library?.count ?? 0) >= 5,
  },
  {
    id: 'buildings50',
    name: '楼宇初成',
    glyph: '楼',
    desc: '累计建造 50 座建筑。',
    check: (s) => s.stats.buildingsBuilt >= 50,
  },
  {
    id: 'buildings200',
    name: '仙家气象',
    glyph: '象',
    desc: '累计建造 200 座建筑。',
    check: (s) => s.stats.buildingsBuilt >= 200,
  },
  {
    id: 'realm1',
    name: '初窥门径',
    glyph: '径',
    desc: '突破到炼气期。',
    check: (s) => s.realm >= 2,
  },
  {
    id: 'realm4',
    name: '金丹大道',
    glyph: '丹',
    desc: '突破到金丹期。',
    check: (s) => s.realm >= 4,
  },
  {
    id: 'realm6',
    name: '神游太虚',
    glyph: '神',
    desc: '突破到化神期。',
    check: (s) => s.realm >= 6,
  },
  {
    id: 'realm10',
    name: '大乘圆满',
    glyph: '满',
    desc: '突破到渡劫期。',
    check: (s) => s.realm >= 10,
  },
  {
    id: 'faith5k',
    name: '香火鼎盛',
    glyph: '盛',
    desc: '累计获得 5000 香火。',
    check: (s) => s.stats.totalFaith >= 5000,
  },
  {
    id: 'disaster10',
    name: '妖兽退散',
    glyph: '退',
    desc: '挡下 10 次妖兽侵袭。',
    check: (s) => s.stats.disasters >= 10,
  },
  {
    id: 'idle1h',
    name: '摸鱼一时',
    glyph: '鱼',
    desc: '累计挂机 1 小时。',
    check: (s) => s.stats.playTime >= 3600,
  },
  {
    id: 'idle10h',
    name: '摸鱼宗师',
    glyph: '摸',
    desc: '累计挂机 10 小时。',
    check: (s) => s.stats.playTime >= 36000,
  },
  {
    id: 'ascend1',
    name: '一朝飞升',
    glyph: '升',
    desc: '完成第一次飞升。',
    check: (s) => s.stats.ascensions >= 1,
  },
  {
    id: 'ascend3',
    name: '三度飞升',
    glyph: '三',
    desc: '完成三次飞升。',
    check: (s) => s.stats.ascensions >= 3,
  },
  {
    id: 'karma50',
    name: '仙缘深厚',
    glyph: '深',
    desc: '持有 50 点仙缘。',
    check: (s) => s.karma >= 50,
  },
]

export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]))
