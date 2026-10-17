import { createBot } from '../player-bot.mjs'
import * as E from '../engine-fixture.mjs'
import { RESOURCES } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { CULTIVATION, ALL_UPGRADES, UPGRADE_MAP } from '../../src/data/upgrades.js'
import { FAITH_UPGRADES } from '../../src/data/faith.js'
import { TECHNIQUES } from '../../src/data/techniques.js'
import { ACHIEVEMENT_REWARD } from '../../src/data/achievements.js'
import { SEASONS, CALENDAR } from '../../src/data/calendar.js'
import { newGame, newGameRunning } from './fixtures.mjs'

export function playerBot({ ok, section }) {
  section('自动目标解锁前的手动备料')
  {
    const { state: s, derived: d } = newGame()
    s.realm = 2
    s.upgrades.alchemyArt = true
    s.buildings.hut = { count: 1, on: true }
    s.buildings.alchemyRoom = { count: 1, on: true }
    Object.assign(s.resources, { qi: E.money(20000), herb: E.money(20000) })
    E.recompute(s, d)
    const bot = createBot(s, d, { realmCost: () => ({ pill: 26 }), breakthrough: () => false })
    for (let i = 0; i < 5; i++) bot.act()
    ok('手动炼丹按近期需求停产，不持续囤到满仓', E.moneyIsPositive(s.resources.pill) && E.moneyGte(35, s.resources.pill))
    ok('手动备料策略不提前开放自动目标能力', !d.craftTargetsUnlocked && !s.upgrades.intuition && Object.keys(s.craftTargets).length === 0)
  }
  section('突破优先的多层扩仓')
  {
    const { state: s, derived: d } = newGame()
    s.realm = 4
    for (const [id, count] of Object.entries({ spiritField: 3, hut: 10, lumberYard: 2, granary: 10, quarry: 2, library: 3, logHouse: 8, herbGarden: 3, ironFurnace: 1, alchemyRoom: 2, scriptureArchive: 24, warehouse: 2, forge: 1, talismanHall: 1, gate: 1 })) s.buildings[id] = { count, on: true }
    for (const id of ['qiOrigin', 'homePlanning', 'herbStudy', 'alchemyArt', 'prospectStudy', 'oralTeaching', 'quarryArt', 'woodworking', 'earthArt', 'qiGazing', 'forgeArt', 'talismanArt', 'incenseVow', 'qiMeasure', 'qiLiquid', 'storeFrameArt', 'qiRune', 'shapeRune', 'conductionRune']) s.upgrades[id] = true
    E.recompute(s, d)
    for (const res of RESOURCES) s.resources[res.id] = d.max[res.id]
    const bot = createBot(s, d, { onlyBreakthrough: true, realmCost: () => ({ arrayBase: 4 }), breakthrough: () => false })
    const archiveCost = E.buildingCost(s, 'scriptureArchive', 1)
    ok('回归夹具确实受灵机及典籍库建材仓容限制', E.moneyLt(d.max.insight, UPGRADE_MAP.arrayAssembly.cost.insight) && E.moneyGt(archiveCost.rock, d.max.rock))
    ok('扩仓计划保留超出当前建材仓容的典籍库目标', bot.prerequisites().buildings.get('scriptureArchive') === 25)
    bot.act()
    ok('先扩原料仓解决科研扩仓的建材上限', E.countOf(s, 'warehouse') > 2)
    s.upgrades.arrayAssembly = true
    E.recompute(s, d)
    const afterAssembly = createBot(s, d, { onlyBreakthrough: true, realmCost: () => ({ insight: 12000 }), breakthrough: () => false })
    ok('能支付讲经前置后转向讲经堂，不永久堆典籍库', afterAssembly.prerequisites().upgrades.has('preachArt') && afterAssembly.prerequisites().buildings.has('academy'))
    s.realm = 7
    s.upgrades.earthEssence = true
    s.buildings.depot = { count: 1, on: true }
    E.recompute(s, d)
    for (const res of RESOURCES) s.resources[res.id] = d.max[res.id]
    E.recompute(s, d)
    ok('必需仓储即使不在旧采购表中也能实际建造', bot.buildStep(0, null, [], new Map([['grandStore', 1]])) && E.countOf(s, 'grandStore') === 1)
    s.realm = 6
    for (const id of ['intuition', 'preachArt', 'crystalTheory', 'compositeRune', 'astrologyArt']) s.upgrades[id] = true
    E.recompute(s, d)
    createBot(s, d, { onlyBreakthrough: true, realmCost: () => ({ arrayDiagram: 3 }), breakthrough: () => false }).act()
    ok('知识加工按近期需求设目标而非无上限抢占灵机', E.moneyEq(s.craftTargets.drawArrayDiagram, 3) && E.moneyIsPositive(s.craftTargets.recordDaoNote) && E.moneyIsPositive(s.craftTargets.compileDaoTreatise))
  }
  section('模拟玩家（机器人）短跑')
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
          const now = E.money(state.resources[r])
          if (!producedAt[r] && E.moneyIsPositive(derived.rates[r])) producedAt[r] = t
          if (!firstSpend[r] && E.moneyLt(now, E.money(prevRes[r]).minus(1e-9))) firstSpend[r] = t
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
        const rate = E.money(s5.derived.rates.wood)
        if (E.moneyGt(rate, 0.02) && E.moneyGte(E.money(s5.state.resources.wood), E.money(s5.derived.max.wood).minus(1e-6))) pinned++
        samples++
      }
      ok(
        '前 30 分钟灵木贴顶时间 < 5%',
        pinned / samples < 0.05,
        `${((pinned / samples) * 100).toFixed(1)}%（上限长到 ${Math.round(E.moneyToNumber(s5.derived.max.wood))}，产量 ${E.moneyToNumber(s5.derived.rates.wood).toFixed(2)}/秒）`,
      )
    }

    ok(
      '可参悟列表里的 id 都能查到条目',
      derived.availableUpgrades.every((id) => !!E.UPGRADE_MAP[id]),
      derived.availableUpgrades.join(','),
    )
    ok(
      '参悟表覆盖两层（修真 + 技艺·法宝）',
      Object.keys(state.upgrades).every((id) => !!E.UPGRADE_MAP[id]) && ALL_UPGRADES.length === CULTIVATION.length + TECHNIQUES.length + FAITH_UPGRADES.length,
    )
  }
}

