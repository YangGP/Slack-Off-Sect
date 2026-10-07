/**
 * 修真 —— 研究 / 解锁层，对标猫国的「科学」（science.js）。
 *
 * 设定：修真研究的是**物质与灵气的本源**，成果是三件事 ——
 *   1. 解锁高级建筑（炼丹房、讲经堂、观星台、护山大阵、锁灵阵、洞天洞府…）
 *   2. 解锁系统（自动制作、离线上限、破境折扣、弟子前来速度、飞升仙缘…）
 *   3. **解锁法宝**（`techniques.js` 里 kind: 'treasure' 的条目，靠 needs.upgrades 挂在修真节点后面）
 *
 * 与 /技艺·法宝/ 的分工：
 *   修真（本文件）：只做解锁与系统开关，不提供 +% 加成
 *   技艺 / 法宝    ：只提供纯数值加成，本身不解锁任何东西
 *
 * 两者共用「感悟」货币，也都用 `needs` 做门禁。修真内部会串成链
 * （炼丹术 → 炼器术 / 符箓入门；讲经法 → 观星术 → 阵法初解 → 阵道精通；静心诀 → 灵兽驯养），
 * 这是猫国科学技术树那种「先发现、再发现下一层」的推进感。
 */
import { TECHNIQUES } from './techniques.js'

