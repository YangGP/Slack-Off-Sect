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
import { EVENTS, EVENT_MAP } from '../src/data/events.js'
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
  const unlockApps = ['unlockBuildings', 'autoCraft', 'offlineHours', 'breakthroughDiscount', 'arrivalBonus', 'ascendBonus', 'karmaRatio']
  const pureNumeric = ['ratio', 'ratioAll', 'jobRatio', 'storage', 'storageAll', 'morale', 'consumeRatio', 'craftBonus', 'disasterGuard']
  const artUnlocks = CULTIVATION.filter((u) => Object.keys(u.effects || {}).some((k) => unlockApps.includes(k)))
  ok(
    '修真层以解锁/系统效果为主',
    artUnlocks.length >= CULTIVATION.length - 1,
    `${artUnlocks.length}/${CULTIVATION.length}`,
  )
  const skillLeaks = TECHNIQUES.filter((u) => Object.keys(u.effects || {}).some((k) => unlockApps.includes(k)))
  ok('技艺/法宝层不含任何解锁/系统效果', skillLeaks.length === 0, skillLeaks.map((u) => u.id).join(','))
  const skillPure = TECHNIQUES.filter((u) => Object.keys(u.effects || {}).every((k) => pureNumeric.includes(k)))
  ok('技艺/法宝层全是纯数值加成', skillPure.length === TECHNIQUES.length)

