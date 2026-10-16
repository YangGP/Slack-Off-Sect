import assert from 'node:assert/strict'
import { createInitialState } from '../src/game/state.js'
import { serialize } from '../src/game/save.js'
import { syncDisciples, cultivationRequired } from '../src/data/disciples.js'
import { setGameContext, economyDetailsEnabled } from '../src/game/context.js'
import * as E from '../src/game/engine.js'
import { powerFixture } from './power-scenarios.mjs'

const startAt = Date.UTC(2026, 9, 15)

export function runOfflineChecks(ok) {
  function compare(label, seed, seconds = 180) {
    const run = cacheEconomy => {
      const state = structuredClone(seed), derived = E.createDerived()
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
    ok(`离线复用与逐步重算完全一致：${label}`, true)
    return optimized
  }

  function populated() {
    const s = createInitialState(startAt)
    s.realm = 4
    s.buildings.hut = { count: 5, on: true }
    s.buildings.spiritField = { count: 40, on: true }
    s.disciples.total = 4
    syncDisciples(s.disciples)
    s.resources.qi = 2000
    return s
  }

  compare('收徒、岗位与跨季节', populated(), 600)
  const full = populated()
  full.settings.recruitMode = 'manual'
  full.upgrades.seekTalents = true
  full.resources.qi = 100000
  full.totalDays = 89.8
  full.buffs = [{ id: 'fractional', mult: 0.3, until: startAt + 1500 },
    { id: 'season', mult: 0.2, target: 'qi', until: startAt + 45125 }]
  compare('满仓、跨季节与小数秒增益到期', full, 180.75)

  const training = populated()
  training.upgrades.mentorship = true
  training.disciples.members[0].mentored = true
  training.disciples.members[0].cultivation = cultivationRequired(0) - 2
  compare('传功修满后停功停费', training)
  training.buildings.spiritField.count = 0
  training.resources.qi = 1
  compare('传功断供、饥饿与人口流失', training)

  const crafting = populated()
  crafting.dao = 1
  crafting.upgrades.earthArt = true
  crafting.upgrades.talismanArt = true
  crafting.settings.craftReservePercent = 0
  crafting.buildings.incenseCauldron = { count: 3, on: true }
  crafting.buildings.talismanHall = { count: 1, on: true }
  crafting.autoCraft.drawTalisman = true
  crafting.resources.wood = 125.5
  crafting.resources.insight = 1000
  crafting.craftTargets.drawTalisman = 4
  compare('自动加工耗尽维护物料、库存目标与保留量', crafting)
  crafting.settings.craftReserves = { wood: 125 }
  compare('逐项保留材料限制加工', crafting)

  const condensed = populated()
  condensed.upgrades.qiLiquid = true
  condensed.upgrades.condenseArt = true
  condensed.upgrades.liquidArt = true
  condensed.dao = 1
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
  hunting.resources.beastHide = 0
  hunting.resources.warrant = 100
  hunting.disciples.members[0].realm = 4
  const hd = E.createDerived()
  setGameContext(hunting, { now: () => startAt, random: () => 0 })
  E.recompute(hunting, hd)
  assert.equal(E.departHunt(hunting, hd, { fieldId: 'foothills', teamIds: [hunting.disciples.members[0].id] }).ok, true)
  compare('断料暖裘居室、猎杀归队补料与自动分工', hunting, 600)

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