export const CULTIVATION = [
  // ---------- Ⅰ 感知：灵气是什么、从哪来、怎么快点聚起来 ----------

  {
    id: 'qiOrigin',
    name: '灵源考',
    glyph: '源',
    cost: { insight: 60 },
    desc: '考究灵气从何而来、如何凝结 —— 懂了地脉走向，才谈得上打井引气。',
    effects: { unlockBuildings: ['spiritVein'] },
    note: '解锁建筑：灵脉井',
    effectDesc: '因此知道该在哪里下锄：灵脉井引的是地脉之气。',
    needs: { building: { id: 'library', count: 2 } },
  },
  {
    id: 'qiGazing',
    name: '观气法',
    glyph: '观',
    cost: { insight: 150, wood: 300, stone: 60 },
    desc: '静坐三日，看清明堂之上那一缕白气的来路与去向。聚灵之理自此可画。',
    effects: { unlockBuildings: ['gatheringArray'] },
    note: '解锁建筑：聚灵大阵',
    effectDesc: '因此看得懂气脉走向：聚灵大阵画得出来了。',
    needs: { upgrades: ['qiOrigin'] },
  },
  // ---------- Ⅱ 识物：木、草、铁、香火各自的性质 ----------

  {
    id: 'herbStudy',
    name: '灵植术',
    glyph: '植',
    cost: { insight: 40, wood: 120 },
    desc: '识得草木性情，才敢开圃种药。',
    effects: { unlockBuildings: ['herbGarden'] },
    note: '解锁建筑：药圃',
    effectDesc: '因此敢开圃种药：有了稳定的灵草来源。',
    needs: { building: { id: 'library', count: 1 } },
  },

  {
    id: 'prospectStudy',
    name: '探矿术',
    glyph: '探',
    cost: { insight: 60, wood: 200 },
    desc: '循着山势与水脉找矿，比瞎挖强得多。',
    effects: { unlockBuildings: ['mine'] },
    note: '解锁建筑：玄铁矿',
    effectDesc: '因此循脉找矿：玄铁矿挖得下去了。',
    needs: { upgrades: ['herbStudy'] },
  },

  {
    id: 'incenseVow',
    name: '香火愿',
    glyph: '愿',
    cost: { insight: 200, wood: 400, stone: 80 },
    desc: '立下山门，许下一桩愿，香客自会寻来。',
    effects: { unlockBuildings: ['gate'] },
    note: '解锁建筑：山门',
    effectDesc: '因此立得起山门，香客自会寻来。',
    needs: { upgrades: ['earthArt'] },
  },
  // ---------- Ⅲ 造物：把材料做成器物（土木与三坊） ----------

  {
    id: 'earthArt',
    name: '土木术',
    glyph: '土',
    cost: { insight: 120, wood: 300, stone: 40 },
    desc: '垒石为基、架木为梁，库房才立得住。',
    effects: { unlockBuildings: ['warehouse'] },
    note: '解锁建筑：库房',
    effectDesc: '因此垒得起库房：基础物资存得住，才谈得上囤积。',
    needs: { upgrades: ['prospectArt'] },
  },

  {
    id: 'alchemyArt',
    name: '炼丹术',
    glyph: '丹',
    cost: { insight: 200, stone: 120, herb: 100 },
    desc: '学会控火，方能开炉。解锁炼丹房与「采药制丹」。',
    effectDesc: '因此灵草可以入炉，丹药有了出处。',
    effects: { unlockBuildings: ['alchemyRoom'] },
    needs: { building: { id: 'library', count: 2 } },
  },

  {
    id: 'talismanArt',
    name: '符箓入门',
    glyph: '符',
    cost: { insight: 240, stone: 140, wood: 400 },
    desc: '一笔落下，天地借力。解锁符箓堂与「朱砂符箓」。',
    effectDesc: '因此画得出符，镇妖避劫有了凭据。',
    effects: { unlockBuildings: ['talismanHall'] },
    needs: { upgrades: ['alchemyArt'] },
  },

  {
    id: 'forgeArt',
    name: '炼器术',
    glyph: '炼',
    cost: { insight: 260, stone: 160, ore: 80 },
    desc: '丹火既通，转入炉锤。解锁炼器坊与「淬炼法器」。',
    effectDesc: '因此淬得出器，法器不再只是纸上谈兵。',
    effects: { unlockBuildings: ['forge'] },
    needs: { upgrades: ['alchemyArt'] },
  },
  // ---------- Ⅳ 制度：让宗门自己运转 ----------

  {
    id: 'preachArt',
    name: '讲经法',
    glyph: '讲',
    cost: { insight: 320, stone: 200 },
    desc: '把玄之又玄的道理，讲成弟子听得懂的人话。解锁讲经堂。',
    effectDesc: '因此长老可以登坛讲经，感悟的来源不再只有藏书。',
    effects: { unlockBuildings: ['academy'] },
    needs: { building: { id: 'library', count: 3 } },
    needs: { realm: 5 },
  },

  {
    id: 'calmMind',
    name: '静心诀',
    glyph: '静',
    cost: { insight: 400, stone: 250, herb: 200 },
    desc: '心静则灵气自聚。解锁静心池。',
    effectDesc: '因此弟子坐得住：静心池让心神与仓储都稳下来。',
    effects: { unlockBuildings: ['meditationPool'] },
    needs: { building: { id: 'herbGarden', count: 3 } },
    needs: { realm: 5 },
  },

  {
    id: 'recruitDrive',
    name: '广开山门',
    glyph: '广',
    cost: { insight: 500, stone: 300, faith: 150 },
    desc: '下山贴榜、沿途施粥。弟子前来的间隔缩短 30%。',
    effectDesc: '因此山门名声在外，愿意上山的弟子更勤。',
    effects: { arrivalBonus: 0.3 },
    needs: { building: { id: 'gate', count: 3 } },
  },

  {
    id: 'intuition',
    name: '心有灵犀',
    glyph: '犀',
    cost: { insight: 900, stone: 600, pill: 10 },
    desc: '丹炉火候、符纸厚薄，不必盯着也知道。解锁自动制作。',
    effectDesc: '因此配方可以自动连做，双手从重复劳动里解放。',
    effects: { autoCraft: true },
    // 自动制作不该被某一座建筑卡住：器械齐了、手上有一批丹药，就能标准化流程
    needs: { upgrades: ['woodworking'] },
  },

  {
    id: 'ancestorArt',
    name: '祖师遗泽',
    glyph: '泽',
    cost: { insight: 1200, stone: 900, talisman: 8 },
    desc: '翻出祖师手札，字里行间都是捷径。解锁祖师殿。',
    effectDesc: '因此立得起祖师殿，香火更盛、人心更齐。',
    effects: { unlockBuildings: ['ancestorHall'] },
    needs: { building: { id: 'incenseCauldron', count: 2 } },
    needs: { realm: 7 },
  },

  {
    id: 'breakthroughArt',
    name: '破境心法',
    glyph: '破',
    cost: { insight: 2000, stone: 1500, pill: 30 },
    desc: '破境时少走弯路，花费降低 15%。',
    effectDesc: '因此破境时省下一成半材料，冲关更从容。',
    effects: { breakthroughDiscount: 0.15 },
    needs: { realm: 3 },
  },

  {
    id: 'beastTaming',
    name: '灵兽驯养',
    glyph: '驯',
    cost: { insight: 3200, stone: 2800, herb: 1500 },
    desc: '心静得下来，才听得懂兽语。解锁灵兽园。',
    effectDesc: '因此养得起灵兽，采药驮矿不必弟子亲自跑。',
    effects: { unlockBuildings: ['beastGarden'] },
    needs: { upgrades: ['calmMind'], realm: 8 },
  },

  {
    id: 'grottoArt',
    name: '洞天福地',
    glyph: '福',
    cost: { insight: 4000, stone: 3500, artifact: 12 },
    desc: '在山上开一方小世界。解锁洞天与洞府。',
    effectDesc: '因此开得出洞天与洞府：一方自成一界，装得下也住得下。',
    effects: { unlockBuildings: ['grotto', 'caveDwelling'] },
    needs: { building: { id: 'depot', count: 2 } },
    needs: { realm: 8 },
  },

  {
    id: 'longBreath',
    name: '龟息功',
    glyph: '龟',
    cost: { insight: 6000, stone: 5000, pill: 40 },
    desc: '闭门即是深山。离线收益上限 +8 小时。',
    effectDesc: '因此离山也在修行：离线八小时照样积攒。',
    effects: { offlineHours: 8 },
    needs: { realm: 5 },
  },
  // ---------- Ⅴ 法则：星象、阵法、因果 ----------

  {
    id: 'astrologyArt',
    name: '观星术',
    glyph: '星',
    cost: { insight: 450, stone: 300 },
    desc: '讲经讲到尽头，就得抬头看天。解锁观星台。',
    effectDesc: '因此搭得起观星台，从星象里读出资源的走势。',
    effects: { unlockBuildings: ['observatory'] },
    needs: { upgrades: ['preachArt'], realm: 6 },
  },

  {
    id: 'arrayBasics',
    name: '阵法初解',
    glyph: '阵',
    cost: { insight: 1500, stone: 1200, artifact: 3 },
    desc: '观星知势，方能布阵。解锁护山大阵。',
    effectDesc: '因此布得起护山大阵，天灾来时损失大减。',
    effects: { unlockBuildings: ['mountainArray'] },
    needs: { upgrades: ['astrologyArt'], building: { id: 'academy', count: 2 } },
    needs: { realm: 7 },
  },

  {
    id: 'arrayMastery',
    name: '阵道精通',
    glyph: '精',
    cost: { insight: 9000, stone: 8000, talisman: 25 },
    desc: '一草一木皆可为阵。解锁锁灵阵。',
    effectDesc: '因此锁得住一山之灵：锁灵阵把灵气囤得更紧。',
    effects: { unlockBuildings: ['spiritLockArray'] },
    needs: { upgrades: ['arrayBasics'], building: { id: 'mountainArray', count: 3 } },
    needs: { realm: 8 },
  },

  {
    id: 'karmaSense',
    name: '因果通感',
    glyph: '感',
    cost: { insight: 50000, stone: 40000, pill: 100 },
    desc: '看清因果的人，飞升时能多带走三成仙缘。',
    effectDesc: '因此看得见因果：下一次飞升带走的仙缘更多。',
    effects: { ascendBonus: 0.3, karmaRatio: 0.005 },
    needs: { realm: 9 },
  },

  {
    id: 'incenseStudy',
    name: '香火志',
    glyph: '香',
    cost: {insight:700, wood:800, faith:200},
    desc: '香火不是凭空来的：愿力聚于一处，才会结成气数。',
    effectDesc: '因此立得起香火鼎，把念力一炉炉炼成香火。',
    effects: { unlockBuildings: ['incenseCauldron'] },
    note: '解锁建筑：香火鼎',
    needs: { upgrades: ['incenseVow'], realm: 4 },
  },
  {
    id: 'earthEssence',
    name: '土木精要',
    glyph: '精',
    cost: {insight:800, wood:1200, plank:12},
    desc: '掏空山腹而不塌，靠的不是蛮力，是懂得岩层怎么受力。',
    effectDesc: '因此挖得出石殿：整座山腹都能当仓库。',
    effects: { unlockBuildings: ['depot'] },
    note: '解锁建筑：石殿',
    needs: { upgrades: ['earthArt'], realm: 5 },
  },
  {
    id: 'buildingCode',
    name: '营造法式',
    glyph: '营',
    cost: {insight:2600, plank:30, pill:20, stone:1500},
    desc: '材有等第、工有次第。一部法式定下来，殿宇才不只靠匠人手感。',
    effectDesc: '因此盖得起精舍：青石铺地、灵纹引气，住得下二十名弟子。',
    effects: { unlockBuildings: ['mansion'] },
    note: '解锁建筑：精舍',
    needs: { upgrades: ['earthEssence'], realm: 6 },
  },
  {
    id: 'trialArt',
    name: '试炼法',
    glyph: '炼',
    cost: {insight:3600, pill:60, herb:2000},
    desc: '以阵纹模拟雷劫，让弟子在安全处先尝一次天威。',
    effectDesc: '因此立得起试炼塔：弟子在塔中磨砺，出塔便是另一番气象。',
    effects: { unlockBuildings: ['trialTower'] },
    note: '解锁建筑：试炼塔',
    needs: { upgrades: ['buildingCode'], realm: 6 },
  },
  {
    id: 'artifactLore',
    name: '器道精微',
    glyph: '器',
    cost: {insight:6400, artifact:25, ore:4000, plank:20},
    desc: '一器之成，差在毫厘。懂得器纹如何引气，法器才算真正入门。',
    effectDesc: '因此炼得出护山阵盘：阵纹落在器物上，比刻在山石上更灵。',
    effects: { unlockBuildings: [] },
    note: '开启参悟：护山阵盘',
    needs: { upgrades: ['forgeArt'], realm: 7 },
  },
  {
    id: 'talismanLore',
    name: '符法精微',
    glyph: '符',
    cost: {insight:7600, talisman:120, wood:6000},
    desc: '符不在笔画繁复，而在落笔时那一线气机是否接得上。',
    effectDesc: '因此画得出镇岳符：一笔落下，山岳为之定。',
    effects: { unlockBuildings: [] },
    note: '开启参悟：镇岳符',
    needs: { upgrades: ['talismanArt'], realm: 7 },
  },
  {
    id: 'towerPlan',
    name: '塔院图',
    glyph: '塔',
    cost: { insight: 60000, stone: 80000, artifact: 30, plank: 60, steel: 15 },
    desc: '塔不怕高，怕的是接不住天风。图样定下九重院墙，塔才立得稳。',
    effectDesc: '因此动得了通天塔的工：塔尖直插云海，看得见飞升的路。',
    effects: { unlockBuildings: ['heavenTower'] },
    note: '解锁建筑：通天塔',
    needs: { upgrades: ['arrayMastery'], realm: 9 },
  },
  {
    id: 'karmaConcord',
    name: '因果参同契',
    glyph: '契',
    // 进阶品让"最后一步"有了自己的门槛：九转丹与灵符只有后期才炼得出来
    cost: {
      insight: 200000,
      talisman: 200,
      pill: 300,
      faith: 20000,
      nineTurnPill: 40,
      spiritTalisman: 25,
      spiritTreasure: 2,
    },
    desc: '把历世的因果摊开对照，才知道哪些是债、哪些是缘。',
    effectDesc: '因此开得出因果池，也看得清下一次飞升能带走多少仙缘。',
    effects: { unlockBuildings: ['karmaPool'] },
    note: '解锁建筑：因果池',
    needs: { upgrades: ['karmaSense','towerPlan'], realm: 10 },
  },
  {
    id: 'hourArt',
    name: '候时法',
    glyph: '候',
    cost: { insight: 1800, stone: 1200, talisman: 5 },
    desc: '破境要挑时候：灵气潮汐、月相、弟子的心神都有节律。',
    effectDesc: '因此破境再省一成材料 —— 同一炉丹，用在刀刃上。',
    effects: { breakthroughDiscount: 0.1 },
    note: '效果：破境花费 −10%',
    needs: { upgrades: ['buildingCode'], realm: 5 },
  },
  {
    id: 'breathArt',
    name: '定息法',
    glyph: '息',
    cost: { insight: 5200, pill: 40, plank: 20 },
    desc: '把呼吸压到极缓，人在与不在，气机不断。',
    effectDesc: '因此离山也在修行：离线时间再多算八小时。',
    effects: { offlineHours: 8 },
    note: '效果：离线结算 +8 小时',
    needs: { upgrades: ['longBreath'], realm: 6 },
  },
  {
    id: 'gateRecord',
    name: '山门志',
    glyph: '志',
    cost: { insight: 9000, faith: 4000, artifact: 10 },
    desc: '把历年上山的弟子名录刻在石上，山门的名声就有了凭据。',
    effectDesc: '因此愿意上山的弟子更勤，宗门扩张更快。',
    effects: { arrivalBonus: 0.3 },
    note: '效果：弟子前来更快',
    needs: { upgrades: ['incenseStudy'], realm: 7 },
  },
  {
    id: 'mindSeal',
    name: '心印法',
    glyph: '印',
    cost: { insight: 15000, pill: 120, herb: 6000 },
    desc: '以心印心，不必言语 —— 长老一个念头，弟子便知该如何行气。',
    effectDesc: '因此破境再省一成半材料。',
    effects: { breakthroughDiscount: 0.15 },
    note: '效果：破境花费 −15%',
    needs: { upgrades: ['hourArt'], realm: 8 },
  },
  {
    id: 'greatVehicleSeal',
    name: '大乘心印',
    glyph: '乘',
    cost: { insight: 40000, artifact: 60, talisman: 120, plank: 40, spiritTreasure: 1 },
    desc: '把前四境的心法合为一印，才有资格谈大乘。',
    effectDesc: '因此参悟得出《大乘心经》—— 全局产出再上一阶。',
    effects: { unlockBuildings: [] },
    note: '开启参悟：大乘心经',
    needs: { upgrades: ['mindSeal'], realm: 9 },
  },
]

