import assert from 'node:assert/strict'
import { createInitialState, normalizeState } from '../src/game/state.js'
import { serialize } from '../src/game/save.js'
import { syncDisciples, cultivationRequired } from '../src/data/disciples.js'
import { setGameContext, economyDetailsEnabled } from '../src/game/context.js'
import { RESOURCES } from '../src/data/resources.js'
import { CRAFT_MAP, craftTime, craftCost } from '../src/data/crafts.js'
import { CONFIG } from '../src/data/config.js'
import * as E from '../src/game/engine.js'
import { powerFixture } from './power-scenarios.mjs'
import { longOfflineFixture } from './lib/offline-fixture.mjs'

const startAt = Date.UTC(2026, 9, 15)

/** 比较同一在线窗口：审计复用必须保留逐秒事件、日志、状态与最终派生。 */
export function compareOnlineEconomy(seed, seconds = 60) {
  const run = optimized => {
    const state = E.cloneRuntime(seed), derived = E.createDerived()
    state.nextEventAt = startAt + 5000
    let randomSeed = 2468
    setGameContext(state, { now: () => startAt, random: () => {
      randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0
      return randomSeed / 4294967296
    } })
    E.tick(state, derived, seconds, { startAt, events: true,
      ...(optimized ? { cacheEconomy: true, economyDetails: false, ...(optimized === 'deferred' ? { finalEconomyDetails: false } : {}) } : {}) })
    assert.equal(economyDetailsEnabled(state), true)
    if (optimized === 'deferred') {
      setGameContext(state, { now: () => state.lastTickAt })
      E.recompute(state, derived)
    }
    return { state: serialize(state, state.lastTickAt), derived, randomSeed }
  }
  assert.deepEqual(run(true), run(false), '在线审计复用与默认逐秒一致')
  assert.deepEqual(run('deferred'), run(false), '仅延后提示明细不改变在线状态或最终派生')
  return true
}

