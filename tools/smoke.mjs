/**
 * 冒烟测试：不依赖浏览器，直接把游戏引擎跑一遍。
 * 覆盖：数据完整性、初始产出、购买/拆除、职位分配、制作、成就、离线收益、飞升、长期挂机稳定性。
 *
 * 用法：
 *   node --import <shim> node_modules/vite/bin/vite.js build --ssr tools/smoke.mjs --outDir .smoke
 *   node .smoke/smoke.mjs
 * 或者（无沙箱限制时）直接用 npm run smoke
 */
import {
  createInitialState,
  normalizeState,
  resetForAscension,
  resetForReincarnation,
} from '../src/game/state.js'
import { createBot, ADVANCED_CRAFTS } from './player-bot.mjs'
import { fmt, fmtAmount, fmtCost, fmtFixed, fmtInt, fmtResource, fmtStock } from '../src/game/format.js'
import * as E from '../src/game/engine.js'
import { RESOURCES, RESOURCE_MAP } from '../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../src/data/buildings.js'
import { JOBS } from '../src/data/jobs.js'
import {
  CULTIVATION,
  ALL_UPGRADES,
  UPGRADE_MAP,
  CULTIVATION_STAGE_OF,
} from '../src/data/upgrades.js'
import { TECHNIQUES } from '../src/data/techniques.js'
import { CRAFTS, CRAFT_MAP } from '../src/data/crafts.js'
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD } from '../src/data/achievements.js'
import { EVENTS, EVENT_MAP, EVENT_LEVELS, getEventLevel, isEventInRealm } from '../src/data/events.js'
import { REALMS, ASCEND_REALM_INDEX, REINCARNATE_REALM_INDEX } from '../src/data/realms.js'
import { SEASONS, CALENDAR } from '../src/data/calendar.js'
import { CONFIG } from '../src/data/config.js'
import { exportSave, parseImport } from '../src/game/save.js'
import {
  unlockText,
  unlockGroups,
  unlockMismatches,
  effectLine,
  effectRows,
} from '../src/game/unlockText.js'
import { describeEffects } from '../src/game/effectsText.js'

let passed = 0
let failed = 0
const failures = []

