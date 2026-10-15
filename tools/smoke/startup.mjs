import { createInitialState, normalizeState, resetForReincarnation } from '../../src/game/state.js'
import { createBot } from '../player-bot.mjs'
import * as E from '../engine-fixture.mjs'
import { RESOURCES } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { JOBS } from '../../src/data/jobs.js'
import { UPGRADE_MAP } from '../../src/data/upgrades.js'
import { CRAFTS } from '../../src/data/crafts.js'
import { REALMS, ASCEND_REALM_INDEX } from '../../src/data/realms.js'
import { CONFIG } from '../../src/data/config.js'
import { describeEffects } from '../../src/game/effectsText.js'
import { newGame } from './fixtures.mjs'

export function firstHut({ ok, section }) {
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
}

export function initialState({ ok, close, section }) {
  section('初始状态：什么都没有（对标猫国开局）')
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
}

export function progressiveReveal({ ok, section }) {
  section('渐进露出（对标猫国的 unlockRatio）')
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
}

export function earlyPacing({ ok, section }) {
  section('前期节奏（对标猫国：第 1 分钟只给一座，其余靠研究放行）')
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
}

export function earlyBuildings({ ok, section }) {
  section('早期建筑：知识前置、分支推进与旧档保留')
  {
    const { state: s, derived: d } = newGame()
    for (const [id, count] of Object.entries({ spiritField: 5, hut: 5, library: 2, lumberYard: 1, quarry: 2, granary: 1 })) s.buildings[id] = { count, on: true }
    Object.assign(s.resources, { insight: 1000, wood: 5000, rock: 5000, stone: 1000, qi: 5000 })
    E.recompute(s, d)
    ok('材料足够仍不能跳过木屋、小院和大阵的知识前置', ['logHouse', 'livingCourt', 'gatheringArray'].every(id => !E.isBuildingUnlocked(s, id) && E.buyBuilding(s, d, id) === 0))
    ok('基础设施可先取得灵源考，无住房和阵法研究循环', E.research(s, d, 'qiOrigin'))
    ok('灵源考后可先学灵植术，无需观气法', !s.upgrades.qiGazing && E.research(s, d, 'herbStudy'))
    ok('未研究观气法可建药圃并开放采药职位', E.buyBuilding(s, d, 'herbGarden') === 1 && E.isJobUnlocked(s, JOBS.find(job => job.id === 'herbalist')))
    ok('居所营造只需起步设施即可研究', E.research(s, d, 'homePlanning'))
    ok('学会居所营造后开放木屋与清风小院', E.buyBuilding(s, d, 'logHouse') === 1 && E.buyBuilding(s, d, 'livingCourt') === 1)
    ok('料场仍须凿石要诀，起步设施能满足研究条件', !E.isBuildingUnlocked(s, 'materialYard') && E.research(s, d, 'quarryArt') && E.buyBuilding(s, d, 'materialYard') === 1)
    ok('只学观气法仍不能建大阵', E.research(s, d, 'qiGazing') && !E.isBuildingUnlocked(s, 'gatheringArray'))
    ok('阵法精要仍需要引气诀', !E.isUpgradeUnlocked(s, UPGRADE_MAP.fieldTillage) && E.research(s, d, 'qiArt'))
    ok('掌握阵法精要后才能建聚灵大阵', E.research(s, d, 'fieldTillage') && E.buyBuilding(s, d, 'gatheringArray') === 1)

    const legacy = createInitialState()
    for (const id of ['logHouse', 'livingCourt', 'gatheringArray']) legacy.buildings[id] = { count: 1, on: true }
    const restored = normalizeState(legacy)
    const restoredDerived = E.createDerived()
    E.recompute(restored, restoredDerived)
    ok('旧档已建建筑保留显示与效果，不补赠新前置技艺', ['logHouse', 'livingCourt', 'gatheringArray'].every(id => E.isBuildingUnlocked(restored, id)) && restoredDerived.maxDisciples === 6 && !restored.upgrades.homePlanning && !restored.upgrades.fieldTillage)
  }
}

export function housingInvestment({ ok, close, section }) {
  section('宜居配套：入住覆盖、实际投资与目标增产')
  {
    const { state: s, derived: d } = newGame()
    for (const [id, count] of Object.entries({ hut: 2, library: 1, lumberYard: 1, quarry: 1, granary: 1 })) s.buildings[id] = { count, on: true }
    s.upgrades.qiOrigin = true
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
    ok('早期入住配套加四座小院提供4%增产', d.habitability === 40 && close(d.habitabilityMult, 1.04) && d.discipleMult === 1)
    s.buildings.hut.count = 30
    s.disciples.total = 60
    E.recompute(s, d)
    ok('正常扩屋入住后保持同样的4%增产', d.housingHabitability === 60 && d.habitability === 96 && close(d.habitabilityMult, 1.04))
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
    s.resources.qi = 1e6 // 持续供能：清幽园林的宜居收益需要灵气供给
    E.recompute(s, d)
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
    ok('参照玩家实际投资到目标区间后停止重复购买纯宜居设施', E.countOf(s, 'livingCourt') === 5 && close(d.habitabilityMult, 1.05))
    s.realm = 10
    s.buildings.depot = { count: 20, on: true }
    E.recompute(s, d)
    for (let i = 0; i < 16; i++) {
      Object.assign(s.resources, E.buildingCost(s, 'livingCourt', 1))
      bot.act()
    }
    ok('中后期参照玩家允许继续建设并达到20%增产', E.countOf(s, 'livingCourt') === 20 && close(d.habitabilityMult, 1.2))
  }
}