export function runOfflineChecks(ok) {
  /**
   * 同一离线窗口的两次推演必须逐位一致：区别只有「逐步复用经济数据」与「完整重算」，
   * 以及是否生成界面明细。长离线已改为有界近似，这条断言保证近似本身是确定性的。
   */
  function compare(label, seed, seconds = 180) {
    compareOnlineEconomy(seed, Math.min(seconds, 60))
    const run = cacheEconomy => {
      const state = E.cloneRuntime(seed), derived = E.createDerived()
      let randomSeed = 2468
      setGameContext(state, { now: () => startAt, random: () => {
        randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0
        return randomSeed / 4294967296
      } })
      const result = E.simulateOffline(state, derived, seconds, { startAt, cacheEconomy, economyDetails: !cacheEconomy })
      assert.equal(economyDetailsEnabled(state), true, `${label}: 恢复界面明细上下文`)
      return { state: serialize(state, state.lastTickAt), derived, result, randomSeed }
    }
    const optimized = run(true), reference = run(false)
    assert.deepEqual(optimized, reference, label)
    ok(`离线同输入可复现，且复用与重算给出相同结果：${label}`, true)
    return optimized
  }

  function populated() {
    const s = createInitialState(startAt)
    s.realm = 4
    s.buildings.hut = { count: 5, on: true }
    s.buildings.spiritField = { count: 40, on: true }
    s.disciples.total = 4
    syncDisciples(s.disciples)
    s.resources.qi = E.money(2000)
    return s
  }

  compare('收徒、岗位与跨季节', populated(), 600)
  const full = populated()
  full.settings.recruitMode = 'manual'
  full.upgrades.seekTalents = true
  full.resources.qi = E.money(100000)
  full.totalDays = 89.8
  full.buffs = [{ id: 'fractional', mult: 0.3, until: startAt + 1500 },
    { id: 'season', mult: 0.2, target: 'qi', until: startAt + 45125 }]
  compare('满仓、跨季节与小数秒增益到期', full, 180.75)

  const annual = populated()
  annual.totalDays = 350
  annual.resources.qi = E.money(100000)
  compare('跨年长离线的季节加权折算', annual, 4000)

  const training = populated()
  training.upgrades.mentorship = true
  training.disciples.members[0].mentored = true
  training.disciples.members[0].cultivation = cultivationRequired(0) - 2
  compare('传功修满后停功停费', training)
  training.buildings.spiritField.count = 0
  training.resources.qi = E.money(1)
  compare('传功断供、饥饿与人口流失', training)

  const crafting = populated()
  crafting.dao = E.money(1)
  crafting.upgrades.earthArt = true
  crafting.upgrades.talismanArt = true
  crafting.settings.craftReservePercent = 0
  crafting.buildings.incenseCauldron = { count: 3, on: true }
  crafting.buildings.talismanHall = { count: 1, on: true }
  crafting.autoCraft.drawTalisman = true
  crafting.resources.wood = E.money('125.5')
  crafting.resources.insight = E.money(1000)
  crafting.craftTargets.drawTalisman = E.money(4)
  compare('自动加工耗尽维护物料、库存目标与保留量', crafting)
  crafting.settings.craftReserves = { wood: E.money(125) }
  compare('逐项保留材料限制加工', crafting)

  const condensed = populated()
  condensed.upgrades.qiLiquid = true
  condensed.upgrades.condenseArt = true
  condensed.upgrades.liquidArt = true
  condensed.dao = E.money(1)
  condensed.buildings.spiritField.count = 2000
  compare('节气满仓凝液', condensed)

  const power = powerFixture({ chains: 2, core: true }).state
  compare('零库存粒子链启动、供给与灵能逸散', power)
  const pd = E.createDerived()
  E.recompute(power, pd)
  power.resources.yangParticle = pd.max.yangParticle
  power.resources.yinParticle = pd.max.yinParticle
  power.buildings.annihilationFurnace.on = false
  compare('偏极阵任一侧满仓限流', power)

  const hunting = populated()
  hunting.upgrades.wildHunting = true
  hunting.buildings.huntingCamp = { count: 1, on: true }
  hunting.buildings.warmFurChamber = { count: 1, on: true }
  hunting.resources.beastHide = E.money(0)
  hunting.resources.warrant = E.money(100)
  hunting.disciples.members[0].realm = 4
  const hd = E.createDerived()
  setGameContext(hunting, { now: () => startAt, random: () => 0 })
  E.recompute(hunting, hd)
  assert.equal(E.departHunt(hunting, hd, { fieldId: 'foothills', teamIds: [hunting.disciples.members[0].id] }).ok, true)
  compare('断料暖裘居室、猎杀归队补料与自动分工', hunting, 600)

  // 短时离线仍走逐秒精确路径：与逐秒参考完全一致（长离线的近似不影响短窗口）。
  {
    const seed = populated(), state = E.cloneRuntime(seed), reference = E.cloneRuntime(seed)
    const sd = E.createDerived(), rd = E.createDerived()
    setGameContext(state, { now: () => startAt, random: () => 0.5 })
    setGameContext(reference, { now: () => startAt, random: () => 0.5 })
    const report = E.simulateOffline(state, sd, 45, { startAt })
    for (let i = 0; i < 45; i++) E.tick(reference, rd, 1, { offline: true, events: false, startAt: startAt + i * 1000 })
    assert.equal(report.approximate, undefined, '不超过门槛仍走精确路径')
    for (const r of RESOURCES) {
      assert.ok(state.resources[r.id].minus(reference.resources[r.id]).abs().lt('1e-9'), `短时精确：${r.id}`)
    }
    ok('不超过门槛的离线仍与逐秒参考完全一致', true)
  }

  // 长离线的有界近似：步数与离线时长无关，库存有限非负且不越仓储，加工不积攒欠账。
  const longRun = (seconds, adjust = () => {}) => {
    const state = longOfflineFixture(startAt)
    adjust(state)
    const derived = E.createDerived()
    setGameContext(state, { now: () => startAt, random: () => 0.5 })
    E.recompute(state, derived)
    const before = { ...state.resources }
    const report = E.simulateOffline(state, derived, seconds, { startAt })
    assert.equal(report.approximate, true, '长离线使用有界近似')
    assert.equal(report.segments, report.baseSegments, '无初始增益时不追加切分边界')
    assert.ok(report.baseSegments <= CONFIG.OFFLINE_MAX_SEGMENTS, '基础段数封顶')
    for (const r of RESOURCES) {
      const value = state.resources[r.id]
      assert.ok(E.moneyFinite(value) && !value.isNegative(), `${r.id} 有限且非负`)
      const cap = derived.max[r.id]
      if (r.id !== 'karma' && cap.isFinite()) {
        assert.ok(value.lte(E.moneyMax(before[r.id] ?? E.ZERO, cap).plus('1e-6')), `${r.id} 不超仓储`)
      }
    }
    for (const [id, timer] of Object.entries(state.craftTimers)) {
      const recipe = CRAFT_MAP[id]
      if (!recipe) continue
      assert.ok(timer.t >= 0 && timer.t <= craftTime(recipe, derived) + 1e-9, `${id} 只保留一份待完成量`)
    }
    assert.ok(report.industryRounds <= report.segments * CONFIG.OFFLINE_INDUSTRY_ROUNDS, '工业分配轮数有界')
    assert.ok(report.huntBatches <= report.segments, '猎杀批次数有界')
    return { state, derived, report, before }
  }

  const eight = longRun(8 * 3600)
  ok(`8 小时多配方工业与自动猎杀在有界步数内结算（${eight.report.segments} 段／工业 ${eight.report.industryRounds} 轮／猎杀 ${eight.report.huntBatches} 批）`, true)
  // 基准夹具必须让工业与自动重复在**多个分段持续**工作，否则测不到批量路径的真实开销。
  assert.ok(eight.report.industryRounds >= eight.report.segments * 0.5,
    `工业应在多数分段持续工作（实际 ${eight.report.industryRounds}/${eight.report.segments}）`)
  assert.ok(eight.report.huntBatches >= 1, '自动猎杀在长段内走批量快进')
  const day = longRun(24 * 3600)
  assert.equal(day.report.segments, eight.report.segments, '8 小时与 24 小时使用相同段数')
  assert.equal(day.report.baseSegments, CONFIG.OFFLINE_MAX_SEGMENTS)
  assert.ok(day.report.huntBatches >= 8, `24 小时自动猎杀持续走批量快进（实际 ${day.report.huntBatches} 批）`)
  ok('24 小时离线不增加分段数：计算量与离线时长无关，且工业与猎杀持续工作', true)

  // 工业批量：多轮只重分配同一段真实时间，任一条线累计加工不得超过「工位速度 × 段长」。
  {
    for (const seconds of [10, 60, 450]) {
      const state = longOfflineFixture(startAt)
      state.autoCraft = { sawPlank: true }
      state.resources.plank = E.money(0)
      const derived = E.createDerived()
      setGameContext(state, { now: () => startAt, random: () => 0.5 })
      E.recompute(state, derived)
      const speed = E.processingPlan(state, derived).sawPlank.speed
      const step = craftTime(CRAFT_MAP.sawPlank, derived)
      const before = state.craftTimers.sawPlank?.t || 0
      E.runIndustrialCraftBatch(state, derived, seconds)
      const timer = state.craftTimers.sawPlank
      const processing = timer.made * step + timer.t - before
      // 原料与仓容都充足：应当用满这段时间，且一份不多。
      assert.ok(processing <= speed * seconds + 1e-9, `工业累计加工不超过时间预算：${seconds}s（${processing} > ${speed * seconds}）`)
      assert.ok(processing >= speed * seconds - 1e-9, `足量原料下用满时间预算：${seconds}s（${processing} < ${speed * seconds}）`)
      assert.ok(timer.t >= 0 && timer.t <= step + 1e-9, '只保留一份待完成量')
    }
    ok('工业多轮只重分配同一段真实时间，不重复发放时长', true)
  }

  // 原料与动力共用同一份库存预算：同一资源既是耗料又是超载动力时，不得先发货后截零。
  {
    const overloaded = () => {
      const state = longOfflineFixture(startAt)
      state.autoCraft = { condenseLiquid: true }
      state.settings.processingModes.condensation = 'overload'
      state.settings.autoCraftSpeeds.condenseLiquid = 10
      state.resources.qi = E.money(900)
      state.resources.spiritLiquid = E.money(0)
      const derived = E.createDerived()
      setGameContext(state, { now: () => startAt, random: () => 0.5 })
      E.recompute(state, derived)
      return { state, derived }
    }
    const { state, derived } = overloaded()
    const line = E.processingPlan(state, derived).condenseLiquid
    const recipe = CRAFT_MAP.condenseLiquid
    const cost = craftCost(derived, recipe)
    const step = craftTime(recipe, derived)
    E.runIndustrialCraftBatch(state, derived, 1000)
    const made = state.craftTimers.condenseLiquid.made
    const available = E.money(900)
    const spent = available.minus(state.resources.qi)
    const minimumFuel = line.powerDrain.qi.times(step).div(line.speed).times(made)
    assert.ok(!state.resources.qi.isNegative(), '灵气不为负')
    assert.ok(made > 0 && state.resources.spiritLiquid.eq(made), '产出与份数一致')
    assert.ok(cost.qi.times(made).plus(minimumFuel).lte(available.plus('1e-9')),
      `已完成份数的原料与最低动力都付得起（需 ${cost.qi.times(made).plus(minimumFuel)}，有 900）`)
    assert.ok(spent.lte(available.plus('1e-9')), '原料与动力合计不超过可用量')
    // 动力与原料都耗尽后停线：不再扣动力、不再积攒进度。
    const qiAfter = state.resources.qi
    const progressAfter = state.craftTimers.condenseLiquid.t
    E.runIndustrialCraftBatch(state, derived, 1000)
    assert.ok(state.resources.qi.eq(qiAfter) && state.craftTimers.condenseLiquid.t === progressAfter,
      '缺料且无动力时停线，不继续扣动力或积攒进度')
    // 自动保留量不能被后置的动力扣除穿透。
    const { state: reserved, derived: rd } = overloaded()
    reserved.settings.craftReserves = { qi: E.money(400) }
    E.recompute(reserved, rd)
    E.runIndustrialCraftBatch(reserved, rd, 1000)
    assert.ok(E.moneyGte(reserved.resources.qi, E.money(400).minus('1e-9')), `自动保留量不被穿透（剩 ${reserved.resources.qi}）`)
    ok('原料与超载动力共用同一份库存预算，保留量不被穿透', true)
  }

  // 不足一份的燃料也必须限制新增进度；已有进度已付费，不能再次收费。
  {
    for (const reserve of [0, 400]) {
      for (const prepaidFraction of [0, 0.5]) {
        const state = longOfflineFixture(startAt)
        state.autoCraft = { sawPlank: true }
        state.resources.plank = E.money(0)
        state.resources.wood = E.money(100000)
        state.resources.qi = E.money(1).plus(reserve)
        state.settings.craftReserves = { qi: E.money(reserve) }
        state.settings.processingModes.woodwork = 'overload'
        state.settings.autoCraftSpeeds.sawPlank = 10
        const derived = E.createDerived()
        setGameContext(state, { now: () => startAt, random: () => 0.5 })
        E.recompute(state, derived)
        const line = E.processingPlan(state, derived).sawPlank
        const step = craftTime(CRAFT_MAP.sawPlank, derived)
        const before = step * prepaidFraction
        state.craftTimers.sawPlank = { t: before, made: 0 }
        assert.ok(line.powerDrain.qi.gt(0), '夹具确实启用了超载动力')
        E.runIndustrialCraftBatch(state, derived, 1000)
        const timer = state.craftTimers.sawPlank
        const newWork = timer.made * step + timer.t - before
        const fuel = line.powerDrain.qi.times(newWork).div(line.speed)
        const spent = E.money(1).plus(reserve).minus(state.resources.qi)
        assert.equal(timer.made, 0, '临界燃料不足以完成一份')
        assert.ok(newWork > 0 && fuel.lte(E.money(1).plus('1e-9')), '新增进度受可用燃料约束')
        assert.ok(E.moneyGte(state.resources.qi, E.money(reserve).minus('1e-9')), '未完成进度不穿透保留量')
        assert.ok(spent.minus(fuel).abs().lt('1e-9'), '只对新增进度付费且足额付清')
      }
    }
    ok('临界燃料限制未完成进度，保留量和已付进度均正确', true)
  }

  const strained = longRun(8 * 3600, state => {
    state.settings.craftReservePercent = 40
    state.settings.craftReserves = { wood: E.money(9000) }
    state.craftTargets.drawTalisman = E.money(5)
    state.resources.ore = E.money(0)
  })
  // 库存目标仍生效：达到目标后停线，只允许共享的 settleCraftCopies 释放小数进度时多出不到一份。
  const talismanYield = E.craftYield(strained.derived, CRAFT_MAP.drawTalisman)
  assert.ok(strained.state.resources.talisman.lte(E.money(5).plus(E.moneyToCount(talismanYield))),
    `库存目标仍然生效（实际 ${strained.state.resources.talisman}）`)
  ok('缺料、满仓、目标与保留量同时生效时仍不越界', true)

  // 初始增益到期是唯一允许的额外切分：步数上界与离线秒数无关，且不放大为整窗加成。
  {
    const state = longOfflineFixture(startAt)
    state.buffs = [
      { id: 'brief', mult: 0.5, until: startAt + 12345 },
      { id: 'past', mult: 0.5, until: startAt - 1000 },
    ]
    const derived = E.createDerived()
    setGameContext(state, { now: () => startAt, random: () => 0.5 })
    const report = E.simulateOffline(state, derived, 8 * 3600, { startAt })
    assert.equal(report.baseSegments, CONFIG.OFFLINE_MAX_SEGMENTS)
    assert.ok(report.segments <= report.baseSegments + 1, '额外切分只按初始有效增益数')
    assert.equal(state.buffs.length, 0, '过期增益在各自边界处移除')
    ok('增益到期只额外切一段，且不放大为整个离线窗口的加成', true)
  }

  // 灵能：持续产出与逸散用闭式解，不能先把整段产出入库、再整体衰减到零。
  {
    const state = E.cloneRuntime(powerFixture({ chains: 2, core: true }).state)
    const derived = E.createDerived()
    setGameContext(state, { now: () => startAt, random: () => 0.5 })
    E.recompute(state, derived)
    for (let i = 0; i < 60; i++) E.tick(state, derived, 1, { offline: true, events: false, startAt: startAt + i * 1000 })
    const bootstrapped = state.resources.qiEnergy
    E.simulateOffline(state, derived, 3600, { startAt: startAt + 60000 })
    assert.ok(bootstrapped.gt(0), '起步一分钟已产出灵能')
    assert.ok(state.resources.qiEnergy.gt(0), '稳定产出的灵能不会长期归零')
    assert.ok(E.moneyGte(state.resources.qiEnergy, bootstrapped), '稳态继续逼近，不因整段衰减回落')
    assert.ok(state.resources.qiEnergy.lte(derived.max.qiEnergy.plus('1e-6')), '灵能不超仓储')
    ok('长离线灵能走闭式解，稳定产出不归零也不越仓储', true)
  }

  // 即使中途抛错，后续实例重算也必须恢复详细来源和解锁列表。
  const broken = populated(), bd = E.createDerived()
  broken.disciples.total = 72
  syncDisciples(broken.disciples)
  setGameContext(broken, { now: () => startAt, random: () => { throw new Error('random failed') } })
  broken.habitabilityPenalty = -60
  broken.leaveTimer = 59
  assert.throws(() => E.simulateOffline(broken, bd, 2, { startAt }), /random failed/)
  assert.equal(economyDetailsEnabled(broken), true)
  E.recompute(broken, bd)
  ok('离线异常后恢复详细来源和解锁计算', bd.sources.qi.length > 0 && Array.isArray(bd.availableUpgrades))
}