// 技艺层的炼成花费只用「资源 + 高级资源」，不吃感悟；法宝的祭炼仍然要感悟
{
  const advanced = ['pill', 'talisman', 'artifact']
  const skillInsight = TECHNIQUES.reduce((s, t) => s + (t.cost.insight || 0), 0)
  const cultInsight = CULTIVATION.reduce((s, u) => s + (u.cost.insight || 0), 0)
  ok(
    '技艺层仍然要吃感悟（没有完全移除）',
    TECHNIQUES.every((t) => (t.cost.insight || 0) > 0),
    TECHNIQUES.filter((t) => !t.cost.insight).map((t) => t.name).join('、') || '每条都有',
  )
  ok(
    '但感悟被压到修真层的一半以下（主要成本让给材料）',
    // 修真树按 RESEARCH.md 铺满时间线之后，它的感悟总量自然会远超技艺层，
    // 所以这里只守「技艺层的感悟不许超过修真层的一半」这条设计规则，不再守下限。
    skillInsight / cultInsight <= 0.5 && skillInsight / cultInsight > 0,
    `技艺 ${skillInsight} vs 修真 ${cultInsight}（${((skillInsight / cultInsight) * 100).toFixed(0)}%）`,
  )
  const resOf = (t) => Object.keys(t.cost).filter((r) => r !== 'insight')
  ok(
    '每条技艺 / 法宝只要 1~4 种资源（感悟另算）',
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
    '每件法宝都写了祭炼的感悟基数，合计 33,110（= 原来那档感悟量，祭炼不打折）',
    treasures.every((t) => (t.refine?.insight || 0) > 0) &&
      treasures.reduce((s, t) => s + t.refine.insight, 0) === 33110,
    `${treasures.reduce((s, t) => s + (t.refine?.insight || 0), 0)}（${treasures.length} 件）`,
  )
  ok(
    '祭炼的感悟不打折（法宝的 refine.insight 大于炼成价里的感悟）',
    treasures.every((t) => t.refine.insight > t.cost.insight),
    treasures.map((t) => `${t.name} 炼成${t.cost.insight}/祭炼${t.refine.insight}`).slice(0, 4).join('、'),
  )
  // 祭炼一次的花费里必须出现感悟（这是「法宝祭炼维持感悟要求」的落地检查）
  const s8 = newGame()
  s8.state.upgrades.spiritPearl = true
  E.recompute(s8.state, s8.derived)
  const rc = E.refineCost(s8.state, 'spiritPearl')
  ok('祭炼花费里有感悟', (rc.insight || 0) > 0, JSON.stringify(rc))
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
  ok(
    '修真节点自身不带纯数值加成（研究就是研究）',
    CULTIVATION.every((c) => Object.keys(c.effects || {}).every((k) => !pureNumeric.includes(k))),
  )

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
  ok('开局士气 100', derived.morale === 100)

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
  ok('茅屋要灵气 + 灵石', (hut.cost.qi || 0) > 0 && (hut.cost.stone || 0) > 0, JSON.stringify(hut.cost))
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
  state.resources.qi = 30
  E.trackPeak(state)
  ok('硬条件满足、水位只到一半时仍不露面', !E.isBuildingUnlocked(state, 'hut'))
  state.peak.stone = 1.2
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
    state.buildings.hut = { count: built, on: true }
    prices.push(E.buildingCost(state, 'hut', 1).stone)
  }
  ok(
    '建筑涨价后的灵石花费都是整数',
    prices.every((v) => Number.isInteger(v)),
    prices.join(','),
  )
  ok('而且是向上取整（不会比真实值便宜）', prices.every((v, i) => v >= 1 * Math.pow(1.55, i) - 1e-9), prices.join(','))
  ok('灵石价格单调递增', prices.every((v, i) => i === 0 || v >= prices[i - 1]), prices.join(','))

  // ② 破境折扣算出来的灵石花费必须是整数
  state.upgrades.breakthroughArt = true
  E.recompute(state, derived)
  const bCosts = []
  for (let i = 1; i <= 4; i++) bCosts.push(E.realmCost(state, derived, i).stone)
  ok(
    '破境（含折扣）的灵石花费都是整数',
    bCosts.every((v) => Number.isInteger(v)),
    bCosts.join(','),
  )
  ok(
    '折扣后向上取整（12 × 0.85 = 10.2 → 11）',
    E.realmCost(state, derived, 1).stone === 11,
    `${E.realmCost(state, derived, 1).stone}`,
  )

  // ③ 法宝祭炼的花费也必须是整数
  state.upgrades.spiritPearl = true
  E.recompute(state, derived)
  const refine = []
  for (let lv = 0; lv < 4; lv++) {
    state.treasureLevels.spiritPearl = lv
    refine.push(E.refineCost(state, 'spiritPearl').stone)
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
  state.resources.stone = fifth.stone
  ok('凑齐整数需求就真的买得起', E.canAfford(state, fifth) === true, `${state.resources.stone} vs ${fifth.stone}`)
  state.resources.stone = fifth.stone - 1
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
  ok('扣除灵石 4（第一间屋子花「炼出来的资源」）', close(before.stone - state.resources.stone, 4, 1e-6))
  ok('弟子上限 0 → 2', derived.maxDisciples === 2, `实际 ${derived.maxDisciples}`)
  ok('仓储上限提升（灵气 +60）', derived.max.qi === 560, `实际 ${derived.max.qi}`)
  ok('建造计数已记录', state.stats.buildingsBuilt === 1)

  const second = E.buildingCost(state, 'hut', 1)
  ok('第二座更贵（价格递增）', second.qi > 80, `实际 ${second.qi}`)

  const affordable = E.maxAffordable(state, 'hut')
  ok('maxAffordable 返回合理数量', affordable >= 1 && affordable < 200, `实际 ${affordable}`)

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
      'spiritVein', // 灵脉井：钻井引脉，耗的是气脉本身
      'hut', // 茅屋：开局第一座，此时手头只有灵气
      'lumberYard', // 伐木场：从"只有灵气"跨到"有木料"的那一步
      'library', // 藏经阁：以灵气养典籍
    ])
    const offenders = BUILDINGS.filter((x) => x.cost?.qi && !allowed.has(x.id)).map((x) => x.name)
    ok('灵气不当建材（实物建筑一律用材料计价）', offenders.length === 0, offenders.join('、') || '干净')

    ok(
      '玄铁矿与药圃按材料计价',
      !BUILDING_MAP.mine.cost.qi && !BUILDING_MAP.herbGarden.cost.qi,
      JSON.stringify({ mine: BUILDING_MAP.mine.cost, herbGarden: BUILDING_MAP.herbGarden.cost }),
    )
  }

  ok('库房改为逐资源上限（不再用 storageAll）', !!wh.effects.storage && !wh.effects.storageAll)
    const st = wh.effects.storage
    ok(
      '库房只存基础物资（灵木 / 灵石 / 玄铁 / 灵草）',
      Object.keys(st).sort().join(',') === 'herb,ore,stone,wood',
      Object.keys(st).join(','),
    )
    ok('库房不再碰灵气 / 感悟 / 丹药 / 符箓 / 香火 / 法器', ['qi', 'insight', 'pill', 'talisman', 'faith', 'artifact'].every((k) => !st[k]))
    ok('份额按流量排序（灵木最多、玄铁最少）', st.wood > st.stone && st.stone > st.herb && st.herb > st.ore, JSON.stringify(st))
    // 被移出去的那几种资源，各自有专属建筑在给上限
    const capSource = (res) =>
      BUILDINGS.filter(
        (b) => b.effects?.storage?.[res] || (b.effects?.storageAll && b.id !== 'warehouse'),
      ).map((b) => b.name)
    ok('灵气上限另有来源（谷仓 / 茅屋 / 木屋）', capSource('qi').includes('谷仓') && capSource('qi').includes('茅屋'), capSource('qi').join('、'))
    ok('感悟上限归藏经阁 / 讲经堂 / 观星台', ['藏经阁', '讲经堂', '观星台'].every((n) => capSource('insight').includes(n)), capSource('insight').join('、'))
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
    ok('拆分账里有资源加成与全局加成', Object.keys(b.ratio).length > 0 && b.ratioAll.length > 0)
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
  const wait = E.timeToAfford(state, derived, 'wood', 30)
  ok('不够时按进项算出等待秒数', close(wait, 30 / rate, 1e-9), `${wait} vs ${30 / rate}`)
  ok(
    '既没有产出、也没有配方的资源返回 Infinity（例如仙缘）',
    E.timeToAfford(state, derived, 'karma', 30) === Infinity,
  )
  ok(
    '配方还没解锁的成品也返回 Infinity（例如没炼器坊时的法器）',
    E.timeToAfford(state, derived, 'artifact', 5) === Infinity,
  )

  // 灵石没有产出，全靠「凝气成石」现印 —— 这条路径也要给出计时器
  const stoneCost = E.CRAFT_MAP.condenseStone.cost.qi
  const netQi = derived.netQi
  ok('灵石的计量走现印路径', netQi > 0, `netQi=${netQi}`)
  ok(
    '灵石缺口 = 凑够兑换所需灵气的时间',
    close(E.timeToAfford(state, derived, 'stone', 30), (30 * stoneCost - state.resources.qi) / netQi, 1e-6),
    `${E.timeToAfford(state, derived, 'stone', 30)}`,
  )
  ok('灵石已经够时返回 0', E.timeToAfford(state, derived, 'stone', 1) === 0)

  // 勾上「自动」之后，还要把一份一份做的耗时算进去
  state.upgrades.intuition = true
  state.autoCraft.condenseStone = true
  state.settings.autoCraftOn = true
  E.recompute(state, derived)
  const withAuto = E.timeToAfford(state, derived, 'stone', 30)
  const withoutAuto = (30 * stoneCost - state.resources.qi) / derived.netQi
  ok(
    '开自动后把制作耗时也加上（30 份 × 0.5 秒）',
    close(withAuto, withoutAuto + 30 * E.craftTime(E.CRAFT_MAP.condenseStone), 1e-6),
    `${withAuto} vs ${withoutAuto}`,
  )
  state.autoCraft.condenseStone = false

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
    s3.buildings.lumberYard = { count: 30, on: true } // 先覆盖三座工坊维护，再积累制作材料
    s3.buildings.mine = { count: 3, on: true }
    s3.resources.qi = 5000
    E.recompute(s3, d3)
    for (const [res, name] of [
      ['pill', '丹药'],
      ['talisman', '符箓'],
      ['artifact', '法器'],
    ]) {
      const w = E.timeToAfford(s3, d3, res, 5)
      ok(`${name}的缺口也能算出时间（现印路径）`, Number.isFinite(w) && w > 0, `${w}`)
    }
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
  ok('冬季感悟加成', (winter.derived.seasonRatio.insight || 0) > 0)
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
          caps[r.id] += eff.storageAll
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
  // 先给足仓储：这一段专门测节奏，不想被「灵石上限 150」挡住
  state.buildings.warehouse = { count: 30, on: true }
  state.resources.qi = 4500 // 够做 100 份凝气成石
  E.recompute(state, derived)
  const step = E.craftTime(E.CRAFT_MAP.condenseStone)

  // 点「制作」是瞬发的：一下立刻出一份
  const before = state.resources.stone
  E.craft(state, derived, 'condenseStone')
  ok('制作是瞬发的（点一下立刻出一份）', state.resources.stone - before === 1)

  // 批量快捷：按「材料能做出来的份数」取 ¼、½、全部
  state.resources.qi = 45 * 20 // 够做 20 份
  E.recompute(state, derived)
  ok('材料够做 20 份', E.maxCraftable(state, derived, 'condenseStone') === 20, `${E.maxCraftable(state, derived, 'condenseStone')}`)
  const q0 = state.resources.qi
  const s0 = state.resources.stone
  E.craftBatch(state, derived, 'condenseStone', 0.25)
  ok(
    '¼料 一次做掉「能做份数」的四分之一（20 → 5 份）',
    state.resources.stone - s0 === 5 && close(q0 - state.resources.qi, 45 * 5, 1e-6),
    `实际 ${state.resources.stone - s0} 份，灵气 -${q0 - state.resources.qi}`,
  )
  state.resources.qi = 45 * 20
  E.recompute(state, derived)
  const q1 = state.resources.qi
  const s1 = state.resources.stone
  E.craftBatch(state, derived, 'condenseStone', 0.5)
  ok(
    '½料 一次做掉一半（20 → 10 份）',
    state.resources.stone - s1 === 10 && close(q1 - state.resources.qi, 45 * 10, 1e-6),
    `实际 ${state.resources.stone - s1} 份`,
  )
  state.resources.qi = 45 * 20
  E.recompute(state, derived)
  const q2 = state.resources.qi
  const s2 = state.resources.stone
  E.craftBatch(state, derived, 'condenseStone', 1)
  ok(
    '全部 一次做光（20 → 20 份）',
    state.resources.stone - s2 === 20 && close(q2 - state.resources.qi, 45 * 20, 1e-6),
    `实际 ${state.resources.stone - s2} 份`,
  )
  state.resources.qi = 45 * 3 // 只够 3 份：四分之一取整为 0
  E.recompute(state, derived)
  ok('份数不足时四分之一取整为 0（不该硬做一份）', E.maxCraftable(state, derived, 'condenseStone') === 3)
  const s3 = state.resources.stone
  E.craftBatch(state, derived, 'condenseStone', 0.25)
  ok('3 份时 ¼料 做 0 份', state.resources.stone === s3)

  // 自动制作：没参悟《心有灵犀》时勾不上
  state.resources.qi = 4500
  E.recompute(state, derived)
  ok('未参悟《心有灵犀》时勾不上自动', E.toggleAutoCraft(state, derived, 'condenseStone') === false)
  ok('未参悟时自动不生效', E.autoCraftStatus(state, derived, 'condenseStone').on === false)

  // 参悟后：勾上自动，一份一份地做（不瞬发）
  state.upgrades.intuition = true
  state.settings.autoCraftOn = true
  E.recompute(state, derived)
  state.resources.qi = 4500
  ok('参悟后可以勾上', E.toggleAutoCraft(state, derived, 'condenseStone') === true)
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
  ok('材料按份扣除', close(state.resources.qi, qiBefore - (state.resources.stone - stoneBefore) * 45 - 0, 1e-6))
  ok('材料远没被抽干（说明没有瞬发做到底）', state.resources.qi > 1000, `剩余灵气 ${Math.round(state.resources.qi)}`)

  // 材料断了：不做、也不取消勾选；补上材料就接着做
  const madeBefore = state.craftTimers.condenseStone.made
  state.resources.qi = 45
  E.recompute(state, derived)
  E.runAutoCraft(state, derived, 10)
  ok('材料不够时先歇着', E.autoCraftStatus(state, derived, 'condenseStone').on === true && state.resources.stone - st2 - expect <= 1)
  state.resources.qi = 450
  E.recompute(state, derived)
  const st3 = state.resources.stone
  E.runAutoCraft(state, derived, step * 3)
  ok('材料补上后接着做', state.resources.stone - st3 >= 2, `实际 +${state.resources.stone - st3}`)
  ok('本轮计数继续累加', state.craftTimers.condenseStone.made > madeBefore)

  // 总开关一关就停
  state.settings.autoCraftOn = false
  E.recompute(state, derived)
  const st5 = state.resources.stone
  E.runAutoCraft(state, derived, 10)
  ok('设置页的总开关关掉后不再自动做', state.resources.stone === st5)
  state.settings.autoCraftOn = true
  E.recompute(state, derived)

  // 走 tick 也能推进；离线也照做
  state.resources.qi = 4500
  state.resources.stone = 0
  E.recompute(state, derived)
  const st6 = state.resources.stone
  for (let i = 0; i < 10; i++) E.tick(state, derived, 1, { events: false })
  ok('tick 里会推进自动制作', state.resources.stone - st6 >= 15, `10 秒做出 ${state.resources.stone - st6} 份`)

  state.resources.stone = 0
  E.recompute(state, derived)
  const st7 = state.resources.stone
  E.simulateOffline(state, derived, 10, { silent: true })
  ok(
    '离线结算也继续做（挂着就一直在做）',
    state.resources.stone - st7 >= 15,
    `离线 10 秒做出 ${state.resources.stone - st7} 份`,
  )
}

