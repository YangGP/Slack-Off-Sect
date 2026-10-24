import { createBot } from '../player-bot.mjs'
import * as E from '../engine-fixture.mjs'
import { RESOURCES, UNCAPPED_CRAFTED_RESOURCES } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { CULTIVATION, ALL_UPGRADES, UPGRADE_MAP } from '../../src/data/upgrades.js'
import { FAITH_UPGRADES } from '../../src/data/faith.js'
import { TECHNIQUES } from '../../src/data/techniques.js'
import { ACHIEVEMENT_REWARD } from '../../src/data/achievements.js'
import { SEASONS, CALENDAR } from '../../src/data/calendar.js'
import { newGame, newGameRunning } from './fixtures.mjs'
import { createInitialState } from '../../src/game/state.js'
import { setGameContext } from '../../src/game/context.js'
import { createSeededRandom } from '../lib/measurement-state.mjs'

export function botEarlyStorage({ ok, section }) {
  section('固定开局的灵木满仓与供气投资')
  const epoch = Date.UTC(2026, 9, 18), state = createInitialState(epoch), derived = E.createDerived()
  // 首名来客带伐木专长：更早填满200木仓，能稳定暴露“预留藏经阁却挡住首座伐木场”的冲突。
  state.disciples.talentSeed = 4032
  let now = epoch, pinned = 0, lumberAt = null, libraryAt = null
  setGameContext(state, { now: () => now, random: createSeededRandom(12345) })
  E.recompute(state, derived)
  const bot = createBot(state, derived)
  for (let t = 1; t <= 1800; t++) {
    now = epoch + t * 1000
    E.tick(state, derived, 1, { events: false })
    if (t % 5 === 0) bot.act()
    if (t % 60 === 0) E.recompute(state, derived)
    if (E.countOf(state, 'lumberYard')) lumberAt ??= t
    if (E.countOf(state, 'library')) libraryAt ??= t
    if (E.moneyGt(derived.rates.wood, 0.02) && E.moneyGte(state.resources.wood, derived.max.wood.minus('0.000001'))) pinned++
  }
  ok('谷仓也囤灵木（早期给上限留出余量）', (BUILDING_MAP.granary.effects.storage?.wood || 0) > 0)
  ok('前30分钟先建伐木场再建藏经阁并实际产出灵机', lumberAt !== null && libraryAt > lumberAt && E.moneyGt(state.resources.insight, 0))
  ok('前 30 分钟灵木贴顶时间 < 5%', pinned / 1800 < 0.05, `${(pinned / 1800 * 100).toFixed(1)}%（${pinned}/1800秒）`)

  const { state: s, derived: d } = newGame()
  s.buildings = { hut: { count: 1, on: true }, spiritField: { count: 1, on: true } }
  s.resources.qi = E.money(50); s.resources.wood = E.money(200)
  E.recompute(s, d)
  const investment = createBot(s, d)
  investment.buildStep(0, { qi: 60, wood: 200 })
  ok('短暂等待不应为了扩产拖延可支付目标', E.countOf(s, 'spiritField') === 1)
  investment.buildStep(0, { qi: 200, wood: 200 })
  ok('能在剩余等待内回本时实际扣费扩建供气', E.countOf(s, 'spiritField') === 2 && E.moneyLt(s.resources.qi, 50))
}