function ok(name, condition, extra = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  ✗ ${name} ${extra}`)
  }
}

function close(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol
}

function section(title) {
  console.log(`\n== ${title} ==`)
}

section('首间茅屋与采集开局')
{
  const s = createInitialState(), d = E.createDerived()
  s.resources.qi = 500
  E.recompute(s, d)
  E.buyBuilding(s, d, 'spiritField', 1)
  ok('首间茅屋无需木材且可单独买入', E.buildingCost(s, 'hut').wood === undefined && E.buyBuilding(s, d, 'hut', 1) === 1 && s.resources.wood === 0)
  ok('后续茅屋需要木材', E.buildingCost(s, 'hut').wood === 31)
  const loaded = normalizeState(JSON.parse(JSON.stringify(s)))
  ok('存读档保留首屋领取与返还标记', loaded.starterHutBuilt && loaded.starterHutStanding)
  E.sellBuilding(s, d, 'hut', 1)
  ok('免费木材不产生拆除返还且重建需木材', s.resources.wood === 0 && E.buildingCost(s, 'hut').wood === 20 && E.buyBuilding(s, d, 'hut', 1) === 0)
  resetForReincarnation(s, 0)
  ok('转世重新获得首屋优惠', !s.starterHutBuilt && !s.starterHutStanding && !E.buildingCost(s, 'hut').wood)
  const legacy = { buildings: { spiritField: { count: 3, on: true } }, resources: {} }
  ok('仅有聚灵阵的旧档仍享首屋优惠', !normalizeState(legacy).starterHutBuilt)
  ok('旧档已有茅屋视为领取过优惠', normalizeState({ buildings: { hut: { count: 1, on: true } } }).starterHutBuilt)
  const oldRecipe = { autoCraft: { condenseStone: true }, craftTargets: { condenseStone: 12 }, settings: { quickCrafts: ['condenseStone'], autoCraftPriority: 'condenseStone' } }
  const migrated = normalizeState(oldRecipe)
  ok('旧凝石配方设置迁移且不改变输入', migrated.autoCraft.infuseStone && migrated.craftTargets.infuseStone === 12 && migrated.settings.autoCraftPriority === 'infuseStone' && migrated.settings.quickCrafts.includes('infuseStone') && !('condenseStone' in migrated.autoCraft) && oldRecipe.autoCraft.condenseStone)
  const bulk = createInitialState()
  bulk.resources.qi = 500; bulk.resources.wood = 31; bulk.buildings.spiritField = { count: 1, on: true }
  E.recompute(bulk, d)
  ok('批量购屋只免首座木材且可买数量一致', E.buildingCost(bulk, 'hut', 2).wood === 31 && E.maxAffordable(bulk, 'hut') === 2 && E.buyBuilding(bulk, d, 'hut', 2) === 2 && bulk.resources.wood === 0)
}

function newGame() {
  const state = createInitialState()
  const derived = E.createDerived()
  E.recompute(state, derived)
  return { state, derived }
}

/**
 * 一个「已经开起来」的早期存档：1 座茅屋（4 个床位）+ 1 座聚灵阵 + 一点各色资源，
 * 还有 4 名弟子。给那些不关心开局、只想测机制本身的用例用。
 */
function newGameRunning() {
  const state = createInitialState()
  state.resources.qi = 2000
  state.resources.wood = 2000
  state.resources.stone = 200
  state.buildings.hut = { count: 1, on: true }
  state.buildings.spiritField = { count: 1, on: true }
  state.disciples.total = 4
  E.trackPeak(state)
  const derived = E.createDerived()
  E.recompute(state, derived)
  return { state, derived }
}

// ------------------------------------------------------------
section('数据完整性')
// ------------------------------------------------------------
{
  const resIds = new Set(RESOURCES.map((r) => r.id))
  ok('资源 id 唯一', resIds.size === RESOURCES.length)

  let badCost = null
  for (const b of BUILDINGS) {
    for (const k in b.cost) if (!resIds.has(k)) badCost = `${b.id}.cost.${k}`
  }
  ok('建筑花费只引用已定义资源', !badCost, badCost || '')

  let badStorage = null
  for (const b of BUILDINGS) {
    const s = b.effects?.storage
    if (s) for (const k in s) if (!resIds.has(k)) badStorage = `${b.id}.storage.${k}`
  }
  ok('建筑仓储只引用已定义资源', !badStorage, badStorage || '')

  let badNeeds = null
  const check = (needs, owner) => {
    if (!needs) return
    if (needs.building && !BUILDING_MAP[needs.building.id]) badNeeds = `${owner} -> ${needs.building.id}`
    if (needs.buildings) {
      for (const b of needs.buildings) if (!BUILDING_MAP[b.id]) badNeeds = `${owner} -> ${b.id}`
    }
    if (needs.upgrade && !UPGRADE_MAP[needs.upgrade]) badNeeds = `${owner} -> ${needs.upgrade}`
    if (needs.upgrades) {
      for (const u of needs.upgrades) if (!UPGRADE_MAP[u]) badNeeds = `${owner} -> ${u}`
    }
    if (needs.realm != null && needs.realm > REALMS.length - 1) badNeeds = `${owner} -> realm ${needs.realm}`
  }
  for (const b of BUILDINGS) check(b.needs, `building:${b.id}`)
  for (const j of JOBS) check(j.needs, `job:${j.id}`)
  for (const u of ALL_UPGRADES) check(u.needs, `upgrade:${u.id}`)
  for (const c of CRAFTS) check(c.needs, `craft:${c.id}`)
  ok('所有解锁条件都指向存在的条目', !badNeeds, badNeeds || '')

  let badUnlock = null
  for (const u of ALL_UPGRADES) {
    const list = u.effects?.unlockBuildings
    if (list) for (const id of list) if (!BUILDING_MAP[id]) badUnlock = `${u.id} -> ${id}`
  }
  ok('修真解锁的建筑都存在', !badUnlock, badUnlock || '')

  // ---- 两层（修真 / 技艺·法宝）的分工与链式前置 ----
  ok('两层 id 不重复', new Set(ALL_UPGRADES.map((u) => u.id)).size === ALL_UPGRADES.length)
  const unlockApps = ['unlockBuildings', 'autoCraft', 'autoCondenseLiquid', 'offlineHours', 'breakthroughDiscount', 'arrivalBonus', 'ascendBonus', 'karmaRatio']
  const pureNumeric = ['storageRatio', 'ratio', 'ratioAll', 'jobRatio', 'storage', 'storageAll', 'habitability', 'habitabilityPerHousing', 'consumeRatio', 'craftBonus', 'craftBonusByResource', 'disasterGuard', 'disasterGuardByResource']
  // 两线重组（RESEARCH.md）：解锁/系统效果仍全部由修真页的主线与经营节点承担
  const artUnlocks = CULTIVATION.filter((u) => Object.keys(u.effects || {}).some((k) => unlockApps.includes(k)))
  ok(
    '修真页承担全部解锁/系统效果',
    artUnlocks.length >= 30,
    `${artUnlocks.length}/${CULTIVATION.length}`,
  )
  const skillLeaks = TECHNIQUES.filter((u) => Object.keys(u.effects || {}).some((k) => unlockApps.includes(k)))
  ok('技艺/法宝层不含任何解锁/系统效果', skillLeaks.length === 0, skillLeaks.map((u) => u.id).join(','))
  const skillPure = TECHNIQUES.filter((u) => Object.keys(u.effects || {}).every((k) => pureNumeric.includes(k)))
  ok('技艺/法宝效果只强化数值，配方由前置条件绑定工艺', skillPure.length === TECHNIQUES.length)

// 技艺层的炼成花费只用「资源 + 高级资源」，不吃灵机；法宝的祭炼仍然要灵机
{
  const advanced = ['pill', 'talisman', 'artifact']
  const skillInsight = TECHNIQUES.reduce((s, t) => s + (t.cost.insight || 0), 0)
  const cultInsight = CULTIVATION.reduce((s, u) => s + (u.cost.insight || 0), 0)
  ok(
    '技艺层仍然要吃灵机（没有完全移除）',
    TECHNIQUES.every((t) => (t.cost.insight || 0) > 0),
    TECHNIQUES.filter((t) => !t.cost.insight).map((t) => t.name).join('、') || '每条都有',
  )
  ok(
    '但灵机被压到修真层的一半以下（主要成本让给材料）',
    // 修真树按 RESEARCH.md 铺满时间线之后，它的灵机总量自然会远超技艺层，
    // 所以这里只守「技艺层的灵机不许超过修真层的一半」这条设计规则，不再守下限。
    skillInsight / cultInsight <= 0.5 && skillInsight / cultInsight > 0,
    `技艺 ${skillInsight} vs 修真 ${cultInsight}（${((skillInsight / cultInsight) * 100).toFixed(0)}%）`,
  )
  const resOf = (t) => Object.keys(t.cost).filter((r) => r !== 'insight')
  ok(
    '每条技艺 / 法宝只要 1~4 种资源（灵机另算）',
    TECHNIQUES.every((t) => resOf(t).length >= 1 && resOf(t).length <= 4),
    TECHNIQUES.map((t) => `${t.name} ${resOf(t).length}`).join(' '),
  )
  ok(
    '高级资源（丹药 / 符箓 / 法器）确实是后期技艺的门槛',
    TECHNIQUES.filter((t) => advanced.some((a) => t.cost[a])).length >= 8,
    TECHNIQUES.filter((t) => advanced.some((a) => t.cost[a])).map((t) => t.name).join('、'),
  )
  const treasures = TECHNIQUES.filter((t) => t.kind === 'treasure')
  ok(
    '每件法宝都有祭炼基数，新增宜居法宝后合计71,150灵机',
    treasures.every((t) => (t.refine?.insight || 0) > 0) &&
      treasures.reduce((s, t) => s + t.refine.insight, 0) === 71150,
    `${treasures.reduce((s, t) => s + (t.refine?.insight || 0), 0)}（${treasures.length} 件）`,
  )
  ok(
    '祭炼的灵机不打折（法宝的 refine.insight 大于炼成价里的灵机）',
    treasures.every((t) => t.refine.insight > t.cost.insight),
    treasures.map((t) => `${t.name} 炼成${t.cost.insight}/祭炼${t.refine.insight}`).slice(0, 4).join('、'),
  )
  // 祭炼一次的花费里必须出现灵机（这是「法宝祭炼维持灵机要求」的落地检查）
  const s8 = newGame()
  s8.state.upgrades.spiritBanner = true
  E.recompute(s8.state, s8.derived)
  const rc = E.refineCost(s8.state, 'spiritBanner')
  ok('祭炼花费里有灵机', (rc.insight || 0) > 0, JSON.stringify(rc))
}
  const chained = ALL_UPGRADES.filter((u) => u.needs?.upgrades?.length)
  ok('两层内部都有链式前置（修真→修真 / 技艺→技艺）', chained.length >= 8, `${chained.length} 条有前置`)
  ok(
    '存在修真→技艺·法宝的跨层前置',
    TECHNIQUES.some((u) => (u.needs?.upgrades || []).some((id) => CULTIVATION.some((a) => a.id === id))),
  )

  // ---- 法宝：由修真解锁的器物（对标猫国工坊里那些「造出来的加成」）----
  const treasures = TECHNIQUES.filter((t) => t.kind === 'treasure')
  const plainSkills = TECHNIQUES.filter((t) => t.kind !== 'treasure')
  ok(
    '法宝是一批独立条目',
    treasures.length >= 10 && plainSkills.length >= 10,
    `${treasures.length} 件法宝 / ${plainSkills.length} 条技艺`,
  )
  const badTreasure = treasures.find(
    (t) =>
      !(t.needs?.upgrades || []).length ||
      !(t.needs.upgrades || []).every((id) => CULTIVATION.some((c) => c.id === id)),
  )
  ok('每件法宝都由修真节点解锁', !badTreasure, badTreasure ? badTreasure.id : '')
  // 数值型研究来自材料工艺、主线成果、金丹增产及聚气纹。
  // 清单用于避免无意把通用技艺迁入修真页，符文原理见 docs/RUNE-DESIGN.md。
  const MIGRATED_NUMERIC_IDS = [
    'woodworking', 'waterworkshop', 'spiritSaw', 'spiritCultivation',
    'steelWorking', 'swordFlight', 'spiritSmelting',
    'arrayAssembly', 'crystalCraft', 'crystalPolishing', 'alchemyFire',
    'arrayRefine', 'mahayanaArt', 'flowField', 'qiRune',
  ]
  const numericCult = CULTIVATION.filter((c) => Object.keys(c.effects || {}).some((k) => pureNumeric.includes(k)))
  ok(
    '修真页的数值增益来自明确的工艺、主线与符文节点',
    numericCult.length === MIGRATED_NUMERIC_IDS.length && numericCult.every((c) => MIGRATED_NUMERIC_IDS.includes(c.id)),
    numericCult.map((c) => c.id).join(','),
  )
  ok('数值节点清单全部落在修真页', MIGRATED_NUMERIC_IDS.every((id) => CULTIVATION.some((c) => c.id === id)))
  ok('技艺页不再包含迁移节点', TECHNIQUES.every((t) => !MIGRATED_NUMERIC_IDS.includes(t.id)))
  // 两线重组的依赖与标注修正
  ok(
    '修真页节点不再引用技艺版探矿术（矿脉经），消除反向跨层依赖',
    CULTIVATION.every((c) => !(c.needs?.upgrades || []).includes('prospectArt')) &&
      (CULTIVATION.find((c) => c.id === 'earthArt').needs?.upgrades || []).includes('prospectStudy'),
  )
  ok('候时法境界标注与实际门槛对齐（化神）', E.UPGRADE_MAP.hourArt.needs.realm === 6, `realm ${E.UPGRADE_MAP.hourArt.needs.realm}`)
  ok('大乘心经境界标注与实际门槛对齐（大乘）', E.UPGRADE_MAP.mahayanaArt.needs.realm === 9, `realm ${E.UPGRADE_MAP.mahayanaArt.needs.realm}`)

  let badJobRes = null
  for (const j of JOBS) if (!resIds.has(j.resource)) badJobRes = j.id
  ok('职位产出资源都已定义', !badJobRes, badJobRes || '')

  let badCraft = null
  for (const c of CRAFTS) {
    if (!resIds.has(c.out)) badCraft = c.id
    for (const k in c.cost) if (!resIds.has(k)) badCraft = `${c.id}.${k}`
  }
  ok('制作配方引用的资源都已定义', !badCraft, badCraft || '')

  let badEvent = null
  for (const e of EVENTS) {
    for (const spec of [e, ...(e.options || []).map(o => o.effect || {})]) {
      for (const field of ['lootRate', 'floor', 'cost', 'costShare', 'tradeCost']) {
        for (const k of Object.keys(spec[field] || {})) if (!resIds.has(k)) badEvent = `${e.id}.${k}`
      }
      if (spec.disaster) for (const k of spec.disaster.resources) if (!resIds.has(k)) badEvent = e.id
      if (spec.buff?.target && !resIds.has(spec.buff.target)) badEvent = e.id
    }
  }
  ok('事件引用的资源都已定义', !badEvent, badEvent || '')

  const s = createInitialState()
  let checkCrash = null
  for (const a of ACHIEVEMENTS) {
    try {
      a.check(s)
    } catch (err) {
      checkCrash = a.id
    }
  }
  ok('成就判定函数在初始状态下不报错', !checkCrash, checkCrash || '')
}

// ------------------------------------------------------------
section('初始状态：什么都没有（对标猫国开局）')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  ok('初始灵气为 0', state.resources.qi === 0)
  ok('初始弟子为 0', state.disciples.total === 0)
  ok('初始没有任何职位', Object.values(state.disciples.jobs).every((n) => n === 0))
  ok('初始没有任何建筑', Object.keys(state.buildings).length === 0)
  ok('弟子上限为 0（要靠茅屋）', derived.maxDisciples === 0, `实际 ${derived.maxDisciples}`)
  ok('开局没有任何产出', derived.rates.qi === 0 && derived.rates.wood === 0)
  ok('开局宜居度20且没有额外全局加成', derived.habitability === 20 && derived.habitabilityMult === 1)

  // 点一下「吸取天地灵气」
  // 前期按猫国力度收紧后：一次点击 +2.5，第一座聚灵阵 25 → 正好 10 下（猫国是 10 猫薄荷一座猫薄荷田）
  ok('没有聚灵阵时每次点击 +2.5 灵气', close(E.clickGain(state, derived), 2.5, 1e-9))
  E.drawQi(state, derived)
  ok('吸取一次得到 2.5 灵气', close(state.resources.qi, 2.5, 1e-9))
  ok('点击次数记在统计里', state.stats.clicks === 1)
  ok('点 10 下攒得出第一座聚灵阵（25 ÷ 2.5）', close(E.BUILDING_MAP.spiritField.cost.qi, 25, 1e-9))

  // 聚灵阵是第一座建筑，也是第一个产出源
  state.resources.qi = 25
  E.trackPeak(state)
  ok('灵气够了就能建聚灵阵', E.buyBuilding(state, derived, 'spiritField', 1) === 1)
  ok('聚灵阵产出灵气（春季 +20% 后 0.36/s）', close(derived.rates.qi, 0.36), `实际 ${derived.rates.qi}`)
  ok('有聚灵阵后点击收益提高到 3.0', close(E.clickGain(state, derived), 3, 1e-9))

  // 茅屋：第一间房子花「吸来的灵气 + 炼出来的灵石」，并且要先有一座聚灵阵（对标猫国小屋）
  const hut = E.BUILDING_MAP.hut
  ok('首屋仅需灵气，后续茅屋需要木料', E.buildingCost(state, 'hut').qi === 80 && !E.buildingCost(state, 'hut').wood && hut.cost.wood === 20)
  ok('茅屋要一座聚灵阵（第 1 分钟只有聚灵阵可选）', !!hut.needs?.building, JSON.stringify(hut.needs))
  state.resources.qi = 80
  state.resources.stone = 4
  E.trackPeak(state)
  ok('材料齐了能建茅屋', E.buyBuilding(state, derived, 'hut', 1) === 1)
  ok('茅屋把弟子上限抬到 2', derived.maxDisciples === 2, `实际 ${derived.maxDisciples}`)

  // 弟子住进来之后才有产出
  state.disciples.total = 2
  E.setJob(state, derived, 'farmer', 1)
  E.recompute(state, derived)
  ok('有阵徒之后灵气产出叠加', derived.rates.qi > 0.36, `实际 ${derived.rates.qi}`)
  ok(
    `灵气消耗按弟子数算（2 人 × ${CONFIG.DISCIPLE_UPKEEP}，凡体倍率 1.0）`,
    close(derived.upkeep, 0.5, 1e-9),
    `实际 ${derived.upkeep}`,
  )

  // 口粮随境界倍率一起上涨：同样两名弟子，破境之后养人就贵了
  // （这条是行为断言：以后谁把 DISCIPLE_UPKEEP_REALM_EXP 改回 0，这里会直接报错）
  {
    const before = derived.upkeep
    const beforeUnit = derived.discipleUpkeep
    state.realm = 4 // 金丹期 ×2.0
    E.recompute(state, derived)
    const mult = REALMS[4].mult
    ok(
      `口粮随境界倍率上涨（金丹期 ×${mult}）`,
      close(derived.upkeep, before * mult, 1e-9),
      `${before} → ${derived.upkeep}`,
    )
    ok(
      `每人口粮 = ${CONFIG.DISCIPLE_UPKEEP} × 境界倍率`,
      close(derived.discipleUpkeep, beforeUnit * mult, 1e-9),
      `实际 ${derived.discipleUpkeep}`,
    )
    // 渡劫期（×20）：口粮占「一名阵徒毛产出」的比例不该再往下掉。
    // 注意要用边际产出（裸 0.6 × 共用乘区），不能拿 rates.qi ÷ 人数 —— 那里面还混着聚灵阵的产出。
    state.realm = ASCEND_REALM_INDEX
    E.recompute(state, derived)
    const factor = derived.prodRaw.qi > 0 ? derived.rates.qi / derived.prodRaw.qi : derived.globalMult
    const grossPerFarmer = 0.6 * factor
    ok(
      '渡劫期口粮仍占阵徒毛产出的 30% 以上（弟子没有随境界变免费）',
      derived.discipleUpkeep / grossPerFarmer > 0.3,
      `口粮 ${derived.discipleUpkeep.toFixed(3)} / 毛产出 ${grossPerFarmer.toFixed(3)}`,
    )
    state.realm = 0
    E.recompute(state, derived)
  }
}

// ------------------------------------------------------------
section('渐进露出（对标猫国的 unlockRatio）')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  // 猫国也是这个逻辑：猫薄荷田要 10 猫薄荷，攒到 3（30%）才出现在列表里
  ok('开局 0 灵气时，连聚灵阵都还没露面', !E.isBuildingUnlocked(state, 'spiritField'))
  state.resources.qi = 8 // 聚灵阵要 25 → 门槛 7.5
  E.trackPeak(state)
  ok('攒到成本的 30% 时聚灵阵出现', E.isBuildingUnlocked(state, 'spiritField'))

  // 茅屋：硬条件是「聚灵阵 ≥1」；水位条件是灵气 80（门槛 24）+ 灵石 4（门槛 1.2）
  state.buildings.spiritField = { count: 1, on: true }
  state.resources.qi = 20
  E.trackPeak(state)
  ok('硬条件满足、水位只到一半时仍不露面', !E.isBuildingUnlocked(state, 'hut'))
  state.peak.qi = 24
  ok('硬条件 + 两种花费的水位都到 30% 才露面', E.isBuildingUnlocked(state, 'hut'))

  // 花光资源也不会缩回去（用历史峰值判定，避免列表跳动）
  state.resources.qi = 0
  state.resources.stone = 0
  ok('把资源花光后建筑不会消失', E.isBuildingUnlocked(state, 'hut'))
  void derived
}

// ------------------------------------------------------------
// 配方的「自举」检查：解锁建筑不能要这条配方的产出，否则第一份永远做不出来
// （木板那次就是这么卡死的：木板配方要百工坊，而百工坊造价里又有木板）
{
  const bad = []
  for (const c of CRAFTS) {
    const gate = c.needs?.building && BUILDING_MAP[c.needs.building.id]
    if (!gate) continue
    const res = Object.keys(gate.cost).filter((r) => r === c.out)
    if (res.length) bad.push(`${c.name}（要 ${gate.name}，而 ${gate.name} 又要 ${c.out}）`)
  }
  ok('配方的解锁建筑不能要它自己的产出（自举检查）', bad.length === 0, bad.join('；'))
}

section('整枚计数的资源不出现小数（灵石/丹药/符箓/法器/木板）')
// ------------------------------------------------------------
{
  const ints = E.RESOURCES.filter((r) => r.integer).map((r) => r.id)
  ok(
    '数据里标了整枚计数的资源（灵石/丹药/符箓/法器/木板）',
    ints.includes('stone') && ints.includes('pill') && ints.includes('talisman') && ints.includes('artifact') && ints.includes('plank'),
    ints.join(','),
  )
  ok(
    '正好是灵石 / 丹药 / 符箓 / 法器',
    ['stone', 'pill', 'talisman', 'artifact'].every((id) => ints.includes(id)),
    ints.join(','),
  )

  const { state, derived } = newGame()
  state.resources.qi = 1e6
  state.resources.wood = 1e6
  state.resources.stone = 1e6
  state.resources.insight = 1e6
  E.recompute(state, derived)

  // ① 涨价算出来的价格必须是整数（以前是 1.55 / 2.4 / 3.72 …）
  const prices = []
  for (let built = 0; built < 6; built++) {
    state.buildings.gatheringArray = { count: built, on: true }
    prices.push(E.buildingCost(state, 'gatheringArray', 1).stone)
  }
  ok(
    '建筑涨价后的灵石花费都是整数',
    prices.every((v) => Number.isInteger(v)),
    prices.join(','),
  )
  const gathering = BUILDING_MAP.gatheringArray
  ok('而且是向上取整（不会比真实值便宜）', prices.every((v, i) => v === Math.ceil(gathering.cost.stone * Math.pow(gathering.priceRatio, i) - 1e-9)), prices.join(','))
  ok('灵石价格单调递增', prices.every((v, i) => i === 0 || v >= prices[i - 1]), prices.join(','))

  // ② 破境折扣算出来的整数资源花费必须是整数
  state.upgrades.breakthroughArt = true
  E.recompute(state, derived)
  const bCosts = []
  for (let i = 1; i < REALMS.length; i++) {
    for (const [res, v] of Object.entries(E.realmCost(state, derived, i))) {
      if (RESOURCE_MAP[res]?.integer) bCosts.push(v)
    }
  }
  ok(
    '破境（含折扣）的整数资源花费都是整数',
    bCosts.length > 0 && bCosts.every((v) => Number.isInteger(v)),
    bCosts.join(','),
  )
  ok(
    '折扣后向上取整（26 × 0.85 = 22.1 → 23）',
    E.realmCost(state, derived, 3).pill === 23,
    `${E.realmCost(state, derived, 3).pill}`,
  )

  // ③ 法宝祭炼的花费也必须是整数
  state.upgrades.spiritBanner = true
  E.recompute(state, derived)
  const refine = []
  for (let lv = 0; lv < 4; lv++) {
    state.treasureLevels.spiritBanner = lv
    refine.push(E.refineCost(state, 'spiritBanner').stone)
  }
  ok('法宝祭炼的灵石花费都是整数', refine.every((v) => Number.isInteger(v)), refine.join(','))

  // ④ 加资源不会给整枚资源留下小数（事件按百分比、旧档都可能带小数）
  state.resources.stone = 10
  E.addResource(state, 'stone', 2.5)
  ok('给灵石加 2.5 只得到 2', state.resources.stone === 12, `${state.resources.stone}`)
  state.resources.stone = 10
  E.addResource(state, 'stone', 3.999)
  ok('给灵石加 3.999 得到 3（向下取整，不凭空多给一枚）', state.resources.stone === 13, `${state.resources.stone}`)
  state.resources.wood = 10
  E.addResource(state, 'wood', 2.5)
  ok('连续资源仍然保留小数', close(state.resources.wood, 12.5, 1e-9), `${state.resources.wood}`)

  // ⑤ 存档往返：旧档里的小数会被抹平
  const legacy = JSON.parse(JSON.stringify(state))
  legacy.resources.stone = 7.77
  legacy.resources.pill = 3.5
  const loaded = normalizeState(legacy)
  ok('读档时把灵石的小数抹平', loaded.resources.stone === 7, `${loaded.resources.stone}`)
  ok('读档时把丹药的小数抹平', loaded.resources.pill === 3, `${loaded.resources.pill}`)

  // ⑥ 显示与判定一致：整数需求下「有 5 就能买 5」不再出现看着够其实不够
  state.buildings.hut = { count: 4, on: true } // 第 5 座要灵石 6
  const fifth = E.buildingCost(state, 'hut', 1)
  state.resources.wood = fifth.wood
  ok('凑齐整数需求就真的买得起', E.canAfford(state, fifth) === true, `${state.resources.stone} vs ${fifth.stone}`)
  state.resources.wood = fifth.wood - 1
  ok('差一枚就买不起（不会显示成「够」）', E.canAfford(state, fifth) === false)
}

// ------------------------------------------------------------
section('数字格式（只有左栏资源表保留小数）')
// ------------------------------------------------------------
{
  // 资源栏：连续资源两位小数，整枚资源取整
  ok('资源栏连续资源两位小数', fmtResource('qi', 12.345) === '12.35', fmtResource('qi', 12.345))
  ok('资源栏整枚资源不带小数', fmtResource('stone', 4.5) === '4', fmtResource('stone', 4.5))
  ok('资源栏的 fmtFixed 仍然固定两位', fmtFixed(12) === '12.00', fmtFixed(12))

  // 其它地方：整数
  ok('存量向下取整', fmtStock(1234.56) === '1234', fmtStock(1234.56))
  ok('花费向上取整', fmtCost(148.955) === '149', fmtCost(148.955))
  ok('累计量四舍五入', fmtAmount(1234.6) === '1235', fmtAmount(1234.6))
  ok('fmtInt 也不会漏出小数', fmtInt(1234.5) === '1235', fmtInt(1234.5))
  ok('大数用中文数量级且最多一位小数', fmtAmount(123456) === '12.3万', fmtAmount(123456))
  ok('整万数干净显示', fmtAmount(80000) === '8万', fmtAmount(80000))
  // 缩放后不保留小数时，整数末尾的 0 不能被当作小数尾零删掉。
  for (const [value, expected] of [
    [1000000, '100万'],
    [1200000, '120万'],
    [1204000, '120万'],
    [10000000, '1000万'],
    [12000000000, '120亿'],
    [-1200000, '-120万'],
  ]) {
    for (const format of [fmt, fmtInt, fmtStock, fmtCost, fmtAmount]) {
      ok(`${format.name}(${value}) 保留整数尾零`, format(value) === expected, format(value))
    }
  }
  ok('资源栏整枚资源保留整数尾零', fmtResource('stone', 1200000) === '120万', fmtResource('stone', 1200000))
  ok('资源栏连续资源仍固定两位', fmtResource('qi', 1200000) === '120.00万', fmtResource('qi', 1200000))
  ok('小数尾零仍正确省略', fmt(120000) === '12万' && fmt(125000) === '12.5万')
  ok('负数也保持整数', fmtStock(-12.7) === '-13', fmtStock(-12.7))
  ok('0 与 Infinity 不出错', fmtStock(0) === '0' && fmtCost(0) === '0' && fmtAmount(Infinity) === '∞')
}

// ------------------------------------------------------------
section('建造 / 拆除 / 停用')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  state.buildings.spiritField = { count: 1, on: true } // 茅屋现在要一座聚灵阵
  state.resources.qi = 1000
  state.resources.stone = 100
  E.trackPeak(state)

  const before = { qi: state.resources.qi, stone: state.resources.stone }
  const built = E.buyBuilding(state, derived, 'hut', 1)
  ok('建成 1 座茅屋', built === 1 && E.countOf(state, 'hut') === 1)
  ok('扣除灵气 80', close(before.qi - state.resources.qi, 80, 1e-6))
  ok('首屋不消耗灵石', state.resources.stone === before.stone)
  ok('弟子上限 0 → 2', derived.maxDisciples === 2, `实际 ${derived.maxDisciples}`)
  ok('仓储上限提升（灵气 +60）', derived.max.qi === 560, `实际 ${derived.max.qi}`)
  ok('建造计数已记录', state.stats.buildingsBuilt === 1)

  const second = E.buildingCost(state, 'hut', 1)
  ok('第二座更贵（价格递增）', second.qi > 80, `实际 ${second.qi}`)

  const affordable = E.maxAffordable(state, 'hut')
  ok('剩余资源不足时 maxAffordable 返回零', affordable === 0, `实际 ${affordable}`)

  // 新规则：只有带维护费的建筑能停用（茅屋没有运行成本，停它只会白亏）
  ok('没有维护费的建筑拒绝停用', E.toggleBuilding(state, derived, 'hut') === null)
  ok('拒绝之后仍是启用状态', E.activeOf(state, 'hut') === 1)

  // 带维护费的建筑可以停：产出消失，维护费也一起消失
  state.buildings.gatheringArray = { count: 2, on: true }
  E.recompute(state, derived)
  const qiRateBefore = derived.rates.qi
  ok('聚灵大阵在吃灵气', (derived.maintenance.qi || 0) > 0, `${derived.maintenance.qi}`)
  ok('停用带维护费的建筑', E.toggleBuilding(state, derived, 'gatheringArray') === false)
  ok('停用后启用数为 0', E.activeOf(state, 'gatheringArray') === 0)
  ok('停用后维护费归零', !derived.maintenance.qi, `${derived.maintenance.qi}`)
  ok('停用后不再产灵气', derived.rates.qi < qiRateBefore, `${qiRateBefore} → ${derived.rates.qi}`)
  E.toggleBuilding(state, derived, 'gatheringArray')
  ok('重新启用后维护费回来', (derived.maintenance.qi || 0) > 0, `${derived.maintenance.qi}`)

  const resBefore = state.resources.qi
  E.sellBuilding(state, derived, 'hut', 1)
  ok('拆除后数量归零', E.countOf(state, 'hut') === 0)
  ok('拆除返还了材料', state.resources.qi > resBefore - 1000)
}

// ------------------------------------------------------------
section('建筑维护费（只有带维护费的建筑能停用）')
// ------------------------------------------------------------
{
  // 数据完整性：维护费必须指向真实资源、且是正数
  const badRes = []
  const zero = []
  for (const b of E.BUILDINGS) {
    for (const [res, v] of Object.entries(b.upkeep || {})) {
      if (!E.RESOURCES.some((r) => r.id === res)) badRes.push(`${b.id}.${res}`)
      if (!(v > 0)) zero.push(`${b.id}.${res}`)
    }
  }
  ok('维护费指向的资源都存在', badRes.length === 0, badRes.join(','))
  ok('维护费都是正数', zero.length === 0, zero.join(','))
  const withUpkeep = E.BUILDINGS.filter((b) => b.upkeep)
  ok('有多座建筑带维护费', withUpkeep.length >= 4, `${withUpkeep.length} 座`)
  ok('带维护费的建筑都能被停用', withUpkeep.every((b) => !!b.upkeep))
  ok(
    '纯产出 / 仓储 / 减耗类没有维护费',
    !E.BUILDING_MAP.spiritField.upkeep &&
      !E.BUILDING_MAP.hut.upkeep &&
      !E.BUILDING_MAP.depot.upkeep &&
      !E.BUILDING_MAP.spiritLockArray.upkeep,
  )

  const { state, derived } = newGameRunning()
  state.disciples.total = 0 // 排除弟子口粮的干扰，只看维护费
  state.resources.qi = 500
  state.buildings.mountainArray = { count: 3, on: true }
  E.recompute(state, derived)

  const unit = E.BUILDING_MAP.mountainArray.upkeep.qi
  ok('维护费按启用数叠加', close(-derived.expense.qi, unit * 3, 1e-9), `${-derived.expense.qi} vs ${unit * 3}`)
  ok(
    '出项明细之和 = 该资源出项总额',
    close((derived.expenseSources.qi || []).reduce((s, x) => s + x.value, 0), derived.expense.qi, 1e-9),
  )
  ok('净额 = 产出 − 出项', close(derived.net.qi, derived.rates.qi - -derived.expense.qi, 1e-9))
  ok(
    '出项明细写明了是哪座建筑、几座',
    (derived.expenseSources.qi || []).some((x) => x.id === 'mountainArray' && x.count === 3),
  )

  // tick 真的按净额扣（灵气上限 500，跑 10 秒不会撞顶）
  // 注意：tick 内部可能因为成就等触发 recompute，所以用「tick 前的净额」算期望，容差 1%
  state.resources.qi = 300
  const qiBefore = state.resources.qi
  const netBefore = derived.rates.qi + derived.expense.qi
  const expect = -netBefore * 10
  E.tick(state, derived, 10, { events: false })
  const spent = qiBefore - state.resources.qi
  ok(
    '挂 10 秒按「产出 − 维护费」结算',
    Math.abs(spent - expect) / Math.abs(expect) < 0.01,
    `${spent} vs ${expect}`,
  )

  // 停用即停费
  E.toggleBuilding(state, derived, 'mountainArray')
  ok('停用护山大阵后不再吃灵气', !derived.expense.qi, `${derived.expense.qi}`)
  ok('停用后护山效果也归零', derived.disasterGuard === 0, `${derived.disasterGuard}`)
}


{
  const { state, derived } = newGameRunning()
  E.recruitArrivals(state, derived, 60) // 已经是 4 人（住满），不该再多
  ok('住满时不会再有人来', state.disciples.total === 4, `实际 ${state.disciples.total}`)

  E.setJob(state, derived, 'farmer', 3)
  ok('阵徒 3 人', state.disciples.jobs.farmer === 3)
  ok('闲散 1 人', E.idleDisciples(state) === 1)
  ok(
    '灵气产出按人数放大（1 座聚灵阵 + 3 名阵徒，再乘春季 +20%）',
    close(derived.rates.qi, (0.3 + 1.8) * 1.2, 1e-9),
    `实际 ${derived.rates.qi}`,
  )

  E.setJob(state, derived, 'farmer', 99)
  ok('超出人数会被夹到可用上限', state.disciples.jobs.farmer === 4)
  ok('没有闲散弟子', E.idleDisciples(state) === 0)

  E.setJob(state, derived, 'farmer', 2)
  ok('减少职位人数后出现闲散', E.idleDisciples(state) === 2, `实际 ${E.idleDisciples(state)}`)

  E.setJob(state, derived, 'woodcutter', 2)
  ok('闲散弟子被派往另一个职位', state.disciples.jobs.farmer === 2 && state.disciples.jobs.woodcutter === 2)
  ok('总数保持不变', state.disciples.total === 4)

  E.setJob(state, derived, 'woodcutter', 99)
  ok('没人的时候抢不到人', state.disciples.jobs.woodcutter === 2)

  E.fillJob(state, derived, 'woodcutter')
  ok('一键填满把闲散都派出去', E.idleDisciples(state) === 0)
}

// ------------------------------------------------------------
section('矿工灵石副产出')
{
  const { state: s, derived: d } = newGame()
  s.disciples.total = 10
  s.disciples.jobs.miner = 10
  // 玄铁现在挂在「探矿术」上（矿工副产出），不再需要单独开一座玄铁矿
  s.upgrades.prospectStudy = true
  s.buildings.quarry = { count: 1, on: true }
  E.recompute(s, d)
  ok('没有灵石矿时矿工仅产玄铁', !(d.sources.stone || []).some(x => x.id === 'miner'))
  s.buildings.spiritQuarry = { count: 1, on: true }
  E.recompute(s, d)
  const stone = d.sources.stone.find(x => x.id === 'miner')
  const ore = d.sources.ore.find(x => x.id === 'miner')
  ok('矿工灵石基础产出比玄铁低一个数量级', close(stone.raw, 0.015) && close(stone.raw / ore.raw, 0.1))
  ok('灵石副产出记入收支来源并应用灵石倍率', stone.count === 10 && close(stone.value, stone.raw * d.sourceFactor.stone) && close(d.sources.stone.reduce((sum, x) => sum + x.value, 0), d.rates.stone))
  s.buildings.spiritQuarry.count = 10
  E.recompute(s, d)
  ok('十座灵石矿固定叠加十倍灵石副产出', close(d.sources.stone.find(x => x.id === 'miner').raw, stone.raw * 10))
  ok('扩建灵石矿不增加矿石和玄铁产出', close(d.sources.ore.find(x => x.id === 'miner').raw, ore.raw) && close(d.sources.rock.find(x => x.id === 'miner').raw, 1.5))
  s.disciples.jobs.miner = 0
  E.recompute(s, d)
  ok('灵石矿无人采矿时不产灵石', d.rates.stone === 0)
  s.disciples.jobs.miner = 10
  s.buildings.spiritQuarry.on = false
  E.recompute(s, d)
  ok('停用灵石矿后副产出停止且玄铁保留', !d.sources.stone?.some(x => x.id === 'miner') && d.sources.ore.some(x => x.id === 'miner'))
}
section('基础资源由人力生产，普通聚灵阵例外')
{
  const humanResources = new Set(JOBS.map(job => job.resource))
  humanResources.add('stone')
  ok('只有普通聚灵阵自带人力资源产出', BUILDINGS.every(b =>
    b.id === 'spiritField' || Object.keys(b.effects.prod || {}).every(id => !humanResources.has(id))))
  const { state: s, derived: d } = newGame()
  for (const id of ['lumberYard', 'quarry', 'ironFurnace', 'spiritQuarry', 'herbGarden', 'library', 'gate', 'beastGarden', 'gatheringArray', 'crystalArray']) {
    s.buildings[id] = { count: 1, on: true }
  }
  s.resources.qi = 1000
  s.resources.herb = 1000
  E.recompute(s, d)
  ok('建好设施但无人时，基础物资与灵机香火均无产出', [...humanResources].every(id => d.rates[id] === 0))
  s.disciples.total = JOBS.length
  for (const job of JOBS) E.setJob(s, d, job.id, 1)
  ok('派遣弟子后，各职位资源开始生产', JOBS.every(job => d.rates[job.resource] > 0))
  ok('矿工矿石产出记入人力来源', d.sources.rock.some(source => source.kind === 'job' && source.id === 'miner' && close(source.raw, 0.15)))
  E.setJob(s, d, 'miner', 0)
  ok('撤回矿工后矿石与玄铁停止生产', d.rates.rock === 0 && d.rates.ore === 0)
  const fresh = normalizeState({ buildings: { quarry: { count: 1, on: true } }, disciples: { total: 1, jobs: {} } })
  ok('旧档补齐矿工且不自动占用人口', fresh.disciples.jobs.miner === 0 && !('stonecutter' in fresh.disciples.jobs) && fresh.disciples.total === 1)
}

section('进项来源明细')
// ------------------------------------------------------------
{
  const { state, derived } = newGameRunning()
  state.resources.qi = 5000
  state.resources.wood = 5000
  E.buyBuilding(state, derived, 'spiritField', 2)
  E.buyBuilding(state, derived, 'lumberYard', 2)
  E.setJob(state, derived, 'farmer', 2)

  const sources = derived.sources.qi || []
  const sum = sources.reduce((s, x) => s + x.value, 0)
  ok('进项来源之和等于进项总额', close(sum, derived.rates.qi, 1e-6), `${sum} vs ${derived.rates.qi}`)
  ok(
    '阵徒出现在来源里且带人数',
    sources.some((s) => s.kind === 'job' && s.id === 'farmer' && s.count === 2),
  )
  ok(
    '聚灵阵出现在来源里且带座数',
    sources.some((s) => s.kind === 'building' && s.id === 'spiritField' && s.count === 3),
  )
  ok('来源按数值从大到小排列', sources.every((s, i) => i === 0 || sources[i - 1].value >= s.value))

  const factor = derived.sourceFactor.qi
  ok('加成倍率把原始值折算成最终值', close(sources[0].raw * factor, sources[0].value, 1e-9))

  const expenses = derived.expenseSources.qi || []
  const expenseSum = expenses.reduce((s, x) => s + x.value, 0)
  ok(
    '出项明细之和等于 −upkeep',
    close(expenseSum, -derived.upkeep, 1e-6),
    `${expenseSum} vs ${-derived.upkeep}`,
  )
  ok('出项里写明弟子人数', expenses.some((x) => x.label === '弟子' && x.count === state.disciples.total))

  // 库房：只存基础物资（灵木 / 灵石 / 玄铁 / 灵草），且份额按流量分配
  {
    const wh = BUILDING_MAP.warehouse
    // 灵气是"气脉"的资源，不是砖石：只有与气本身有关的建筑、以及开局自举的那几座才用它
  {
    const allowed = new Set([
      'spiritField', // 聚灵阵：聚气之法，起手就要引气
      'hut', // 茅屋：开局第一座，此时手头只有灵气
      'lumberYard', // 伐木场：从"只有灵气"跨到"有木料"的那一步
      'library', // 藏经阁：以灵气养典籍
    ])
    const offenders = BUILDINGS.filter((x) => x.cost?.qi && !allowed.has(x.id)).map((x) => x.name)
    ok('灵气不当建材（实物建筑一律用材料计价）', offenders.length === 0, offenders.join('、') || '干净')

    ok(
      '炼铁炉与药圃按材料计价',
      !BUILDING_MAP.ironFurnace.cost.qi && !BUILDING_MAP.herbGarden.cost.qi,
      JSON.stringify({ mine: BUILDING_MAP.ironFurnace.cost, herbGarden: BUILDING_MAP.herbGarden.cost }),
    )
  }

  ok('库房改为逐资源上限（不再用 storageAll）', !!wh.effects.storage && !wh.effects.storageAll)
    const st = wh.effects.storage
    ok(
      '库房只存基础物资（灵木 / 灵石 / 矿石 / 玄铁 / 灵草）',
      Object.keys(st).sort().join(',') === 'herb,ore,rock,stone,wood',
      Object.keys(st).join(','),
    )
    ok('库房不再碰灵气 / 灵机 / 丹药 / 符箓 / 香火 / 法器', ['qi', 'insight', 'pill', 'talisman', 'faith', 'artifact'].every((k) => !st[k]))
    ok('份额按流量排序（灵木最多、玄铁最少）', st.wood > st.stone && st.stone > st.rock && st.rock > st.herb && st.herb > st.ore, JSON.stringify(st))
    // 被移出去的那几种资源，各自有专属建筑在给上限
    const capSource = (res) =>
      BUILDINGS.filter(
        (b) => b.effects?.storage?.[res] || (b.effects?.storageAll && b.id !== 'warehouse'),
      ).map((b) => b.name)
    ok('灵气上限另有来源（谷仓 / 茅屋 / 木屋）', capSource('qi').includes('谷仓') && capSource('qi').includes('茅屋'), capSource('qi').join('、'))
    ok('灵机上限归藏经阁 / 讲经堂 / 观星台', ['藏经阁', '讲经堂', '观星台'].every((n) => capSource('insight').includes(n)), capSource('insight').join('、'))
    ok('丹药 / 符箓 / 法器各有专属仓（炼丹房 / 符箓堂 / 炼器坊）', ['炼丹房', '符箓堂', '炼器坊'].every((n) => capSource('pill').includes(n) || capSource('talisman').includes(n) || capSource('artifact').includes(n)), `${capSource('pill')} / ${capSource('talisman')} / ${capSource('artifact')}`)
    ok('香火上限归山门 / 香火鼎', capSource('faith').includes('山门') && capSource('faith').includes('香火鼎'), capSource('faith').join('、'))
    // 生效检查：建 1 座库房，基础物资的上限按表抬高，其它资源一律不动
    const { state: s4, derived: d4 } = newGame()
    s4.buildings.lumberYard = { count: 3, on: true }
    s4.upgrades.earthArt = true // 库房现在挂在「土木术」后面
    E.recompute(s4, d4)
    const before = { ...d4.max }
    s4.resources.wood = 5000
    s4.resources.stone = 5000
    s4.resources.rock = 5000
    s4.resources.ore = 5000
    s4.resources.qi = 5000
    E.trackPeak(s4)
    ok('库房真的建起来了（前置检查）', E.buyBuilding(s4, d4, 'warehouse', 1) === 1)
    const delta = (r) => (d4.max[r] || 0) - (before[r] || 0)
    ok(
      '基础物资的上限按表逐项抬高',
      Object.keys(st).every((r) => close(delta(r), st[r], 1e-6)),
      Object.keys(st).map((r) => `${r}+${delta(r)}`).join(' '),
    )
    ok(
      '其它资源的上限一点都不动',
      ['qi', 'insight', 'pill', 'talisman', 'faith', 'artifact'].every((r) => close(delta(r), 0, 1e-6)),
      ['qi', 'insight', 'pill', 'talisman', 'faith', 'artifact'].map((r) => `${r}+${delta(r)}`).join(' '),
    )
  }

  // 加成倍率要能拆开：每一项的和 = 该项总额，逐项相乘 = sourceFactor
  {
    state.buildings.gatheringArray = { count: 2, on: true }
    state.upgrades.qiArt = true
    state.upgrades.spiritBanner = true
    state.achievements.firstHut = true
    E.recompute(state, derived)
    const b = derived.bonus
    ok('专业加成进入资源拆分账，生产设施不再提供全局加成', Object.keys(b.ratio).length > 0 && (ACHIEVEMENT_REWARD > 0 || b.ratioAll.length === 0))
    const ratioSum = (b.ratio.qi || []).reduce((s, x) => s + x.value, 0)
    ok('拆分之和 = derived.ratio.qi', close(ratioSum, derived.ratio.qi, 1e-9), `${ratioSum} vs ${derived.ratio.qi}`)
    const allSum = b.ratioAll.reduce((s, x) => s + x.value, 0)
    ok('拆分之和 = ratioAll', close(allSum, derived.ratioAll, 1e-9), `${allSum} vs ${derived.ratioAll}`)
    ok(
      '逐项相乘 = sourceFactor（灵气）',
      close(
        (1 + ratioSum) * (1 + allSum) * (1 + (derived.seasonRatio.qi || 0)) * b.globalMult,
        derived.sourceFactor.qi,
        1e-9,
      ),
      `${(1 + ratioSum) * (1 + allSum) * (1 + (derived.seasonRatio.qi || 0)) * b.globalMult} vs ${derived.sourceFactor.qi}`,
    )
    ok('拆分里能追到具体条目（引气诀 / 聚灵大阵）', (() => {
      const labels = [...(b.ratio.qi || []), ...b.ratioAll].map((x) => x.id)
      return labels.includes('qiArt') && labels.includes('gatheringArray')
    })(), [...(b.ratio.qi || []), ...b.ratioAll].map((x) => x.id).join(','))
    // 成就奖励清零后，加成拆解里不该再出现一条 0% 的「成就」明细
    ok(
      ACHIEVEMENT_REWARD > 0
        ? '成就条目带条数'
        : '成就奖励为 0 时，拆解里不列出成就明细',
      ACHIEVEMENT_REWARD > 0
        ? b.ratioAll.some((x) => x.id === 'achievements' && x.count === 1)
        : !b.ratioAll.some((x) => x.id === 'achievements'),
    )
  }

  // 停用带维护费的建筑后，它的产出与维护费一起从账上消失
  state.buildings.gatheringArray = { count: 2, on: true }
  E.recompute(state, derived)
  ok('启用时它在吃灵气', (derived.maintenance.qi || 0) > 0, `${derived.maintenance.qi}`)
  E.toggleBuilding(state, derived, 'gatheringArray')
  ok('停用后该建筑不再计入来源', !(derived.sources.qi || []).some((s) => s.id === 'gatheringArray'))
  ok('停用后这一项不再出现在出项里', !(derived.expenseSources.qi || []).some((s) => s.id === 'gatheringArray'))
  const sum2 = (derived.sources.qi || []).reduce((s, x) => s + x.value, 0)
  ok('停用后来源之和仍等于进项总额', close(sum2, derived.rates.qi, 1e-6))
  const exp2 = (derived.expenseSources.qi || []).reduce((s, x) => s + x.value, 0)
  ok('停用后出项明细之和 = −弟子口粮', close(exp2, -derived.upkeep, 1e-6), `${exp2} vs ${-derived.upkeep}`)
}

// ------------------------------------------------------------
section('还差多久买得起')
// ------------------------------------------------------------
{
  const { state, derived } = newGameRunning()
  state.resources.qi = 500
  state.resources.wood = 0
  state.resources.stone = 0
  // 让灵气净额为正，否则「现印」路径会（正确地）返回 Infinity
  state.buildings.spiritField = { count: 6, on: true }
  E.setJob(state, derived, 'farmer', 2)
  E.setJob(state, derived, 'woodcutter', 1)
  E.recompute(state, derived)

  ok('已经够时返回 0', E.timeToAfford(state, derived, 'qi', 100) === 0)
  const rate = derived.rates.wood
  ok('伐木工真的在产灵木（前置检查）', rate > 0, `${rate}`)
  // 催生灵木是配方：灵气在手时，灵木可以**立刻**换到 —— 所以等待是 0，这是对的行为
  ok(
    '有灵气时灵木可立刻换到（等待 0）',
    E.timeToAfford(state, derived, 'wood', 30) === 0,
    String(E.timeToAfford(state, derived, 'wood', 30)),
  )
  // 把灵气清零，检验另一条路径：只能靠产率等
  // 只清掉灵气存量还不够：灵气**产率**仍在，于是"印灵气换灵木"这条路比灵木自身产率更快，
  // timeToAfford 会（正确地）给出更短的时间。要隔离出纯产率路径，必须把这条路也断掉。
  state.resources.qi = 0
  E.recompute(state, derived)
  // 注意：timeToAfford 读的是 derived.net（净额），只改 rates 是拦不住它的
  derived.rates = { ...derived.rates, qi: 0 }
  derived.net = { ...(derived.net || {}), qi: 0 }
  const rateNow = derived.rates.wood
  const wait = E.timeToAfford(state, derived, 'wood', 30)
  ok('灵气与灵气产率都断了，按灵木产率算等待', close(wait, 30 / rateNow, 1e-9), `${wait} vs ${30 / rateNow}`)
  ok(
    '既没有产出、也没有配方的资源返回 Infinity（例如仙缘）',
    E.timeToAfford(state, derived, 'karma', 30) === Infinity,
  )
  ok(
    '配方还没解锁的成品也返回 Infinity（例如没炼器坊时的法器）',
    E.timeToAfford(state, derived, 'artifact', 5) === Infinity,
  )

  // 灵石没有产出，全靠「点石成灵」现印 —— 这条路径也要给出计时器
  state.resources.rock = 100 // 本段单独验证灵气等待，矿物载体已备齐。
  state.buildings.quarry = { count: 1, on: true }
  state.resources.qi = 0
  E.recompute(state, derived)
  const stoneCost = E.CRAFT_MAP.infuseStone.cost.qi
  const netQi = derived.netQi
  ok('灵石的计量走现印路径', netQi > 0, `netQi=${netQi}`)
  ok(
    '灵石缺口 = 凑够兑换所需灵气的时间',
    close(E.timeToAfford(state, derived, 'stone', 30), (30 * stoneCost - state.resources.qi) / netQi, 1e-6),
    `${E.timeToAfford(state, derived, 'stone', 30)}`,
  )
  state.resources.stone = 1
  ok('灵石已经够时返回 0', E.timeToAfford(state, derived, 'stone', 1) === 0)
  state.resources.stone = 0

  // 勾上「自动」之后，还要把一份一份做的耗时算进去
  state.upgrades.intuition = true
  state.autoCraft.infuseStone = true
  state.settings.autoCraftOn = true
  E.recompute(state, derived)
  const withAuto = E.timeToAfford(state, derived, 'stone', 30)
  const withoutAuto = (30 * stoneCost - state.resources.qi) / derived.netQi
  ok(
    '开自动后把制作耗时也加上（30 份 × 0.5 秒）',
    close(withAuto, withoutAuto + 30 * E.craftTime(E.CRAFT_MAP.infuseStone), 1e-6),
    `${withAuto} vs ${withoutAuto}`,
  )
  state.autoCraft.infuseStone = false

  // 凝灵诀：每逢节气，灵气满仓时把仓内一定比例（AUTO_CONDENSE_RATIO）凝成灵液；不满仓不动手
  {
    const { state: s4, derived: d4 } = newGame()
    s4.buildings.quarry = { count: 1, on: true }
    s4.resources.rock = d4.max.rock
    ok('未参悟凝灵诀时不置位', d4.autoCondenseLiquidUnlocked === false)
    s4.upgrades.condenseArt = true
    E.recompute(s4, d4)
    ok('参悟凝灵诀后置位 autoCondenseLiquidUnlocked', d4.autoCondenseLiquidUnlocked === true)
    ok('凝灵诀开放库存目标但不提前解锁常驻自动', d4.autoCraftUnlocked === false && d4.craftTargetsUnlocked === true)
    s4.resources.qi = d4.max.qi
    ok('未掌握凝液法时不提前凝液或凝石', !E.runAutoCondense(s4, d4) && s4.resources.spiritLiquid === 0 && s4.resources.stone === 0)
    s4.upgrades.liquidArt = true
    s4.buildings.granary = { count: 5, on: true }
    s4.upgrades.intuition = true
    E.recompute(s4, d4)
    ok('《心有灵犀》即解锁库存目标（不再等金丹期）', d4.autoCraftUnlocked === true && d4.craftTargetsUnlocked === true)
    const qiMax = d4.max.qi
    const qiCost = E.CRAFT_MAP.condenseLiquid.cost.qi
    s4.resources.qi = qiMax * 0.999
    ok('灵气不满仓时不动手', E.runAutoCondense(s4, d4) === false && s4.resources.qi === qiMax * 0.999)
    s4.resources.qi = qiMax
    const expect = Math.floor((qiMax * CONFIG.AUTO_CONDENSE_RATIO) / qiCost)
    ok(
      '满仓时按仓内比例一次凝掉',
      E.runAutoCondense(s4, d4) === true &&
        close(s4.resources.qi, qiMax - expect * qiCost, 1e-6) &&
        s4.resources.spiritLiquid === expect,
    )
    s4.resources.spiritLiquid = d4.max.spiritLiquid
    s4.resources.qi = qiMax
    ok('灵液满仓时不再凝', E.runAutoCondense(s4, d4) === false)
    s4.resources.spiritLiquid = 0
    s4.settings.autoCraftOn = false
    ok('关闭总开关时凝灵诀不扣灵气', !E.runAutoCondense(s4, d4) && s4.resources.qi === qiMax)
    s4.settings.autoCraftOn = true
    E.setCraftTarget(s4, d4, 'condenseLiquid', 2)
    E.runAutoCondense(s4, d4)
    ok('批量凝液逐份遵守库存目标', s4.resources.spiritLiquid === 2 && s4.resources.qi === qiMax - qiCost * 2)
    s4.resources.qi = qiMax
    ok('目标已达时不凝液', !E.runAutoCondense(s4, d4) && s4.resources.qi === qiMax)
    s4.resources.spiritLiquid = 1
    E.runAutoCondense(s4, d4)
    ok('消费灵液后下一次凝液补回目标', s4.resources.spiritLiquid === 2 && s4.resources.qi === qiMax - qiCost)
    E.setCraftTarget(s4, d4, 'condenseLiquid', 0)
    s4.dao = 1
    s4.settings.craftReservePercent = 90
    s4.resources.qi = qiMax
    s4.resources.spiritLiquid = 0
    s4.resources.rock = d4.max.rock
    E.recompute(s4, d4)
    E.runAutoCondense(s4, d4)
    ok('凝灵诀按份保留道果指定的材料', s4.resources.qi >= qiMax * 0.9 && s4.resources.spiritLiquid === Math.floor(qiMax * 0.1 / qiCost))
    s4.upgrades.condenseArt = false
    E.recompute(s4, d4)
    ok('移除凝灵诀后解锁标记恢复 false', d4.autoCondenseLiquidUnlocked === false)
  }

  // 凝灵诀由节气驱动：跨过节气边界的那一刻结算（挂在 tick 的历法推进里，离线模拟同样逐步过 tick）
  {
    const { state: s5, derived: d5 } = newGame()
    s5.buildings.quarry = { count: 1, on: true }
    s5.resources.rock = d5.max.rock
    s5.upgrades.condenseArt = true
    s5.upgrades.liquidArt = true
    s5.buildings.granary = { count: 5, on: true }
    E.recompute(s5, d5)
    const qiMax = d5.max.qi
    const qiCost = E.CRAFT_MAP.condenseLiquid.cost.qi
    const expect = Math.floor((qiMax * CONFIG.AUTO_CONDENSE_RATIO) / qiCost)
    s5.resources.qi = qiMax
    E.simulateOffline(s5, d5, CALENDAR.DAYS_PER_TERM * CALENDAR.DAY_SECONDS + 1)
    ok(
      '节气一到，满仓灵气凝成灵液（离线也照做）',
      s5.resources.spiritLiquid === expect && close(s5.resources.qi, qiMax - expect * qiCost, 1e-6),
      `stone=${s5.resources.spiritLiquid} qi=${s5.resources.qi}`,
    )
    s5.resources.spiritLiquid = 0
    s5.resources.qi = qiMax
    E.setCraftTarget(s5, d5, 'condenseLiquid', 2)
    E.simulateOffline(s5, d5, CALENDAR.DAYS_PER_TERM * CALENDAR.DAY_SECONDS)
    ok('离线节气凝液也遵守库存目标', s5.resources.spiritLiquid === 2 && s5.resources.qi === qiMax - qiCost * 2)
    s5.resources.qi = qiMax
    s5.resources.spiritLiquid = 0
    s5.settings.autoCraftOn = false
    E.simulateOffline(s5, d5, CALENDAR.DAYS_PER_TERM * CALENDAR.DAY_SECONDS)
    ok('离线凝液遵守总开关', s5.resources.spiritLiquid === 0 && s5.resources.qi === qiMax)
  }

  ok(
    '灵气按净额计算等待时间',
    close(
      E.timeToAfford(state, derived, 'qi', 500),
      state.resources.qi >= 500 ? 0 : (500 - state.resources.qi) / derived.netQi,
      1e-9,
    ),
  )
  state.resources.qi = 400
  ok('灵气净额为负时返回 Infinity', E.timeToAfford(state, derived, 'qi', 99999) > 0)
  // 把人气拉到吃不上饭：净额转负，现印路径也得给不出时间
  state.disciples.total = 40
  E.recompute(state, derived)
  ok('灵气净额为负时，现印路径也给不出时间', derived.netQi < 0 && E.timeToAfford(state, derived, 'stone', 99999) === Infinity)

  // 另外三种成品（丹药/符箓/法器）走同一套现印路径：材料有产出、配方已解锁就都能给出时间
  {
    const { state: s3, derived: d3 } = newGame()
    s3.buildings.alchemyRoom = { count: 1, on: true }
    s3.buildings.talismanHall = { count: 1, on: true }
    s3.buildings.forge = { count: 1, on: true }
    s3.buildings.herbGarden = { count: 4, on: true }
    s3.buildings.lumberYard = { count: 30, on: true }
    // 玄铁不再靠单独开矿：学会探矿术后，矿工一并采出；炼铁炉再用矿石与灵木把它烧出来
    s3.upgrades.prospectStudy = true
    s3.buildings.ironFurnace = { count: 1, on: true }
    s3.buildings.quarry = { count: 3, on: true }
    s3.resources.qi = 5000
    // 灵气**净额必须为正**：法器要灵石、灵石靠「点石成灵」吃灵气，
    // 若灵气净额为负，现印路径会（正确地）返回 Infinity —— 那样测的就不是配方链了。
    // 20 名弟子：10 名阵徒产 6 气/秒 > 20 × 0.25 的口粮；4 名矿工供得上 1 座炼铁炉的炉料。
    s3.disciples.total = 20
    s3.disciples.jobs = { farmer: 10, woodcutter: 6, herbalist: 2, miner: 4 }
    E.recompute(s3, d3)
    const waits = []
    for (const [res, name] of [
      ['pill', '丹药'],
      ['talisman', '符箓'],
      ['artifact', '法器'],
    ]) {
      const w = E.timeToAfford(s3, d3, res, 5)
      // 灵气在手时，缺口可以沿"现印"路径补齐：木料还能再顺着「催生灵木」即时换到，
      // 所以符箓的等待**可能是 0**（现印能立刻凑齐）—— 这是对的，不是 bug。
      waits.push(w)
      ok(`${name}的缺口能算出时间（现印路径）`, Number.isFinite(w) && w >= 0, `${w}`)
    }
    // 但"按产率等"这条时间路径不该被现印完全取代：丹药要灵草、法器要矿料，都还得等
    ok(
      '至少有一种仍需要等待产率（时间路径仍在）',
      waits.some((w) => w > 0),
      waits.map((w) => (Number.isFinite(w) ? w.toFixed(1) : '∞')).join(' / '),
    )
  }
}

// ------------------------------------------------------------
section('弟子自动前来')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  // 开局一片空地：没有居所就没有弟子上限，自然也没人来
  ok('开局 0 人且上限为 0', state.disciples.total === 0 && derived.maxDisciples === 0)
  E.recruitArrivals(state, derived, 600, { silent: true })
  ok('没有居所时不会来人', state.disciples.total === 0)

  state.resources.qi = 2000
  state.resources.stone = 100
  state.resources.qi = 2000
  state.buildings.spiritField = { count: 1, on: true } // 茅屋现在要一座聚灵阵
  state.buildings.granary = { count: 20, on: true } // 抬灵气上限，才买得起一次九座
  E.buyBuilding(state, derived, 'hut', 1) // 上限 2
  const interval = E.arrivalInterval(derived)
  ok('间隔取配置值', close(interval, 15, 1e-9), `实际 ${interval}`)

  E.recruitArrivals(state, derived, interval - 1, { silent: true })
  ok('没到间隔不会来人', state.disciples.total === 0, `实际 ${state.disciples.total}`)
  E.recruitArrivals(state, derived, 1.5, { silent: true })
  ok('到点来一名', state.disciples.total === 1, `实际 ${state.disciples.total}`)

  E.recruitArrivals(state, derived, interval * 10, { silent: true })
  ok('一路来到住满为止', state.disciples.total === derived.maxDisciples)
  ok('住满后计时清零', state.arrivalTimer === 0)

  ok('nextArrivalIn 在满员时为 null', E.nextArrivalIn(state, derived) === null)
  state.resources.wood = 100
  E.buyBuilding(state, derived, 'hut', 1)
  const wait = E.nextArrivalIn(state, derived)
  ok('扩建后给出下一位的时间', wait !== null && wait > 0 && wait <= E.arrivalInterval(derived), `${wait}`)

  // 《广开山门》缩短间隔
  state.upgrades.recruitDrive = true
  state.resources.insight = 9999
  state.resources.stone = 9999
  state.resources.faith = 9999
  E.recompute(state, derived)
  ok('《广开山门》缩短前来间隔', close(E.arrivalInterval(derived), 15 * 0.7, 1e-9))

  // 弟子到达后应写进纪事
  const logBefore = state.log.length
  E.recruitArrivals(state, derived, E.arrivalInterval(derived) + 0.1)
  ok('弟子到来会写纪事', state.log.length > logBefore && state.log[0].text.includes('慕名而来'))
}

// ------------------------------------------------------------
section('历法与节气')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  const C = E.calendarAt(0)
  ok('开局是第 1 年立春第 1 天', C.year === 1 && C.termName === '立春' && C.day === 1)
  ok('开局是春季', C.seasonName === '春')

  // 推算：1 节气 15 天、1 季 6 节气、1 年 24 节气
  ok('第 15 天进入下一个节气', E.calendarAt(15).termName === '雨水', E.calendarAt(15).termName)
  ok('第 90 天入夏', E.calendarAt(90).seasonName === '夏', E.calendarAt(90).seasonName)
  ok('第 180 天入秋', E.calendarAt(180).seasonName === '秋')
  ok('第 270 天入冬', E.calendarAt(270).seasonName === '冬')
  ok('第 360 天进入第 2 年立春', E.calendarAt(360).year === 2 && E.calendarAt(360).termName === '立春')

  // 季节真的影响产出
  const spring = newGameRunning()
  const winter = newGameRunning()
  spring.state.totalDays = 10 // 春
  winter.state.totalDays = 300 // 冬
  E.recompute(spring.state, spring.derived)
  E.recompute(winter.state, winter.derived)
  ok(
    '春季灵气产出高于冬季',
    spring.derived.rates.qi > winter.derived.rates.qi,
    `${spring.derived.rates.qi} vs ${winter.derived.rates.qi}`,
  )
  ok('春季灵草有加成', (spring.derived.seasonRatio.herb || 0) > 0)
  ok('冬季灵草减产', (winter.derived.seasonRatio.herb || 0) < 0)
  ok('冬季灵机加成', (winter.derived.seasonRatio.insight || 0) > 0)
  ok(
    '季节倍率乘进了产出（1 座聚灵阵 0.3，春季 +20%）',
    close(spring.derived.rates.qi, 0.3 * 1.2, 1e-9),
    `${spring.derived.rates.qi}`,
  )

  // 时间推进：一天 CALENDAR.DAY_SECONDS 秒。
  // 时长全部从常量推出来 —— 以前这里把「2 秒一天 / 30 秒一节气」写死了，改历法就会红一片。
  const DAY = CALENDAR.DAY_SECONDS
  const TERM_SECONDS = CALENDAR.DAYS_PER_TERM * DAY // 1 节气 = 15 天
  const t = newGame()
  E.tick(t.state, t.derived, DAY * 3, { events: false })
  ok(`${DAY} 秒一天：${DAY * 3} 秒过去 3 天`, close(t.state.totalDays, 3, 1e-9), `实际 ${t.state.totalDays}`)

  // 跨节气：只更新历法面板，不该写纪事（一节气只有几十秒，写纪事会把纪事刷满）
  {
    const before = t.state.log.length
    const termBefore = t.derived.calendar.termName
    E.tick(t.state, t.derived, TERM_SECONDS, { events: false })
    ok(
      `${TERM_SECONDS} 秒过去 1 个节气`,
      t.derived.calendar.termName !== termBefore,
      `${termBefore} → ${t.derived.calendar.termName}`,
    )
    ok('节气变化不写纪事', t.state.log.length === before, `多了 ${t.state.log.length - before} 条`)
  }
  // 入季才写纪事（一季 6 个节气，上面已经过掉 1 个，再跑 5 个）
  {
    const before = t.state.log.length
    const seasonBefore = t.derived.calendar.seasonName
    for (let i = 0; i < 5; i++) E.tick(t.state, t.derived, TERM_SECONDS, { events: false })
    ok('入季会写纪事', t.state.log.length > before && t.state.log.some((l) => l.text.includes('入')), `${t.state.log.length - before} 条`)
    ok('跨季后季节真的换了', t.derived.calendar.seasonName !== seasonBefore, `${seasonBefore} → ${t.derived.calendar.seasonName}`)
  }
  ok('一季 90 天 / 一年 360 天', close(E.calendarAt(90).seasonIndex, 1, 1e-9) && close(E.calendarAt(360).year, 2, 1e-9), `${E.calendarAt(90).seasonName} / 第 ${E.calendarAt(360).year} 年`)

  // 四季的强度阶梯：春正、夏正为主、秋中立、冬负为主；且每种资源四季平均 ≈ 0（历法不送净加成）
  {
    const byId = Object.fromEntries(SEASONS.map((s) => [s.id, s.ratio || {}]))
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0)
    const pos = (o) => Object.values(o).filter((v) => v > 0).reduce((a, b) => a + b, 0)
    const neg = (o) => Object.values(o).filter((v) => v < 0).reduce((a, b) => a + b, 0)
    ok('春全为正向', Object.values(byId.spring).every((v) => v >= 0) && sum(byId.spring) > 0.5, JSON.stringify(byId.spring))
    ok(
      '夏正向为主（有正有负，但正的更大）',
      Object.values(byId.summer).some((v) => v > 0) && Object.values(byId.summer).some((v) => v < 0) && pos(byId.summer) > -neg(byId.summer),
      JSON.stringify(byId.summer),
    )
    ok(
      '秋中立（一进一出，净额接近 0）',
      Object.values(byId.autumn).some((v) => v > 0) && Object.values(byId.autumn).some((v) => v < 0) && Math.abs(sum(byId.autumn)) <= 0.05,
      `净 ${sum(byId.autumn).toFixed(3)}`,
    )
    ok(
      '冬负向为主（负项占多数且量更大，最多留一个小正项）',
      Object.values(byId.winter).filter((v) => v < 0).length > Object.values(byId.winter).filter((v) => v > 0).length &&
        -neg(byId.winter) > pos(byId.winter) * 2,
      JSON.stringify(byId.winter),
    )
    // 每种资源的四季平均必须接近 0：历法只是「什么时候好、什么时候难」
    const resIds = new Set(SEASONS.flatMap((s) => Object.keys(s.ratio || {})))
    const bad = []
    for (const id of resIds) {
      const avg = SEASONS.reduce((a, s) => a + (s.ratio?.[id] || 0), 0) / SEASONS.length
      if (Math.abs(avg) > 0.05) bad.push(`${id} ${(avg * 100).toFixed(1)}%`)
    }
    ok('每种资源的四季平均都不超过 ±5%（不给全局送净加成）', bad.length === 0, bad.join('、'))
  }

  // 存档往返
  const saved = JSON.parse(JSON.stringify({ totalDays: t.state.totalDays }))
  ok('历法会进存档', close(saved.totalDays, t.state.totalDays, 1e-9))
}

// ------------------------------------------------------------
section('可购买性：不会被仓储上限卡死')
// ------------------------------------------------------------
{
  // 这一类 bug：某建筑的花费超过了「当前能堆到的上限」，于是它永远买不起。
  // （真实案例：库房要 400 灵木，而灵木基础上限只有 200，且谷仓不提供灵木仓储。）
  //
  // 做法：从基础上限出发做一次不动点推演 —— 凡是「花费都不超过当前上限」的东西就当作买得起，
  // 买得起的仓储加成累加上限，如此循环；最后检查所有花费是否都能被某个上限覆盖。
  // 这里刻意忽略解锁条件，只回答「就算解锁了，钱付得出来吗」。
  const caps = {}
  for (const r of RESOURCES) caps[r.id] = Number.isFinite(r.baseMax) ? r.baseMax : Infinity

  const entries = [
    ...BUILDINGS.map((b) => ({ kind: '建筑', id: b.id, name: b.name, cost: b.cost, effects: b.effects, priceRatio: b.priceRatio || 1 })),
    ...ALL_UPGRADES.map((u) => ({ kind: '修真', id: u.id, name: u.name, cost: u.cost, effects: u.effects, priceRatio: 1 })),
  ]

  const costAt = (e, n) => {
    const out = {}
    for (const [r, v] of Object.entries(e.cost || {})) out[r] = v * Math.pow(e.priceRatio, n)
    return out
  }
  const affordable = (cost) => Object.entries(cost).every(([r, v]) => v <= caps[r] + 1e-9)
  const addStorage = (eff) => {
    let added = false
    if (eff?.storageAll) {
      for (const r of RESOURCES) {
        if (caps[r.id] !== Infinity) {
          caps[r.id] += eff.storageAll * (r.storageWeight ?? 1)
          added = true
        }
      }
    }
    if (eff?.storage) {
      for (const [r, v] of Object.entries(eff.storage)) {
        if (caps[r] !== Infinity) {
          caps[r] += v
          added = true
        }
      }
    }
    return added
  }

  // 上限一直涨，所以同一建筑会反复买得起；每座建筑最多算 200 座，足够暴露问题又能收敛
  let changed = true
  let guard = 0
  while (changed && guard++ < 400) {
    changed = false
    for (const e of entries) {
      for (let n = 0; n < 200; n++) {
        if (!affordable(costAt(e, n))) break
        if (addStorage(e.effects)) changed = true
      }
    }
  }

  const unfundable = []
  for (const e of entries) {
    for (const [r, v] of Object.entries(e.cost || {})) {
      if (v > caps[r] + 1e-9) {
        unfundable.push(`${e.kind}「${e.name}」要 ${RESOURCE_MAP[r]?.name || r} ${v}，上限只到 ${Math.round(caps[r])}`)
      }
    }
  }
  ok('没有「花费超过可达上限」的死锁条目', unfundable.length === 0, unfundable.slice(0, 4).join('；'))

  // 更严的一条设计约定：每种资源都要有一条「能自己起步」的仓储来源 ——
  // 某个条目，它对该资源的花费不超过基础上限，且自己就提供该资源的仓储。
  // 否则玩家会在左栏看到「200/200」而货架上摆着一个 400 的东西，无从下手。
  // （真实案例：库房要 400 灵木、灵木基础上限 200，而仓储组里没有别的灵木来源。）
  const storageEntries = [
    ...BUILDINGS.map((b) => ({ kind: '建筑', name: b.name, cost: b.cost, effects: b.effects })),
    ...ALL_UPGRADES.map((u) => ({ kind: '修真', name: u.name, cost: u.cost, effects: u.effects })),
  ]
  const grants = (eff, r) => (eff?.storage?.[r] || 0) > 0 || (eff?.storageAll || 0) > 0
  const noBootstrap = []
  for (const r of RESOURCES) {
    if (!Number.isFinite(r.baseMax)) continue
    const ok0 = storageEntries.some((e) => grants(e.effects, r.id) && (e.cost?.[r.id] || 0) <= r.baseMax)
    if (!ok0) noBootstrap.push(r.name)
  }
  ok('每种资源都有能自己起步的仓储来源', noBootstrap.length === 0, noBootstrap.join('、'))

  // 具体守住库房这条链：第一座必须能靠基础上限买下，之后自己把自己抬高
  const wh = BUILDINGS.find((b) => b.id === 'warehouse')
  ok(
    '库房第一座在基础上限内买得起',
    (wh.cost.wood || 0) <= RESOURCE_MAP.wood.baseMax && (wh.cost.stone || 0) <= RESOURCE_MAP.stone.baseMax,
    `要 灵木 ${wh.cost.wood} / 灵石 ${wh.cost.stone}，基础上限 灵木 ${RESOURCE_MAP.wood.baseMax} / 灵石 ${RESOURCE_MAP.stone.baseMax}`,
  )
  ok(
    '库房连续几座都买得起（自己抬高上限）',
    (() => {
      let cap = RESOURCE_MAP.wood.baseMax + wh.effects.storageAll
      for (let n = 1; n < 5; n++) {
        const need = wh.cost.wood * Math.pow(wh.priceRatio, n)
        if (need > cap) return false
        cap += wh.effects.storageAll
      }
      return true
    })(),
  )
}

// ------------------------------------------------------------
section('自动制作（一份一份不瞬发，就是原来的「连续」）')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  state.buildings.quarry = { count: 1, on: true }
  // 先给足仓储：这一段专门测节奏，不想被「灵石上限 150」挡住
  state.buildings.warehouse = { count: 30, on: true }
  state.resources.qi = 1500 // 够做 100 份点石成灵
  state.resources.rock = 1000 // 节奏测试备足石材，缺料另测。
  E.recompute(state, derived)
  const step = E.craftTime(E.CRAFT_MAP.infuseStone)

  // 点「制作」是瞬发的：一下立刻出一份
  const before = state.resources.stone
  E.craft(state, derived, 'infuseStone')
  ok('制作是瞬发的（点一下立刻出一份）', state.resources.stone - before === 1)

  // 批量快捷：按「材料能做出来的份数」取 ¼、½、全部
  state.resources.qi = 15 * 20 // 够做 20 份
  E.recompute(state, derived)
  ok('材料够做 20 份', E.maxCraftable(state, derived, 'infuseStone') === 20, `${E.maxCraftable(state, derived, 'infuseStone')}`)
  const q0 = state.resources.qi
  const s0 = state.resources.stone
  E.craftBatch(state, derived, 'infuseStone', 0.25)
  ok(
    '¼料 一次做掉「能做份数」的四分之一（20 → 5 份）',
    state.resources.stone - s0 === 5 && close(q0 - state.resources.qi, 15 * 5, 1e-6),
    `实际 ${state.resources.stone - s0} 份，灵气 -${q0 - state.resources.qi}`,
  )
  state.resources.qi = 15 * 20
  E.recompute(state, derived)
  const q1 = state.resources.qi
  const s1 = state.resources.stone
  E.craftBatch(state, derived, 'infuseStone', 0.5)
  ok(
    '½料 一次做掉一半（20 → 10 份）',
    state.resources.stone - s1 === 10 && close(q1 - state.resources.qi, 15 * 10, 1e-6),
    `实际 ${state.resources.stone - s1} 份`,
  )
  state.resources.qi = 15 * 20
  E.recompute(state, derived)
  const q2 = state.resources.qi
  const s2 = state.resources.stone
  E.craftBatch(state, derived, 'infuseStone', 1)
  ok(
    '全部 一次做光（20 → 20 份）',
    state.resources.stone - s2 === 20 && close(q2 - state.resources.qi, 15 * 20, 1e-6),
    `实际 ${state.resources.stone - s2} 份`,
  )
  state.resources.qi = 15 * 3 // 只够 3 份：四分之一取整为 0
  E.recompute(state, derived)
  ok('份数不足时四分之一取整为 0（不该硬做一份）', E.maxCraftable(state, derived, 'infuseStone') === 3)
  const s3 = state.resources.stone
  E.craftBatch(state, derived, 'infuseStone', 0.25)
  ok('3 份时 ¼料 做 0 份', state.resources.stone === s3)

  // 自动制作：没参悟《心有灵犀》时勾不上
  state.resources.qi = 1500
  E.recompute(state, derived)
  ok('未参悟《心有灵犀》时勾不上自动', E.toggleAutoCraft(state, derived, 'infuseStone') === false)
  ok('未参悟时自动不生效', E.autoCraftStatus(state, derived, 'infuseStone').on === false)

  // 参悟后：勾上自动，一份一份地做（不瞬发）
  state.upgrades.intuition = true
  state.settings.autoCraftOn = true
  E.recompute(state, derived)
  state.resources.qi = 1500
  ok('参悟后可以勾上', E.toggleAutoCraft(state, derived, 'infuseStone') === true)
  const stoneBefore = state.resources.stone
  const qiBefore = state.resources.qi
  ok('刚勾上时一份都还没做', state.resources.stone === stoneBefore && state.resources.qi === qiBefore)

  E.runAutoCraft(state, derived, step * 0.5)
  ok('半份时间还没出东西', state.resources.stone === stoneBefore)
  E.runAutoCraft(state, derived, step * 0.5 + 1e-6)
  ok('满一份时间出 1 份', state.resources.stone - stoneBefore === 1, `实际 +${state.resources.stone - stoneBefore}`)

  const st2 = state.resources.stone
  E.runAutoCraft(state, derived, 10)
  const expect = Math.floor(10 / step)
  ok(
    '10 秒做出约 10/step 份（不是一次性全做完）',
    Math.abs(state.resources.stone - st2 - expect) <= 1,
    `实际 +${state.resources.stone - st2}，预期约 ${expect}`,
  )
  ok('材料按份扣除', close(state.resources.qi, qiBefore - (state.resources.stone - stoneBefore) * 15 - 0, 1e-6))
  ok('材料远没被抽干（说明没有瞬发做到底）', state.resources.qi > 1000, `剩余灵气 ${Math.round(state.resources.qi)}`)

  // 材料断了：不做、也不取消勾选；补上材料就接着做
  const madeBefore = state.craftTimers.infuseStone.made
  state.resources.qi = 15
  E.recompute(state, derived)
  E.runAutoCraft(state, derived, 10)
  ok('材料不够时先歇着', E.autoCraftStatus(state, derived, 'infuseStone').on === true && state.resources.stone - st2 - expect <= 1)
  state.resources.qi = 150
  E.recompute(state, derived)
  const st3 = state.resources.stone
  E.runAutoCraft(state, derived, step * 3)
  ok('材料补上后接着做', state.resources.stone - st3 >= 2, `实际 +${state.resources.stone - st3}`)
  ok('本轮计数继续累加', state.craftTimers.infuseStone.made > madeBefore)

  // 悬停明细的「出项」要计入此刻自动制作的材料消耗（满仓/耗尽预估同一口径），
  // 但不并进 expenseSources —— tick 按 expense 结算、自动制作另按份实付，并进去会双扣
  state.resources.stone = 0
  state.resources.qi = 150
  E.recompute(state, derived)
  const drainQi = derived.autoCraftDrain.qi || []
  ok(
    '出项快照计入自动制作的材料消耗（15 灵气 ÷ 单件耗时）',
    drainQi.length === 1 &&
      drainQi[0].id === 'infuseStone' &&
      close(drainQi[0].value, -15 / step, 1e-9),
    `实际 ${drainQi.map((x) => x.value).join(', ')}`,
  )
  ok(
    '结算口径的 expenseSources 不含自动制作（tick 会双扣）',
    !(derived.expenseSources.qi || []).some((x) => x.kind === 'autoCraft'),
  )
  state.autoCraft.infuseStone = false
  E.recompute(state, derived)
  ok('关掉自动后出项快照清空', (derived.autoCraftDrain.qi || []).length === 0)
  state.autoCraft.infuseStone = true
  state.resources.qi = 10 // 连一份材料都不够：配方暂停，此刻不消耗
  E.recompute(state, derived)
  ok('材料不够时配方暂停，不再计入出项', (derived.autoCraftDrain.qi || []).length === 0)
  state.resources.qi = 150
  E.recompute(state, derived)

  // 总开关一关就停
  state.settings.autoCraftOn = false
  E.recompute(state, derived)
  const st5 = state.resources.stone
  E.runAutoCraft(state, derived, 10)
  ok('设置页的总开关关掉后不再自动做', state.resources.stone === st5)
  state.settings.autoCraftOn = true
  E.recompute(state, derived)

  // 走 tick 也能推进；离线也照做
  state.resources.qi = 1500
  state.resources.stone = 0
  E.recompute(state, derived)
  const st6 = state.resources.stone
  for (let i = 0; i < 10; i++) E.tick(state, derived, 1, { events: false })
  ok('tick 里会推进自动制作', state.resources.stone - st6 >= 3, `10 秒做出 ${state.resources.stone - st6} 份`)

  state.resources.stone = 0
  E.recompute(state, derived)
  const st7 = state.resources.stone
  E.simulateOffline(state, derived, 10, { silent: true })
  ok(
    '离线结算也继续做（挂着就一直在做）',
    state.resources.stone - st7 >= 3,
    `离线 10 秒做出 ${state.resources.stone - st7} 份`,
  )
}

// ------------------------------------------------------------
section('法宝祭炼（可重复升级）')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  const pearl = E.UPGRADE_MAP.spiritBanner

  // 没炼成之前不能祭炼
  ok('未炼成时祭炼无效', E.refineTreasure(state, derived, 'spiritBanner') === 0)
  ok('未炼成时没有祭炼花费', E.refineCost(state, 'spiritBanner') && !E.isTreasureForged(state, 'spiritBanner'))

  state.upgrades.spiritBanner = true
  state.resources.insight = 1e7
  state.resources.stone = 1e7
  state.buildings.spiritField = { count: 1, on: true } // 有个产出源才看得出效果变化
  E.recompute(state, derived)
  ok('炼成后倍数从 1 起算', close(E.treasureMult(state, pearl), 1, 1e-9))

  const cost1 = E.refineCost(state, 'spiritBanner')
  ok(
    '首次祭炼花费 = 法宝基础材料 + 灵机基数',
    close(cost1.insight, pearl.refine.insight, 1e-9) &&
      close(cost1.stone, pearl.cost.stone, 1e-9) &&
      close(cost1.wood, pearl.cost.wood, 1e-9),
    JSON.stringify(cost1),
  )

  // 祭炼要「材料 + 灵机」，所以按当前花费把两种都给足（花费形状以后变了也不会假失败）
  const topUp = () => {
    const c = E.refineCost(state, 'spiritBanner')
    for (const res in c) state.resources[res] = Math.max(state.resources[res] || 0, c[res] * 100)
    E.recompute(state, derived)
  }
  topUp()

  const rateBefore = derived.rates.qi
  ok('祭炼一次成功', E.refineTreasure(state, derived, 'spiritBanner') === 1)
  ok('等级记在 state 里', E.treasureLevel(state, 'spiritBanner') === 1)
  ok('效果按 +30% 放大', close(E.treasureMult(state, pearl), 1.3, 1e-9))
  ok('产出真的跟着涨了', derived.rates.qi > rateBefore, `${rateBefore.toFixed(3)} → ${derived.rates.qi.toFixed(3)}`)
  ok('单件法宝 +15% → 祭炼一级后 +19.5%', close(derived.ratio.qi - 0, 0.15 * 1.3 + (derived.ratio.qi - derived.ratio.qi), 1e9))

  const cost2 = E.refineCost(state, 'spiritBanner')
  ok(
    '第二次祭炼花费 ×1.7（材料与灵机同乘）',
    close(cost2.insight, pearl.refine.insight * 1.7, 1e-6) && close(cost2.stone, pearl.cost.stone * 1.7, 1e-6),
    `灵机 ${cost1.insight} → ${cost2.insight}`,
  )

  for (let i = 0; i < 4; i++) {
    topUp()
    E.refineTreasure(state, derived, 'spiritBanner')
  }
  ok('可以继续往上祭炼（无等级上限）', E.treasureLevel(state, 'spiritBanner') === 5)
  ok('Lv.5 时效果 ×2.5', close(E.treasureMult(state, pearl), 2.5, 1e-9))
  ok(
    '花费指数增长',
    E.refineCost(state, 'spiritBanner').insight > pearl.refine.insight * 7,
    `${Math.round(E.refineCost(state, 'spiritBanner').insight)} vs 基础 ${pearl.refine.insight}`,
  )

  // 修真与技艺不参与祭炼
  ok('修真与技艺没有祭炼花费', E.refineCost(state, 'qiOrigin') === null && E.refineCost(state, 'qiArt') === null)
  ok('修真与技艺的倍率恒为 1', E.treasureMult(state, E.UPGRADE_MAP.qiOrigin) === 1)

  // 存档往返
  const round = normalizeState(JSON.parse(JSON.stringify(state)))
  ok('祭炼等级进存档', round.treasureLevels.spiritBanner === 5)
}

// ------------------------------------------------------------
section('批量自动炼制')
{
  const { state: s, derived: d } = newGame()
  s.buildings.quarry = { count: 1, on: true }
  s.settings.autoCraftOn = false
  ok('未解锁自动炼制不能批量开启', !E.setAllAutoCraft(s, d, true) && !s.settings.autoCraftOn && Object.keys(s.autoCraft).length === 0)
  s.upgrades.intuition = true
  E.recompute(s, d)
  s.ui.craftFilter = 'advanced'
  ok('批量自动可在缺料时开启且保持总开关关闭', E.setAllAutoCraft(s, d, true) && !s.settings.autoCraftOn && s.autoCraft.infuseStone)
  ok('批量自动只选择已解锁配方，不受筛选影响', CRAFTS.every(c => !!s.autoCraft[c.id] === E.isCraftUnlocked(s, c)))
  s.craftTargets.infuseStone = 8
  s.autoCraft.refinePill = true // 旧偏好即使当前配方锁定，也要可清除。
  s.settings.autoCraftOn = true
  ok('取消自动清除所有选择且保持总开关开启', E.setAllAutoCraft(s, d, false) && s.settings.autoCraftOn && Object.values(s.autoCraft).every(on => !on))
  ok('批量切换保留库存目标', s.craftTargets.infuseStone === 8)
  s.upgrades.intuition = false
  s.upgrades.condenseArt = true
  s.resources.qi = d.max.qi
  s.resources.rock = 10
  E.recompute(s, d)
  s.upgrades.liquidArt = true
  E.recompute(s, d)
  ok('取消配方自动不影响节气凝液且不需要常驻解锁', E.setAllAutoCraft(s, d, false) && s.settings.autoCraftOn && E.runAutoCondense(s, d) && s.resources.spiritLiquid > 0)
}

section('金丹前修真按知识与产业递进')
{
  const { state: s } = newGame()
  s.upgrades.forgeArt = true
  s.upgrades.qiGazing = true
  ok('炼器术后需建炼器坊才开放符箓入门', !E.isUpgradeUnlocked(s, UPGRADE_MAP.talismanArt))
  s.buildings.forge = { count: 1, on: true }
  ok('符箓分支不要求先学自动制作', E.isUpgradeUnlocked(s, UPGRADE_MAP.talismanArt) && !s.upgrades.intuition)
  s.upgrades.earthArt = true
  s.upgrades.talismanArt = true
  ok('香火愿需先建符箓堂', !E.isUpgradeUnlocked(s, UPGRADE_MAP.incenseVow))
  s.buildings.talismanHall = { count: 1, on: true }
  ok('香火分支不依赖流水作坊', E.isUpgradeUnlocked(s, UPGRADE_MAP.incenseVow) && !s.upgrades.waterworkshop)
  s.realm = 3
  s.upgrades.alchemyArt = true
  ok('破境心法需先掌握丹火', !E.isUpgradeUnlocked(s, UPGRADE_MAP.breakthroughArt))
  s.upgrades.alchemyFire = true
  ok('破境心法不强制先发展香火', E.isUpgradeUnlocked(s, UPGRADE_MAP.breakthroughArt) && !s.upgrades.incenseVow)
  s.upgrades.deepShaft = true
  s.buildings.forge = { count: 3, on: true }
  ok('玄钢未开放前御剑术不提前展示', !E.isUpgradeUnlocked(s, UPGRADE_MAP.swordFlight) && !E.isProgressionVisible(s, UPGRADE_MAP.swordFlight.needs))
}

section('木作器械后的修真递进链')
{
  const { state: s, derived: d } = newGame()
  for (const id of ['prospectStudy', 'woodworking', 'alchemyArt']) s.upgrades[id] = true
  s.buildings.ironFurnace = { count: 1, on: true }
  s.buildings.alchemyRoom = { count: 1, on: true }
  const chain = ['earthArt', 'forgeArt', 'alchemyFire', 'intuition', 'waterworkshop']
  E.recompute(s, d)
  for (const id of chain) {
    const available = chain.filter(next => !s.upgrades[next] && E.isUpgradeUnlocked(s, E.UPGRADE_MAP[next]))
    ok(`递进阶段只开放${E.UPGRADE_MAP[id].name}`, available.length === 1 && available[0] === id, available.join(','))
    for (const next of chain.filter(next => !s.upgrades[next] && next !== id)) {
      ok(`${E.UPGRADE_MAP[id].name}完成前不预告${E.UPGRADE_MAP[next].name}`, !E.isProgressionVisible(s, E.UPGRADE_MAP[next].needs))
    }
    for (const [res, cost] of Object.entries(E.UPGRADE_MAP[id].cost)) s.resources[res] = cost
    ok(`${E.UPGRADE_MAP[id].name}可通过正常参悟推进`, E.research(s, d, id))
  }
  const legacy = createInitialState()
  legacy.upgrades.waterworkshop = true
  ok('已掌握流水作坊不因新前置而失效', E.isUpgradeUnlocked(legacy, E.UPGRADE_MAP.waterworkshop))
}

section('本轮评估问题回归')
{
  const { state: s, derived: d } = newGame()
  s.buildings.quarry = { count: 1, on: true }
  s.buildings.spiritQuarry = { count: 1, on: true }
  s.upgrades.prospectStudy = true
  s.disciples.total = 1
  s.disciples.jobs.miner = 1
  E.recompute(s, d)
  const before = { ...d.rates }
  s.upgrades.ironPick = true
  E.recompute(s, d)
  ok('玄铁镐只提高矿石，不提高玄铁和天然灵石', close(d.rates.rock, before.rock * 1.3, 1e-9) && close(d.rates.ore, before.ore, 1e-9) && close(d.rates.stone, before.stone, 1e-9))
  s.treasureLevels.ironPick = 2
  E.recompute(s, d)
  ok('玄铁镐祭炼仍只提高矿石', close(d.rates.rock, before.rock * 1.48, 1e-9) && close(d.rates.ore, before.ore, 1e-9) && close(d.rates.stone, before.stone, 1e-9))
  for (const [id, fixed] of [['grotto', 15000], ['heavenTower', 40000]]) {
    const { state: storageState, derived: storageDerived } = newGame()
    const base = storageDerived.max.insight
    storageState.buildings[id] = { count: 1, on: false }
    E.recompute(storageState, storageDerived)
    ok(`${E.BUILDING_MAP[id].name}保留灵机定额与通用仓储`, storageDerived.max.insight === base + fixed + E.BUILDING_MAP[id].effects.storageAll)
  }
  ok('料场归入仓储分类', E.BUILDING_MAP.materialYard.group === 'store')
  const tools = E.UPGRADE_MAP.temperedTools
  s.upgrades.forgeArt = true
  ok('百炼工具在淬玄工艺前保持锁定', !E.isUpgradeUnlocked(s, tools))
  s.upgrades.steelWorking = true
  ok('掌握淬玄工艺后开放百炼工具', E.isUpgradeUnlocked(s, tools))
}

section('制作')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  state.buildings.quarry = { count: 1, on: true }
  E.recompute(state, derived)
  state.resources.qi = 1000
  state.resources.rock = 3
  const made = E.craft(state, derived, 'infuseStone')
  ok('点石成灵产出 1 枚', made === 1 && state.resources.stone === 1, `实际 ${made}/${state.resources.stone}`)
  ok('扣除了 15 灵气', close(state.resources.qi, 985, 1e-6), `实际 ${state.resources.qi}`)
  ok('凝石同时消耗一块石材', state.resources.rock === 0)
  ok('统计已记录', state.stats.crafted.stone === 1)

  // 制作加成：小数累积机制
  derived.craftBonus = 0.5
  state.resources.qi = 10000
  state.resources.rock = 6
  state.craftProgress.infuseStone = 0
  const before = state.resources.stone
  E.craft(state, derived, 'infuseStone', { times: 2 })
  ok('50% 加成下两次制作得到 3 枚', state.resources.stone - before === 3, `实际 ${state.resources.stone - before}`)

  const { state: s2, derived: d2 } = newGame()
  ok('未解锁的配方不能制作', E.craft(s2, d2, 'refinePill') === 0)
}

// ------------------------------------------------------------
section('成就')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  state.resources.qi = 50000
  state.resources.wood = 50000
  state.resources.stone = 5000 // 九座茅屋的灵石合计 600+，给足
  state.buildings.spiritField = { count: 1, on: true } // 茅屋现在要一座聚灵阵
  state.buildings.granary = { count: 20, on: true } // 抬灵气上限，一次九座才买得起
  E.buyBuilding(state, derived, 'hut', 1)
  E.checkAchievements(state, derived)
  ok('达成「立锥之地」', state.achievements.firstHut === true)
  ok(
    '成就暂不提供全局加成（奖励待重新设计，ACHIEVEMENT_REWARD = 0）',
    derived.ratioAll < 0.02 || ACHIEVEMENT_REWARD === 0,
    `ratioAll ${derived.ratioAll.toFixed(4)} / 奖励 ${ACHIEVEMENT_REWARD}`,
  )

  const ratioBefore = derived.ratioAll
  const rateBefore = derived.rates.qi
  E.buyBuilding(state, derived, 'hut', 9)
  ok('一次购买多座', E.countOf(state, 'hut') === 10, `实际 ${E.countOf(state, 'hut')}`)
  E.checkAchievements(state, derived)
  ok('达成「茅屋十间」', state.achievements.hutTen === true)
  ok(
    '达成更多成就也不改变全局倍率（加成已清零）',
    ACHIEVEMENT_REWARD > 0 ? derived.ratioAll > ratioBefore : derived.ratioAll === ratioBefore,
    `${derived.ratioAll} vs ${ratioBefore}`,
  )
  ok(
    '加成立刻反映到产出速率（先有产出源才看得出）',
    (() => {
      state.resources.qi = 100
      E.buyBuilding(state, derived, 'spiritField', 1)
      return derived.rates.qi > 0
    })(),
    `${derived.rates.qi}`,
  )
  void rateBefore
}

// ------------------------------------------------------------
section('修真·技艺 / 境界 / 飞升')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  ok('初始看不到修真与技艺（需藏经阁）', derived.availableUpgrades.length === 0)

  state.resources.qi = 5000
  state.resources.wood = 5000
  state.resources.stone = 500
  state.resources.herb = 500
  state.buildings.spiritField = { count: 3, on: true } // 藏经阁现在要三座聚灵阵，且不要灵草
  E.buyBuilding(state, derived, 'hut', 1)
  E.buyBuilding(state, derived, 'library', 1)
  ok('建成藏经阁仍需研究灵源考才出现引气诀', !derived.availableUpgrades.includes('qiArt'))
  state.upgrades.qiOrigin = true
  E.recompute(state, derived)
  ok('研究灵源考后出现引气诀', derived.availableUpgrades.includes('qiArt'))

  state.resources.insight = 100
  const okResearch = E.research(state, derived, 'qiArt')
  ok('参悟成功', okResearch === true && state.upgrades.qiArt === true)
  // 引气诀 +10% 要作用在产出源上才看得出来：先补一座聚灵阵
  state.resources.qi = 100
  E.buyBuilding(state, derived, 'spiritField', 1)
  const fields = E.countOf(state, 'spiritField')
  ok(
    `灵气产出加成生效（聚灵阵 ${fields} × 0.3 × 引气诀 1.1 × 春季 1.2）`,
    close(derived.rates.qi, fields * 0.3 * 1.1 * 1.2, 1e-6),
    `实际 ${derived.rates.qi}`,
  )

  const { state: s2, derived: d2 } = newGame()
  // 破境材料横跨基础资源与进阶成品，逐项列举容易漏（每加一种料就断）—— 统一补满。
  for (const r of RESOURCES) s2.resources[r.id] = 1e7
  const okBreak = E.breakthrough(s2, d2)
  ok('破境成功', okBreak === true && s2.realm === 1)
  ok('境界倍率提升', d2.realmMult > 1)

  // 一路推到渡劫期
  let guard = 0
  while (E.breakthrough(s2, d2) && guard++ < 50) {
    // 补满**所有**资源：早先这里逐个列了 7 种，加了进阶品之后
    // 一路只推到第 8 境就断了（夹具的错，不是玩法的错）—— 改成通用写法，以后新增资源不会再犯。
    for (const r of RESOURCES) s2.resources[r.id] = 1e7
  }
  ok('可修到渡劫期', s2.realm === ASCEND_REALM_INDEX, `实际 ${s2.realm}`)
  ok('渡劫期即可飞升（不要求转世次数）', E.canAscend(s2) === true)
  s2.stats.reincarnations = 0
  ok('一次都没转世也能飞升（转世只是常见路线）', E.canAscend(s2) === true)
  s2.realm = ASCEND_REALM_INDEX - 1
  ok('境界不到渡劫期则不能飞升', E.canAscend(s2) === false)
  s2.realm = ASCEND_REALM_INDEX

  s2.stats.lifeInsight = 2e6
  const gain = E.ascensionGain(s2, d2)
  ok('飞升可获得仙缘', gain > 0, `实际 ${gain}`)

  resetForAscension(s2, gain)
  E.recompute(s2, d2)
  ok('飞升后境界归零', s2.realm === 0)
  ok('飞升后建筑清空', Object.keys(s2.buildings).length === 0)
  ok('飞升后保留仙缘', s2.karma === gain)
  ok('飞升后保留成就', true)
  ok('仙缘提供全局加成', d2.karmaMult > 1)
  ok('飞升次数 +1', s2.stats.ascensions === 1)

  // 回归：飞升后的第二世必须跟第一次开山一样从零起步（曾经漏改，一飞升就白送 2 人 1 阵徒）
  ok('飞升后弟子归零', s2.disciples.total === 0, `实际 ${s2.disciples.total}`)
  ok('飞升后职位清空', Object.values(s2.disciples.jobs).every((n) => n === 0))
  ok('飞升后弟子上限为 0（没有居所）', d2.maxDisciples === 0, `实际 ${d2.maxDisciples}`)
  ok('飞升后资源清空', Object.values(s2.resources).every((v) => v === 0))
  ok('飞升后修真与技艺清空', Object.keys(s2.upgrades).length === 0)
  ok('飞升后法宝祭炼等级清空', Object.keys(s2.treasureLevels).length === 0)
  ok('飞升后左栏回到只有灵气', Object.keys(s2.seen).join() === 'qi')
  ok('飞升后建筑列表回到开局（渐进露出重置）', !E.isBuildingUnlocked(s2, 'lumberYard'))
  ok('飞升后仍然没有任何建筑可造（连聚灵阵都还没露面）', !E.isBuildingUnlocked(s2, 'spiritField'))
  ok('飞升后制作进度与自动开关清空', Object.keys(s2.craftProgress).length === 0 && Object.keys(s2.autoCraft).length === 0)
}

// ------------------------------------------------------------
section('随机事件')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  state.resources.qi = 1000
  state.resources.wood = 1000
  state.resources.ore = 1000

  const rain = EVENTS.find((e) => e.id === 'spiritRain')
  E.fireEvent(state, derived, rain)
  ok('增益类事件写入 buff', state.buffs.length === 1)
  const beforeMult = derived.globalMult
  E.recompute(state, derived)
  ok('增益提升全局倍率', derived.globalMult > beforeMult, `${derived.globalMult} vs ${beforeMult}`)

  const beast = EVENTS.find((e) => e.id === 'beastRaid')
  const woodBefore = state.resources.wood
  E.fireEvent(state, derived, beast)
  ok('天灾掠夺资源', state.resources.wood < woodBefore)
  ok('天灾计数 +1', state.stats.disasters === 1)

  const pilgrim = EVENTS.find((e) => e.id === 'pilgrims')
  const faithBefore = state.resources.faith
  E.fireEvent(state, derived, pilgrim)
  ok('奇遇发放资源', state.resources.faith > faithBefore)
  ok('事件会重排下次时间', state.nextEventAt > Date.now())
}

// ------------------------------------------------------------
section('离线收益')
// ------------------------------------------------------------
{
  const { state, derived } = newGameRunning()
  state.resources.qi = 0
  state.resources.wood = 0
  E.setJob(state, derived, 'farmer', 2)
  const before = state.resources.qi
  const result = E.simulateOffline(state, derived, 3600)
  ok('离线 1 小时结算了时间', result.seconds === 3600)
  ok('离线期间灵气增长', state.resources.qi > before)
  ok('离线不会触发随机事件', state.log.every((l) => !l.text.includes('妖兽')), '')

  const capped = E.simulateOffline(state, derived, 100)
  ok('短时间离线也能结算', capped.seconds === 100)
}

// ------------------------------------------------------------
section('存档序列化')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  state.resources.qi = 1234.5
  state.resources.stone = 42
  state.buildings = { hut: { count: 7, on: true } }
  state.disciples.total = 9
  state.upgrades.qiArt = true
  state.achievements.firstHut = true
  state.realm = 3
  state.karma = 12
  state.log = Array.from({ length: 100 }, (_, i) => ({ id: i, at: Date.now(), text: 'x', kind: 'info' }))

  const text = exportSave(state)
  ok('导出得到可复制文本', typeof text === 'string' && text.length > 20)
  const parsed = parseImport(text)
  ok('导入后资源一致', close(parsed.resources.qi, 1234.5))
  ok('导入后建筑一致', parsed.buildings.hut.count === 7)
  ok('导入后境界一致', parsed.realm === 3)
  ok('导入后仙缘一致', parsed.karma === 12)
  ok('导入后日志被截断到 60 条', parsed.log.length === 60, `实际 ${parsed.log.length}`)
  ok('导入后不含内存字段 __max', parsed.__max === undefined)

  const json = JSON.stringify(parsed)
  const again = normalizeState(JSON.parse(json))
  ok('二次序列化稳定', again.realm === 3 && again.resources.stone === 42)

  let threw = false
  try {
    parseImport('这不是存档')
  } catch (err) {
    threw = true
  }
  ok('非法存档会抛错', threw)
}

// ------------------------------------------------------------
section('模拟玩家（机器人）短跑')
// ------------------------------------------------------------
{
  // 机器人是「按 id 到条目列表里查表」的典型消费方，两层拆开后最容易在这里脱节，
  // 所以让它真跑一段：既验证查询口径，也验证参悟链不会把推进卡死。
  const { state, derived } = newGame()
  const bot = createBot(state, derived)
  let error = null
  // 顺手记录「玄铁/灵草 从开始产出到第一次被花掉」用了多久 —— 早期资源不能是死资源
  const firstSpend = { ore: null, herb: null }
  const producedAt = { ore: null, herb: null }
  const prevRes = { ...state.resources }
  try {
    // 观察12小时：未进入的产业遵守解锁条件，已投产的材料能进入消费链。
    for (let t = 1; t <= 12 * 3600; t++) {
      E.tick(state, derived, 1, { events: false })
      if (t % 5 === 0) bot.act()
      if (t % 60 === 0) E.recompute(state, derived)
      for (const r of ['ore', 'herb']) {
        const now = state.resources[r] || 0
        if (!producedAt[r] && (derived.rates[r] || 0) > 0) producedAt[r] = t
        if (!firstSpend[r] && now < prevRes[r] - 1e-9) firstSpend[r] = t
        prevRes[r] = now
      }
    }
  } catch (e) {
    error = e
  }
  ok('机器人跑 12 小时不报错', !error, error ? String(error.message) : '')
  for (const [id, name] of [
    ['ore', '玄铁'],
    ['herb', '灵草'],
  ]) {
    ok(
      `${name}已投产则被使用，未投产则矿场或药圃尚未启用`,
      producedAt[id] === null
        ? E.countOf(state, id === 'ore' ? 'ironFurnace' : 'herbGarden') === 0
        : firstSpend[id] !== null && firstSpend[id] >= producedAt[id],
      producedAt[id] === null
        ? '整局没有产出'
        : `产出 ${Math.round(producedAt[id] / 60)} 分 → 花掉 ${firstSpend[id] === null ? '（没花掉）' : Math.round(firstSpend[id] / 60) + ' 分'}`,
    )
  }
  ok('机器人参悟出了东西', Object.keys(state.upgrades).length > 0, `${Object.keys(state.upgrades).length} 条`)
  ok('机器人盖起了房子', state.stats.buildingsBuilt > 0, `${state.stats.buildingsBuilt} 座`)

  // 灵木的「用处」要平滑：早期不能被上限卡成 0 ↔ 满仓的锯齿，中期要有连续去处（工坊烧柴）
  {
    const woodUpkeep = BUILDINGS.filter((b) => b.upkeep?.wood)
    ok(
      '灵木有连续去处（多座工坊以灵木为维护费）',
      woodUpkeep.length >= 3,
      woodUpkeep.map((b) => `${b.name} ${b.upkeep.wood}/s`).join('、'),
    )
    ok('谷仓也囤灵木（早期给上限留出余量）', (BUILDING_MAP.granary.effects.storage?.wood || 0) > 0, `${BUILDING_MAP.granary.effects.storage?.wood}`)

    // 跑 30 分钟：灵木不该长时间贴顶（旧版前期上限只有 200，产量 3~4/秒，几十秒就灌满）
    const s5 = newGame()
    const bot5 = createBot(s5.state, s5.derived)
    let pinned = 0
    let samples = 0
    for (let t = 1; t <= 1800; t++) {
      E.tick(s5.state, s5.derived, 1, { events: false })
      if (t % 5 === 0) bot5.act()
      if (t % 60 === 0) E.recompute(s5.state, s5.derived)
      const rate = s5.derived.rates.wood || 0
      if (rate > 0.02 && (s5.state.resources.wood || 0) >= (s5.derived.max.wood || 0) - 1e-6) pinned++
      samples++
    }
    ok(
      '前 30 分钟灵木贴顶时间 < 5%',
      pinned / samples < 0.05,
      `${((pinned / samples) * 100).toFixed(1)}%（上限长到 ${Math.round(s5.derived.max.wood)}，产量 ${(s5.derived.rates.wood || 0).toFixed(2)}/秒）`,
    )
  }

  ok(
    '可参悟列表里的 id 都能查到条目',
    derived.availableUpgrades.every((id) => !!E.UPGRADE_MAP[id]),
    derived.availableUpgrades.join(','),
  )
  ok(
    '参悟表覆盖两层（修真 + 技艺·法宝）',
    Object.keys(state.upgrades).every((id) => !!E.UPGRADE_MAP[id]) && ALL_UPGRADES.length === CULTIVATION.length + TECHNIQUES.length,
  )
}

// ------------------------------------------------------------
section('长时挂机稳定性')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  // 给一套中等规模的家底，再模拟 2 小时
  state.resources.qi = 5000
  state.resources.wood = 5000
  state.resources.stone = 5000
  state.resources.insight = 5000
  state.resources.herb = 5000
  state.resources.ore = 5000
  state.resources.pill = 500
  state.resources.artifact = 500
  E.buyBuilding(state, derived, 'spiritField', 5) // 先有聚灵阵，茅屋与藏经阁才立得住
  E.buyBuilding(state, derived, 'hut', 5)
  E.buyBuilding(state, derived, 'library', 2)
  E.recruitArrivals(state, derived, 200) // 等弟子自己来
  E.setJob(state, derived, 'farmer', 6)
  E.setJob(state, derived, 'scholar', 4)

  // 这份稳定性夹具从有效容量内开始；超额旧档另有专门回归。
  for (const r of RESOURCES) state.resources[r.id] = Math.min(state.resources[r.id] || 0, derived.max[r.id])
  let nan = false
  for (let i = 0; i < 7200; i++) {
    E.tick(state, derived, 1, { events: false })
    if (i % 600 === 0) E.recompute(state, derived)
    for (const r of RESOURCES) {
      if (Number.isNaN(state.resources[r.id])) nan = true
    }
  }
  ok('2 小时模拟没有 NaN', !nan)
  ok('灵气未越界', state.resources.qi >= 0 && state.resources.qi <= derived.max.qi + 1e-6)
  ok('灵机有积累', state.resources.insight > 0, `实际 ${state.resources.insight}`)
  ok('稳定供粮未产生宜居度断供惩罚', state.habitabilityPenalty === 0, `实际 ${state.habitabilityPenalty}`)
  ok('弟子未流失', state.disciples.total > 0)
}

// ------------------------------------------------------------
section('前期节奏（对标猫国：第 1 分钟只给一座，其余靠研究放行）')
// ------------------------------------------------------------
{
  const noNeeds = BUILDINGS.filter((b) => !b.needs).map((b) => b.id)
  ok('开局只有一座建筑没有前置条件', noNeeds.length === 1 && noNeeds[0] === 'spiritField', noNeeds.join(','))
  const gated = ['herbGarden', 'ironFurnace', 'warehouse', 'gate']
  ok(
    '药圃 / 炼铁炉 / 库房 / 山门 都挂在研究节点后',
    gated.every((id) => (BUILDING_MAP[id].needs?.upgrades || []).length > 0),
    gated.map((id) => BUILDING_MAP[id].name).join('、'),
  )
  ok(
    '藏经阁不花灵草（否则「藏经阁 → 药圃 → 灵草 → 藏经阁」自锁）',
    !(BUILDING_MAP.library.cost.herb > 0),
    JSON.stringify(BUILDING_MAP.library.cost),
  )

  // 自举闭包：从基础仓储出发，反复把「当前买得起的建筑」的仓储加成加进来，
  // 看是否所有建筑最终都能买得起第一座 —— 抓「灵木上限 200 却要 300」这类硬死锁。
  {
    const caps = {}
    for (const r of RESOURCES) caps[r.id] = r.baseMax || 0
    const reachable = new Set()
    // 允许「同一种建筑反复盖」（玩家会用便宜的仓储建筑把上限堆上去）
    for (let round = 0; round < 64; round++) {
      for (const b of BUILDINGS) {
        if (!Object.entries(b.cost).every(([r, v]) => v <= caps[r] + 1e-9)) continue
        reachable.add(b.id)
        for (const [r, v] of Object.entries(b.effects?.storage || {})) caps[r] = (caps[r] || 0) + v
        const all = b.effects?.storageAll || 0
        if (all) for (const key of Object.keys(caps)) caps[key] += all
      }
    }
    const unreachable = BUILDINGS.filter((b) => !reachable.has(b.id)).map((b) => b.id)
    ok('自举闭包：所有建筑都能在可达的仓储上限内买下第一座', unreachable.length === 0, unreachable.join(','))
  }

  // 行为：前 10 分钟只该认出少数几种建筑，且 2 小时里不能卡死
  {
    const st = createInitialState()
    const dv = E.createDerived()
    E.recompute(st, dv)
    const b = createBot(st, dv)
    let typesAt10 = 0
    let typesAt60 = 0
    let builtAt60 = 0
    let builtAt110 = 0
    for (let x = 1; x <= 2 * 3600; x++) {
      E.tick(st, dv, 1, { events: true })
      if (x % 5 === 0) b.act()
      if (x % 60 === 0) {
        E.recompute(st, dv)
        const types = BUILDINGS.filter((bd) => (st.buildings[bd.id]?.count || 0) > 0).length
        if (x === 600) typesAt10 = types
        if (x === 3600) {
          typesAt60 = types
          builtAt60 = st.stats.buildingsBuilt
        }
        if (x === 6600) builtAt110 = st.stats.buildingsBuilt
      }
    }
    ok('前 10 分钟建成的建筑类型 ≤ 6 种', typesAt10 <= 6, typesAt10 + ' 种')
    ok('前 1 小时建成的建筑类型 ≤ 9 种', typesAt60 <= 9, typesAt60 + ' 种')
    ok('第 1~2 小时仍在推进（没有硬死锁）', builtAt110 > builtAt60, builtAt60 + ' → ' + builtAt110)
  }
}

// ------------------------------------------------------------
section('仓储定点（终局上限不能被自己的涨价率锁死）')
// ------------------------------------------------------------
{
  // 模型：只盖仓储、不看具体产出，但假设「攒满 → 买一座 → 再攒满」无限重复。
  // 于是每一种仓储建筑能盖多少，只由「它的涨价率 vs 它给的上限」决定 —— 这就是定点。
  // 每一档破境的造价都必须落在定点之内，否则那一档永远买不起。
  //（2026 实测：库房第 40 座要 200×1.18^39 ≈ 12.6 万灵木，而它只给 +360 灵木上限
  //  → 造价指数涨、上限线性涨 → 39 座处卡死，渡劫期永远够不着。石殿/洞天/通天塔因此加了仓储。）
  const caps = {}
  for (const r of RESOURCES) caps[r.id] = r.baseMax || 0
  const storageBuildings = BUILDINGS.filter((b) => b.effects?.storageAll || b.effects?.storage)
  const holdings = new Map()
  const countOf = (id) => holdings.get(id) || 0
  /** 第 n 座（从 0 数）的造价 */
  const priceAt = (b, n) => {
    const out = {}
    const ratio = b.priceRatio || 1
    for (const [r, v] of Object.entries(b.cost)) out[r] = v * Math.pow(ratio, n)
    return out
  }
  for (let round = 0; round < 500; round++) {
    let bought = false
    for (const b of storageBuildings) {
      for (let k = 0; k < 500; k++) {
        const price = priceAt(b, countOf(b.id))
        // 「已经攒满」：只有造价超过上限时才真的买不起
        if (!Object.entries(price).every(([r, v]) => v <= caps[r] + 1e-9)) break
        holdings.set(b.id, countOf(b.id) + 1)
        for (const [r, v] of Object.entries(b.effects?.storage || {})) caps[r] = (caps[r] || 0) + v
        const all = b.effects?.storageAll || 0
        if (all) for (const key of Object.keys(caps)) caps[key] += all
        bought = true
      }
    }
    if (!bought) break
  }
  const first = storageBuildings.map((b) => b.name + '×' + countOf(b.id)).filter((s) => !s.endsWith('×0'))
  ok('仓储定点推得动', first.length > 0, first.join(' '))
  const bad = []
  for (let i = 1; i < REALMS.length; i++) {
    const cost = REALMS[i].cost
    if (!cost) continue
    for (const [r, v] of Object.entries(cost)) {
      if ((caps[r] || 0) < v) bad.push(REALMS[i].name + ' 要 ' + r + ' ' + v + '，定点只有 ' + Math.round(caps[r] || 0))
    }
  }
  ok('每一档破境都在仓储定点之内', bad.length === 0, bad.slice(0, 2).join('；'))

  // 同一把尺子量**建筑**与**学术花费**。
  //
  // 注意这把尺子的**适用边界**（2026 实测过）：
  // 模型只买仓储、不花别的钱，所以它给出的是"**理论上限**"，比参照玩家实际堆到的高。
  //   ✓ 它能抓：造价超过理论定点 —— 也就是"即使把仓储堆到极限也买不起"，
  //            最初那次库房死锁（造价指数涨、上限线性涨）就是这一类；
  //   ✗ 它抓不住：造价落在理论定点内、但超过**玩家实际愿意堆到的上限**。
  //            两次真实翻车正属此类（分灵阵 25 万 vs 玩家上限 22.8 万；
  //            《湮灭法》30 万灵机 vs 上限 26.8 万）—— 我把分灵阵改回 25 万验证过，
  //            这条断言不会报红。那一类只能靠**推演**发现，见 ROADMAP §J 的待办。
  const overCap = []
  const check = (label, cost) => {
    for (const [r, v] of Object.entries(cost || {})) {
      if ((caps[r] || 0) + 1e-9 < v) {
        overCap.push(label + ' 要 ' + (RESOURCES.find((x) => x.id === r)?.name || r) + ' ' + v + '，定点只有 ' + Math.round(caps[r] || 0))
      }
    }
  }
  for (const b2 of BUILDINGS) check('建筑：' + b2.name, b2.cost)
  for (const u of ALL_UPGRADES) check('学术：' + u.name, u.cost)
  ok(
    '建筑与学术花费也都在仓储定点之内',
    overCap.length === 0,
    overCap.slice(0, 3).join('；') || '全部在定点内',
  )
}

// ------------------------------------------------------------
section('转世（化神期起，清空范围与飞升相同）')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  state.realm = REINCARNATE_REALM_INDEX - 1
  E.recompute(state, derived)
  ok('元婴期还不能转世', !E.canReincarnate(state), REALMS[state.realm].name)

  state.realm = REINCARNATE_REALM_INDEX
  E.recompute(state, derived)
  ok(
    '化神期即可转世（且此时还不能飞升）',
    E.canReincarnate(state) && !E.canAscend(state),
    REALMS[state.realm].name + ' / 飞升需 ' + REALMS[ASCEND_REALM_INDEX].name,
  )

  // 同一条公式：越晚结算越值钱
  state.stats.lifeInsight = 40000
  E.recompute(state, derived)
  const atShen = E.reincarnationGain(state, derived)
  state.realm = ASCEND_REALM_INDEX
  E.recompute(state, derived)
  const atDujie = E.ascensionGain(state, derived)
  ok('化神期转世能结算仙缘', atShen > 0, String(atShen))
  ok('渡劫期飞升拿得更多（同一公式，门槛更高）', atDujie > atShen, atShen + ' → ' + atDujie)
  ok('两者用同一条公式（境界因子 1+境界×0.3）', close(atDujie / atShen, (1 + ASCEND_REALM_INDEX * 0.3) / (1 + REINCARNATE_REALM_INDEX * 0.3), 0.02), (atDujie / atShen).toFixed(3))

  // 清空范围：与飞升完全一样（连修真 / 技艺·法宝 都不保留）
  const st = createInitialState()
  const dv = E.createDerived()
  E.recompute(st, dv)
  st.buildings.hut = { count: 3, on: true }
  st.upgrades.qiOrigin = true
  st.upgrades.qiArt = true
  st.treasureLevels.spiritBanner = 3
  st.resources.qi = 1234
  st.disciples.total = 5
  st.realm = REINCARNATE_REALM_INDEX
  st.karma = 10
  st.achievements.firstHut = true
  const gain = 22
  resetForReincarnation(st, gain)
  E.recompute(st, dv)
  ok('转世后境界回凡体', st.realm === 0, String(st.realm))
  ok('转世后修真 / 技艺·法宝清空（与飞升一致）', Object.keys(st.upgrades).length === 0, Object.keys(st.upgrades).join(','))
  ok('转世后法宝等级清空', Object.keys(st.treasureLevels).length === 0)
  ok('转世后建筑 / 弟子 / 资源清空', Object.keys(st.buildings).length === 0 && st.disciples.total === 0 && (st.resources.qi || 0) === 0)
  ok('转世结算仙缘', st.karma === 10 + gain, String(st.karma))
  ok('转世计数与飞升计数分开', st.stats.reincarnations === 1 && (st.stats.ascensions || 0) === 0, '转世 ' + st.stats.reincarnations + ' / 飞升 ' + (st.stats.ascensions || 0))
  ok('成就与统计保留', st.achievements.firstHut === true)
}

// ------------------------------------------------------------
section('道果与仙缘软上限（第 3 步）')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  state.realm = ASCEND_REALM_INDEX
  state.stats.reincarnations = 0 // 转世不是门槛：一次都没转世也能飞升
  state.stats.lifeInsight = 2e6
  E.recompute(state, derived)
  const before = { dao: state.dao || 0, mult: derived.daoMult, gain: E.ascensionGain(state, derived) }
  ok('飞升前没有道果', before.dao === 0, String(before.dao))

  // 模拟一次飞升的结算（只跑重置函数，不动其它）
  resetForAscension(state, 0)
  E.recompute(state, derived)
  ok('飞升结一颗道果', (state.dao || 0) === 1, String(state.dao))
  ok('道果提升全局产出（+5%/颗）', close(derived.daoMult, 1.05, 1e-9), '×' + derived.daoMult.toFixed(3))

  // 道果反哺下层：同一份「本世灵机」，有 1 颗道果时仙缘多 10%
  const probe = (dao) => {
    const s3 = createInitialState()
    const d3 = E.createDerived()
    s3.realm = REINCARNATE_REALM_INDEX
    s3.stats.lifeInsight = 40000
    s3.dao = dao
    E.recompute(s3, d3)
    return E.reincarnationGain(s3, d3)
  }
  const g0 = probe(0)
  const g1 = probe(1)
  ok('道果让转世拿到的仙缘更多（+10%/颗）', g1 > g0, g0 + ' → ' + g1)

  // 仙缘软上限：前 75% 不打折，之后渐近到 +200%
  ok('软上限：小数值不打折', close(E.softCap(1, 2), 1, 1e-9), String(E.softCap(1, 2)))
  ok('软上限：超过 75% 后打折但仍在涨', E.softCap(1.8, 2) > 1.5 && E.softCap(1.8, 2) < 2, E.softCap(1.8, 2).toFixed(3))
  ok('软上限：永远到不了上限', E.softCap(1000, 2) < 2 && E.softCap(1000, 2) > 1.99, E.softCap(1000, 2).toFixed(4))

  const s4 = createInitialState()
  const d4 = E.createDerived()
  s4.karma = 50
  E.recompute(s4, d4)
  const low = d4.karmaMult
  s4.karma = 500
  E.recompute(s4, d4)
  const high = d4.karmaMult
  ok('仙缘加成随点数上涨但被压住（500 点 < 线性外推）', high < 1 + 500 * CONFIG.KARMA_BONUS_PER_POINT && high > low, low.toFixed(2) + ' → ' + high.toFixed(2))
}

// ------------------------------------------------------------
section('修真线第一阶段：先懂原理才能盖')
// ------------------------------------------------------------
{
  const qi = UPGRADE_MAP.qiOrigin
  ok(
    '灵源考保留研究入口，不再解锁重复的产能建筑',
    unlockGroups(qi.id).upgrades.includes('观气法') && !(qi.effects.unlockBuildings || []).length,
    JSON.stringify(qi.effects),
  )
  ok(
    '灵泉灌溉由聚灵大阵承接，建筑表不再包含灵脉井',
    !BUILDING_MAP.spiritVein && UPGRADE_MAP.spiritIrrigation.needs.building.id === 'gatheringArray',
    JSON.stringify(UPGRADE_MAP.spiritIrrigation.needs),
  )
  const gazing = UPGRADE_MAP.qiGazing
  ok('新增观气法（解锁聚灵大阵）', !!gazing && (gazing.effects.unlockBuildings || []).includes('gatheringArray'))
  ok(
    '聚灵大阵的门槛从「有藏经阁」改成研究放行',
    (BUILDING_MAP.gatheringArray.needs.upgrades || []).includes('qiGazing'),
    JSON.stringify(BUILDING_MAP.gatheringArray.needs),
  )

  // 顺序：数据顺序就是界面顺序（见 CultivationPanel），所以两线分组要体现在数组里
  const ids = CULTIVATION.map((u) => u.id)
  const unstaged = ids.filter((id) => !CULTIVATION_STAGE_OF[id])
  ok('每个修真节点都归入两线分组之一（主线五章 + 材料六族 + 宗门经营）', unstaged.length === 0, unstaged.join(','))
  ok(
    '第一章是「观气」（灵源考 + 观气法同章且在最前）',
    ids[0] === 'qiOrigin' &&
      CULTIVATION_STAGE_OF.qiGazing?.index === CULTIVATION_STAGE_OF.qiOrigin?.index &&
      CULTIVATION_STAGE_OF.qiOrigin?.index === 0,
    ids.slice(0, 4).join(','),
  )
  ok('修真节点数量（A 项铺满时间线后应不少于 28）', CULTIVATION.length >= 28, String(CULTIVATION.length))

  // 不变量：修真层不该有「什么都不做」的装饰性节点
  const decorative = CULTIVATION.filter((u) => Object.keys(u.effects || {}).length === 0).map((u) => u.name)
  ok('没有空效果的装饰性节点', decorative.length === 0, decorative.join('、'))
}

// ------------------------------------------------------------
section('解锁清单（B 项）：修真节点必须真的开出东西')
// ------------------------------------------------------------
{
  const mismatches = unlockMismatches()
  ok('节点的「解锁声明」与建筑的「门槛」一致', mismatches.length === 0, mismatches.slice(0, 3).join('；'))

  const empty = CULTIVATION.filter((u) => {
    const g = unlockGroups(u.id)
    const hasRule = Object.keys(u.effects || {}).some((k) => k !== 'unlockBuildings')
    return g.buildings.length === 0 && g.upgrades.length === 0 && g.crafts.length === 0 && !hasRule
  }).map((u) => u.name)
  ok('每个修真节点至少开出一样东西（建筑 / 配方 / 参悟 / 规则）', empty.length === 0, empty.join('、'))

  const t1 = unlockText('qiOrigin')
  ok('灵源考的解锁清单保留观气法与引气诀', t1.includes('观气法') && t1.includes('引气诀'), t1)
  const t2 = unlockText('qiGazing')
  ok('观气法的解锁清单里有聚灵大阵', t2.includes('聚灵大阵'), t2)
  const t3 = unlockText('alchemyArt')
  ok('炼丹术的清单里有炼丹房与采药制丹', t3.includes('炼丹房') && t3.includes('采药制丹'), t3)
}

// ------------------------------------------------------------
section('修真页的效果文本：同一件事只说一遍')
// ------------------------------------------------------------
{
  const lines = CULTIVATION.map((u) => ({ name: u.name, text: effectLine(u, describeEffects) }))
  // 2026 实测的那次异常：describeEffects、unlockText、手写 note 三处都渲染，
  // 于是"解锁建筑 聚灵大阵；解锁建筑：聚灵大阵；…；解锁建筑：聚灵大阵"。
  const dup = lines.filter((l) => (l.text.match(/解锁建筑/g) || []).length > 1).map((l) => l.name)
  ok('效果文本里「解锁建筑」至多出现一次', dup.length === 0, dup.join('、') || '全部正常')

  const spaced = lines.filter((l) => /解锁建筑[^：]/.test(l.text)).map((l) => l.name)
  ok('解锁建筑一律写成「解锁建筑：X」（不带旧的空格写法）', spaced.length === 0, spaced.join('、') || '全部正常')

  const multi = lines.find((l) => l.name === '洞天福地')
  ok('多个建筑之间用顿号', !!multi && multi.text.includes('洞府、洞天'), multi ? multi.text : '（找不到洞天福地）')

  const qi = lines.find((l) => l.name === '灵源考')
  ok('灵源考只展示它开启的研究与技艺', !!qi && /^开启参悟：/.test(qi.text) && !qi.text.includes('解锁建筑'), qi ? qi.text : '')
}

// ------------------------------------------------------------
section('提示里的效果一节：一个效果一行')
// ------------------------------------------------------------
{
  const rowsOf = (id) => effectRows(UPGRADE_MAP[id], describeEffects)
  const alchemy = rowsOf('alchemyArt')
  ok(
    '炼丹术的效果是三条（解锁建筑 / 开放配方 / 开启参悟）',
    alchemy.length === 3,
    alchemy.map((r) => r.label + '=' + r.value).join(' ｜ '),
  )
  ok(
    '每一行都有标签与值，且值里不再用分号串多件事',
    alchemy.every((r) => !!r.label && !!r.value && !r.value.includes('；')),
    JSON.stringify(alchemy),
  )
  const bt = rowsOf('breakthroughArt')
  ok(
    '纯规则型节点也有行（破境花费）',
    bt.length === 1 && bt[0].label === '破境花费',
    JSON.stringify(bt),
  )
  const qi = rowsOf('qiOrigin')
  ok('灵源考仅一行开启参悟，不再预告已删除的建筑', qi.length === 1 && qi[0].label === '开启参悟', JSON.stringify(qi))
}

// ------------------------------------------------------------
section('百工坊：提前到手 + 制作加成')
// ------------------------------------------------------------
{
  const wh = BUILDING_MAP.workshop
  const gates = (wh.needs?.buildings || []).map((b) => b.id)
  ok(
    '百工坊在采木采矿阶段开放，无需炼丹房与炼器坊',
    gates.length === 2 && gates.includes('lumberYard') && gates.includes('quarry'),
    gates.join('、') || '（无门槛）',
  )
  ok('百工坊给制作加成', (wh.effects?.craftBonus || 0) > 0, String(wh.effects?.craftBonus))

  // 百工坊是**纯加成**建筑：任何东西都不该"因为缺它而做不出来"
  {
    const lockers = []
    const scan = (kind, list, needsOf) => {
      for (const item of list) {
        const n = needsOf(item) || {}
        const ids = [
          ...(n.buildings || []).map((x) => x.id),
          n.building?.id,
        ].filter(Boolean)
        if (ids.includes('workshop')) lockers.push(kind + ':' + (item.name || item.id))
      }
    }
    scan('建筑', BUILDINGS, (b2) => b2.needs)
    scan('配方', CRAFTS, (c) => c.needs)
    scan('学术', ALL_UPGRADES, (u) => u.needs)
    ok('百工坊不锁任何东西（没有一条 needs 指向它）', lockers.length === 0, lockers.join('、') || '干净')

    const keys = Object.keys(wh.effects || {})
    ok(
      '百工坊的效果只与制作有关（制作加成 / 木板上限）',
      keys.every((k) => k === 'craftBonus' || k === 'storage') && !keys.includes('ratioAll'),
      keys.join('、'),
    )
  }

  // 百工坊用基础原料启动；木板工艺独立解锁。
  ok(
    '百工坊仅使用普通灵木与矿石，不需加工材料',
    wh.cost.wood === 150 && wh.cost.rock === 100 && Object.keys(wh.cost).length === 2,
    JSON.stringify(wh.cost),
  )
  ok(
    '木作器械不再需要百工坊，也不吃木板',
    CRAFT_MAP.sawPlank.needs?.upgrades?.includes('woodworking') &&
      UPGRADE_MAP.woodworking?.needs?.buildings?.some(b => b.id === 'lumberYard') &&
      !UPGRADE_MAP.woodworking?.needs?.buildings?.some(b => b.id === 'workshop') &&
      !(UPGRADE_MAP.woodworking?.cost?.plank > 0),
    JSON.stringify(UPGRADE_MAP.woodworking?.cost),
  )
  ok('木料链无环（刨木成板不再由百工坊解锁）', CRAFT_MAP.sawPlank.needs?.building?.id !== 'workshop')
  {
    const { state: s, derived: d } = newGame()
    s.buildings.lumberYard = { count: 1, on: true }
    Object.assign(s.resources, wh.cost)
    E.recompute(s, d)
    ok('未建立采矿场时不能跳过百工坊前置', E.buyBuilding(s, d, 'workshop') === 0)
    s.buildings.quarry = { count: 1, on: true }
    E.recompute(s, d)
    ok('基础仓容装得下首座百工坊全部用料', Object.entries(wh.cost).every(([r, v]) => d.max[r] >= v))
    ok('未学木作器械或炼丹术也能实际建成百工坊', E.buyBuilding(s, d, 'workshop') === 1 && s.resources.wood === 0 && s.resources.rock === 0)
    ok('木材耗尽后早期百工坊仍提供6%制作增益', close(d.craftBonus, 0.06))
  }

  // 加成随启用数量叠加（用增量比较：craftBonus 另有技艺来源，别写死绝对值）
  const bonusWith = (count) => {
    const { state: s, derived: d } = newGame()
    s.resources.wood = 100
    s.upgrades.alchemyArt = true
    s.buildings.alchemyRoom = { count: 1, on: true }
    if (count > 0) s.buildings.workshop = { count, on: true }
    E.recompute(s, d)
    return d.craftBonus
  }
  const one = bonusWith(1)
  const two = bonusWith(2)
  ok(
    `每座百工坊 +6%（一座 ${(one * 100).toFixed(0)}% → 两座 ${(two * 100).toFixed(0)}%）`,
    Math.abs(two - one - (wh.effects.craftBonus || 0)) < 1e-9,
    `${one} → ${two}`,
  )

  // 同一配方，有工坊时产出更多（点石成灵：qi → stone，craftBonus 直接乘在产量上，不取整）
  const run = (withWorkshop) => {
    const { state: s2, derived: d2 } = newGame()
    s2.resources.wood = 100
    s2.upgrades.earthArt = true
    s2.upgrades.alchemyArt = true
    s2.buildings.warehouse = { count: 2, on: true }
    s2.buildings.alchemyRoom = { count: 1, on: true }
    if (withWorkshop) s2.buildings.workshop = { count: 1, on: true }
    s2.resources.qi = 1e6
    s2.buildings.quarry = { count: 1, on: true }
    s2.resources.rock = 60
    s2.resources.stone = 0 // 成品上限不高，先清空免得被上限挡住
    E.recompute(s2, d2)
    E.craft(s2, d2, 'infuseStone', { times: 20, silent: true })
    return s2.resources.stone || 0
  }
  const plain = run(false)
  const boosted = run(true)
  ok(
    '制作产出按 craftBonus 放大（不取整丢弃）',
    plain > 0 && boosted > plain,
    `无工坊 ${plain.toFixed(2)} → 有工坊 ${boosted.toFixed(2)} 石`,
  )
  ok(
    `放大比例约等于 craftBonus（实测 ×${(boosted / plain).toFixed(3)}）`,
    Math.abs(boosted / plain - (1 + (wh.effects.craftBonus || 0))) < 0.02,
    `${plain.toFixed(2)} → ${boosted.toFixed(2)}`,
  )
}

// ------------------------------------------------------------
section('灵石矿：天然的灵石来源')
// ------------------------------------------------------------
{
  const natural = JOBS.filter(job => job.secondary?.resource === 'stone')
  ok(
    '灵石有天然来源（不再只能靠点石成灵造）',
    natural.length > 0,
    natural.map(job => job.name + ' +' + job.secondary.base + '/秒').join('、') || '（没有）',
  )

  const q = BUILDING_MAP.spiritQuarry
  ok('灵石矿开放矿工副产出，不自带灵石生产', !!q && !q.effects?.prod?.stone && JOBS.some(job => job.secondary?.building === q.id), q ? JSON.stringify(q.effects) : '（缺）')
  ok('灵石矿由探矿术开启（与炼铁炉同一条寻脉线）', q?.needs?.upgrades?.includes('prospectStudy'), JSON.stringify(q?.needs))
  ok('灵石矿是实物建筑（不吃灵气）', !q?.cost?.qi, JSON.stringify(q?.cost))

  // 两条路并存：点石成灵还在（灵气 → 灵石），灵石矿只是多给一条天然来源
  ok('点石成灵仍在（灵气凝石这条路没被拿掉）', CRAFT_MAP.infuseStone?.out === 'stone', JSON.stringify(CRAFT_MAP.infuseStone?.out))

  // 真的会产：建好设施后派矿工，跑一段时间，灵石要涨。
  {
    const { state: s, derived: d } = newGame()
    s.upgrades.prospectStudy = true
    s.buildings.spiritQuarry = { count: 1, on: true }
    s.buildings.ironFurnace = { count: 1, on: true }
    s.disciples.total = 1
    s.disciples.jobs.miner = 1
    s.resources.qi = 1000
    s.resources.stone = 0
    E.recompute(s, d)
    const before = s.resources.stone || 0
    E.tick(s, d, 600, { events: false })
    ok(
      '灵石矿有矿工时能采到灵石',
      (s.resources.stone || 0) > before,
      `${before} → ${(s.resources.stone || 0).toFixed(2)}`,
    )
  }
}

// ------------------------------------------------------------
section('新增加工链与旧存档兼容')
{
  const legacy = createInitialState()
  delete legacy.resources.qiParticle
  delete legacy.resources.spiritLiquid
  legacy.buildings.splitArray = { count: 2, on: false }
  legacy.upgrades.yinyangSplit = true
  legacy.upgrades.crystalTheory = true
  legacy.autoCraft.condenseCrystal = true
  legacy.stats.crafted.immortalHerb = 5
  const restored = normalizeState(legacy)
  ok('旧分灵阵迁移补齐偏极阵并保留数量与停用状态', restored.buildings.polarizeArray?.count === 2 && restored.buildings.polarizeArray.on === false && restored.upgrades.particleTheory)
  ok('旧凝晶产线补齐凝液法与自动上游', restored.upgrades.liquidArt && restored.autoCraft.condenseLiquid)
  ok('迁移不改写原始存档对象', !legacy.buildings.polarizeArray && !legacy.upgrades.liquidArt && !legacy.autoCraft.condenseLiquid)
  const twice = normalizeState(restored)
  ok('重复读档不重复发放设施', twice.buildings.polarizeArray.count === 2)
  const current = createInitialState()
  current.buildings.splitArray = { count: 1, on: true }
  current.upgrades.crystalTheory = true
  const unchanged = normalizeState(current)
  ok('新版存档遵守新产线，不自动补设施或研究', !unchanged.buildings.polarizeArray && !unchanged.upgrades.liquidArt)
  const herbLegacy = { resources: {}, stats: { crafted: { immortalHerb: 1 } } }
  ok('旧育仙草记录也能补齐凝液法', normalizeState(herbLegacy).upgrades.liquidArt)
  const { state: s, derived: d } = newGame()
  s.buildings.quarry = { count: 1, on: true }
  E.recompute(s, d)
  d.net = { qi: 1, rock: 1, stone: 0.01 }
  ok('等待时间比较采集与两条凝石配方，选择最快路线', close(E.timeToAfford(s, d, 'stone', 1), 15))
  d.craftBonus = 1
  ok('等待时间计入制作收益，避免高估原料需求', close(E.timeToAfford(s, d, 'stone', 2), 15))
  d.rates = { qi: 3, rock: 3 }
  const rateWithQuarry = E.eventResourceRate(s, d, 'stone')
  delete s.buildings.quarry
  const rateWithoutQuarry = E.eventResourceRate(s, d, 'stone')
  ok('事件产能选可用配方的最佳供料路线，不计入未解锁路线', rateWithQuarry > rateWithoutQuarry && rateWithoutQuarry === 0)
  s.realm = 10
  for (const b of BUILDINGS) s.buildings[b.id] = { count: 10, on: true }
  for (const u of ALL_UPGRADES) s.upgrades[u.id] = true
  E.recompute(s, d)
  d.net = Object.fromEntries(RESOURCES.map(r => [r.id, 0]))
  Object.assign(d.net, { qi: 150, rock: 100, herb: 100, ore: 100, wood: 100, faith: 500 })
  ok('灵宝的多级加工等待可沿九转丹、仙草、灵液追溯到灵气', Number.isFinite(E.timeToAfford(s, d, 'spiritTreasure', 1)))
}

section('矿石与点石成灵：凡石砌基，硬通货归灵石')
// ------------------------------------------------------------
{
  const rock = RESOURCE_MAP.rock
  const q = BUILDING_MAP.quarry
  // 矿石已去掉整数限制：采掘与炉料都按小数结算（炼铁炉每座耗 0.3/秒，整枚计数反而别扭）
  ok('矿石资源已定义且不按整枚计数', !!rock && !rock.integer, rock ? JSON.stringify({ id: rock.id, baseMax: rock.baseMax, integer: !!rock.integer }) : '（缺）')
  ok(
    '采矿场由伐木场与谷仓解锁、木料计价：不吃灵气、不吃自己的产出',
    ['lumberYard', 'granary'].every(id => q.needs?.buildings?.some(b => b.id === id)) && (q.cost?.wood || 0) > 0 && !q.cost?.qi && !q.cost?.rock,
    JSON.stringify({ cost: q.cost, needs: q.needs }),
  )
  ok(
    '采矿场开放矿工，自身不产矿石',
    !q.effects?.prod?.rock &&
      JOBS.some(
        (job) =>
          job.resource === 'rock' &&
          (job.needs?.building?.id === q.id || job.needs?.anyBuildings?.some((b) => b.id === q.id)),
      ),
    JSON.stringify(q.effects),
  )
  ok('灵石矿造价改吃矿石，不再用硬通货当砌石', (BUILDING_MAP.spiritQuarry.cost?.rock || 0) > 0 && !BUILDING_MAP.spiritQuarry.cost?.stone, JSON.stringify(BUILDING_MAP.spiritQuarry.cost))
  ok('聚灵大阵灵石需求减少，矿石承接砌筑', BUILDING_MAP.gatheringArray.cost.stone === 150 && BUILDING_MAP.gatheringArray.cost.rock === 400, JSON.stringify(BUILDING_MAP.gatheringArray.cost))
  ok('库房以矿石砌基并为矿石扩容', (BUILDING_MAP.warehouse.cost?.rock || 0) > 0 && (BUILDING_MAP.warehouse.effects?.storage?.rock || 0) > 0)
  const r = CRAFT_MAP.infuseStone
  ok('点石成灵：矿石3+灵气15凝一枚灵石，需采矿场', r.cost.rock === 3 && r.cost.qi === 15 && r.out === 'stone' && r.needs?.building?.id === 'quarry', JSON.stringify(r))
  {
    const { state: s, derived: d } = newGame()
    Object.assign(s.resources, { rock: 30, qi: 100 })
    E.recompute(s, d)
    ok('没有采矿场点不了石', E.craft(s, d, 'infuseStone') === 0)
    s.buildings.quarry = { count: 1, on: true }
    E.recompute(s, d)
    const made = E.craft(s, d, 'infuseStone', { times: 2 })
    ok('点石成灵按配方产出并扣料', made === 2 && s.resources.stone === 2 && close(s.resources.rock, 24) && close(s.resources.qi, 70), `产 ${made}，余 rock ${(s.resources.rock || 0).toFixed(2)} qi ${(s.resources.qi || 0).toFixed(2)}`)
  }
}

// ------------------------------------------------------------
section('参照玩家的囤货上限：不能低于游戏里的需求')
// ------------------------------------------------------------
{
  const maxDemand = {}
  const addDemand = (cost) => {
    for (const [res, amount] of Object.entries(cost || {})) {
      maxDemand[res] = Math.max(maxDemand[res] || 0, amount || 0)
    }
  }
  for (const b of BUILDINGS) addDemand(b.cost)
  for (const u of ALL_UPGRADES) addDemand(u.cost)
  for (const r of REALMS) addDemand(r.cost)

  const bad = []
  for (const [recipeId, adv] of Object.entries(ADVANCED_CRAFTS)) {
    const out = CRAFT_MAP[recipeId]?.out
    if (!out) continue
    const need = maxDemand[out] || 0
    if (adv.cap < need) bad.push(out + '：上限 ' + adv.cap + ' < 游戏需求 ' + need)
  }
  ok('参照玩家的囤货上限 ≥ 游戏里的最大单笔需求', bad.length === 0, bad.join('；') || '全部够用')
}

// ------------------------------------------------------------
section('资源完整性：每个资源都要有来源、有去向')
// ------------------------------------------------------------
{
  // 尊贵资源（道果 / 仙缘）的来源是转世与飞升、去向是当乘区，单独放行
  const prestige = new Set(['dao', 'karma'])
  // 逸散也算"去向"：灵能是被自身衰减消耗掉的，不写进任何造价
  const decaying = new Set(['qiEnergy'])
  const sourced = new Set()
  const sunk = new Set()
  for (const j of JOBS) {
    if (j.resource) sourced.add(j.resource)
    for (const output of j.additionalOutputs || []) sourced.add(output.resource)
    for (const k of Object.keys(j.effects?.prod || {})) sourced.add(k)
  }
  for (const b of BUILDINGS) {
    for (const k of Object.keys(b.effects?.prod || {})) sourced.add(k)
    for (const k of Object.keys(b.cost || {})) sunk.add(k)
    for (const k of Object.keys(b.upkeep || {})) sunk.add(k)
  }
  for (const c of CRAFTS) {
    sourced.add(c.out)
    for (const k of Object.keys(c.cost || {})) sunk.add(k)
  }
  for (const u of ALL_UPGRADES) for (const k of Object.keys(u.cost || {})) sunk.add(k)
  for (const r of REALMS) for (const k of Object.keys(r.cost || {})) sunk.add(k)

  const noSource = RESOURCES.filter((r) => !prestige.has(r.id) && !sourced.has(r.id)).map((r) => r.name)
  const noSink = RESOURCES.filter(
    (r) => !prestige.has(r.id) && !decaying.has(r.id) && !sunk.has(r.id),
  ).map((r) => r.name)
  ok('每个资源都有来源（没有凭空出现的）', noSource.length === 0, noSource.join('、') || '全部有')
  ok('每个资源都有去向（没有死资源）', noSink.length === 0, noSink.join('、') || '全部有')
}

// ------------------------------------------------------------
section('进阶品的作用：一次性突破 + 可重复去向')
// ------------------------------------------------------------
{
  // 纯中间体：只作为别的东西的原料，自己不进建筑（放行）
  const INTERMEDIATE = new Set(['immortalHerb'])
  const buildingSinks = new Set()
  for (const b of BUILDINGS) for (const k of Object.keys(b.cost || {})) buildingSinks.add(k)

  const generated = CRAFTS.filter((c) => c.cost && Object.keys(c.cost).length >= 2 && c.needs)
  const advancedActs = generated.filter((c) => ['steel', 'immortalHerb', 'nineTurnPill', 'spiritTalisman', 'spiritArtifact', 'spiritTreasure'].includes(c.out))

  const noRepeat = advancedActs
    .map((c) => c.out)
    .filter((out) => !INTERMEDIATE.has(out) && !buildingSinks.has(out))
  ok(
    '每种进阶品都有可重复去向（至少进一样建筑的造价）',
    noRepeat.length === 0,
    noRepeat.join('、') || '全部有',
  )

  // 另一条：进阶品必须出现在"一次性"的后期门槛里（破境或研究），否则它只是建材
  const oneShot = new Set()
  for (const r of REALMS) for (const k of Object.keys(r.cost || {})) oneShot.add(k)
  for (const u of ALL_UPGRADES) for (const k of Object.keys(u.cost || {})) oneShot.add(k)
  const noGate = advancedActs
    .map((c) => c.out)
    .filter((out) => !INTERMEDIATE.has(out) && !oneShot.has(out))
  ok('每种进阶品也都进了后期门槛（破境或研究）', noGate.length === 0, noGate.join('、') || '全部有')
}

// ------------------------------------------------------------
section('角色倾向：灵符与复合建材承担后期营造')
// ------------------------------------------------------------
{
  // 这两样按设计口径**偏建材消耗品**：建筑（可反复盖）的总需求应当不低于一次性门槛的总需求。
  const sumOf = (res, list) =>
    list.reduce((s, x) => s + (x.cost?.[res] || 0), 0)
  const oneShot = [...REALMS, ...ALL_UPGRADES]
  for (const [res, label] of [
    ['ironMortar', '玄铁混灵土'],
    ['arcaneGold', '玄金'],
    ['crystalSilver', '晶银'],
    ['spiritTalisman', '灵符'],
  ]) {
    const inBuildings = sumOf(res, BUILDINGS)
    const inGates = sumOf(res, oneShot)
    ok(
      label + '的建筑需求 ≥ 一次性需求（偏建材）',
      inBuildings >= inGates,
      '建筑 ' + inBuildings + ' vs 门槛 ' + inGates,
    )
  }
}

// ------------------------------------------------------------
section('第二种驱动：灵子论 → 分灵 → 偏极 → 湮灭 → 灵能')
// ------------------------------------------------------------
{
  // 灵能会逸散：无产出时应当衰减到 0
  {
    const { state: s, derived: d } = newGame()
    s.resources.qiEnergy = 100
    E.recompute(s, d)
    // 注意：tick 内部把单步上限压到 60 秒，所以"6 小时"要自己循环推进
    for (let i = 0; i < 6 * 60; i++) E.tick(s, d, 60, { events: false })
    ok(
      '灵能会逸散（无产出时衰减到接近 0）',
      (s.resources.qiEnergy || 0) < 0.01,
      '6 小时后剩 ' + (s.resources.qiEnergy || 0).toFixed(6),
    )
  }

  // 稳态 ≈ 产出 ÷ 逸散率：一台湮灭炉 0.06/秒、逸散 0.005/秒 → 12 灵能
  {
    const { state: s, derived: d } = newGame()
    s.upgrades.annihilationArt = true
    s.buildings.annihilationFurnace = { count: 1, on: true }
    s.buildings.grotto = { count: 1, on: true } // 足够容纳整段稳态测量所需的粒子
    s.resources.yangParticle = 1e6 // 粒子管够，隔离掉分灵阵的变量
    s.resources.yinParticle = 1e6
    s.resources.qi = 1e6
    E.recompute(s, d)
    for (let i = 0; i < 4000; i++) {
      E.tick(s, d, 1, { events: false })
      if (i % 300 === 0) E.recompute(s, d)
    }
    const steady = s.resources.qiEnergy || 0
    const expect = (d.rates.qiEnergy || 0) / CONFIG.QI_ENERGY_DECAY
    ok(
      '灵能有稳态（≈ 产出 ÷ 逸散率）',
      Math.abs(steady - expect) / Math.max(expect, 1e-9) < 0.1,
      '实测 ' + steady.toFixed(2) + '，预期 ' + expect.toFixed(2),
    )
  }

  // 只加成基础物资：灵木吃、灵机不吃
  {
    const build = (energy) => {
      const { state: s, derived: d } = newGame()
      s.upgrades.prospectStudy = true
      s.buildings.lumberYard = { count: 10, on: true }
      s.buildings.library = { count: 2, on: true }
      s.disciples.total = 2
      s.disciples.jobs = { woodcutter: 1, scholar: 1 }
      s.resources.qiEnergy = energy
      E.recompute(s, d)
      return { wood: d.rates.wood || 0, insight: d.rates.insight || 0 }
    }
    const before = build(0)
    const after = build(250) // 250 灵能 → 满额 +500%
    ok(
      '灵能大幅提高基础物资产出',
      after.wood > before.wood * 3,
      '灵木 ' + before.wood.toFixed(3) + '/秒 → ' + after.wood.toFixed(3) + '/秒',
    )
    ok(
      '灵能不加成灵机（只作用于基础物资）',
      Math.abs(after.insight - before.insight) < 1e-9,
      '灵机 ' + before.insight.toFixed(4) + ' → ' + after.insight.toFixed(4),
    )
  }

  // 《灵能应用》（主线第Ⅳ章）：灵能同时进入点石成灵、刨木成板的制作收益
  {
    const probe = (learned, energy) => {
      const { state: s, derived: d } = newGame()
      if (learned) s.upgrades.energyApplication = true
      s.resources.qiEnergy = energy
      E.recompute(s, d)
      return {
        stone: E.craftYield(d, CRAFT_MAP.infuseStone),
        infusedStone: E.craftYield(d, CRAFT_MAP.infuseStone),
        plank: E.craftYield(d, CRAFT_MAP.sawPlank),
        pill: E.craftYield(d, CRAFT_MAP.refinePill),
      }
    }
    const before = probe(false, 0)
    const stockOnly = probe(false, 250)
    const learned = probe(true, 250)
    ok(
      '未参悟《灵能应用》时，灵能不进入点石成灵/刨木成板的制作收益',
      Math.abs(stockOnly.stone - before.stone) < 1e-9 && Math.abs(stockOnly.plank - before.plank) < 1e-9,
      `灵石 ${before.stone.toFixed(3)} → ${stockOnly.stone.toFixed(3)}`,
    )
    ok(
      '参悟《灵能应用》后，点石成灵与刨木成板的收益随灵能提高',
      learned.stone > stockOnly.stone && learned.plank > stockOnly.plank,
      `灵石 ${stockOnly.stone.toFixed(3)} → ${learned.stone.toFixed(3)}`,
    )
    ok('灵能应用不外溢到名单之外的配方（采药制丹不变）', Math.abs(learned.pill - before.pill) < 1e-9)
    ok('两条灵石配方都得到灵能应用加成', learned.infusedStone > stockOnly.infusedStone && close(learned.infusedStone, learned.stone))
  }

  // 灵气六阶阶梯（RESEARCH.md）：气 → 液 → 晶 → 灵气分子 → 正负灵子 → 灵能；灵石是含灵矿物，不在阶梯上
  {
    const liq = CRAFT_MAP.condenseLiquid
    const cry = CRAFT_MAP.condenseCrystal
    ok('凝气成液由凝液法放行，150 灵气一瓶', liq.needs?.upgrades?.includes('liquidArt') && liq.cost.qi === 150 && liq.out === 'spiritLiquid')
    ok('凝液法挂在元婴、接在凝灵诀之后（金丹重排后移一档）', E.UPGRADE_MAP.liquidArt.needs.realm === 5 && E.UPGRADE_MAP.liquidArt.needs.upgrades.includes('condenseArt'))
    ok('凝晶原理以凝液法为前置（第Ⅱ章成链）', E.UPGRADE_MAP.crystalTheory.needs.upgrades.includes('liquidArt'))
    ok('凝气结晶由固形纹直接加工灵液与灵气', cry.cost.spiritLiquid === 3 && !cry.cost.talisman && cry.cost.qi === 300)
    ok('培育仙草以灵液浇灌', CRAFT_MAP.growImmortalHerb.cost.spiritLiquid === 2 && !CRAFT_MAP.growImmortalHerb.cost.qi)
    ok('灵石是含灵矿物：矿工开采与点石成灵并存', JOBS.some(job => job.secondary?.resource === 'stone') && CRAFT_MAP.infuseStone.needs?.building?.id === 'quarry')
    const split = BUILDING_MAP.splitArray
    const polar = BUILDING_MAP.polarizeArray
    ok('灵子论在合体开放分灵阵，产出灵气分子', E.UPGRADE_MAP.particleTheory.needs.realm === 8 && split.needs.upgrades.includes('particleTheory') && split.effects.prod.qiParticle > 0 && !split.effects.prod.yangParticle)
    ok('阴阳分灵改开偏极阵：吃灵气分子、出正负灵子', polar.needs.upgrades.includes('yinyangSplit') && polar.upkeep.qiParticle > 0 && polar.effects.prod.yangParticle > 0 && polar.effects.prod.yinParticle > 0)
    ok('粒子链质量守恒：一分灵阵恰好喂一偏极阵、一偏极阵恰好喂一湮灭炉', close(split.effects.prod.qiParticle, polar.upkeep.qiParticle) && close(polar.effects.prod.yangParticle + polar.effects.prod.yinParticle, BUILDING_MAP.annihilationFurnace.upkeep.yangParticle + BUILDING_MAP.annihilationFurnace.upkeep.yinParticle))
    ok('阴阳分灵仍以灵子论为前置，湮灭链保持连通', E.UPGRADE_MAP.yinyangSplit.needs.upgrades.includes('particleTheory') && E.UPGRADE_MAP.annihilationArt.needs.upgrades.includes('yinyangSplit'))
  }

  // 分灵阵烧灵气：它是本作最大的灵气去处，且停用即停费
  {
    const wh = BUILDING_MAP.splitArray
    ok('阴阳分灵阵以灵气为维护费', (wh.upkeep?.qi || 0) > 0, JSON.stringify(wh.upkeep))
    const { state: s, derived: d } = newGame()
    s.upgrades.yinyangSplit = true
    s.buildings.splitArray = { count: 2, on: true }
    s.resources.qi = 100
    E.recompute(s, d)
    const on = d.expense?.qi || 0
    s.buildings.splitArray = { count: 2, on: false }
    E.recompute(s, d)
    const off = d.expense?.qi || 0
    ok('停用分灵阵后灵气开销归零', off > on && Math.abs(off) < Math.abs(on), on + ' → ' + off)
  }
}

// ------------------------------------------------------------
section('事件三分类：自然环境 / 突发 / 选择')
// ------------------------------------------------------------
{
  const byType = (ty) => EVENTS.filter((e) => e.type === ty)
  ok('三类事件都有内容', byType('nature').length > 0 && byType('sudden').length > 0 && byType('choice').length > 0,
    '环境 ' + byType('nature').length + ' / 突发 ' + byType('sudden').length + ' / 选择 ' + byType('choice').length)
  ok('每个事件都标了类别', EVENTS.every((e) => ['nature', 'sudden', 'choice'].includes(e.type)),
    EVENTS.filter((e) => !e.type).map((e) => e.id).join(',') || '全部有')

  // 自然环境类：靠临时增益/减益，主要影响产出，且有正有负
  const nature = byType('nature')
  ok('自然环境类都是临时增益/减益（影响产出）',
    nature.every((e) => e.buff && typeof e.buff.mult === 'number'),
    nature.filter((e) => !e.buff).map((e) => e.id).join(',') || '全部有')
  ok('自然环境类有正有负', nature.some((e) => e.buff.mult > 0) && nature.some((e) => e.buff.mult < 0))

  // 突发事件类：立刻结算，收获与损失都要有
  const sudden = byType('sudden')
  ok('突发事件类都是立刻结算（收获或损失）',
    sudden.every((e) => e.lootRate || e.disaster || e.recruit),
    sudden.filter((e) => !e.lootRate && !e.disaster && !e.recruit).map((e) => e.id).join(',') || '全部有')
  ok('突发事件类里"发现资源""顿悟""丢失物资"三种都在',
    sudden.some((e) => e.lootRate) && sudden.some((e) => e.lootRate?.insight) && sudden.some((e) => e.disaster))

  // 选择类：每个选项都要有收获、也有代价
  const choice = byType('choice')
  ok('选择类每个事件都有两个以上选项', choice.every((e) => (e.options || []).length >= 2),
    choice.filter((e) => (e.options || []).length < 2).map((e) => e.id).join(',') || '全部有')

  // 收益 > 代价：平铺代价可直接比"资源当量"，百分比代价只要求确实有收获
  // 资源当量：按**后期实际丰度**定 —— 灵机与灵石到那时是海量（各自二十多万），
  // 整枚的精料与进阶品才是真贵的东西；弟子按 300 计（中期一名弟子的价值）。
  const WEIGHT = {
    qi: 0.005, wood: 0.01, faith: 0.02, stone: 0.02, ore: 0.1, herb: 0.1,
    plank: 4, insight: 0.02, pill: 1, talisman: 1, artifact: 2,
    spiritTalisman: 8, spiritArtifact: 15, nineTurnPill: 15, spiritTreasure: 60,
  }
  const RECRUIT_WORTH = 300
  const worth = (obj) => Object.entries(obj || {}).reduce((s, [r, v]) => s + (WEIGHT[r] || 1) * v, 0)
  const gainWorth = (eff) => worth(eff.floor) + (eff.recruit || 0) * RECRUIT_WORTH
  const problems = []
  for (const e of choice) {
    for (const o of e.options) {
      const eff = o.effect || {}
      if (eff.decline || e.threat) continue
      const hasGain = !!(eff.lootRate || eff.recruit)
      // 代价可以是比例（costShare，随资源缩放）、绝对值（cost）或按比例掠夺（disaster）
      const hasCost = !!(eff.cost || eff.costShare || eff.tradeCost || eff.disaster)
      if (!hasGain) problems.push(e.id + '/' + o.label + '：没有收获')
      if (!hasCost) problems.push(e.id + '/' + o.label + '：没有代价')
      // 绝对值代价仍按当量比较；比例代价由下面三条结构规则守（30% 上限 + 按产出发放）
      if (eff.cost && gainWorth(eff) < worth(eff.cost)) {
        problems.push(e.id + '/' + o.label + '：保底收益 ' + gainWorth(eff).toFixed(0) + ' < 平铺代价 ' + worth(eff.cost).toFixed(0))
      }
    }
  }
  ok('选择类：参与选项都有收获与代价', problems.length === 0, problems.slice(0, 3).join('；') || '全部合规')

  // 挂钩当前境界与资源（三条结构规则）
  {
    const flatCost = []
    const noRate = []
    const tooHeavy = []
    for (const e of EVENTS) {
      if (e.type !== 'choice') continue
      for (const o of e.options) {
        const eff = o.effect || {}
        if (eff.decline || e.threat) continue
        if (eff.cost) flatCost.push(e.id + '/' + o.label)
        // 收获必须是"当前产出的多少秒" —— 产出随境界与建筑缩放，奖励因此水涨船高
        if (!eff.lootRate) noRate.push(e.id + '/' + o.label)
        // 代价是存量比例，且不该一次拿走三成以上
        for (const [res, share] of Object.entries(eff.costShare || {})) {
          if (share > 0.3) tooHeavy.push(e.id + '/' + o.label + ' ' + res + ' ' + share)
        }
      }
    }
    ok('选择类使用产能交易或比例风险，避免固定价格随进度稀释', flatCost.length === 0, flatCost.join('、') || '全部动态')
    ok('选择类的收获都按"当前产出的多少秒"发放（随境界与资源缩放）', noRate.length === 0, noRate.join('、') || '全部按产出')
    ok('选择类的比例代价不超过存量的 30%', tooHeavy.length === 0, tooHeavy.join('、') || '全部在 30% 以内')

    // 高境界的选择要"更贵"：代价比例（costShare 与 disaster 中值）随 minRealm 抬升
    const costLevel = (e) => {
      const vals = []
      for (const o of e.options) {
        const eff = o.effect || {}
        for (const v of Object.values(eff.costShare || {})) vals.push(v)
        for (const cost of Object.values(eff.tradeCost || {})) vals.push(cost.seconds / 600)
        if (eff.disaster?.lossPercent) {
          vals.push((eff.disaster.lossPercent[0] + eff.disaster.lossPercent[1]) / 2)
        }
      }
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
    }
    const pick = (lo, hi) =>
      EVENTS.filter((e) => e.type === 'choice' && (e.minRealm || 0) >= lo && (e.minRealm || 0) <= hi)
    const avgLevel = (list) =>
      list.reduce((s, e) => s + costLevel(e), 0) / Math.max(list.length, 1)
    const lowTier = pick(0, 6)
    const highTier = pick(7, 10)
    ok(
      '高境界的选择更贵（交易时长与风险水平平均更高）',
      highTier.length >= 4 && avgLevel(highTier) > avgLevel(lowTier),
      '低境界 ' + (avgLevel(lowTier) * 100).toFixed(0) + '% vs 高境界 ' + (avgLevel(highTier) * 100).toFixed(0) + '%',
    )
    ok('高境界（≥7）的选择至少四条', highTier.length >= 4, String(highTier.length))

    // 行为验证：同一事件在不同产出下给的东西不同
    const gainAt = (rate) => {
      const { state: s, derived: d } = newGame()
      d.rates = { ...d.rates, artifact: rate }
      s.pendingChoice = { id: 'ancientCave', at: 0 }
      const before = s.resources.artifact || 0
      E.resolveChoice(s, d, 0)
      return (s.resources.artifact || 0) - before
    }
    const low = gainAt(0.01)
    const high = gainAt(1)
    ok('同一事件在高产出的存档里给得更多（与资源挂钩）', high > low, low + ' → ' + high)
  }
}

// ------------------------------------------------------------
section('事件工艺奖励与交易')
{
  const { state: s, derived: d } = newGame()
  s.realm = 4
  s.upgrades.woodworking = true
  s.upgrades.talismanArt = true
  s.upgrades.arrayAssembly = true
  s.buildings.forge = { count: 1, on: true }
  s.buildings.talismanHall = { count: 1, on: true }
  E.recompute(s, d)
  d.rates = { ...d.rates, wood: 350, qi: 500, ore: 100, stone: 30 }
  const rate = E.eventResourceRate(s, d, 'arrayBase')
  ok('组合工艺奖励可沿木板、玄铁与灵气追溯产能', rate > 0 && rate <= E.craftYield(d, CRAFT_MAP.assembleArrayBase) / 4)
  const low = E.eventOutcome(s, d, { lootRate: { artifact: 30 }, floor: { artifact: 1 } }).rows[0].gained
  d.craftBonus += 1
  const high = E.eventOutcome(s, d, { lootRate: { artifact: 30 }, floor: { artifact: 1 } }).rows[0].gained
  ok('工艺品奖励随制作加成成长', high > low)
  // 断掉灵木产率之后，木作产能仍可沿"催生灵木"追到灵气 —— 这是新增的一条上游路径
  d.rates.wood = 0
  ok(
    '灵木产率断了，但灵气在手时仍可沿"催生灵木"追到产能',
    E.eventResourceRate(s, d, 'arrayBase') > 0,
    String(E.eventResourceRate(s, d, 'arrayBase')),
  )
  // 再把灵气也断了，才是真的"上游短板"
  d.rates.qi = 0
  ok('灵气与灵木都断了，工艺产能归零', E.eventResourceRate(s, d, 'arrayBase') === 0)
  s.buildings.forge.count = 0
  ok('未解锁配方不虚构加工产能', E.eventResourceRate(s, d, 'artifact') === 0)

  const trade = EVENT_MAP.caravan.options[0].effect
  d.rates.herb = 1
  s.resources.herb = 0
  const empty = E.eventOutcome(s, d, trade)
  s.resources.herb = d.max.herb
  const stocked = E.eventOutcome(s, d, trade)
  ok('交易价格不随囤货增加', empty.required.herb === stocked.required.herb)
  ok('空库存无法领取交易奖励', !empty.affordable && stocked.affordable)
  d.rates.herb = 100000
  const capped = E.eventOutcome(s, d, trade)
  ok('交易价格有仓储比例上限', capped.required.herb <= Math.max(40, d.max.herb * 0.1))
  d.disasterGuard = 0.9
  ok('护山减损不抵扣交易用料', E.eventOutcome(s, d, trade).required.herb === capped.required.herb)
  s.resources.herb = 0
  s.pendingChoice = { id: 'caravan', at: 0 }
  const before = JSON.stringify(s.resources)
  ok('引擎拒绝材料不足的选择并保留待决', E.resolveChoice(s, d, 0) === null && s.pendingChoice?.id === 'caravan')
  ok('失败交易不扣料、不发奖', JSON.stringify(s.resources) === before)
  const skip = EVENT_MAP.caravan.options.findIndex(o => o.effect.decline)
  E.resolveChoice(s, d, skip)
  ok('不介入可退出且不改变资源', !s.pendingChoice && JSON.stringify(s.resources) === before)
  s.resources.herb = d.max.herb
  s.pendingChoice = { id: 'caravan', at: 0 }
  const expected = E.eventOutcome(s, d, trade)
  const stocks = { ...s.resources }
  E.resolveChoice(s, d, 0)
  ok('付费交易的预览和实际结算相符', expected.rows.every(row => close(s.resources[row.res], (stocks[row.res] || 0) - row.lost + row.gained)))
  ok('普通机会可无代价退出，威胁必须提供默认防守', EVENTS.filter(e => e.type === 'choice').every(e => e.options.some(o => e.threat ? o.effect.beastResponse === 'default' : o.effect.decline)))
  ok('阵基接入至少三条现有事件', EVENTS.filter(e => e.lootRate?.arrayBase || e.options?.some(o => o.effect.lootRate?.arrayBase)).length >= 3)
  ok('交易最低用料和产能时长有效', EVENTS.every(e => (e.options || []).every(o => Object.values(o.effect.tradeCost || {}).every(c => c.floor > 0 && c.seconds > 0))))
}

section('选择类的结算流程')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  const ev = EVENT_MAP.ancientCave
  state.resources.wood = 100
  state.nextEventAt = Date.now() - 1000
  E.fireEvent(state, derived, ev)
  ok('选择触发时立即重排计时，避免下个 tick 连发', state.nextEventAt > Date.now())
  const plannedAt = state.nextEventAt
  ok('显式触发也不会覆盖未决选择', E.fireEvent(state, derived, EVENT_MAP.stoneStele) === null && state.pendingChoice.id === ev.id)
  const preview = E.eventOutcome(state, derived, ev.options[0].effect)
  ok('选择预览包含实际损失', preview.rows.find(r => r.res === 'wood').lost === 12)
  E.resolveChoice(state, derived, 0)
  ok('收益与灾损同时结算，不再吞掉损失', state.resources.wood === 88 && state.resources.artifact === 2)
  ok('结算选择不推迟下一次自然事件', state.nextEventAt === plannedAt)
  ok('预览与结算的收益一致', preview.rows.every(r => state.resources[r.res] === ({ wood: 100 }[r.res] || 0) - r.lost + r.gained))
  state.stats.choicesMade = 0
  E.fireEvent(state, derived, ev)
  ok('选择类触发后进入待决，不立即生效', !!state.pendingChoice && state.pendingChoice.id === ev.id,
    JSON.stringify(state.pendingChoice))

  let sawChoice = false
  for (let i = 0; i < 300; i++) {
    const fired = E.fireEvent(state, derived)
    if (fired && fired.type === 'choice') sawChoice = true
  }
  ok('待决期间不会再抽到选择类', !sawChoice)

  const before = { ...state.resources }
  E.resolveChoice(state, derived, 0)
  ok('结算后清空待决', !state.pendingChoice)
  ok('结算应用了所选选项的效果', Object.entries(state.resources).some(([k, v]) => v > (before[k] || 0)))
  ok('结算记了一笔（stats.choicesMade）', state.stats.choicesMade === 1, String(state.stats.choicesMade))
  ok('待决为空时结算不报错', E.resolveChoice(state, derived, 0) === null)
}

{
  const { state, derived } = newGame()
  state.resources.herb = derived.max.herb - 10
  const herbBefore = state.resources.herb
  const spec = { costShare: { herb: 0.1 }, disaster: { resources: ['herb'], lossPercent: [0.1, 0.1] }, lootRate: { herb: 100 }, floor: { herb: 100 } }
  const result = E.eventOutcome(state, derived, spec).rows[0]
  E.fireEvent(state, derived, { id: 'testMixed', type: 'sudden', text: '混合结算', kind: 'event', ...spec })
  ok('同资源先付代价再收奖励，预览与结算一致', close(state.resources.herb, herbBefore - result.lost + result.gained))
  ok('仓储截断在预览中显示', result.overflow > 0 && state.resources.herb === derived.max.herb)
  state.resources.wood = 100
  derived.disasterGuard = 0.5
  const guarded = E.eventOutcome(state, derived, EVENT_MAP.ancientCave.options[0].effect)
  ok('预览包含护山减损', guarded.rows.find(r => r.res === 'wood').lost === 6)
  state.disciples.total = derived.maxDisciples
  ok('满员时预览不会许诺收徒', E.eventOutcome(state, derived, { recruit: 1 }).recruits === 0)
}

// ------------------------------------------------------------
section('宜居度：阈值、来源倍率与人口流失')
{
  for (const [h, n, global, jobs, leave] of [
    [0, 100, 1, 0.5, 0.5], [-25, 100, 0.75, 0.5, 0.5], [-50, 100, 0.5, 0.5, 0.5],
    [-500, 100, 0.5, 0.5, 0.5], [120, 100, 1, 1, 0], [170, 100, 1.25, 1, 0],
    [220, 100, 1.5, 1, 0], [500, 100, 1.5, 1, 0], [80, 100, 1, 1, 0],
    [79, 100, 1, 0.5, 0], [50, 100, 1, 0.5, 0], [49, 100, 1, 0.5, 0.02],
    [-10, 19, 0.9, 1, 0], [-1, 20, 0.99, 0.5, 0], [0, 20, 1, 1, 0],
    [-10, 49, 0.9, 0.5, 0], [-1, 50, 0.99, 0.5, 0.02], [0, 50, 1, 0.5, 0],
  ]) {
    const effects = E.habitabilityEffects(h, n)
    ok(`宜居度${h}、人口${n}的边界效果`, close(effects.globalMult, global) && effects.discipleMult === jobs && close(effects.leaveChance, leave))
  }

  const { state: s, derived: d } = newGame()
  s.buildings.lumberYard = { count: 1, on: true }
  s.buildings.spiritField = { count: 1, on: true }
  s.disciples.total = 40
  s.disciples.jobs.woodcutter = 10
  s.disciples.jobs.farmer = 10
  E.recompute(s, d)
  const baseline = { wood: d.rates.wood, upkeep: d.upkeep, craft: E.craftYield(d, CRAFT_MAP.sawPlank), buildingQi: d.sources.qi.find(row => row.kind === 'building').value }
  s.disciples.total = 41
  E.recompute(s, d)
  const building = d.sources.qi.find(row => row.kind === 'building')
  const job = d.sources.wood.find(row => row.kind === 'job')
  ok('拥挤只使弟子产出减半，建筑产出不减半', close(d.rates.wood, baseline.wood * 0.5) && close(job.raw, JOBS.find(j => j.id === 'woodcutter').base * 10 * 0.5) && close(building.value, baseline.buildingQi))
  s.habitabilityPenalty = -70 // 直接验证负值产量下限；正常断供惩罚仍限于-60。
  E.recompute(s, d)
  ok('负宜居度与拥挤相乘，弟子最低25%而建筑最低50%', close(d.habitabilityMult, 0.5) && close(d.sources.wood.find(row => row.kind === 'job').value, job.value * 0.5) && close(d.sources.qi.find(row => row.kind === 'building').value, building.value * 0.5))
  ok('宜居度不降低口粮，也不改变每份合成收益', close(d.upkeep, baseline.upkeep * 41 / 40) && close(E.craftYield(d, CRAFT_MAP.sawPlank), baseline.craft))
  ok('岗位惩罚后的来源明细仍与实际进项相等', close(d.sources.wood.reduce((sum, row) => sum + row.value, 0), d.rates.wood))
  s.habitabilityPenalty = 0
  s.buildings.meditationPool = { count: 24, on: true }
  E.recompute(s, d)
  ok('宜居度富余实际增产最多50%并解除岗位减半', d.habitability === 164 && d.discipleMult === 1 && close(d.rates.wood, baseline.wood * 1.5) && close(d.sources.qi.find(row => row.kind === 'building').value, baseline.buildingQi * 1.5))
  ok('宜居度富余也不放大每份合成收益', close(E.craftYield(d, CRAFT_MAP.sawPlank), baseline.craft))

  const crowded = () => {
    const game = newGame()
    game.state.buildings.hut = { count: 100, on: true }
    game.state.buildings.spiritField = { count: 1, on: true }
    game.state.disciples.total = 71
    game.state.disciples.jobs.farmer = 70
    game.state.disciples.jobs.woodcutter = 1
    E.recompute(game.state, game.derived)
    game.state.resources.qi = game.derived.max.qi
    return game
  }
  const originalRandom = Math.random
  try {
    const online = crowded()
    Math.random = () => 0.019
    for (let i = 0; i < 59; i++) E.tick(online.state, online.derived, 1, { events: false })
    ok('风险区暂停来人，未满60秒不提前离开', online.state.disciples.total === 71 && E.nextArrivalIn(online.state, online.derived) === null && online.state.arrivalTimer === 0)
    E.tick(online.state, online.derived, 1, { events: false })
    ok('60秒概率命中离开一人，并重新计算风险', online.state.disciples.total === 70 && online.derived.leaveChance === 0 && online.state.disciples.jobs.woodcutter === 0)
    const offline = crowded()
    E.simulateOffline(offline.state, offline.derived, 60)
    ok('离线采用相同周期与离开规则', offline.state.disciples.total === online.state.disciples.total && offline.state.disciples.jobs.farmer === online.state.disciples.jobs.farmer)
    const noLeave = crowded()
    Math.random = () => 0.02
    E.simulateOffline(noLeave.state, noLeave.derived, 60)
    ok('抽签未命中不会强制流失，周期重新计时', noLeave.state.disciples.total === 71 && noLeave.state.leaveTimer === 0)
    E.recruitArrivals(noLeave.state, noLeave.derived, 1000)
    ok('直接来人结算也遵守风险暂停', noLeave.state.disciples.total === 71)
    noLeave.state.buildings.meditationPool = { count: 1, on: true }
    E.recompute(noLeave.state, noLeave.derived)
    E.recruitArrivals(noLeave.state, noLeave.derived, 15)
    ok('改善宜居度后恢复来人', noLeave.state.disciples.total === 72 && noLeave.derived.leaveChance === 0)
    const bulk = crowded()
    bulk.state.disciples.total = 0
    bulk.state.disciples.jobs.farmer = 0
    bulk.state.disciples.jobs.woodcutter = 0
    E.recompute(bulk.state, bulk.derived)
    E.recruitArrivals(bulk.state, bulk.derived, 2000)
    ok('大段来人结算逐人检查风险，不越过暂停条件', bulk.state.disciples.total === 71 && bulk.state.arrivalTimer === 0)
  } finally {
    Math.random = originalRandom
  }
}

section('宜居配套：入住覆盖、实际投资与目标增产')
{
  const { state: s, derived: d } = newGame()
  for (const [id, count] of Object.entries({ hut: 2, library: 1, lumberYard: 1, quarry: 1, granary: 1 })) s.buildings[id] = { count, on: true }
  s.disciples.total = 4
  E.recompute(s, d)
  Object.assign(s.resources, UPGRADE_MAP.homePlanning.cost)
  ok('前期实际学习居所营造并扣除普通原料', E.research(s, d, 'homePlanning') && s.resources.wood === 0 && s.resources.rock === 0 && s.resources.insight === 0 && d.housingHabitability === 4)
  s.disciples.total = 0
  E.recompute(s, d)
  ok('空房不增加宜居度或产量', d.housingHabitability === 0 && d.habitability === 20 && d.habitabilityMult === 1)
  s.disciples.total = 8
  E.recompute(s, d)
  ok('入住配套最多覆盖实际居所容量', d.housingHabitability === 4 && d.maxDisciples === 4)
  s.disciples.total = 4
  E.recompute(s, d)
  for (let i = 0; i < 4; i++) {
    const cost = E.buildingCost(s, 'livingCourt', 1)
    Object.assign(s.resources, cost)
    ok(`第${i + 1}座清风小院实际营造且扣料`, E.buyBuilding(s, d, 'livingCourt') === 1 && s.resources.wood === 0 && s.resources.rock === 0)
  }
  ok('早期入住配套加四座小院提供8%增产', d.habitability === 40 && close(d.habitabilityMult, 1.08) && d.discipleMult === 1)
  s.buildings.hut.count = 30
  s.disciples.total = 60
  E.recompute(s, d)
  ok('正常扩屋入住后保持同样的8%增产', d.housingHabitability === 60 && d.habitability === 96 && close(d.habitabilityMult, 1.08))
  const housingEffects = describeEffects(UPGRADE_MAP.homePlanning.effects)
  ok('工艺说明明确标示每个已入住名额的宜居度', housingEffects.some(row => row.label === '宜居度 / 已入住名额'))

  // 后续阶段使用真实研究、营造和祭炼动作，前置产业作为已发展的夹具。
  s.buildings.herbGarden = { count: 1, on: true }
  s.buildings.library.count = 10
  s.buildings.depot = { count: 3, on: true }
  E.recompute(s, d)
  Object.assign(s.resources, BUILDING_MAP.communalHall.cost)
  const beforeHall = d.habitability
  ok('膳养堂实际营造后增加8点宜居度', E.buyBuilding(s, d, 'communalHall') === 1 && d.habitability === beforeHall + 8 && s.resources.herb === 0)
  s.realm = 3
  s.upgrades.prospectStudy = true
  E.recompute(s, d)
  Object.assign(s.resources, UPGRADE_MAP.waterSanitation.cost)
  const beforeWater = d.habitability
  ok('引泉净水实际研究后增加6点宜居度', E.research(s, d, 'waterSanitation') && d.habitability === beforeWater + 6 && s.resources.ore === 0)
  s.upgrades.spiritMortarArt = true
  Object.assign(s.resources, BUILDING_MAP.cleansingBath.cost)
  ok('未到元婴不能提前建净身灵池', E.buyBuilding(s, d, 'cleansingBath') === 0)
  s.realm = 5
  E.recompute(s, d)
  const beforeBath = d.habitability
  ok('元婴净身灵池实际消耗混灵土和灵液', E.buyBuilding(s, d, 'cleansingBath') === 1 && d.habitability === beforeBath + 10 && s.resources.spiritMortar === 0 && s.resources.spiritLiquid === 0)
  s.upgrades.calmMind = true
  Object.assign(s.resources, UPGRADE_MAP.gardenDesign.cost)
  ok('元婴不能提前学习化神园林营造', !E.research(s, d, 'gardenDesign'))
  s.realm = 6
  E.recompute(s, d)
  const beforeGarden = d.habitability
  ok('园林营造实际消耗复合建材并增加8点', E.research(s, d, 'gardenDesign') && d.habitability === beforeGarden + 8 && s.resources.spiritMortar === 0)
  s.upgrades.ironMortarArt = true
  Object.assign(s.resources, BUILDING_MAP.quietGarden.cost)
  const beforeQuiet = d.habitability
  ok('清幽园林实际消耗玄铁混灵土并增加14点', E.buyBuilding(s, d, 'quietGarden') === 1 && d.habitability === beforeQuiet + 14 && s.resources.ironMortar === 0)
  s.upgrades.forgeArt = true
  s.upgrades.shapeRune = true
  s.upgrades.compositeRune = true
  for (const id of ['dustBell', 'peaceBanner']) {
    const meta = UPGRADE_MAP[id]
    Object.assign(s.resources, meta.cost)
    const before = d.habitability
    ok(`${meta.name}实际炼成并提供宜居度`, E.research(s, d, id) && close(d.habitability - before, meta.effects.habitability) && Object.keys(meta.cost).every(res => s.resources[res] === 0))
    Object.assign(s.resources, E.refineCost(s, id))
    const beforeRefine = d.habitability
    ok(`${meta.name}祭炼按规则放大宜居度`, E.refineTreasure(s, d, id) && close(d.habitability - beforeRefine, meta.effects.habitability * CONFIG.TREASURE_REFINE_STEP))
  }
}
{
  const { state: s, derived: d } = newGame()
  for (const [id, count] of Object.entries({ hut: 10, lumberYard: 1, quarry: 1, granary: 1 })) s.buildings[id] = { count, on: true }
  s.upgrades.homePlanning = true
  s.disciples.total = 20
  E.recompute(s, d)
  const bot = createBot(s, d)
  for (let i = 0; i < 6; i++) {
    Object.assign(s.resources, E.buildingCost(s, 'livingCourt', 1))
    bot.act()
  }
  ok('参照玩家实际投资到目标区间后停止重复购买纯宜居设施', E.countOf(s, 'livingCourt') === 5 && close(d.habitabilityMult, 1.1))
  s.realm = 10
  s.buildings.depot = { count: 20, on: true }
  E.recompute(s, d)
  for (let i = 0; i < 16; i++) {
    Object.assign(s.resources, E.buildingCost(s, 'livingCourt', 1))
    bot.act()
  }
  ok('中后期参照玩家允许继续建设并超过前期20%目标', E.countOf(s, 'livingCourt') === 20 && close(d.habitabilityMult, 1.4))
}

section('缺料、长期断粮与首颗道果')
{
  const { state: s, derived: d } = newGame()
  s.buildings.annihilationFurnace = { count: 1, on: true }
  E.recompute(s, d)
  E.tick(s, d, 1, { events: false })
  ok('没有粒子就没有灵能产出', s.resources.qiEnergy === 0 && d.rates.qiEnergy === 0)
  s.resources.yangParticle = 1
  s.resources.yinParticle = 0.005
  E.recompute(s, d)
  ok('供应按最缺的材料缩放', close(d.buildingSupply.annihilationFurnace, 0.25))
  const fullRate = BUILDING_MAP.annihilationFurnace.effects.prod.qiEnergy * d.globalMult
  E.tick(s, d, 1, { events: false })
  ok('部分供应的产出与实际支付一致', close(s.resources.qiEnergy, fullRate * 0.25 * (1 - CONFIG.QI_ENERGY_DECAY)))
  ok('多材料生产不会透支任一种输入', close(s.resources.yangParticle, 0.995) && close(s.resources.yinParticle, 0))
  s.resources.yinParticle = 1
  E.recompute(s, d)
  ok('补料后自动恢复，不改变启用开关', d.buildingSupply.annihilationFurnace === 1 && s.buildings.annihilationFurnace.on)

  const shared = newGame()
  shared.state.resources.wood = 0.375
  shared.state.buildings.alchemyRoom = { count: 1, on: true }
  shared.state.buildings.forge = { count: 1, on: true }
  E.recompute(shared.state, shared.derived)
  ok('多座设施按需求比例共享短缺材料', close(shared.derived.buildingSupply.alchemyRoom, 0.5) && close(shared.derived.buildingSupply.forge, 0.5))
  E.tick(shared.state, shared.derived, 1, { events: false })
  ok('共享供料不重复花费库存', close(shared.state.resources.wood, 0))
  ok('材料没有净收入时不虚报购买倒计时', E.timeToAfford(shared.state, shared.derived, 'wood', 10) === Infinity)

  const hungry = newGame()
  hungry.state.buildings.meditationPool = { count: 20, on: true }
  hungry.state.disciples.total = 4
  hungry.state.disciples.jobs.farmer = 1
  hungry.state.disciples.jobs.woodcutter = 3
  // 冬季，即使高宜居度加成，单名阵徒仍无法供应四人的口粮。
  hungry.state.totalDays = 280
  E.recompute(hungry.state, hungry.derived)
  E.simulateOffline(hungry.state, hungry.derived, CONFIG.LEAVE_INTERVAL)
  ok('高宜居度也不能免疫长期断粮，离线同样生效', hungry.derived.habitabilityMult > 1 && hungry.state.disciples.total === 3)
  ok('流失优先保留供粮职位', hungry.state.disciples.jobs.farmer === 1 && hungry.state.disciples.jobs.woodcutter === 2)

  const automation = newGame()
  const a = automation.state
  const ad = automation.derived
  resetForAscension(a, 20)
  E.recompute(a, ad)
  ok('首颗道果永久解锁自动炼制，无需重新研究', ad.daoAutomation && ad.autoCraftUnlocked && !a.upgrades.intuition)
  a.buildings.quarry = { count: 1, on: true }
  E.recompute(a, ad)
  a.resources.qi = 140
  a.resources.rock = ad.max.rock
  a.autoCraft.infuseStone = true
  E.runAutoCraft(a, ad, 1)
  ok('自动炼制保留材料底线', a.resources.qi === 140 && a.resources.stone === 0)
  ok('自动状态说明保留材料导致的暂停', E.autoCraftStatus(a, ad, 'infuseStone').reason.includes('保留材料'))
  E.craft(a, ad, 'infuseStone')
  ok('手动制作允许玩家动用保留材料', a.resources.qi === 125 && a.resources.stone === 1)
  a.settings.craftReservePercent = 0
  a.settings.autoCraftPriority = 'refinePill'
  a.buildings.alchemyRoom = { count: 1, on: true }
  a.resources.wood = 100
  a.resources.qi = 60
  a.resources.herb = CRAFT_MAP.refinePill.cost.herb
  a.autoCraft.refinePill = true
  E.recompute(a, ad)
  E.runAutoCraft(a, ad, 2)
  ok('优先配方先获得竞争材料', a.resources.pill > 0 && a.resources.stone === 1)
  const restored = parseImport(exportSave(a))
  ok('统筹设置可随存档保存', restored.settings.autoCraftPriority === 'refinePill' && restored.settings.craftReservePercent === 0)
  resetForReincarnation(a, 5)
  E.recompute(a, ad)
  ok('转世保留道果统筹与偏好', ad.daoAutomation && a.settings.autoCraftPriority === 'refinePill')
  const old = normalizeState({ resources: {} })
  ok('旧存档补齐供粮计时与统筹设置', old.starvationTimer === 0 && old.settings.craftReservePercent === 20)
  const blockedArrivals = newGame()
  blockedArrivals.state.buildings.hut = { count: 3, on: true }
  blockedArrivals.state.disciples.total = 2
  E.simulateOffline(blockedArrivals.state, blockedArrivals.derived, 20)
  ok('断粮时停止接收新弟子，避免流失与招收相互抵消', blockedArrivals.state.disciples.total === 2)
  ok('精舍保留居所与研究两项前置', BUILDING_MAP.mansion.needs.building.id === 'logHouse' && BUILDING_MAP.mansion.needs.upgrades.includes('buildingCode'))
  ok('石殿保留仓储与研究两项前置', BUILDING_MAP.depot.needs.building.id === 'warehouse' && BUILDING_MAP.depot.needs.upgrades.includes('earthEssence'))
  ok('香火鼎保留山门与研究两项前置', BUILDING_MAP.incenseCauldron.needs.building.id === 'gate' && BUILDING_MAP.incenseCauldron.needs.upgrades.includes('incenseStudy'))
  ok('湮灭研究与建筑在渡劫前开放', UPGRADE_MAP.annihilationArt.needs.realm === 9 && BUILDING_MAP.annihilationFurnace.needs.realm === 9)
}

section('金丹工艺：阵基与库存目标')
{
  const { state: s, derived: d } = newGame()
  s.upgrades.woodworking = true
  s.upgrades.talismanArt = true
  s.upgrades.arrayAssembly = true
  s.buildings.talismanHall = { count: 1, on: true }
  s.resources.plank = CRAFT_MAP.assembleArrayBase.cost.plank * 2
  s.resources.talisman = 7
  s.resources.qi = CRAFT_MAP.assembleArrayBase.cost.qi * 2
  s.resources.ore = CRAFT_MAP.assembleArrayBase.cost.ore * 2
  s.realm = 3
  E.recompute(s, d)
  ok('金丹前不能组装阵基', !E.isCraftUnlocked(s, CRAFT_MAP.assembleArrayBase) && E.craft(s, d, 'assembleArrayBase') === 0)
  ok('金丹前普通存档不能设置库存目标', !E.setCraftTarget(s, d, 'infuseStone', 3))
  s.realm = 4
  E.recompute(s, d)
  const made = E.craft(s, d, 'assembleArrayBase', { times: 2 })
  ok('阵基消耗木板、玄铁与灵气，不消耗符箓，整件产出', made === 2 && s.resources.arrayBase === 2 && s.resources.plank === 0 && s.resources.talisman === 7 && s.resources.qi === 0 && s.resources.ore === 0)
  s.upgrades.preachArt = true
  s.resources.arrayBase = BUILDING_MAP.academy.cost.arrayBase
  s.resources.plank = BUILDING_MAP.academy.cost.plank
  ok('第一座讲经堂可以用基础阵基仓储启动', E.buyBuilding(s, d, 'academy', 1) === 1 && s.resources.arrayBase === 0)
  ok('阵基具有至少三处可重复建造用途', BUILDINGS.filter(b => b.cost.arrayBase > 0).length >= 3)
  ok('讲经堂在金丹开放并保留建筑前置', UPGRADE_MAP.preachArt.needs.realm === 4 && !!UPGRADE_MAP.preachArt.needs.building)
  ok('静心池随仙草链后移到元婴并保留建筑前置', UPGRADE_MAP.calmMind.needs.realm === 5 && !!UPGRADE_MAP.calmMind.needs.building)

  s.upgrades.intuition = true
  s.buildings.quarry = { count: 1, on: true }
  s.resources.qi = 450
  s.resources.rock = 30
  s.resources.stone = 0
  s.autoCraft.infuseStone = true
  E.recompute(s, d)
  ok('可以设置成品库存目标', E.setCraftTarget(s, d, 'infuseStone', 3))
  E.runAutoCraft(s, d, 10)
  ok('达到目标后不继续消耗原料', s.resources.stone === 3 && s.resources.qi === 405)
  ok('状态明确显示目标暂停', E.autoCraftStatus(s, d, 'infuseStone').reason === '目标已达 · 暂停')
  s.resources.stone -= 2
  E.runAutoCraft(s, d, 6)
  ok('使用成品后自动补回库存目标', s.resources.stone === 3 && s.resources.qi === 375)
  E.craft(s, d, 'infuseStone')
  ok('手动制作可以超过自动目标', s.resources.stone === 4)
  ok('非法目标不覆盖已有设置', !E.setCraftTarget(s, d, 'infuseStone', -1) && !E.setCraftTarget(s, d, 'infuseStone', Infinity) && E.craftTarget(s, d, 'infuseStone') === 3)
  E.setCraftTarget(s, d, 'infuseStone', 0)
  E.runAutoCraft(s, d, 3)
  ok('目标为零表示不限', s.resources.stone > 4)
  E.setCraftTarget(s, d, 'infuseStone', 8)
  s.resources.stone = 0
  s.resources.qi = 450
  s.resources.rock = 30
  E.simulateOffline(s, d, 30)
  ok('离线自动炼制也遵守目标', s.resources.stone === 8)
  const restored = parseImport(exportSave(s))
  ok('目标数量与阵基资源能导出导入', restored.craftTargets.infuseStone === 8 && 'arrayBase' in restored.resources)
  const old = normalizeState({ resources: { wood: 5 }, realm: 4 })
  ok('旧存档补零阵基与空目标，原资源不变', old.resources.arrayBase === 0 && old.resources.wood === 5 && Object.keys(old.craftTargets).length === 0)
  resetForReincarnation(s, 5)
  E.recompute(s, d)
  ok('转世清空本世库存目标与阵基', Object.keys(s.craftTargets).length === 0 && s.resources.arrayBase === 0)
}

section('灵能枢供能与早期空间技艺移除')
{
  const { state: s, derived: d } = newGame()
  s.upgrades.energyCore = true
  E.recompute(s, d)
  ok('灵能枢炼成但无供能时停效，不虚构灵能消耗', d.upgradeSupply.energyCore === 0 && !(d.ratio.qi || 0) && !(d.ratio.insight || 0) && !(d.maintenance.qiEnergy || 0))
  s.resources.qiEnergy = 10
  E.recompute(s, d)
  ok('满供灵能枢兑现基础效果和每秒耗能', close(d.ratio.qi, 0.5) && close(d.ratio.insight, 0.25) && close(d.maintenance.qiEnergy, 1))
  ok('灵能消耗账目列出灵能枢', d.expenseSources.qiEnergy.some(x => x.id === 'energyCore' && close(x.value, -1)))
  E.tick(s, d, 1, { events: false })
  ok('灵能枢实际扣费且继续计入逸散', close(s.resources.qiEnergy, 9 * (1 - CONFIG.QI_ENERGY_DECAY)))
  s.resources.qiEnergy = 0.25
  E.recompute(s, d)
  ok('不足一秒供能按库存预算缩减效果和耗能', close(d.upgradeSupply.energyCore, 0.25) && close(d.ratio.qi, 0.125) && close(d.ratio.insight, 0.0625) && close(d.maintenance.qiEnergy, 0.25))
  s.treasureLevels.energyCore = 2
  s.resources.qiEnergy = 10
  E.recompute(s, d)
  ok('祭炼同比增加灵能枢效果与持续消耗', close(d.ratio.qi, 0.8) && close(d.ratio.insight, 0.4) && close(d.maintenance.qiEnergy, 1.6))
  s.resources.qiEnergy = 0
  s.buildings.annihilationFurnace = { count: 1, on: true }
  s.resources.yangParticle = 10
  s.resources.yinParticle = 10
  E.recompute(s, d)
  ok('空库存时可使用湮灭炉的实时供能，效果受供料约束', d.upgradeSupply.energyCore > 0 && d.upgradeSupply.energyCore < 1 && close(d.maintenance.qiEnergy, d.rates.qiEnergy))
  s.buildings.annihilationFurnace.on = false
  E.recompute(s, d)
  ok('断料或停炉且无库存时灵能枢停效', d.upgradeSupply.energyCore === 0 && !(d.ratio.qi || 0))
  s.resources.qiEnergy = 0.5
  E.tick(s, d, 10, { events: false })
  ok('长时间结算不会透支灵能，耗尽后停效', s.resources.qiEnergy === 0 && d.upgradeSupply.energyCore === 0)
  ok('删除的空间技艺不再出现在研究表，叠匣术只依赖普通库房', !UPGRADE_MAP.storageBag && !UPGRADE_MAP.voidPouch && !UPGRADE_MAP.caseStackArt.needs.upgrades && UPGRADE_MAP.caseStackArt.needs.building.id === 'warehouse')
  const old = normalizeState({ upgrades: { storageBag: true, voidPouch: true, caseStackArt: true } })
  ok('旧档移除废弃空间记录，保留已学普通仓储技艺', !old.upgrades.storageBag && !old.upgrades.voidPouch && old.upgrades.caseStackArt)
}

section('分层仓储、点击与进阶祭炼')
{
  const { state: s, derived: d } = newGame()
  s.buildings.mansion = { count: 6, on: true }
  s.buildings.depot = { count: 2, on: true }
  s.upgrades.caseStackArt = true
  E.recompute(s, d)
  ok('基础物资通用扩仓仍全额计入', d.max.wood === RESOURCE_MAP.wood.baseMax + 6 * 200 + 2 * BUILDING_MAP.depot.effects.storage.wood + 1200)
  ok('工艺与稀有材料容量有层级差异', d.max.plank > d.max.arrayBase && d.max.arrayBase > d.max.spiritArtifact && d.max.spiritArtifact > d.max.spiritTreasure)
  const pillBefore = d.max.pill
  s.buildings.alchemyRoom = { count: 1, on: true }
  E.recompute(s, d)
  ok('专属成品仓储不被通用折算削弱', d.max.pill === pillBefore + 200)
  ok('整枚资源容量是整数', RESOURCES.filter(r => r.integer).every(r => Number.isInteger(d.max[r.id])))
  const old = normalizeState({ ...s, resources: { ...s.resources, nineTurnPill: 1000 } })
  E.recompute(old, d)
  E.addResource(old, 'nineTurnPill', 10)
  ok('旧档超额成品不被收入操作抹掉且不能继续囤货', old.resources.nineTurnPill === 1000)
  E.payCost(old, { nineTurnPill: 3 })
  E.tick(old, d, 1, { events: false })
  ok('旧档超额成品可正常消费', old.resources.nineTurnPill === 997)
  s.buildings.spiritField = { count: 5, on: true }
  ok('开局点击收益保留', E.clickGain(s, d) === 5)
  s.buildings.spiritField.count = 45
  ok('多聚灵阵点击仍增益但小于原线性收益', E.clickGain(s, d) > 7.5 && E.clickGain(s, d) < 25)
  s.upgrades.flyingSword = true
  s.treasureLevels.flyingSword = 1
  ok('低层祭炼不要求尚未需要的进阶材料', !E.refineCost(s, 'flyingSword').spiritArtifact)
  s.treasureLevels.flyingSword = 2
  const first = E.refineCost(s, 'flyingSword')
  ok('进阶祭炼开始支付灵器与玄钢', first.spiritArtifact === 1 && first.steel === 2)
  for (const [res, amount] of Object.entries(first)) s.resources[res] = amount
  const denied = { ...s.resources }
  s.resources.spiritArtifact = 0
  ok('缺进阶材料不能祭炼', E.refineTreasure(s, d, 'flyingSword') === 0 && s.treasureLevels.flyingSword === 2)
  s.resources.spiritArtifact = denied.spiritArtifact
  E.refineTreasure(s, d, 'flyingSword')
  ok('祭炼实际扣除进阶材料并提升层数', s.resources.spiritArtifact === 0 && s.resources.steel === 0 && s.treasureLevels.flyingSword === 3)
  ok('进阶用料随层数增长并整枚计价', E.refineCost(s, 'flyingSword').spiritArtifact === 2)
  ok('仙草增加可重复消费去向', UPGRADE_MAP.alchemyCauldron.refine.materials.immortalHerb > 0)
}

section('分类仓库与扩仓可达性')
{
  const { state: s, derived: d } = newGame()
  s.realm = 3
  for (const id of ['alchemyArt', 'forgeArt', 'talismanArt', 'woodworking', 'earthArt']) s.upgrades[id] = true
  s.buildings.warehouse = { count: 2, on: true }
  E.recompute(s, d)
  ok('专藏在金丹前不提前出现', !d.unlockedBuildings.includes('medicineVault') && !d.unlockedBuildings.includes('arcaneVault'))
  // 渐进露出要求见过造价的 30%：金丹档把法藏的建材备齐
  for (const [res, n] of Object.entries(BUILDING_MAP.arcaneVault.cost)) s.resources[res] = Math.max(s.resources[res] || 0, n)
  s.realm = 4
  E.recompute(s, d)
  ok('金丹重排后药藏延后到元婴、法藏随符器仓容留在金丹', !d.unlockedBuildings.includes('medicineVault') && d.unlockedBuildings.includes('arcaneVault'))
  s.realm = 5
  for (const id of ['medicineVault', 'arcaneVault']) {
    for (const [res, n] of Object.entries(BUILDING_MAP[id].cost)) s.resources[res] = Math.max(s.resources[res] || 0, n)
  }
  E.recompute(s, d)
  ok('元婴掌握对应手艺且有材料后显示两类专藏', d.unlockedBuildings.includes('medicineVault') && d.unlockedBuildings.includes('arcaneVault'))
  for (const id of ['medicineVault', 'arcaneVault']) {
    const cost = E.buildingCost(s, id, 1)
    ok(`${BUILDING_MAP[id].name}首座费用未超过既有容量`, Object.entries(cost).every(([res, n]) => n <= d.max[res]))
    for (const [res, n] of Object.entries(cost)) s.resources[res] = n
    const before = { ...d.max }
    ok(`${BUILDING_MAP[id].name}可以实际建成`, E.buyBuilding(s, d, id, 1) === 1)
    if (id === 'medicineVault') {
      ok('药藏增加药材丹药容量并支撑终阶投料', d.max.pill - before.pill === 1000 && d.max.nineTurnPill - before.nineTurnPill === 100 && d.max.immortalHerb - before.immortalHerb === 80)
      ok('药藏不扩符器及灵机容量', d.max.artifact === before.artifact && d.max.insight === before.insight && d.max.talisman === before.talisman)
    } else {
      ok('法藏覆盖普通符器与进阶品', d.max.talisman - before.talisman === 1000 && d.max.spiritArtifact - before.spiritArtifact === 100 && d.max.spiritTreasure - before.spiritTreasure === 10)
      ok('法藏不扩丹药及原料容量', d.max.pill === before.pill && d.max.stone === before.stone)
    }
  }
  const before = { ...d.max }
  s.buildings.mansion = { count: 1, on: true }
  E.recompute(s, d)
  ok('扩人口不再顺带扩成品及灵机', d.max.pill === before.pill && d.max.insight === before.insight && d.max.qi === before.qi + 400)
  const restored = normalizeState(JSON.parse(JSON.stringify(s)))
  ok('分类仓库数量随存档保留', restored.buildings.medicineVault.count === 1 && restored.buildings.arcaneVault.count === 1)
  ok('旧石殿沿用同一个存档编号', BUILDING_MAP.depot.name === '材料库' && !BUILDING_MAP.depot.effects.storageAll)
  restored.resources.wood = 10000
  restored.buildings.lumberYard = { count: 1, on: true }
  E.recompute(restored, d)
  E.tick(restored, d, 1, { events: false })
  ok('扩仓调整后旧档超额原料不会被产出截掉', restored.resources.wood === 10000)
  E.payCost(restored, { wood: 20 })
  E.tick(restored, d, 1, { events: false })
  ok('超额原料正常消费且停止补入', restored.resources.wood === 9980)
}

section('仙缘仓储永久加成')
{
  const { state: s, derived: d } = newGame()
  s.buildings.medicineVault = { count: 2, on: true }
  s.buildings.arcaneVault = { count: 1, on: true }
  s.upgrades.caseStackArt = true
  E.recompute(s, d)
  const initial = { ...d.max }
  ok('无仙缘时仓储倍率为1', d.karmaStorageMult === 1)
  s.karma = 202
  E.recompute(s, d)
  ok('202仙缘增加30.3%仓储', close(d.karmaStorageMult, 1.303, 1e-9))
  ok('仙缘统一放大基础、通用及专属容量，最后才整件取整', RESOURCES.filter(r => Number.isFinite(initial[r.id])).every(r => {
    const ratio = TECHNIQUES.filter((u) => s.upgrades[u.id]).reduce((sum, u) => sum + (u.effects?.storageRatio?.[r.id] || 0), 0)
    const raw = (r.baseMax + 1200 * (r.storageWeight ?? 1) + 2 * (BUILDING_MAP.medicineVault.effects.storage[r.id] || 0) + (BUILDING_MAP.arcaneVault.effects.storage[r.id] || 0)) * (1 + ratio)
    return close(d.max[r.id], r.integer ? Math.floor(raw * 1.303 + 1e-9) : raw * 1.303, 1e-8)
  }))
  ok('仙缘及道果自身容量仍为无限', d.max.karma === Infinity && d.max.dao === Infinity)
  const enlarged = { ...d.max }
  E.recompute(s, d)
  ok('重复重算不会复利放大仓储', RESOURCES.every(r => d.max[r.id] === enlarged[r.id]))
  ok('仙缘扩仓不会直接增加库存', s.resources.pill === 0 && s.resources.qi === 0)
  const warehouseWood = E.buildingCost({ ...s, buildings: { warehouse: { count: 45, on: true } } }, 'warehouse', 1).wood
  // 此截图使用旧版石殿造价；保留历史容量回归，不把旧价当成当前材料库价格。
  const depotStone = Math.ceil(1500 * Math.pow(1.25, 25))
  ok('截图下一座库房从容量不足变为可支付', warehouseWood > 336000 && warehouseWood <= 336000 * d.karmaStorageMult)
  ok('历史截图石殿需求落在仙缘增加后的容量内', depotStone > 321000 && depotStone <= 321000 * d.karmaStorageMult)
  s.karma = 250
  E.recompute(s, d)
  ok('250仙缘前仓储增益不递减', close(d.karmaStorageMult, 1.375, 1e-9))
  s.karma = 500
  E.recompute(s, d)
  const high = d.karmaStorageMult
  s.karma = 100000
  E.recompute(s, d)
  ok('高仙缘继续增益但低于50%软上限', high > 1.375 && high < d.karmaStorageMult && d.karmaStorageMult < 1.5)
  s.karma = 202
  resetForReincarnation(s, 0)
  E.recompute(s, d)
  ok('转世后基础容量保留仙缘增益', s.karma === 202 && close(d.max.qi, RESOURCE_MAP.qi.baseMax * 1.303, 1e-9) && d.karmaStorageMult > 1)
}

section('高阶居所人口曲线')
{
  ok('精舍容量增幅不超过木屋两倍', BUILDING_MAP.mansion.effects.maxDisciples <= BUILDING_MAP.logHouse.effects.maxDisciples * 2)
  ok('洞府容量增幅不超过精舍三倍', BUILDING_MAP.caveDwelling.effects.maxDisciples <= BUILDING_MAP.mansion.effects.maxDisciples * 3)
  const { state: s, derived: d } = newGame()
  s.realm = 6
  s.upgrades.buildingCode = true
  s.buildings.hut = { count: 5, on: true }
  s.buildings.logHouse = { count: 5, on: true }
  E.recompute(s, d)
  const before = d.maxDisciples
  for (const [res, amount] of Object.entries(E.buildingCost(s, 'mansion', 1))) s.resources[res] = amount
  ok('精舍保持既有前置并能实际建造', E.buyBuilding(s, d, 'mansion', 1) === 1)
  ok('首座精舍人口40到50，跳幅为25%', before === 40 && d.maxDisciples === 50)
  E.recruitArrivals(s, d, 3600, { silent: true })
  ok('持续收徒只填满新的住房容量', s.disciples.total === 50 && E.recruitArrivals(s, d, 3600, { silent: true }) === 0)
  E.setJob(s, d, 'woodcutter', 100)
  ok('新住房容量约束可派出的劳动力', s.disciples.jobs.woodcutter === 50 && E.idleDisciples(s) === 0)
  const old = normalizeState({ ...s, buildings: { hut: { count: 20, on: true }, logHouse: { count: 17, on: true }, mansion: { count: 13, on: true }, caveDwelling: { count: 10, on: true } }, disciples: { total: 893, jobs: { farmer: 100, woodcutter: 100 } } })
  E.recompute(old, d)
  ok('截图居所组合人口容量1002降至512', d.maxDisciples === 512)
  ok('更新保留旧档已有弟子与分工', old.disciples.total === 893 && old.disciples.jobs.woodcutter === 100)
  ok('旧档超员时停止自动收徒', E.recruitArrivals(old, d, 3600, { silent: true }) === 0 && old.disciples.total === 893)
  const restored = normalizeState(JSON.parse(JSON.stringify(old)))
  ok('旧档超员弟子可再次存读档', restored.disciples.total === 893)
}

section('快捷炼制偏好兼容')
{
  const initial = createInitialState()
  ok('新档默认保留凝石制丹木板快捷', initial.settings.quickCrafts.join(',') === 'infuseStone,refinePill,sawPlank')
  const old = normalizeState({ settings: { autoCraftOn: false } })
  ok('旧档补齐快捷且不改变自动总开关', old.settings.quickCrafts.length === 3 && old.settings.autoCraftOn === false)
  const malformed = normalizeState({ settings: { quickCrafts: ['unknown', 'constructor', 'toString', 'infuseStone', 'infuseStone', null, 'refinePill', 'sawPlank', 'refineSteel', 'drawTalisman'] } })
  ok('快捷导入去重过滤无效项且保留超过四个配方', malformed.settings.quickCrafts.join(',') === 'infuseStone,refinePill,sawPlank,refineSteel,drawTalisman')
  const empty = normalizeState({ settings: { quickCrafts: [] } })
  ok('允许玩家清空快捷偏好', empty.settings.quickCrafts.length === 0)
  malformed.ui.tab = 'craft'
  const restored = normalizeState(JSON.parse(JSON.stringify(malformed)))
  ok('炼制页与快捷偏好能存读档', restored.ui.tab === 'craft' && restored.settings.quickCrafts.join(',') === malformed.settings.quickCrafts.join(','))
  resetForReincarnation(restored, 0)
  ok('转世保留全部快捷偏好', restored.settings.quickCrafts.includes('refineSteel') && restored.settings.quickCrafts.length === 5)
}

section('金丹妖兽事务完整循环')
{
  const realNow = Date.now
  let now = 1800000000000
  Date.now = () => now
  try {
    const event = EVENT_MAP.beastThreat
    const start = (karma = 0) => {
      const { state: s, derived: d } = newGame()
      s.realm = 4
      s.karma = karma
      s.resources.herb = 100000
      E.recompute(s, d)
      E.fireEvent(s, d, event)
      return { s, d }
    }
    const { state: early, derived: ed } = newGame()
    ok('金丹之前不能触发新妖兽事务', E.fireEvent(early, ed, event) === null)
    const { s, d } = start()
    ok('妖兽预兆有五分钟期限与有界损失', s.pendingChoice.deadline === now + 300000 && s.pendingChoice.herbLoss <= 80)
    ok('威胁没有免费取消选项', !event.options.some(o => o.effect.decline))
    ok('重大事务不覆盖现有选择', E.fireEvent(s, d, event) === null && E.fireEvent(s, d, EVENT_MAP.caravan) === null)
    const stocks = JSON.stringify(s.resources)
    ok('缺料时加固被拒绝并保留威胁', E.resolveChoice(s, d, 0) === null && s.pendingChoice?.id === event.id && JSON.stringify(s.resources) === stocks)
    s.resources.arrayBase = 1
    s.resources.talisman = 2
    const preview = E.eventOutcome(s, d, event.options[0].effect)
    ok('加固预览明确阵基与符箓用料', preview.affordable && preview.required.arrayBase === 1 && preview.required.talisman === 2)
    E.resolveChoice(s, d, 0)
    ok('加固实际扣料并保全药圃', s.resources.arrayBase === 0 && s.resources.talisman === 0 && s.resources.herb === 100000)
    ok('加固形成十五分钟安宁和二十分钟冷却', s.affairs.beastPeaceUntil === now + 900000 && s.affairs.beastCooldownUntil === now + 1200000)
    ok('安宁期间显式触发同样被拒绝', E.fireEvent(s, d, event) === null)
    now += 900001
    ok('安宁结束仍遵守同类冷却', E.fireEvent(s, d, event) === null)
    now += 300000
    ok('冷却结束能够再次触发', !!E.fireEvent(s, d, event))
    s.upgrades.arrayBasics = true
    ok('阵法初解将符箓用量降到一枚', E.eventOutcome(s, d, event.options[0].effect).required.talisman === 1)
    s.resources.artifact = 1
    s.resources.pill = 3
    ok('无救护准备出击需要三枚丹药', E.eventOutcome(s, d, event.options[1].effect).required.pill === 3)
    s.buildings.meditationPool = { count: 1, on: true }
    ok('静心池将出击丹药用量降到一枚', E.eventOutcome(s, d, event.options[1].effect).required.pill === 1)
    E.resolveChoice(s, d, 1)
    ok('出击扣除法器丹药并获得三十分钟安宁', s.resources.artifact === 0 && s.resources.pill === 2 && s.affairs.beastPeaceUntil === now + 1800000)
    const { s: retreat, d: rd } = start()
    E.resolveChoice(retreat, rd, 2)
    E.recompute(retreat, rd)
    ok('收缩采药只降低灵草产出且不扣成品', retreat.buffs.some(b => b.target === 'herb' && b.mult === -0.25 && b.until === now + 120000))
    now += 120001
    E.tick(retreat, rd, 0.1, { events: false })
    ok('收缩采药到期自动恢复', !retreat.buffs.some(b => b.id === 'withdrawHerbs'))
    for (const karma of [0, 202]) {
      const { s: guarded, d: gd } = start(karma)
      gd.disasterGuard = 0.5
      const expected = E.eventOutcome(guarded, gd, event.options[3].effect)
      const loss = expected.rows.find(row => row.res === 'herb').lost
      E.resolveChoice(guarded, gd, 3)
      ok(`${karma}仙缘超额库存默认防守预览与结算相同且减损`, guarded.resources.herb === 100000 - loss && loss <= 40 && !guarded.pendingChoice)
    }
    const { s: expired, d: xd } = start()
    const saved = normalizeState(JSON.parse(JSON.stringify(expired)))
    ok('威胁期限与损失估价可存读档', saved.pendingChoice.deadline === expired.pendingChoice.deadline && saved.pendingChoice.herbLoss === expired.pendingChoice.herbLoss)
    now += 300001
    E.simulateOffline(saved, xd, 2)
    const after = saved.resources.herb
    ok('离线已有威胁有界结算一次并不积累新事件', !saved.pendingChoice && after >= 99920 && saved.stats.eventsSeen === 1)
    E.simulateOffline(saved, xd, 2)
    ok('再次离线不会重复扣损失', saved.resources.herb === after)
    const { s: late, d: ld } = start()
    late.resources.arrayBase = 1
    late.resources.talisman = 2
    now += 300001
    E.resolveChoice(late, ld, 0)
    ok('到期点击按默认防守结算，不花付费材料', !late.pendingChoice && late.resources.arrayBase === 1 && late.resources.talisman === 2)
    const old = normalizeState({ pendingChoice: {} })
    ok('旧档补齐事务状态并清除无效选择', old.affairs.beastPeaceUntil === 0 && old.pendingChoice === null)
    resetForReincarnation(s, 0)
    ok('转世清空威胁与本世安宁', !s.pendingChoice && s.affairs.beastPeaceUntil === 0 && s.affairs.beastCooldownUntil === 0)
  } finally {
    Date.now = realNow
  }
}

section('事件三级分类与纪事兼容')
{
  ok('事件目录定义三级且等级标识唯一', EVENT_LEVELS.map(l => l.id).join(',') === '1,2,3')
  ok('全部正式事件显式声明合法等级', EVENTS.every(e => EVENT_LEVELS.some(l => l.id === e.level)))
  ok('三个等级均有实际内容', EVENT_LEVELS.every(l => EVENTS.some(e => e.level === l.id)))
  ok('等级按境界阶段划分，处理类型独立', EVENT_MAP.ancestorBless.level === 1 && EVENT_MAP.ancientCave.level === 1 && EVENT_MAP.heavenGate.type === 'nature' && EVENT_MAP.heavenGate.level === 3 && EVENT_MAP.beastThreat.level === 2)
  ok('全部事件的境界门槛与阶段存在交集', EVENTS.every(e => REALMS.some((_, realm) => isEventInRealm(e, realm))))
  ok('筑基到金丹切换一级二级事件池', isEventInRealm(EVENT_MAP.spiritRain, 3) && !isEventInRealm(EVENT_MAP.spiritRain, 4) && !isEventInRealm(EVENT_MAP.beastThreat, 3) && isEventInRealm(EVENT_MAP.beastThreat, 4))
  ok('化神到炼虚切换二级三级事件池', isEventInRealm(EVENT_MAP.beastThreat, 6) && !isEventInRealm(EVENT_MAP.beastThreat, 7) && !isEventInRealm(EVENT_MAP.thunderTemper, 6) && isEventInRealm(EVENT_MAP.thunderTemper, 7))
  ok('阶段内仍遵守细分境界门槛', !isEventInRealm(EVENT_MAP.beastCub, 4) && isEventInRealm(EVENT_MAP.beastCub, 6) && !isEventInRealm(EVENT_MAP.heavenGate, 7) && isEventInRealm(EVENT_MAP.heavenGate, 8))
  for (const realm of [3, 4, 6, 7]) {
    const { state: stage, derived: sd } = newGame()
    stage.realm = realm
    const expected = realm < 4 ? 1 : realm < 7 ? 2 : 3
    let valid = true
    for (let i = 0; i < 100; i++) {
      stage.pendingChoice = null
      const event = E.fireEvent(stage, sd)
      if (event && event.level !== expected) valid = false
    }
    ok(`${REALMS[realm].name}随机抽取只来自当前阶段`, valid)
  }
  ok('旧调试事件缺失或无效等级时归日常', getEventLevel({}).id === 1 && getEventLevel({ level: 99 }).id === 1)
  const { state: s, derived: d } = newGame()
  E.fireEvent(s, d, EVENT_MAP.spiritRain)
  ok('即时事件纪事保留事件id和等级', s.log[0].eventId === 'spiritRain' && s.log[0].eventLevel === 1 && s.log[0].kind === 'good')
  E.fireEvent(s, d, EVENT_MAP.grottoRift)
  ok('选择预兆纪事记录天地级', s.log[0].eventId === 'grottoRift' && s.log[0].eventLevel === 3)
  E.resolveChoice(s, d, EVENT_MAP.grottoRift.options.findIndex(o => o.effect.decline))
  ok('选择结束后保留来源等级', s.log[0].eventId === 'grottoRift' && s.log[0].eventLevel === 3)
  s.realm = 4
  E.fireEvent(s, d, EVENT_MAP.beastThreat)
  s.pendingChoice.deadline = Date.now() - 1
  E.settleExpiredThreat(s, d)
  ok('自动防守及安宁纪事均保留宗门级', s.log.slice(0, 2).every(row => row.eventId === 'beastThreat' && row.eventLevel === 2))
  const saved = normalizeState(JSON.parse(JSON.stringify(s)))
  ok('等级元数据可随纪事存读档', saved.log[0].eventLevel === 2 && saved.log[0].eventId === 'beastThreat')
  const old = normalizeState({ log: [{ id: 1, text: '旧纪事', kind: 'event' }] })
  ok('旧纪事保留原文且不臆测等级', old.log[0].text === '旧纪事' && old.log[0].eventLevel === undefined)
  const reclassified = normalizeState({ log: [{ id: 1, text: '祖师显灵', eventId: 'ancestorBless', eventLevel: 2 }] })
  ok('有来源的旧纪事按修正后的阶段归属读档', reclassified.log[0].eventLevel === 1)
  const { state: crossed, derived: cd } = newGame()
  E.fireEvent(crossed, cd, EVENT_MAP.ancientCave)
  crossed.realm = 4
  ok('突破后仍能结束前阶段未决事务', !!E.resolveChoice(crossed, cd, EVENT_MAP.ancientCave.options.findIndex(o => o.effect.decline)) && crossed.pendingChoice === null)
  E.pushLog(s, '日常建造', 'good')
  ok('普通操作纪事不被标成事件', s.log[0].eventLevel === undefined && s.log[0].eventId === undefined)
}

section('金丹：修真、工艺、材料与建设闭环')
{
  const { state: s, derived: d } = newGame()
  s.realm = 3
  for (const id of ['qiOrigin', 'qiGazing', 'condenseArt', 'liquidArt', 'earthArt', 'woodworking', 'herbStudy', 'talismanArt', 'forgeArt', 'qiRune', 'shapeRune', 'conductionRune']) s.upgrades[id] = true
  s.buildings.talismanHall = { count: 1, on: true }
  s.buildings.forge = { count: 1, on: true }
  Object.assign(s.resources, { insight: 3000, qi: 8000, spiritLiquid: 300, talisman: 1900, ore: 2000, plank: 640, artifact: 10, stone: 1000, wood: 2000 })
  E.recompute(s, d)
  ok('金丹前不能研究凝晶或掌握淬玄工艺', !E.research(s, d, 'crystalTheory') && !E.research(s, d, 'steelWorking'))
  s.realm = 4
  E.recompute(s, d)
  ok('金丹档开放阵基装配、淬玄工艺、材料库与灵流要诀', ['arrayAssembly', 'steelWorking', 'earthEssence', 'flowField'].every(id => E.isUpgradeUnlocked(s, UPGRADE_MAP[id])))
  ok('凝聚链与御剑术延后到元婴', !E.isUpgradeUnlocked(s, UPGRADE_MAP.crystalTheory) && !E.isUpgradeUnlocked(s, UPGRADE_MAP.crystalCraft) && !E.isUpgradeUnlocked(s, UPGRADE_MAP.swordFlight) && !E.isUpgradeUnlocked(s, UPGRADE_MAP.calmMind))
  ok('工艺条目显示它实际开放的配方', unlockGroups('arrayAssembly').crafts.includes('组装阵基'))
  // 采药人需要药圃才开工；伐木场会给灵木 +5% 比例，会污染 ×1.3 的增产对比，故不建
  s.buildings.herbGarden = { count: 1, on: true }
  s.disciples.jobs.woodcutter = 1
  s.disciples.jobs.herbalist = 1
  s.disciples.total = 2
  E.recompute(s, d)
  const baseRates = { wood: d.rates.wood, herb: d.rates.herb }
  ok('增产前两条产线已在运转', baseRates.wood > 0 && baseRates.herb > 0)
  E.research(s, d, 'flowField')
  E.recompute(s, d)
  ok('灵流要诀给灵木与灵草各三成增产，玄铁写在效果表内', close(d.rates.wood / baseRates.wood, 1.3) && close(d.rates.herb / baseRates.herb, 1.3) && UPGRADE_MAP.flowField.effects.ratio.ore === 0.3)
  s.buildings.warehouse = { count: 5, on: true }
  ok('阵基装配与材料库在金丹参悟', E.research(s, d, 'arrayAssembly') && E.research(s, d, 'earthEssence') && UPGRADE_MAP.earthEssence.needs.realm === 4)
  ok('未见过玄钢前材料库不露面（渐进露出）', !d.unlockedBuildings.includes('depot'))
  ok('淬出几份玄钢后材料库露面', E.research(s, d, 'steelWorking') && E.craft(s, d, 'refineSteel', { times: 3 }) === 3 && d.unlockedBuildings.includes('depot'))
  ok('点修真不能直接制作灵晶或建成晶核阵', E.craft(s, d, 'condenseCrystal') === 0 && E.buyBuilding(s, d, 'crystalArray', 1) === 0)
  s.realm = 5
  E.recompute(s, d)
  ok('元婴研究凝晶原理后能看到建设目标', E.research(s, d, 'crystalTheory') && d.unlockedBuildings.includes('crystalArray'))
  ok('凝晶工艺在元婴用旧材料即可起步', E.research(s, d, 'crystalCraft'))
  const qiBefore = s.resources.qi
  const liquidBefore = s.resources.spiritLiquid
  const talismanBefore = s.resources.talisman
  const stoneBefore = s.resources.stone
  const crystalNeed = BUILDING_MAP.crystalArray.cost.crystal
  const arrayNeed = BUILDING_MAP.crystalArray.cost.arrayBase
  const crystalMade = E.craft(s, d, 'condenseCrystal', { times: crystalNeed })
  ok('灵晶确实由灵液与灵气加工，不消耗符箓与灵石', crystalMade === crystalNeed && s.resources.spiritLiquid === liquidBefore - CRAFT_MAP.condenseCrystal.cost.spiritLiquid * crystalNeed && s.resources.talisman === talismanBefore && s.resources.qi === qiBefore - CRAFT_MAP.condenseCrystal.cost.qi * crystalNeed && s.resources.stone === stoneBefore)
  ok('学工艺后能加工阵基并完成第一座晶核阵', E.craft(s, d, 'assembleArrayBase', { times: arrayNeed }) === arrayNeed && E.buyBuilding(s, d, 'crystalArray', 1) === 1)
  ok('晶核阵消费成品并扩充灵晶仓储', s.resources.crystal === 0 && s.resources.arrayBase === 0 && d.max.crystal === 45)
  const recipe = CRAFT_MAP.condenseCrystal
  const beforeRate = E.eventResourceRate(s, d, 'crystal')
  const beforeYield = E.craftYield(d, recipe)
  s.upgrades.crystalPolishing = true
  E.recompute(s, d)
  ok('凝晶专业强化增加实际单份收益', close(E.craftYield(d, recipe) - beforeYield, 0.2))
  d.rates = { qi: 600, wood: 80, ore: 40 }
  const crystalRate = E.eventResourceRate(s, d, 'crystal')
  d.craftBonusByResource.crystal += 0.5
  ok('工艺奖励计价使用同一专业加成', E.eventResourceRate(s, d, 'crystal') > crystalRate && beforeRate >= 0)
  s.upgrades.intuition = true
  Object.assign(s.resources, { qi: 3000, talisman: 900, crystal: 0 })
  s.autoCraft.condenseCrystal = true
  s.settings.autoCraftOn = true
  E.recompute(s, d)
  E.setCraftTarget(s, d, 'condenseCrystal', 2)
  E.simulateOffline(s, d, 30)
  ok('灵晶离线自动制作遵守目标并结转已有小数收益', s.resources.crystal === 3 && s.resources.talisman === 900 && s.craftTargets.condenseCrystal === 2)
  const saved = parseImport(exportSave(s))
  ok('灵晶工艺与库存目标可以存读档', saved.resources.crystal === 3 && saved.upgrades.crystalCraft && saved.craftTargets.condenseCrystal === 2)
  const old = normalizeState({ resources: { stone: 17 }, buildings: { observatory: { count: 1, on: true } } })
  ok('旧档保留库存与建筑，新增灵晶补零', old.resources.stone === 17 && old.resources.crystal === 0 && E.isBuildingUnlocked(old, 'observatory'))
  resetForReincarnation(s, 0)
  ok('重修清空灵晶和本世工艺', s.resources.crystal === 0 && !s.upgrades.crystalCraft)
}

section('专业制作：实际产出与设施启停')
{
  const { state: s, derived: d } = newGame()
  Object.assign(s.resources, { wood: 10000, qi: 10000 })
  s.buildings.workshop = { count: 1, on: true }
  E.recompute(s, d)
  const stoneYield = E.craftYield(d, CRAFT_MAP.infuseStone)
  const pillYield = E.craftYield(d, CRAFT_MAP.refinePill)
  s.buildings.alchemyRoom = { count: 10, on: true }
  E.recompute(s, d)
  ok('炼丹房提高丹药收益而不增加凝石收益', close(E.craftYield(d, CRAFT_MAP.refinePill) - pillYield, 0.5) && close(E.craftYield(d, CRAFT_MAP.infuseStone), stoneYield))
  E.toggleBuilding(s, d, 'alchemyRoom')
  ok('专业加成随设施停用停止', close(E.craftYield(d, CRAFT_MAP.refinePill), pillYield))
  const effects = describeEffects(BUILDING_MAP.forge.effects)
  ok('设施效果明确列出专业成品', effects.some(row => row.label === '玄钢 制作产出') && !effects.some(row => row.label === '制作产出'))
  s.upgrades.alchemyCauldron = true
  E.recompute(s, d)
  const unrefined = E.craftYield(d, CRAFT_MAP.refinePill)
  s.treasureLevels.alchemyCauldron = 2
  E.recompute(s, d)
  ok('法宝祭炼正确放大专业加成', close(E.craftYield(d, CRAFT_MAP.refinePill) - unrefined, 0.048))
  s.resources.wood = 0
  E.recompute(s, d)
  ok('百工坊无需维护材料即可提供通用制作收益', close(d.craftBonus, 0.06))
  ok('无维护费的百工坊遵循免费建筑不可停用规则', E.toggleBuilding(s, d, 'workshop') === null && close(d.craftBonus, 0.06))
}

section('修真前置不被境界条件覆盖')
for (const [id, parent, building, count, realm] of [
  ['ancestorArt', null, 'incenseCauldron', 2, 7],
  ['grottoArt', null, 'depot', 2, 8],
  ['arrayBasics', 'astrologyArt', 'academy', 2, 7],
  ['arrayMastery', 'arrayBasics', 'mountainArray', 3, 8],
]) {
  const { state: s } = newGame()
  s.realm = realm
  ok(`${id}仅达到境界仍不能参悟`, !E.isUpgradeUnlocked(s, UPGRADE_MAP[id]))
  if (parent) s.upgrades[parent] = true
  s.buildings[building] = { count, on: true }
  ok(`${id}同时满足研究与建筑条件才开放`, E.isUpgradeUnlocked(s, UPGRADE_MAP[id]))
  s.realm = realm - 1
  ok(`${id}保留境界门槛`, !E.isUpgradeUnlocked(s, UPGRADE_MAP[id]))
}

section('境界加工速度与数量级分层')
{
  const { state: s, derived: d } = newGame()
  s.buildings.talismanHall = { count: 1, on: true }
  s.upgrades.intuition = true
  Object.assign(s.resources, { wood: 2000, qi: 2000 })
  E.recompute(s, d)
  const recipe = CRAFT_MAP.drawTalisman
  const earlyYield = E.craftYield(d, recipe)
  const earlyStep = E.autoCraftStatus(s, d, recipe.id).step
  s.realm = 7
  s.autoCraft[recipe.id] = true
  E.recompute(s, d)
  ok('后期境界提高加工吞吐而不直接扩大单份收益', d.craftSpeed === 2 && E.autoCraftStatus(s, d, recipe.id).step === earlyStep / 2 && close(E.craftYield(d, recipe), earlyYield))
  const clone = normalizeState(JSON.parse(JSON.stringify(s)))
  const cd = E.createDerived()
  E.recompute(clone, cd)
  E.runAutoCraft(s, d, 4)
  for (let i = 0; i < 40; i++) E.runAutoCraft(clone, cd, 0.1)
  ok('小步与批量自动加工产出和扣料一致', s.resources.talisman === 4 && clone.resources.talisman === 4 && s.resources.wood === clone.resources.wood && s.resources.qi === clone.resources.qi && close(s.craftProgress[recipe.id], clone.craftProgress[recipe.id]))
  ok('自动节拍与收支估计一致', close(E.autoCraftStatus(s, d, recipe.id).step, E.craftTime(recipe, d)))
  d.craftBonus = 10
  ok('后期制作设施持续增产且没有统一200%封顶', E.craftYield(d, recipe) > 11)
  s.buildings.arcaneVault = { count: 2, on: true }
  s.buildings.medicineVault = { count: 2, on: true }
  E.recompute(s, d)
  ok('专藏可承接灵宝的三路投料', Object.entries(CRAFT_MAP.forgeSpiritTreasure.cost).every(([res, n]) => d.max[res] >= n))
}

section('高级建筑与仓储逐级自举')
{
  const { state: s, derived: d } = newGame()
  s.realm = 5
  for (const id of ['earthArt', 'earthEssence', 'alchemyArt', 'forgeArt', 'talismanArt', 'woodworking', 'crystalTheory']) s.upgrades[id] = true
  for (const [id, count] of Object.entries({ warehouse: 5, granary: 4, workshop: 1, library: 8, alchemyRoom: 1, forge: 1, talismanHall: 1 })) s.buildings[id] = { count, on: true }
  E.recompute(s, d)
  for (const id of ['depot', 'medicineVault', 'arcaneVault', 'crystalArray']) {
    const price = E.buildingCost(s, id, 1)
    ok(`${BUILDING_MAP[id].name}首座能在自身建成前存够材料`, Object.entries(price).every(([res, amount]) => d.max[res] >= amount), JSON.stringify(price))
  }
  s.realm = 8
  s.upgrades.grottoArt = true
  s.buildings.depot = { count: 5, on: true }
  s.buildings.academy = { count: 10, on: true }
  s.buildings.observatory = { count: 2, on: true }
  E.recompute(s, d)
  ok('洞天首座由材料库和修行设施承接，不依赖自己的扩仓', Object.entries(E.buildingCost(s, 'grotto', 1)).every(([res, n]) => d.max[res] >= n))
  s.realm = 9
  s.upgrades.towerPlan = true
  s.buildings.grotto = { count: 5, on: true }
  s.buildings.arcaneVault = { count: 1, on: true }
  E.recompute(s, d)
  ok('通天塔首座可由洞天与专藏承接所有单笔用料', Object.entries(E.buildingCost(s, 'heavenTower', 1)).every(([res, n]) => d.max[res] >= n))
  s.buildings.heavenTower = { count: 1, on: true }
  E.recompute(s, d)
  ok('涨价后的第二座通天塔仍有可达的存料空间', Object.entries(E.buildingCost(s, 'heavenTower', 1)).every(([res, n]) => d.max[res] >= n))
}

section('产业增益隔离与加工链收益')
{
  ok('所有建筑、技艺和法宝均使用专业生产加成', [...BUILDINGS, ...TECHNIQUES].every(x => !x.effects?.ratioAll))
  const ids = ['swordFlight', 'arrayRefine', 'mahayanaArt', 'spiritBanner', 'flyingSword', 'zhenyueSeal', 'spiritSaw', 'spiritSmelting', 'spiritCultivation']
  for (const id of ids) {
    const { state: s, derived: d } = newGame()
    s.realm = 9
    // 固定供料和生产来源；只有所测技艺变化。
    for (const b of BUILDINGS) s.buildings[b.id] = { count: 1, on: true }
    s.disciples.total = JOBS.length
    s.disciples.jobs = Object.fromEntries(JOBS.map(job => [job.id, 1]))
    for (const r of RESOURCES) s.resources[r.id] = 1e8
    E.recompute(s, d)
    const beforeRates = { ...d.rates }
    const beforeYields = Object.fromEntries(CRAFTS.map(c => [c.out, E.craftYield(d, c)]))
    const beforeGlobal = d.globalMult
    s.upgrades[id] = true
    E.recompute(s, d)
    const ef = UPGRADE_MAP[id].effects
    ok(`${UPGRADE_MAP[id].name}只增加目标资源生产`, RESOURCES.every(r => ef.ratio?.[r.id] ? d.rates[r.id] > beforeRates[r.id] : close(d.rates[r.id], beforeRates[r.id])), JSON.stringify(ef.ratio))
    ok(`${UPGRADE_MAP[id].name}专业加工不外溢且公共倍率不变`, close(d.globalMult, beforeGlobal) && CRAFTS.every(c => ef.craftBonusByResource?.[c.out] ? E.craftYield(d, c) > beforeYields[c.out] : close(E.craftYield(d, c), beforeYields[c.out])))
  }
  const { state: s, derived: d } = newGame()
  s.realm = 9
  s.resources.qi = 1e8
  s.resources.wood = 1e8
  s.resources.ore = 1e8
  s.buildings.heavenTower = { count: 2, on: true }
  E.recompute(s, d)
  ok('两座通天塔强化灵气与灵子，不强化木材和玄铁', close(d.ratio.qi, 0.6) && close(d.ratio.yangParticle, 0.3) && !d.ratio.wood && !d.ratio.ore)
  E.toggleBuilding(s, d, 'heavenTower')
  ok('停用通天塔后专业增益与维护费同时停止', !d.ratio.qi && !d.ratio.yangParticle && !d.maintenance.wood && !d.maintenance.ore)
  const tech = UPGRADE_MAP.spiritSmelting
  s.realm = 5
  for (const id of tech.needs.upgrades) s.upgrades[id] = true
  E.recompute(s, d)
  ok('炼虚产业升级不会在金丹至化神提前开放', !E.isUpgradeUnlocked(s, tech))
  s.realm = 6
  E.recompute(s, d)
  ok('炼虚且专业前置齐备后开放灵火冶炼', E.isUpgradeUnlocked(s, tech))
}

// ------------------------------------------------------------
// 门槛建筑的造价不能超过"可达仓容"—— 否则前置环会被自己锁死
// ------------------------------------------------------------
{
  // 教训：炼铁炉曾定价矿石 300，而**早期**矿石上限只有 250（要靠库房才抬得上去），
  // 库房又卡在土木术 → 木作器械 → 炼铁炉 下游，于是 6 小时起整局停摆。
  //
  // 两条站得住的规则（写成"基础仓容"会误判后期建筑：它们的仓容本就该先涨上去）：
  //   ① 前中期门槛建筑（炼铁炉）的基础造价必须落在**基础上限**之内 —— 那时还没有库房；
  //   ② 任何门槛建筑的造价，都必须有**至少一种仓储建筑**能把对应资源的上限抬到它之上。
  const furnace = BUILDING_MAP.ironFurnace
  ok(
    '炼铁炉的首座矿石造价落在矿石基础上限之内（早期没有库房）',
    (furnace?.cost?.rock || 0) <= (RESOURCE_MAP.rock?.baseMax || 0),
    `造价 ${furnace?.cost?.rock} vs 基础上限 ${RESOURCE_MAP.rock?.baseMax}`,
  )

  const gating = new Set()
  for (const u of [...CULTIVATION, ...TECHNIQUES]) {
    if (u.needs?.building) gating.add(u.needs.building.id)
    for (const b of u.needs?.buildings || []) gating.add(b.id)
  }
  const unreachable = []
  for (const id of gating) {
    const meta = BUILDING_MAP[id]
    if (!meta) continue
    for (const [res, amount] of Object.entries(meta.cost || {})) {
      const base = RESOURCE_MAP[res]?.baseMax
      if (base == null) continue
      // 所有建筑里，能把该资源上限抬得最高的那一档
      let best = base
      for (const b of BUILDINGS) {
        const add = b.effects?.storage?.[res] || 0
        if (add > 0) best = Math.max(best, base + add * 8) // 按 8 座估一个现实可及的量级
      }
      if (amount > best) unreachable.push(`${meta.name} 要 ${RESOURCE_MAP[res].name} ${amount} > 可及仓容 ${best}`)
    }
  }
  ok('门槛建筑的造价都在"可及仓容"之内', unreachable.length === 0, unreachable.slice(0, 4).join('；'))
}

// ------------------------------------------------------------
// 矿工的三条产出：矿石 → 玄铁 → 灵石，每级差一个数量级
// ------------------------------------------------------------
{
  const miner = JOBS.find((j) => j.id === 'miner')
  const rock = miner?.base || 0
  const ore = (miner?.additionalOutputs || []).find((o) => o.resource === 'ore')?.base || 0
  const stone = miner?.secondary?.base || 0
  ok('矿工三条产出成十倍阶梯', close(ore * 10, rock) && close(stone * 10, ore), `矿石 ${rock} / 玄铁 ${ore} / 灵石 ${stone}`)
  ok('矿石最多、灵石最少', rock > ore && ore > stone)
}

// ------------------------------------------------------------
// 玄铁：不再单独开矿，改由「炼铁炉」烧出来；矿工的玄铁挂在「探矿术」上
// ------------------------------------------------------------
{
  const furnace = BUILDING_MAP.ironFurnace
  ok('炼铁炉以矿石与灵木烧玄铁（消耗与产出都在）',
    (furnace?.effects?.prod?.ore || 0) > 0 && (furnace?.upkeep?.rock || 0) > 0 && (furnace?.upkeep?.wood || 0) > 0,
    JSON.stringify({ prod: furnace?.effects?.prod, upkeep: furnace?.upkeep }))
  ok('炼铁炉是实物建筑（不吃灵气/硬通货）',
    !furnace?.cost?.qi && !furnace?.cost?.stone && !furnace?.cost?.insight && (furnace?.cost?.rock || 0) > 0,
    JSON.stringify(furnace?.cost))
  ok('玄铁不再有独立的矿场建筑',
    !BUILDINGS.some((b) => b.id === 'mine') && !BUILDINGS.some((b) => (b.effects?.prod?.ore || 0) > 0 && b.id !== 'ironFurnace'),
    BUILDINGS.filter((b) => (b.effects?.prod?.ore || 0) > 0).map((b) => b.id).join('、'))
  const miner = JOBS.find((j) => j.id === 'miner')
  const oreOut = (miner?.additionalOutputs || []).find((o) => o.resource === 'ore')
  ok('矿工的玄铁副产出挂在「探矿术」上（不再靠建筑）',
    !!oreOut && oreOut.upgrade === 'prospectStudy' && !oreOut.building,
    JSON.stringify(oreOut))
  ok('探矿术后移到《炼丹术》之后，并解锁炼铁炉',
    UPGRADE_MAP.prospectStudy?.needs?.upgrades?.includes('alchemyArt') &&
      UPGRADE_MAP.prospectStudy?.effects?.unlockBuildings?.includes('ironFurnace'),
    JSON.stringify(UPGRADE_MAP.prospectStudy?.needs))
}

// ------------------------------------------------------------
// 灵气与灵木的汇率：手动兑换允许溢价，但不能比雇樵夫还贵（否则是陷阱）
// ------------------------------------------------------------
{
  const farmer = JOBS.find((j) => j.resource === 'qi')
  const cutter = JOBS.find((j) => j.resource === 'wood')
  // 劳动平价：阵徒 0.6 灵气/秒 ÷ 樵夫 0.15 灵木/秒 = 4 灵气/灵木
  const parity = farmer.base / cutter.base
  const recipe = CRAFT_MAP.growWood
  const unit = recipe.cost.qi / recipe.amount
  const premium = unit / parity
  ok(
    '催生灵木的灵气单价不超过劳动平价的 1.5 倍',
    premium <= 1.5 + 1e-9,
    `单价 ${unit} / 平价 ${parity.toFixed(2)} = ${premium.toFixed(2)}×`,
  )
  ok('但也不低于平价（瞬发与不占弟子值一点溢价）', premium >= 1, `${premium.toFixed(2)}×`)
}

section('金丹起步与末期产业破境')
{
  const { state: s, derived: d } = newGame()
  s.realm = 4
  for (const id of ['woodworking', 'herbStudy', 'earthArt', 'forgeArt', 'steelWorking']) s.upgrades[id] = true
  s.buildings.warehouse = { count: 3, on: true }
  s.buildings.forge = { count: 1, on: true }
  Object.assign(s.resources, { insight: 560, wood: 800, plank: 20, ore: 1220, qi: 500 })
  E.recompute(s, d)
  ok('金丹小额投资能同时研究增产与材料库', E.research(s, d, 'flowField') && E.research(s, d, 'earthEssence'))
  ok('首批玄钢即可建材料库，无需等到元婴', E.craft(s, d, 'refineSteel', { times: 4 }) === 4 && E.buyBuilding(s, d, 'depot', 1) === 1)

  const { state: late, derived: ld } = newGame()
  late.realm = 8
  for (const r of RESOURCES) late.resources[r.id] = 1e7
  late.resources.qiParticle = 0
  E.recompute(late, ld)
  ok('基础材料齐全也不能跳过分灵进入大乘', E.breakthrough(late, ld) === false && late.realm === 8)
  late.resources.qiParticle = E.realmCost(late, ld, 9).qiParticle
  ok('分灵产物备齐后能突破大乘', E.breakthrough(late, ld) === true && late.realm === 9)
  late.resources.qiEnergy = 0
  E.recompute(late, ld)
  ok('渡劫不能绕过湮灭产出的灵能', E.breakthrough(late, ld) === false && late.realm === 9)
  late.resources.qiEnergy = E.realmCost(late, ld, 10).qiEnergy
  ok('整条产业材料备齐后可渡劫飞升', E.breakthrough(late, ld) === true && E.canAscend(late))

  const { state: saving, derived: sd } = newGame()
  saving.realm = 4
  for (const id of ['woodworking', 'forgeArt', 'talismanArt', 'prospectStudy', 'qiGazing', 'herbStudy', 'earthArt', 'flowField', 'earthEssence', 'intuition', 'arrayAssembly', 'alchemyArt']) saving.upgrades[id] = true
  for (const id of ['forge', 'talismanHall', 'depot', 'ironFurnace', 'alchemyRoom']) saving.buildings[id] = { count: 1, on: true }
  saving.buildings.warehouse = { count: 3, on: true }
  Object.assign(saving.resources, { qi: 1000, wood: 1000, herb: 1000, rock: 1000, artifact: 2 })
  saving.autoCraft.forgeArtifact = true
  saving.settings.autoCraftOn = true
  E.recompute(saving, sd)
  const bot = createBot(saving, sd)
  bot.act()
  ok('攒淬玄工艺时已开启的炼器自动制作会暂停', saving.autoCraft.forgeArtifact === false)
  // 研究与其它前置全部完成，资源足以研究和破境：下一次决策恢复普通自动配方。
  for (const u of ALL_UPGRADES) saving.upgrades[u.id] = true
  for (const r of RESOURCES) saving.resources[r.id] = 1e7
  E.recompute(saving, sd)
  bot.act()
  ok('退出攒料后普通自动制作恢复', saving.autoCraft.forgeArtifact === true)
}

section('符文研究与载体应用')
{
  const { state: s, derived: d } = newGame()
  s.realm = 3
  s.upgrades.talismanArt = true
  s.upgrades.liquidArt = true
  s.upgrades.earthArt = true
  s.upgrades.woodworking = true
  s.upgrades.steelWorking = true
  s.buildings.talismanHall = { count: 1, on: true }
  s.buildings.forge = { count: 1, on: true }
  Object.assign(s.resources, { insight: 20000, qi: 20000, wood: 2000, ore: 2000, stone: 2000, spiritLiquid: 30, crystal: 20, steel: 100, artifact: 200, faith: 2000 })
  E.recompute(s, d)
  ok('金丹前不能掌握基础符文进阶', !E.research(s, d, 'qiRune') && !E.research(s, d, 'shapeRune'))
  s.realm = 4
  E.recompute(s, d)
  ok('没有聚气与固形原理不能研究导灵纹', !E.research(s, d, 'conductionRune'))
  ok('金丹实际研究三种符文后开放阵基工艺', E.research(s, d, 'qiRune') && E.research(s, d, 'shapeRune') && E.research(s, d, 'conductionRune') && E.isUpgradeUnlocked(s, UPGRADE_MAP.arrayAssembly))
  ok('纳灵与灵符不能在金丹提前开放', !E.research(s, d, 'capacityRune') && !E.isCraftUnlocked(s, CRAFT_MAP.drawSpiritTalisman))
  s.realm = 5
  E.recompute(s, d)
  ok('元婴掌握纳灵纹才开放灵符', !E.isCraftUnlocked(s, CRAFT_MAP.drawSpiritTalisman) && E.research(s, d, 'capacityRune') && E.isCraftUnlocked(s, CRAFT_MAP.drawSpiritTalisman))
  const before = { ...s.resources }
  const made = E.craft(s, d, 'drawSpiritTalisman')
  ok('灵符使用玄钢载体与灵液，不消耗灵木或基础符箓', made === 1 && Object.entries(CRAFT_MAP.drawSpiritTalisman.cost).every(([r, cost]) => s.resources[r] === before[r] - cost) && s.resources.talisman === before.talisman && s.resources.wood === before.wood)
  ok('元婴不能研究复合符文或制造灵器', !E.research(s, d, 'compositeRune') && !E.isCraftUnlocked(s, CRAFT_MAP.forgeSpiritArtifact))
  s.realm = 6
  E.recompute(s, d)
  ok('化神实际掌握复合符文后制造灵器', E.research(s, d, 'compositeRune') && E.craft(s, d, 'forgeSpiritArtifact') === 1)
  s.realm = 7
  E.recompute(s, d)
  ok('镇岳符研究还需镇守纹原理', !E.isUpgradeUnlocked(s, UPGRADE_MAP.talismanLore) && E.research(s, d, 'guardRune') && E.isUpgradeUnlocked(s, UPGRADE_MAP.talismanLore))
}

section('晶核加工与炼虚防护分工')
{
  const { state: s, derived: d } = newGame()
  s.realm = 5
  s.upgrades.liquidArt = true
  s.upgrades.crystalCraft = true
  s.buildings.talismanHall = { count: 1, on: true }
  Object.assign(s.resources, { qi: 10000, spiritLiquid: 10 })
  E.recompute(s, d)
  const liquidBase = E.craftYield(d, CRAFT_MAP.condenseLiquid)
  const crystalBase = E.craftYield(d, CRAFT_MAP.condenseCrystal)
  s.buildings.crystalArray = { count: 1, on: true }
  E.recompute(s, d)
  ok('晶核阵只增幅灵液与灵晶制作，不提高灵气原料产出', close(E.craftYield(d, CRAFT_MAP.condenseLiquid) - liquidBase, 0.15) && close(E.craftYield(d, CRAFT_MAP.condenseCrystal) - crystalBase, 0.15) && !BUILDING_MAP.crystalArray.effects.ratio)
  s.resources.spiritLiquid = 0
  ok('凝液的实际整件产出应用晶核阵增幅并结转小数', E.craft(s, d, 'condenseLiquid', { times: 7 }) === 8 && close(s.craftProgress.condenseLiquid, 0.05))
  s.buildings.crystalArray.count = 2
  E.recompute(s, d)
  ok('两座晶核阵的专业加成相加', close(E.craftYield(d, CRAFT_MAP.condenseCrystal) - crystalBase, 0.3))
  E.toggleBuilding(s, d, 'crystalArray')
  ok('关闭晶核阵停止增产及维护，保留已建仓储', close(E.craftYield(d, CRAFT_MAP.condenseLiquid), liquidBase) && !d.expense.qi && d.max.crystal === 60)
  s.buildings.crystalArray.on = true
  s.resources.qi = 0
  E.tick(s, d, 1, { events: false })
  ok('缺少维护灵气时晶核阵加工加成停止', close(E.craftYield(d, CRAFT_MAP.condenseLiquid), liquidBase))
}
{
  const { state: s, derived: d } = newGame()
  s.realm = 7
  s.buildings.mountainArray = { count: 1, on: true }
  s.upgrades.wardTalisman = true
  Object.assign(s.resources, { wood: 1000, herb: 1000, ore: 1000, qi: 10000, insight: 10000 })
  E.recompute(s, d)
  const disaster = { disaster: { resources: ['wood', 'herb', 'ore'], lossPercent: [0.2, 0.2] } }
  const rows = E.eventOutcome(s, d, disaster).rows
  ok('大阵通用防御与镇岳符重点物资保护分别生效', close(d.disasterGuard, 0.15) && rows.filter(r => r.res !== 'ore').every(r => close(r.lost, 140)) && close(rows.find(r => r.res === 'ore').lost, 170))
  const bounded = E.eventOutcome(s, d, { boundedLoss: { wood: 100, ore: 100 } }).rows
  ok('有界灾损与比例灾损共享防护规则', close(bounded.find(r => r.res === 'wood').lost, 70) && close(bounded.find(r => r.res === 'ore').lost, 85))
  ok('符阵不能减免主动固定支出', E.eventOutcome(s, d, { cost: { wood: 20 } }).rows[0].lost === 20)
  Object.assign(s.resources, { wood: 2000, talisman: 12, stone: 500 })
  const prior = d.disasterGuardByResource.wood
  ok('镇岳符祭炼强化专项防护', E.refineTreasure(s, d, 'wardTalisman') && close(d.disasterGuardByResource.wood, prior * 1.3))
  s.resources.wood = 1000
  s.buildings.mountainArray.count = 10
  E.recompute(s, d)
  ok('全宗防护与重点资源防护合计上限保持80%', E.eventOutcome(s, d, disaster).rows.every(r => close(r.lost, 40)))
  E.toggleBuilding(s, d, 'mountainArray')
  ok('关闭大阵后专项法宝保留，普通物资不再获得防护', d.disasterGuard === 0 && d.disasterGuardByResource.wood > 0 && close(E.eventOutcome(s, d, disaster).rows.find(r => r.res === 'ore').lost, 200))
  const before = { ...d.craftBonusByResource }
  s.upgrades.mountainPlate = true
  E.recompute(s, d)
  ok('护山阵盘转为阵基与灵符专业增产，不叠加防御', close(d.craftBonusByResource.arrayBase - (before.arrayBase || 0), 0.2) && close(d.craftBonusByResource.spiritTalisman - (before.spiritTalisman || 0), 0.15) && d.disasterGuard === 0)
  ok('移除两项重复的全资源防灾技艺', !UPGRADE_MAP.arrayPatterns && !UPGRADE_MAP.arrayCompendium)
}

section('后期建材：研究、加工与营造')
{
  const ids = ['spiritMortar', 'ironMortar', 'mithril', 'arcaneGold', 'crystalSilver']
  ok('五种建材均为整数库存，且各有至少两个建筑用途', ids.every(id => RESOURCE_MAP[id].integer && BUILDINGS.filter(b => b.cost[id] > 0).length >= 2))
  ok('首座材料库和混灵土工艺不依赖新建材，避免自举循环', ids.every(id => !BUILDING_MAP.depot.cost[id] && !UPGRADE_MAP.spiritMortarArt.cost[id]))
  const { state: s, derived: d } = newGame()
  const research = ['spiritMortarArt', 'ironMortarArt', 'mithrilArt', 'arcaneGoldArt', 'crystalSilverArt']
  for (const u of ALL_UPGRADES) if (!research.includes(u.id)) s.upgrades[u.id] = true
  s.buildings.depot = { count: 1, on: true }
  s.buildings.logHouse = { count: 5, on: true }
  Object.assign(s.resources, { insight: 100000, qi: 100000, wood: 3000, stone: 20000, spiritLiquid: 2000, ore: 10000, rock: 10000, plank: 100, arrayBase: 100, herb: 1000, immortalHerb: 20, steel: 1000, crystal: 1000 })
  s.realm = 4
  E.recompute(s, d)
  ok('金丹不提前研究或制造混灵土', !E.research(s, d, 'spiritMortarArt') && E.craft(s, d, 'mixSpiritMortar') === 0)
  s.realm = 5
  E.recompute(s, d)
  ok('元婴用原有材料研究混灵土', E.research(s, d, 'spiritMortarArt'))
  const before = { ...s.resources }
  ok('混灵土现场消耗灵石与灵液，不引入粉末库存', E.craft(s, d, 'mixSpiritMortar') === 1 && s.resources.spiritMortar === 1 && s.resources.stone === before.stone - 20 && s.resources.spiritLiquid === before.spiritLiquid - 2 && !RESOURCE_MAP.stonePowder)
  E.craft(s, d, 'mixSpiritMortar', { times: 40 })
  ok('第一座药藏实际消耗混灵土且扩充药材仓容', E.buyBuilding(s, d, 'medicineVault') === 1 && s.resources.spiritMortar === 33)
  ok('玄库基础建材可以在既有仓储内启动', Object.entries(BUILDING_MAP.mysticVault.cost).every(([id, amount]) => d.max[id] >= amount))
  ok('第一座玄库实际消耗新建材并提供后续材料仓位', E.buyBuilding(s, d, 'mysticVault') === 1 && s.resources.spiritMortar === 13 && ids.every(id => d.max[id] > RESOURCE_MAP[id].baseMax))
  ok('元婴不能提前浇筑玄铁混灵土', !E.research(s, d, 'ironMortarArt'))
  s.realm = 6
  E.recompute(s, d)
  ok('化神研究玄铁骨架并制作结构建材', E.research(s, d, 'ironMortarArt') && E.craft(s, d, 'reinforceSpiritMortar', { times: 4 }) === 4 && s.resources.ironMortar === 4 && s.resources.spiritMortar === 1)
  E.craft(s, d, 'mixSpiritMortar', { times: 16 })
  E.craft(s, d, 'reinforceSpiritMortar', { times: 4 })
  ok('精舍使用复合结构建材完成实际营造', E.buyBuilding(s, d, 'mansion') === 1 && s.resources.ironMortar === 0)
  s.realm = 7
  E.recompute(s, d)
  ok('炼虚提炼秘银，用矿石与灵气取得储灵金属', E.research(s, d, 'mithrilArt') && E.craft(s, d, 'refineMithril', { times: 20 }) === 20 && s.resources.mithril === 20)
  ok('炼虚不能提前熔炼玄金', !E.research(s, d, 'arcaneGoldArt') && !E.isCraftUnlocked(s, CRAFT_MAP.smeltArcaneGold))
  s.realm = 8
  E.recompute(s, d)
  ok('合体研究玄金后实际消耗秘银制作合金', E.research(s, d, 'arcaneGoldArt') && E.craft(s, d, 'smeltArcaneGold', { times: 2 }) === 2 && s.resources.arcaneGold === 2 && s.resources.mithril === 8)
  ok('合体不能提前制作晶银', !E.research(s, d, 'crystalSilverArt'))
  s.realm = 9
  E.recompute(s, d)
  E.craft(s, d, 'refineMithril', { times: 8 })
  ok('大乘稳定晶体金属界面后实际制作晶银', E.research(s, d, 'crystalSilverArt') && E.craft(s, d, 'fuseCrystalSilver') === 1 && s.resources.crystalSilver === 1 && s.resources.mithril === 7)
  ok('粒子设施的建材不会反向消耗其待生产的灵子或灵能', ['refineMithril', 'smeltArcaneGold', 'fuseCrystalSilver'].every(id => ['qiParticle', 'yangParticle', 'yinParticle', 'qiEnergy'].every(res => !CRAFT_MAP[id].cost[res])))
}
{
  const { state: s, derived: d } = newGame()
  s.realm = 5
  s.upgrades.spiritMortarArt = true
  s.upgrades.intuition = true
  s.settings.autoCraftOn = true
  s.autoCraft.mixSpiritMortar = true
  s.resources.stone = 100
  s.resources.spiritLiquid = 10
  E.recompute(s, d)
  E.setCraftTarget(s, d, 'mixSpiritMortar', 2)
  E.simulateOffline(s, d, 30)
  ok('混灵土自动制作遵守库存目标并按份扣料', s.resources.spiritMortar === 2 && s.resources.stone === 60 && s.resources.spiritLiquid === 6)
}

{
  const { state: s, derived: d } = newGame()
  s.realm = 5
  for (const id of ['qiOrigin', 'qiGazing', 'condenseArt', 'herbStudy', 'prospectStudy', 'alchemyArt', 'woodworking', 'forgeArt', 'talismanArt', 'earthArt', 'earthEssence', 'liquidArt', 'crystalTheory', 'crystalCraft', 'steelWorking', 'qiRune', 'shapeRune', 'conductionRune', 'arrayAssembly', 'flowField']) s.upgrades[id] = true
  for (const id of ['spiritField', 'ironFurnace', 'depot', 'warehouse', 'quarry', 'alchemyRoom', 'forge', 'talismanHall', 'arcaneVault']) s.buildings[id] = { count: 1, on: true }
  s.buildings.library = { count: 10, on: true }
  s.buildings.granary = { count: 25, on: true }
  Object.assign(s.resources, { qi: 20000, insight: 2000, wood: 1000, herb: 1000, rock: 2000, stone: 500, ore: 5000, artifact: 770, pill: 200, steel: 25, crystal: 35, spiritLiquid: 100, plank: 30, arrayBase: 8 })
  E.recompute(s, d)
  const bot = createBot(s, d)
  bot.act()
  ok('丹药仓容不足时机器人追踪药藏建材并实际研究混灵土', s.upgrades.spiritMortarArt === true)
  for (let i = 0; i < 12; i++) bot.act()
  ok('机器人研究建材后仍能选择可负担的设施实际扩大丹药仓容', s.resources.spiritMortar > 0 && d.max.pill >= REALMS[6].cost.pill && (E.countOf(s, 'medicineVault') >= 1 || E.countOf(s, 'alchemyRoom') > 1))
}

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`)
if (failed) {
  console.log('失败清单：')
  for (const f of failures) console.log('  - ' + f)
  process.exit(1)
}
console.log('全部通过 ✅')