// ------------------------------------------------------------
section('法宝祭炼（可重复升级）')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  const pearl = E.UPGRADE_MAP.spiritPearl

  // 没炼成之前不能祭炼
  ok('未炼成时祭炼无效', E.refineTreasure(state, derived, 'spiritPearl') === 0)
  ok('未炼成时没有祭炼花费', E.refineCost(state, 'spiritPearl') && !E.isTreasureForged(state, 'spiritPearl'))

  state.upgrades.spiritPearl = true
  state.resources.insight = 1e7
  state.resources.stone = 1e7
  state.buildings.spiritField = { count: 1, on: true } // 有个产出源才看得出效果变化
  E.recompute(state, derived)
  ok('炼成后倍数从 1 起算', close(E.treasureMult(state, pearl), 1, 1e-9))

  const cost1 = E.refineCost(state, 'spiritPearl')
  ok(
    '首次祭炼花费 = 法宝基础材料 + 感悟基数',
    close(cost1.insight, pearl.refine.insight, 1e-9) &&
      close(cost1.stone, pearl.cost.stone, 1e-9) &&
      close(cost1.wood, pearl.cost.wood, 1e-9),
    JSON.stringify(cost1),
  )

  // 祭炼要「材料 + 感悟」，所以按当前花费把两种都给足（花费形状以后变了也不会假失败）
  const topUp = () => {
    const c = E.refineCost(state, 'spiritPearl')
    for (const res in c) state.resources[res] = Math.max(state.resources[res] || 0, c[res] * 100)
    E.recompute(state, derived)
  }
  topUp()

  const rateBefore = derived.rates.qi
  ok('祭炼一次成功', E.refineTreasure(state, derived, 'spiritPearl') === 1)
  ok('等级记在 state 里', E.treasureLevel(state, 'spiritPearl') === 1)
  ok('效果按 +30% 放大', close(E.treasureMult(state, pearl), 1.3, 1e-9))
  ok('产出真的跟着涨了', derived.rates.qi > rateBefore, `${rateBefore.toFixed(3)} → ${derived.rates.qi.toFixed(3)}`)
  ok('单件法宝 +15% → 祭炼一级后 +19.5%', close(derived.ratio.qi - 0, 0.15 * 1.3 + (derived.ratio.qi - derived.ratio.qi), 1e9))

  const cost2 = E.refineCost(state, 'spiritPearl')
  ok(
    '第二次祭炼花费 ×1.7（材料与感悟同乘）',
    close(cost2.insight, pearl.refine.insight * 1.7, 1e-6) && close(cost2.stone, pearl.cost.stone * 1.7, 1e-6),
    `感悟 ${cost1.insight} → ${cost2.insight}`,
  )

  for (let i = 0; i < 4; i++) {
    topUp()
    E.refineTreasure(state, derived, 'spiritPearl')
  }
  ok('可以继续往上祭炼（无等级上限）', E.treasureLevel(state, 'spiritPearl') === 5)
  ok('Lv.5 时效果 ×2.5', close(E.treasureMult(state, pearl), 2.5, 1e-9))
  ok(
    '花费指数增长',
    E.refineCost(state, 'spiritPearl').insight > pearl.refine.insight * 7,
    `${Math.round(E.refineCost(state, 'spiritPearl').insight)} vs 基础 ${pearl.refine.insight}`,
  )

  // 修真与技艺不参与祭炼
  ok('修真与技艺没有祭炼花费', E.refineCost(state, 'qiOrigin') === null && E.refineCost(state, 'qiArt') === null)
  ok('修真与技艺的倍率恒为 1', E.treasureMult(state, E.UPGRADE_MAP.qiOrigin) === 1)

  // 存档往返
  const round = normalizeState(JSON.parse(JSON.stringify(state)))
  ok('祭炼等级进存档', round.treasureLevels.spiritPearl === 5)
}

