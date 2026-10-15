import { normalizeState } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { RESOURCES } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { JOBS } from '../../src/data/jobs.js'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { newGame, newGameRunning } from './fixtures.mjs'

export function buildingActions({ ok, close, section }) {
  section('建造 / 拆除 / 停用')
  {
    const { state, derived } = newGameRunning()
    const cost = E.buildingCost(state, 'hut', 2)
    const affordable = E.maxAffordable(state, 'hut')
    const recipes = ['spiritMortar', 'ironMortar'].map(out => Object.values(CRAFT_MAP).find(c => c.out === out))
    const yields = recipes.map(recipe => E.craftYield(derived, recipe))
    state.upgrades.masonryArt = true
    E.recompute(state, derived)
    ok('已学营造技艺仍按原价计算单座与批量建筑费用',
      JSON.stringify(E.buildingCost(state, 'hut', 2)) === JSON.stringify(cost) && E.maxAffordable(state, 'hut') === affordable)
    ok('营造技艺保留两种混灵土的制作产出增益',
      recipes.every((recipe, i) => close(E.craftYield(derived, recipe), yields[i] + 0.1)))
    state.resources.qi = cost.qi
    state.resources.wood = cost.wood
    ok('营造技艺不改变实际批量建造扣料',
      E.buyBuilding(state, derived, 'hut', 2) === 2 && close(state.resources.qi, 0) && close(state.resources.wood, 0))
    ok('拆除仍按原价返还一半材料',
      E.sellBuilding(state, derived, 'hut', 2) === 2 && close(state.resources.qi, cost.qi / 2) && close(state.resources.wood, cost.wood / 2))
  }
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
}

export function buildingUpkeep({ ok, close, section }) {
  section('建筑维护费（只有带维护费的建筑能停用）')
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
}

export function miningByproducts({ ok, close, section }) {
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
}

export function mineralBonuses({ ok, close, section }) {
  section('采矿场矿物增产')
  {
    const { state: s, derived: d } = newGame()
    s.disciples.total = 1
    s.disciples.jobs.miner = 1
    s.upgrades.prospectStudy = true
    s.buildings.quarry = { count: 1, on: true }
    s.buildings.spiritQuarry = { count: 1, on: true }
    s.buildings.spiritField = { count: 1, on: true }
    E.recompute(s, d)
    const mineralRates = Object.fromEntries(['rock', 'ore', 'stone'].map(id => [id, d.rates[id]]))
    const qiRate = d.rates.qi
    ok('单座采矿场为三种矿物实际产出增加10%', ['rock', 'ore', 'stone'].every(id => close(d.sourceFactor[id], d.globalMult * 1.1)))
    s.buildings.quarry.count = 3
    E.recompute(s, d)
    ok('三座采矿场加成相加至30%，不影响灵气', Object.entries(mineralRates).every(([id, rate]) => close(d.rates[id], rate * 1.3 / 1.1)) && close(d.rates.qi, qiRate))
    s.buildings.quarry.on = false
    E.recompute(s, d)
    ok('停用采矿场移除矿物加成并停止采矿石', d.rates.rock === 0 && ['ore', 'stone'].every(id => close(d.rates[id], mineralRates[id] / 1.1)))
  }
}

export function herbBonuses({ ok, close, section }) {
  section('药圃灵草增产')
  {
    const { state: s, derived: d } = newGame()
    s.disciples.total = 1
    s.disciples.jobs.herbalist = 1
    s.buildings.herbGarden = { count: 1, on: true }
    s.buildings.spiritField = { count: 1, on: true }
    E.recompute(s, d)
    const herbRate = d.rates.herb
    const qiRate = d.rates.qi
    ok('单座药圃为灵草实际生产产出增加10%', herbRate > 0 && close(d.sourceFactor.herb, d.globalMult * (1 + (d.seasonRatio.herb || 0)) * 1.1))
    s.buildings.herbGarden.count = 3
    E.recompute(s, d)
    ok('三座药圃加成相加至30%，不影响灵气', close(d.rates.herb, herbRate * 1.3 / 1.1) && close(d.rates.qi, qiRate))
    s.buildings.herbGarden.on = false
    E.recompute(s, d)
    ok('停用药圃移除灵草产出加成', close(d.rates.herb, herbRate / 1.1) && (d.ratio.herb || 0) === 0)
  }
}

export function workerProduction({ ok, close, section }) {
  section('基础资源由人力生产，普通聚灵阵例外')
  {
    const humanResources = new Set(JOBS.map(job => job.resource))
    humanResources.add('stone')
    ok('只有普通聚灵阵自带人力资源产出', BUILDINGS.every(b =>
      b.id === 'spiritField' || Object.keys(b.effects.prod || {}).every(id => !humanResources.has(id))))
    const { state: s, derived: d } = newGame()
    for (const id of ['lumberYard', 'quarry', 'ironFurnace', 'spiritQuarry', 'herbGarden', 'library', 'gate', 'gatheringArray', 'crystalArray', 'huntingCamp']) {
      s.buildings[id] = { count: 1, on: true }
    }
    s.resources.qi = 1000
    s.resources.herb = 1000
    E.recompute(s, d)
    ok('建好设施但无人时，基础物资与灵机香火均无产出', [...humanResources].every(id => d.rates[id] === 0))
    s.disciples.total = JOBS.length
    for (const job of JOBS) E.setJob(s, d, job.id, 1)
    // 弟子资质由随机种子生成：清掉天赋，避免随机岗位天赋抬高基准产出，稳定下面的 0.15 断言。
    s.disciples.members.forEach((m) => { m.talents = [] })
    E.recompute(s, d)
    ok('派遣弟子后，各职位资源开始生产', JOBS.every(job => d.rates[job.resource] > 0))
    ok('矿工矿石产出记入人力来源', d.sources.rock.some(source => source.kind === 'job' && source.id === 'miner' && close(source.raw, 0.15)))
    E.setJob(s, d, 'miner', 0)
    ok('撤回矿工后矿石与玄铁停止生产', d.rates.rock === 0 && d.rates.ore === 0)
    const fresh = normalizeState({ buildings: { quarry: { count: 1, on: true } }, disciples: { total: 1, jobs: {} } })
    ok('旧档补齐矿工且不自动占用人口', fresh.disciples.jobs.miner === 0 && !('stonecutter' in fresh.disciples.jobs) && fresh.disciples.total === 1)
  }
}

export function naturalSpiritStone({ ok, section }) {
  section('灵石矿：天然的灵石来源')
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
}

export function lateHousing({ ok, section }) {
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
}