export function botDiplomacy({ ok, section }) {
  section('参照机器人跨境界互市备料与信符供给')
  const { state: s, derived: d } = newGame()
  s.realm = 4
  s.disciples.total = 10
  s.disciples.jobs = { farmer: 2, woodcutter: 4, scholar: 2, incenseKeeper: 2 }
  for (const id of ['hut', 'gate', 'library', 'lumberYard']) s.buildings[id] = { count: 10, on: true }
  for (const id of ['neighborContacts', 'quarryArt', 'wildHunting', 'incenseVow', 'preachArt', 'talentAssignment']) s.upgrades[id] = true
  Object.assign(s.resources, { qi: E.money(100000), wood: E.money(10000), stone: E.money(5000),
    cutStone: E.money(500), insight: E.money(5000), faith: E.money(5000), warrant: E.ZERO })
  E.recompute(s, d)
  for (const member of s.disciples.members) member.talents = [{ id: 'job_woodcutter_huang', level: 1 }]
  const bot = createBot(s, d, { onlyBreakthrough: true, realmCost: () => ({ crystal: 10 }),
    breakthrough: () => false, allowUpgrade: () => false })
  const plan = bot.prerequisites()
  ok('金丹灵晶前置走执符堂，不追索尚不可用的秘银产业', plan.buildings.has('huntingCamp') && !plan.upgrades.has('mithrilArt'))
  ok('回归夹具起初全员已分工', E.idleDisciples(s) === 0)
  bot.act()
  ok('为互市实际建堂并从已有岗位调出执符使', E.countOf(s, 'huntingCamp') === 1 && s.disciples.jobs.huntPlanner === 1)
  ok('没有信符时不免费换料', s.diplomacy.statistics.trades === 0 && E.moneyIsZero(s.resources.crystal))
  E.tick(s, d, 300, { events: false })
  ok('手动维持互市岗位时暂停天赋改岗，真实推进后不丢执符使', s.settings.autoTalentJobs === false && s.disciples.jobs.huntPlanner === 1)
  ok('执符使通过真实生产补充信符', E.moneyGte(s.resources.warrant, 50))
  bot.act()
  ok('金丹未解锁凝晶也能实际支付换得灵晶', s.diplomacy.statistics.trades === 1 && E.moneyGte(s.resources.crystal, 10) && !E.isCraftUnlocked(s, E.CRAFT_MAP.condenseCrystal))
  bot.act()
  ok('满足近期需求后停止兑换', s.diplomacy.statistics.trades === 1)

  s.realm = 5
  s.resources.crystal = E.ZERO
  s.resources.warrant = E.money(50)
  s.resources.faith = E.ZERO
  E.recompute(s, d)
  const localPlan = bot.prerequisites()
  ok('元婴规划凝晶工艺与符箓堂，不追索炼虚秘银提炼', localPlan.upgrades.has('crystalCraft') &&
    localPlan.buildings.has('talismanHall') && !localPlan.upgrades.has('mithrilArt'))
  bot.act()
  ok('缺少真实换料费时不扣信符、不发灵晶', s.diplomacy.statistics.trades === 1 && E.moneyEq(s.resources.warrant, 50) && E.moneyIsZero(s.resources.crystal))
  s.resources.faith = E.money(5000)
  s.resources.ore = E.money(1000)
  s.resources.stone = E.money(1000)
  E.recompute(s, d)
  bot.act()
  ok('元婴以少量秘银互市启动本地凝晶，不再批量进口灵晶', s.diplomacy.statistics.trades === 2 && E.moneyGte(s.resources.mithril, 3) && E.moneyIsZero(s.resources.crystal))
  s.upgrades.crystalCraft = true
  s.buildings.talismanHall = { count: 1, on: true }
  s.resources.qi = E.money(10000)
  s.resources.spiritLiquid = E.money(30)
  E.recompute(s, d)
  const catalyst = s.resources.mithril
  const made = E.craft(s, d, 'condenseCrystal', { times: 10 })
  ok('元婴真实扣除互市所得催化剂、灵液和灵气制得灵晶', E.moneyGt(made, 0) &&
    E.moneyEq(s.resources.mithril, catalyst.minus('0.1')) && E.moneyIsZero(s.resources.spiritLiquid) && E.moneyEq(s.resources.qi, 7000))
  s.resources.warrant = E.money(50)
  bot.act()
  ok('本地凝晶满足近期需求后停止进口，不多囤催化剂', s.diplomacy.statistics.trades === 2 && E.moneyEq(s.resources.warrant, 50))
  s.realm = 6
  s.resources.crystal = s.resources.mithril = E.ZERO
  s.resources.warrant = E.money(50)
  s.resources.ore = E.money(1000)
  s.resources.stone = E.money(1000)
  E.recompute(s, d)
  bot.act()
  ok('化神转为兑换少量秘银启动本地凝晶', s.diplomacy.statistics.trades === 3 && E.moneyGte(s.resources.mithril, 3) && E.moneyIsZero(s.resources.crystal))
  s.realm = 7
  s.resources.mithril = E.ZERO
  s.resources.warrant = E.money(50)
  E.recompute(s, d)
  bot.act()
  ok('炼虚已有本地提炼路线时不再依赖互市', s.diplomacy.statistics.trades === 3)
}

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
    // 口传心授把典籍库仓容 ×1.4（每座 80 → 112）：21 座 = 200 + 21×112 = 2552，
    // 仍低于阵基装配的 2600 灵机，多建一座（2664）即承接 —— 保持「研究超仓容先扩仓」的回归场景。
    for (const [id, count] of Object.entries({ spiritField: 3, hut: 10, lumberYard: 2, granary: 10, quarry: 2, library: 3, logHouse: 8, herbGarden: 3, ironFurnace: 1, alchemyRoom: 2, scriptureArchive: 21, warehouse: 2, forge: 1, talismanHall: 1, gate: 1 })) s.buildings[id] = { count, on: true }
    for (const id of ['qiOrigin', 'homePlanning', 'herbStudy', 'alchemyArt', 'prospectStudy', 'oralTeaching', 'quarryArt', 'woodworking', 'earthArt', 'qiGazing', 'forgeArt', 'talismanArt', 'incenseVow', 'qiMeasure', 'qiLiquid', 'storeFrameArt', 'qiRune', 'shapeRune', 'conductionRune']) s.upgrades[id] = true
    E.recompute(s, d)
    for (const res of RESOURCES) s.resources[res.id] = d.max[res.id].isFinite() ? d.max[res.id] : E.money(UNCAPPED_CRAFTED_RESOURCES.has(res.id) ? 10000 : 0)
    const bot = createBot(s, d, { onlyBreakthrough: true, realmCost: () => ({ arrayBase: 4 }), breakthrough: () => false })
    const archiveCost = E.buildingCost(s, 'scriptureArchive', 1)
    ok('回归夹具仍受灵机仓容与典籍库涨价限制', E.moneyLt(d.max.insight, UPGRADE_MAP.arrayAssembly.cost.insight) && archiveCost.cutStone > 20)
    ok('扩仓计划保留超出当前建材仓容的典籍库目标', bot.prerequisites().buildings.get('scriptureArchive') === 22)
    bot.act()
    ok('先扩灵机仓承接科研扩仓', E.countOf(s, 'scriptureArchive') > 21)
    s.upgrades.arrayAssembly = true
    E.recompute(s, d)
    const afterAssembly = createBot(s, d, { onlyBreakthrough: true, realmCost: () => ({ insight: 12000 }), breakthrough: () => false })
    ok('能支付讲经前置后转向讲经堂，不永久堆典籍库', afterAssembly.prerequisites().upgrades.has('preachArt') && afterAssembly.prerequisites().buildings.has('academy'))
    s.realm = 7
    s.upgrades.earthEssence = true
    s.buildings.warehouse = { count: 10, on: true }
    E.recompute(s, d)
    for (const res of RESOURCES) s.resources[res.id] = d.max[res.id].isFinite() ? d.max[res.id] : E.money(UNCAPPED_CRAFTED_RESOURCES.has(res.id) ? 10000 : 0)
    E.recompute(s, d)
    ok('必需空间仓储可实际建造', bot.buildStep(0, null, [], new Map([['grotto', 1]])) && E.countOf(s, 'grotto') === 1)
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
    E.buyBuilding(state, derived, 'spiritField', 5) // 先有聚灵阵，伐木场、茅屋与藏经阁才立得住
    E.buyBuilding(state, derived, 'hut', 5)
    E.buyBuilding(state, derived, 'lumberYard', 1) // 首屋建成后开放伐木场。
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
