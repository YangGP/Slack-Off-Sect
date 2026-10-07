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
  // ---------- 本源研究：法宝的起点 ----------
  {
    id: 'herbStudy',
    name: '灵植术',
    glyph: '植',
    cost: { insight: 40, wood: 120 },
    desc: '识得草木性情，才敢开圃种药。',
    effects: { unlockBuildings: ['herbGarden'] },
    note: '解锁建筑：药圃',
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
    needs: { upgrades: ['herbStudy'] },
  },
  {
    id: 'earthArt',
    name: '土木术',
    glyph: '土',
    cost: { insight: 120, wood: 300, stone: 40 },
    desc: '垒石为基、架木为梁，库房才立得住。',
    effects: { unlockBuildings: ['warehouse'] },
    note: '解锁建筑：库房',
    needs: { upgrades: ['prospectArt'] },
  },
  {
    id: 'incenseVow',
    name: '香火愿',
    glyph: '愿',
    cost: { insight: 200, wood: 400, stone: 80 },
    desc: '立下山门，许下一桩愿，香客自会寻来。',
    effects: { unlockBuildings: ['gate'] },
    note: '解锁建筑：山门',
    needs: { upgrades: ['earthArt'] },
  },
  {
    id: 'qiOrigin',
    name: '灵源考',
    glyph: '源',
    cost: { insight: 60 },
    desc: '考究灵气从何而来、如何凝结，是修真路上第一门正经学问。',
    effects: {},
    note: '解锁法宝：聚灵珠、聚灵幡',
    needs: { building: { id: 'library', count: 2 } },
  },

  // ---------- 炼造三术：整条建筑线的钥匙 ----------
  {
    id: 'alchemyArt',
    name: '炼丹术',
    glyph: '丹',
    cost: { insight: 200, stone: 120, herb: 100 },
    desc: '学会控火，方能开炉。解锁炼丹房与「采药制丹」。',
    effects: { unlockBuildings: ['alchemyRoom'] },
    needs: { building: { id: 'library', count: 2 } },
  },
  {
    id: 'forgeArt',
    name: '炼器术',
    glyph: '炼',
    cost: { insight: 260, stone: 160, ore: 80 },
    desc: '丹火既通，转入炉锤。解锁炼器坊与「淬炼法器」。',
    effects: { unlockBuildings: ['forge'] },
    needs: { upgrades: ['alchemyArt'] },
  },
  {
    id: 'talismanArt',
    name: '符箓入门',
    glyph: '符',
    cost: { insight: 240, stone: 140, wood: 400 },
    desc: '一笔落下，天地借力。解锁符箓堂与「朱砂符箓」。',
    effects: { unlockBuildings: ['talismanHall'] },
    needs: { upgrades: ['alchemyArt'] },
  },

  // ---------- 讲学一线 ----------
  {
    id: 'preachArt',
    name: '讲经法',
    glyph: '讲',
    cost: { insight: 320, stone: 200 },
    desc: '把玄之又玄的道理，讲成弟子听得懂的人话。解锁讲经堂。',
    effects: { unlockBuildings: ['academy'] },
    needs: { building: { id: 'library', count: 3 } },
  },
  {
    id: 'astrologyArt',
    name: '观星术',
    glyph: '星',
    cost: { insight: 450, stone: 300 },
    desc: '讲经讲到尽头，就得抬头看天。解锁观星台。',
    effects: { unlockBuildings: ['observatory'] },
    needs: { upgrades: ['preachArt'] },
  },
  {
    id: 'arrayBasics',
    name: '阵法初解',
    glyph: '阵',
    cost: { insight: 1500, stone: 1200, artifact: 3 },
    desc: '观星知势，方能布阵。解锁护山大阵。',
    effects: { unlockBuildings: ['mountainArray'] },
    needs: { upgrades: ['astrologyArt'], building: { id: 'academy', count: 2 } },
  },
  {
    id: 'arrayMastery',
    name: '阵道精通',
    glyph: '精',
    cost: { insight: 9000, stone: 8000, talisman: 25 },
    desc: '一草一木皆可为阵。解锁锁灵阵。',
    effects: { unlockBuildings: ['spiritLockArray'] },
    needs: { upgrades: ['arrayBasics'], building: { id: 'mountainArray', count: 3 } },
  },

  // ---------- 修行与人心 ----------
  {
    id: 'calmMind',
    name: '静心诀',
    glyph: '静',
    cost: { insight: 400, stone: 250, herb: 200 },
    desc: '心静则灵气自聚。解锁静心池。',
    effects: { unlockBuildings: ['meditationPool'] },
    needs: { building: { id: 'herbGarden', count: 3 } },
  },
  {
    id: 'beastTaming',
    name: '灵兽驯养',
    glyph: '驯',
    cost: { insight: 3200, stone: 2800, herb: 1500 },
    desc: '心静得下来，才听得懂兽语。解锁灵兽园。',
    effects: { unlockBuildings: ['beastGarden'] },
    needs: { upgrades: ['calmMind'] },
  },
  {
    id: 'ancestorArt',
    name: '祖师遗泽',
    glyph: '泽',
    cost: { insight: 1200, stone: 900, talisman: 8 },
    desc: '翻出祖师手札，字里行间都是捷径。解锁祖师殿。',
    effects: { unlockBuildings: ['ancestorHall'] },
    needs: { building: { id: 'incenseCauldron', count: 2 } },
  },
  {
    id: 'recruitDrive',
    name: '广开山门',
    glyph: '广',
    cost: { insight: 500, stone: 300, faith: 150 },
    desc: '下山贴榜、沿途施粥。弟子前来的间隔缩短 30%。',
    effects: { arrivalBonus: 0.3 },
    needs: { building: { id: 'gate', count: 3 } },
  },

  // ---------- 系统与天赋 ----------
  {
    id: 'intuition',
    name: '心有灵犀',
    glyph: '犀',
    cost: { insight: 900, stone: 600, pill: 10 },
    desc: '丹炉火候、符纸厚薄，不必盯着也知道。解锁自动制作。',
    effects: { autoCraft: true },
    needs: { building: { id: 'workshop', count: 1 } },
  },
  {
    id: 'breakthroughArt',
    name: '破境心法',
    glyph: '破',
    cost: { insight: 2000, stone: 1500, pill: 30 },
    desc: '破境时少走弯路，花费降低 15%。',
    effects: { breakthroughDiscount: 0.15 },
    needs: { realm: 3 },
  },
  {
    id: 'grottoArt',
    name: '洞天福地',
    glyph: '福',
    cost: { insight: 4000, stone: 3500, artifact: 12 },
    desc: '在山上开一方小世界。解锁洞天与洞府。',
    effects: { unlockBuildings: ['grotto', 'caveDwelling'] },
    needs: { building: { id: 'depot', count: 2 } },
  },
  {
    id: 'longBreath',
    name: '龟息功',
    glyph: '龟',
    cost: { insight: 6000, stone: 5000, pill: 40 },
    desc: '闭门即是深山。离线收益上限 +8 小时。',
    effects: { offlineHours: 8 },
    needs: { realm: 5 },
  },
  {
    id: 'karmaSense',
    name: '因果通感',
    glyph: '感',
    cost: { insight: 50000, stone: 40000, pill: 100 },
    desc: '看清因果的人，飞升时能多带走三成仙缘。',
    effects: { ascendBonus: 0.3, karmaRatio: 0.005 },
    needs: { realm: 9 },
  },
]

/** 两层合起来的完整列表：产出计算、解锁判定、文案都要用它 */
export const ALL_UPGRADES = [...CULTIVATION, ...TECHNIQUES]

/** id -> 条目（跨层引用依赖时用，例如修真节点 needs 里写一条技艺） */
export const UPGRADE_MAP = Object.fromEntries(ALL_UPGRADES.map((u) => [u.id, u]))