export function longRunningStability({ ok, section }) {
  section('长时挂机稳定性')
  {
    const { state, derived } = newGame()
    // 给一套中等规模的家底，再模拟 2 小时
    state.resources.qi = E.money(5000)
    state.resources.wood = E.money(5000)
    state.resources.stone = E.money(5000)
    state.resources.insight = E.money(5000)
    state.resources.herb = E.money(5000)
    state.resources.ore = E.money(5000)
    state.resources.pill = E.money(500)
    state.resources.artifact = E.money(500)
    E.buyBuilding(state, derived, 'spiritField', 5) // 先有聚灵阵，茅屋与藏经阁才立得住
    E.buyBuilding(state, derived, 'hut', 5)
    E.buyBuilding(state, derived, 'library', 2)
    E.recruitArrivals(state, derived, 200) // 等弟子自己来
    E.setJob(state, derived, 'farmer', 6)
    E.setJob(state, derived, 'scholar', 4)

    // 这份稳定性夹具从有效容量内开始；超额旧档另有专门回归。
    for (const r of RESOURCES) state.resources[r.id] = E.moneyMin(state.resources[r.id] ?? E.ZERO, derived.max[r.id])
    let nan = false
    for (let i = 0; i < 7200; i++) {
      E.tick(state, derived, 1, { events: false })
      if (i % 600 === 0) E.recompute(state, derived)
      for (const r of RESOURCES) {
        // 金额域的「不是数字」= 非有限 Decimal（NaN/±Infinity 都不该出现在库存里）。
        if (!E.moneyFinite(state.resources[r.id])) nan = true
      }
    }
    ok('2 小时模拟没有 NaN', !nan)
    ok('灵气未越界', E.moneyGte(state.resources.qi, 0) && E.moneyGte(E.money(derived.max.qi).plus(1e-6), state.resources.qi))
    ok('灵机有积累', E.moneyIsPositive(state.resources.insight), `实际 ${state.resources.insight}`)
    ok('稳定供粮未产生宜居度断供惩罚', state.habitabilityPenalty === 0, `实际 ${state.habitabilityPenalty}`)
    ok('弟子未流失', state.disciples.total > 0)
  }
}