/** 两层合起来的完整列表：产出计算、解锁判定、文案都要用它 */
export const ALL_UPGRADES = [...CULTIVATION, ...TECHNIQUES]

/** id -> 条目（跨层引用依赖时用，例如修真节点 needs 里写一条技艺） */
/**
 * 修真线的五段主线（界面上按它分组显示）。
 * 名字里的罗马数字只是方便阅读；分组本身来自 RESEARCH.md 的「从气到则」。
 */
export const CULTIVATION_STAGES = [
  {
    key: 'sense',
    label: 'Ⅰ 感知',
    hint: '灵气是什么、从哪来、怎么快点聚起来',
    ids: ['qiOrigin', 'qiGazing'],
  },
  {
    key: 'matter',
    label: 'Ⅱ 识物',
    hint: '木、草、铁、香火各自的性质',
    ids: ['herbStudy', 'prospectStudy', 'incenseVow', 'incenseStudy'],
  },
  {
    key: 'craft',
    label: 'Ⅲ 造物',
    hint: '把材料做成器物：土木与三坊',
    ids: ['earthArt', 'alchemyArt', 'talismanArt', 'forgeArt', 'earthEssence', 'buildingCode'],
  },
  {
    key: 'order',
    label: 'Ⅳ 制度',
    hint: '让宗门自己运转',
    ids: [
      'preachArt',
      'calmMind',
      'recruitDrive',
      'intuition',
      'ancestorArt',
      'breakthroughArt',
      'beastTaming',
      'grottoArt',
      'longBreath',
    , 'trialArt', 'artifactLore', 'talismanLore', 'hourArt', 'breathArt', 'gateRecord', 'mindSeal'],
  },
  {
    key: 'law',
    label: 'Ⅴ 法则',
    hint: '星象、阵法、因果',
    ids: ['astrologyArt', 'arrayBasics', 'arrayMastery', 'karmaSense', 'towerPlan', 'karmaConcord', 'greatVehicleSeal'],
  },
]

/** 节点 id → 所属段（给界面用） */
export const CULTIVATION_STAGE_OF = (() => {
  const map = {}
  CULTIVATION_STAGES.forEach((s, i) => {
    for (const id of s.ids) map[id] = { ...s, index: i }
  })
  return map
})()

export const UPGRADE_MAP = Object.fromEntries(ALL_UPGRADES.map((u) => [u.id, u]))
