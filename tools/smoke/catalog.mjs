import { createInitialState, normalizeState } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { RESOURCES } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { JOBS } from '../../src/data/jobs.js'
import { HUNT_FIELDS } from '../../src/modules/hunting/data.js'
import { CULTIVATION, ALL_UPGRADES, UPGRADE_MAP, CULTIVATION_STAGE_OF } from '../../src/data/upgrades.js'
import { TECHNIQUES } from '../../src/data/techniques.js'
import { CRAFTS } from '../../src/data/crafts.js'
import { ACHIEVEMENTS } from '../../src/data/achievements.js'
import { EVENTS } from '../../src/data/events.js'
import { REALMS } from '../../src/data/realms.js'
import { newGame } from './fixtures.mjs'

export function dataIntegrity({ ok, section }) {
  section('数据完整性')
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
    const unlockApps = ['unlockBuildings', 'autoCraft', 'autoCraftSpeedControl', 'autoCondenseLiquid', 'offlineHours', 'arrivalBonus', 'ascendBonus', 'karmaRatio']
    const pureNumeric = ['storageRatio', 'buildingStorageRatio', 'ratio', 'ratioAll', 'jobRatio', 'storage', 'storageAll', 'habitability', 'habitabilityPerHousing', 'consumeRatio', 'craftBonus', 'craftBonusByResource', 'disasterGuard', 'disasterGuardByResource', 'craftSpeedByRecipe', 'craftCostReduction', 'processingCapacityRatio', 'processingPowerCapacity', 'processingCoolingRatio', 'huntSuccessBonus', 'huntYieldBonus', 'huntDurationReduction', 'tribulationSafety']
    // 两线重组（RESEARCH.md）：解锁/系统效果仍全部由修真页的主线与经营节点承担
    const artUnlocks = CULTIVATION.filter((u) => Object.keys(u.effects || {}).some((k) => unlockApps.includes(k)))
    ok(
      '修真页承担全部解锁/系统效果',
      artUnlocks.length >= 30,
      `${artUnlocks.length}/${CULTIVATION.length}`,
    )
    const skillLeaks = TECHNIQUES.filter((u) => Object.keys(u.effects || {}).some((k) => unlockApps.includes(k)))
    ok('技艺/法宝层不含任何解锁/系统效果', skillLeaks.length === 0, skillLeaks.map((u) => u.id).join(','))
    const skillPure = TECHNIQUES.filter((u) => Object.keys(u.effects || {}).every((k) => pureNumeric.includes(k) || k === 'breakthroughDiscount'))
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
      '每件法宝都有祭炼基数，移除驭兽铃后合计76,750灵机',
      treasures.every((t) => (t.refine?.insight || 0) > 0) &&
        treasures.reduce((s, t) => s + t.refine.insight, 0) === 76750,
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
    // 清单用于避免无意把通用技艺迁入修真页，符文原理见 docs/CRAFT-PROGRESSION.md。
    const MIGRATED_NUMERIC_IDS = [
      'woodworking', 'steelWorking', 'arrayAssembly', 'crystalCraft', 'crystalPolishing',
      'mahayanaArt', 'qiRune', 'craftTempo',
      // 主线数值节点：灵气纯化的纯度增益
      'qiPurify',
      // 修真应用：灵流采集 / 仓储 / 灵能高阶的数值节点
      // 修真应用 · 营造（自技艺页迁入）
      'fieldTillage', 'quarryArt', 'homePlanning', 'waterSanitation', 'gardenDesign',
      // 土木工艺：《营造技艺》暂时只保留专业制作增益（见 MATERIAL-RESEARCH.md §3.1）
      'masonryArt',
    ]
    const numericCult = CULTIVATION.filter((c) => Object.keys(c.effects || {}).some((k) => pureNumeric.includes(k)))
    ok(
      '修真页的数值增益来自明确的工艺、主线与符文节点',
      numericCult.length === MIGRATED_NUMERIC_IDS.length && numericCult.every((c) => MIGRATED_NUMERIC_IDS.includes(c.id)),
      numericCult.map((c) => c.id).join(','),
    )
    ok('数值节点清单全部落在修真页', MIGRATED_NUMERIC_IDS.every((id) => CULTIVATION.some((c) => c.id === id)))
    ok('技艺页不再包含迁移节点', TECHNIQUES.every((t) => !MIGRATED_NUMERIC_IDS.includes(t.id)))
    const applications = ['breakthroughArt', 'waterworkshop', 'spiritSaw', 'spiritCultivation', 'swordFlight', 'spiritSmelting',
      'alchemyFire', 'flowField', 'spiritCanal', 'liquidIrrigation', 'veinInfuse', 'liquidVault', 'runeVault',
      'treasureVault', 'particleRecover', 'energyDrive']
    ok('16项应用增益在技艺页且不占修真分组', applications.every(id =>
      TECHNIQUES.some(u => u.id === id) && !CULTIVATION.some(u => u.id === id) && !CULTIVATION_STAGE_OF[id]))
    for (const id of applications) {
      const legacy = normalizeState({ upgrades: { [id]: true } })
      ok(`迁移后的${UPGRADE_MAP[id].name}保留旧档资格与同一数据条目`,
        legacy.upgrades[id] && E.isUpgradeUnlocked(legacy, UPGRADE_MAP[id]) && ALL_UPGRADES.filter(u => u.id === id).length === 1)
    }
    // 两线重组的依赖与标注修正
    ok(
      '修真页节点不再引用技艺版探矿术（矿脉经），消除反向跨层依赖',
      CULTIVATION.every((c) => !(c.needs?.upgrades || []).includes('prospectArt')) &&
        (CULTIVATION.find((c) => c.id === 'earthArt').needs?.upgrades || []).includes('prospectStudy'),
    )
    ok('候时法由灵机费用推进研究', E.UPGRADE_MAP.hourArt.needs.realm == null && E.UPGRADE_MAP.hourArt.cost.insight === 24000, `realm ${E.UPGRADE_MAP.hourArt.needs.realm}`)
    ok('大乘心经由灵机费用推进研究', E.UPGRADE_MAP.mahayanaArt.needs.realm == null && E.UPGRADE_MAP.mahayanaArt.cost.insight === 160000, `realm ${E.UPGRADE_MAP.mahayanaArt.needs.realm}`)

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
}

export function resourceSourcesAndSinks({ ok, section }) {
  section('资源完整性：每个资源都要有来源、有去向')
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
    // 兽材由猎杀任务结算产生，信符由出征与外交互市消耗 —— 都不在 jobs/crafts 的静态表里，单独补进来。
    for (const f of HUNT_FIELDS) {
      for (const k of Object.keys(f.baseYield || {})) sourced.add(k)
      for (const k of Object.keys(f.advancedYield || {})) sourced.add(k)
    }
    sunk.add('warrant')

    const noSource = RESOURCES.filter((r) => !prestige.has(r.id) && !sourced.has(r.id)).map((r) => r.name)
    const noSink = RESOURCES.filter(
      (r) => !prestige.has(r.id) && !decaying.has(r.id) && !sunk.has(r.id),
    ).map((r) => r.name)
    ok('每个资源都有来源（没有凭空出现的）', noSource.length === 0, noSource.join('、') || '全部有')
    ok('每个资源都有去向（没有死资源）', noSink.length === 0, noSink.join('、') || '全部有')
  }
}