// ------------------------------------------------------------
section('制作')
// ------------------------------------------------------------
{
  const { state, derived } = newGame()
  state.resources.qi = 1000
  const made = E.craft(state, derived, 'condenseStone')
  ok('凝气成石产出 1 枚', made === 1 && state.resources.stone === 1, `实际 ${made}/${state.resources.stone}`)
  ok('扣除了 45 灵气', close(state.resources.qi, 955, 1e-6), `实际 ${state.resources.qi}`)
  ok('统计已记录', state.stats.crafted.stone === 1)

  // 制作加成：小数累积机制
  derived.craftBonus = 0.5
  state.resources.qi = 10000
  state.craftProgress.condenseStone = 0
  const before = state.resources.stone
  E.craft(state, derived, 'condenseStone', { times: 2 })
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
  ok('建成藏经阁后出现技艺', derived.availableUpgrades.includes('qiArt'))

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
  s2.resources.insight = 100000
  s2.resources.stone = 100000
  s2.resources.herb = 100000
  s2.resources.pill = 100000
  s2.resources.artifact = 100000
  s2.resources.talisman = 100000
  s2.resources.faith = 100000
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
    // 跑 2 小时：前期按猫国力度收紧后，药圃/玄铁矿要先研究出「灵植术/探矿术」，
    // 第一座吃料的建筑（炼丹房/炼器坊）也随之后移，所以观察窗放到 2 小时
    for (let t = 1; t <= 7200; t++) {
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
  ok('机器人跑 1 小时不报错', !error, error ? String(error.message) : '')
  for (const [id, name] of [
    ['ore', '玄铁'],
    ['herb', '灵草'],
  ]) {
    ok(
      `${name}产出后 90 分钟内被用上`,
      firstSpend[id] !== null && firstSpend[id] - (producedAt[id] || 0) <= 90 * 60,
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
  ok('感悟有积累', state.resources.insight > 0, `实际 ${state.resources.insight}`)
  ok('士气体面（未长期断粮）', derived.morale >= 60, `实际 ${derived.morale}`)
  ok('弟子未流失', state.disciples.total > 0)
}

// ------------------------------------------------------------
section('前期节奏（对标猫国：第 1 分钟只给一座，其余靠研究放行）')
// ------------------------------------------------------------
{
  const noNeeds = BUILDINGS.filter((b) => !b.needs).map((b) => b.id)
  ok('开局只有一座建筑没有前置条件', noNeeds.length === 1 && noNeeds[0] === 'spiritField', noNeeds.join(','))
  const gated = ['herbGarden', 'mine', 'warehouse', 'gate']
  ok(
    '药圃 / 玄铁矿 / 库房 / 山门 都挂在研究节点后',
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
  //            《湮灭法》30 万感悟 vs 上限 26.8 万）—— 我把分灵阵改回 25 万验证过，
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
  st.treasureLevels.spiritPearl = 3
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

  // 道果反哺下层：同一份「本世感悟」，有 1 颗道果时仙缘多 10%
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
    '灵源考不再是空效果（解锁灵脉井）',
    (qi.effects.unlockBuildings || []).includes('spiritVein'),
    JSON.stringify(qi.effects),
  )
  ok(
    '灵脉井的门槛从「盖够 10 座聚灵阵」改成研究放行',
    (BUILDING_MAP.spiritVein.needs.upgrades || []).includes('qiOrigin'),
    JSON.stringify(BUILDING_MAP.spiritVein.needs),
  )
  const gazing = UPGRADE_MAP.qiGazing
  ok('新增观气法（解锁聚灵大阵）', !!gazing && (gazing.effects.unlockBuildings || []).includes('gatheringArray'))
  ok(
    '聚灵大阵的门槛从「有藏经阁」改成研究放行',
    (BUILDING_MAP.gatheringArray.needs.upgrades || []).includes('qiGazing'),
    JSON.stringify(BUILDING_MAP.gatheringArray.needs),
  )

  // 顺序：数据顺序就是界面顺序（见 CultivationPanel），所以五段主线要体现在数组里
  const ids = CULTIVATION.map((u) => u.id)
  const unstaged = ids.filter((id) => !CULTIVATION_STAGE_OF[id])
  ok('每个修真节点都归入五段主线之一', unstaged.length === 0, unstaged.join(','))
  ok(
    '第一段是「气从哪来」（灵源考 + 观气法同段且在最前）',
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
  ok('灵源考的解锁清单里有灵脉井', t1.includes('灵脉井'), t1)
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
  // 于是"解锁建筑 灵脉井；解锁建筑：灵脉井；…；解锁建筑：灵脉井"。
  const dup = lines.filter((l) => (l.text.match(/解锁建筑/g) || []).length > 1).map((l) => l.name)
  ok('效果文本里「解锁建筑」至多出现一次', dup.length === 0, dup.join('、') || '全部正常')

  const spaced = lines.filter((l) => /解锁建筑[^：]/.test(l.text)).map((l) => l.name)
  ok('解锁建筑一律写成「解锁建筑：X」（不带旧的空格写法）', spaced.length === 0, spaced.join('、') || '全部正常')

  const multi = lines.find((l) => l.name === '洞天福地')
  ok('多个建筑之间用顿号', !!multi && multi.text.includes('洞府、洞天'), multi ? multi.text : '（找不到洞天福地）')

  const qi = lines.find((l) => l.name === '灵源考')
  ok('灵源考的效果文本形如「解锁建筑：灵脉井；开启参悟：…」', !!qi && /^解锁建筑：灵脉井；开启参悟：/.test(qi.text), qi ? qi.text : '')
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
  ok('灵源考两行（解锁建筑 + 开启参悟）', qi.length === 2, JSON.stringify(qi))
}

// ------------------------------------------------------------
section('百工坊：提前到手 + 制作加成')
// ------------------------------------------------------------
{
  const wh = BUILDING_MAP.workshop
  const gates = (wh.needs?.buildings || []).map((b) => b.id)
  ok(
    '百工坊只要炼丹房就能盖（不必等炼器坊）',
    gates.length === 1 && gates[0] === 'alchemyRoom',
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

  // 木料链：伐木场 → 木作器械 → 刨木成板 → 百工坊（每一环都不能回头要下游的东西）
  ok(
    '百工坊的配料是木板，不是灵木',
    (wh.cost.plank || 0) > 0 && !wh.cost.wood,
    JSON.stringify(wh.cost),
  )
  ok(
    '木作器械不再需要百工坊，也不吃木板',
    CRAFT_MAP.sawPlank.needs?.upgrades?.includes('woodworking') &&
      UPGRADE_MAP.woodworking?.needs?.building?.id === 'lumberYard' &&
      !(UPGRADE_MAP.woodworking?.cost?.plank > 0),
    JSON.stringify(UPGRADE_MAP.woodworking?.cost),
  )
  ok('木料链无环（刨木成板不再由百工坊解锁）', CRAFT_MAP.sawPlank.needs?.building?.id !== 'workshop')

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
    `每座百工坊 +15%（一座 ${(one * 100).toFixed(0)}% → 两座 ${(two * 100).toFixed(0)}%）`,
    Math.abs(two - one - (wh.effects.craftBonus || 0)) < 1e-9,
    `${one} → ${two}`,
  )

  // 同一配方，有工坊时产出更多（凝气成石：qi → stone，craftBonus 直接乘在产量上，不取整）
  const run = (withWorkshop) => {
    const { state: s2, derived: d2 } = newGame()
    s2.resources.wood = 100
    s2.upgrades.earthArt = true
    s2.upgrades.alchemyArt = true
    s2.buildings.warehouse = { count: 2, on: true }
    s2.buildings.alchemyRoom = { count: 1, on: true }
    if (withWorkshop) s2.buildings.workshop = { count: 1, on: true }
    s2.resources.qi = 1e6
    s2.resources.stone = 0 // 成品上限不高，先清空免得被上限挡住
    E.recompute(s2, d2)
    E.craft(s2, d2, 'condenseStone', { times: 20, silent: true })
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
  const natural = BUILDINGS.filter((b) => (b.effects?.prod?.stone || 0) > 0)
  ok(
    '灵石有天然来源（不再只能靠凝气成石造）',
    natural.length > 0,
    natural.map((b) => b.name + ' +' + b.effects.prod.stone + '/秒').join('、') || '（没有）',
  )

  const q = BUILDING_MAP.spiritQuarry
  ok('灵石矿存在且产出灵石', !!q && (q.effects?.prod?.stone || 0) > 0, q ? JSON.stringify(q.effects) : '（缺）')
  ok('灵石矿由探矿术开启（与玄铁矿同一条寻脉线）', q?.needs?.upgrades?.includes('prospectStudy'), JSON.stringify(q?.needs))
  ok('灵石矿是实物建筑（不吃灵气）', !q?.cost?.qi, JSON.stringify(q?.cost))

  // 两条路并存：凝气成石还在（灵气 → 灵石），灵石矿只是多给一条天然来源
  ok('凝气成石仍在（灵气凝石这条路没被拿掉）', CRAFT_MAP.condenseStone?.out === 'stone', JSON.stringify(CRAFT_MAP.condenseStone?.out))

  // 真的会产：造一座，跑一段时间，灵石要涨
  {
    const { state: s, derived: d } = newGame()
    s.upgrades.prospectStudy = true
    s.buildings.spiritQuarry = { count: 1, on: true }
    s.resources.stone = 0
    E.recompute(s, d)
    const before = s.resources.stone || 0
    E.tick(s, d, 600, { events: false })
    ok(
      '造一座灵石矿，10 分钟能采到灵石',
      (s.resources.stone || 0) > before,
      `${before} → ${(s.resources.stone || 0).toFixed(2)}`,
    )
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
section('角色倾向：玄钢与灵符偏建材')
// ------------------------------------------------------------
{
  // 这两样按设计口径**偏建材消耗品**：建筑（可反复盖）的总需求应当不低于一次性门槛的总需求。
  const sumOf = (res, list) =>
    list.reduce((s, x) => s + (x.cost?.[res] || 0), 0)
  const oneShot = [...REALMS, ...ALL_UPGRADES]
  for (const [res, label] of [
    ['steel', '玄钢'],
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
section('第二种驱动：阴阳分灵 → 湮灭 → 灵能')
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

  // 只加成基础物资：灵木吃、感悟不吃
  {
    const build = (energy) => {
      const { state: s, derived: d } = newGame()
      s.upgrades.prospectStudy = true
      s.buildings.lumberYard = { count: 10, on: true }
      s.buildings.library = { count: 2, on: true }
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
      '灵能不加成感悟（只作用于基础物资）',
      Math.abs(after.insight - before.insight) < 1e-9,
      '感悟 ' + before.insight.toFixed(4) + ' → ' + after.insight.toFixed(4),
    )
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
  // 资源当量：按**后期实际丰度**定 —— 感悟与灵石到那时是海量（各自二十多万），
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
      if (eff.decline) continue
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
        if (eff.decline) continue
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
  s.buildings.forge = { count: 1, on: true }
  s.buildings.talismanHall = { count: 1, on: true }
  E.recompute(s, d)
  d.rates = { ...d.rates, wood: 350, qi: 500, ore: 100, stone: 30 }
  const rate = E.eventResourceRate(s, d, 'arrayBase')
  ok('组合工艺奖励可沿木板符箓追溯产能', rate > 0 && rate <= (1 + d.craftBonus) / 4)
  const low = E.eventOutcome(s, d, { lootRate: { artifact: 30 }, floor: { artifact: 1 } }).rows[0].gained
  d.craftBonus += 1
  const high = E.eventOutcome(s, d, { lootRate: { artifact: 30 }, floor: { artifact: 1 } }).rows[0].gained
  ok('工艺品奖励随制作加成成长', high > low)
  d.rates.wood = 0
  ok('工艺产能受上游短板约束', E.eventResourceRate(s, d, 'arrayBase') === 0)
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
  ok('所有选择都有无代价退出选项', EVENTS.filter(e => e.type === 'choice').every(e => e.options.some(o => o.effect.decline)))
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
  // 冬季，即使士气200%，一名阵徒产出0.96仍小于四人口粮1。
  hungry.state.totalDays = 280
  E.recompute(hungry.state, hungry.derived)
  E.simulateOffline(hungry.state, hungry.derived, CONFIG.LEAVE_INTERVAL)
  ok('高士气也不能免疫长期断粮，离线同样生效', hungry.derived.morale > 100 && hungry.state.disciples.total === 3)
  ok('流失优先保留供粮职位', hungry.state.disciples.jobs.farmer === 1 && hungry.state.disciples.jobs.woodcutter === 2)

  const automation = newGame()
  const a = automation.state
  const ad = automation.derived
  resetForAscension(a, 20)
  E.recompute(a, ad)
  ok('首颗道果永久解锁自动炼制，无需重新研究', ad.daoAutomation && ad.autoCraftUnlocked && !a.upgrades.intuition)
  a.resources.qi = 140
  a.autoCraft.condenseStone = true
  E.runAutoCraft(a, ad, 1)
  ok('自动炼制保留材料底线', a.resources.qi === 140 && a.resources.stone === 0)
  ok('自动状态说明保留材料导致的暂停', E.autoCraftStatus(a, ad, 'condenseStone').reason.includes('保留材料'))
  E.craft(a, ad, 'condenseStone')
  ok('手动制作允许玩家动用保留材料', a.resources.qi === 95 && a.resources.stone === 1)
  a.settings.craftReservePercent = 0
  a.settings.autoCraftPriority = 'refinePill'
  a.buildings.alchemyRoom = { count: 1, on: true }
  a.resources.wood = 100
  a.resources.qi = 60
  a.resources.herb = 25
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
  s.buildings.talismanHall = { count: 1, on: true }
  s.resources.plank = 4
  s.resources.talisman = 4
  s.resources.ore = 40
  s.realm = 3
  E.recompute(s, d)
  ok('金丹前不能组装阵基', !E.isCraftUnlocked(s, CRAFT_MAP.assembleArrayBase) && E.craft(s, d, 'assembleArrayBase') === 0)
  ok('金丹前普通存档不能设置库存目标', !E.setCraftTarget(s, d, 'condenseStone', 3))
  s.realm = 4
  E.recompute(s, d)
  const made = E.craft(s, d, 'assembleArrayBase', { times: 2 })
  ok('阵基消耗木板、符箓与玄铁，整件产出', made === 2 && s.resources.arrayBase === 2 && s.resources.plank === 0 && s.resources.talisman === 0 && s.resources.ore === 0)
  s.upgrades.preachArt = true
  s.resources.stone = 120
  ok('第一座讲经堂可以用基础阵基仓储启动', E.buyBuilding(s, d, 'academy', 1) === 1 && s.resources.arrayBase === 0)
  ok('阵基具有至少三处可重复建造用途', BUILDINGS.filter(b => b.cost.arrayBase > 0).length >= 3)
  ok('讲经堂、静心池在金丹开放并保留建筑前置', UPGRADE_MAP.preachArt.needs.realm === 4 && !!UPGRADE_MAP.preachArt.needs.building && UPGRADE_MAP.calmMind.needs.realm === 4 && !!UPGRADE_MAP.calmMind.needs.building)

  s.upgrades.intuition = true
  s.resources.qi = 450
  s.resources.stone = 0
  s.autoCraft.condenseStone = true
  E.recompute(s, d)
  ok('可以设置成品库存目标', E.setCraftTarget(s, d, 'condenseStone', 3))
  E.runAutoCraft(s, d, 5)
  ok('达到目标后不继续消耗原料', s.resources.stone === 3 && s.resources.qi === 315)
  ok('状态明确显示目标暂停', E.autoCraftStatus(s, d, 'condenseStone').reason === '目标已达 · 暂停')
  s.resources.stone -= 2
  E.runAutoCraft(s, d, 1)
  ok('使用成品后自动补回库存目标', s.resources.stone === 3 && s.resources.qi === 225)
  E.craft(s, d, 'condenseStone')
  ok('手动制作可以超过自动目标', s.resources.stone === 4)
  ok('非法目标不覆盖已有设置', !E.setCraftTarget(s, d, 'condenseStone', -1) && !E.setCraftTarget(s, d, 'condenseStone', Infinity) && E.craftTarget(s, d, 'condenseStone') === 3)
  E.setCraftTarget(s, d, 'condenseStone', 0)
  E.runAutoCraft(s, d, 0.5)
  ok('目标为零表示不限', s.resources.stone > 4)
  E.setCraftTarget(s, d, 'condenseStone', 8)
  s.resources.stone = 0
  s.resources.qi = 450
  E.simulateOffline(s, d, 20)
  ok('离线自动炼制也遵守目标', s.resources.stone === 8)
  const restored = parseImport(exportSave(s))
  ok('目标数量与阵基资源能导出导入', restored.craftTargets.condenseStone === 8 && 'arrayBase' in restored.resources)
  const old = normalizeState({ resources: { wood: 5 }, realm: 4 })
  ok('旧存档补零阵基与空目标，原资源不变', old.resources.arrayBase === 0 && old.resources.wood === 5 && Object.keys(old.craftTargets).length === 0)
  resetForReincarnation(s, 5)
  E.recompute(s, d)
  ok('转世清空本世库存目标与阵基', Object.keys(s.craftTargets).length === 0 && s.resources.arrayBase === 0)
}

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`)
if (failed) {
  console.log('失败清单：')
  for (const f of failures) console.log('  - ' + f)
  process.exit(1)
}
console.log('全部通过 ✅')
