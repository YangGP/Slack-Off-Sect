/**
 * 模拟玩家策略（供 tools/balance.mjs 与 tools/resource-audit.mjs 共用）。
 *
 * 行为设定：每 5 秒决策一次 —— 派活、参悟最便宜的条目（修真 / 技艺 / 法宝同一张表）、按「优先级 + 已有数量」打分买建筑、
 * 灵气富余就凝石、缺破境材料就专门去做、能破境就破境。
 * 目的是给出一个**稳定可复现**的参照玩家，而不是最优打法。
 */
import * as E from '../src/game/engine.js'
import { CONFIG } from '../src/data/config.js'
import { CULTIVATION, ALL_UPGRADES } from '../src/data/upgrades.js'
import { CRAFTS } from '../src/data/crafts.js'
import { REALMS } from '../src/data/realms.js'

/** 建筑采购优先级：先居住，再产出与修行，再仓储/香火，最后奇观 */
export const PRIORITY = [
  'hut',
  'spiritField',
  'lumberYard',
  'library',
  'granary',
  'logHouse',
  'mine',
  'herbGarden',
  'warehouse',
  'gate',
  'spiritVein',
  'gatheringArray',
  'academy',
  'alchemyRoom',
  'forge',
  'talismanHall',
  'incenseCauldron',
  'meditationPool',
  'observatory',
  'workshop',
  'mansion',
  'depot',
  'trialTower',
  'mountainArray',
  'ancestorHall',
  'beastGarden',
  'grotto',
  'caveDwelling',
  'spiritLockArray',
  'heavenTower',
  'karmaPool',
]

/** 凝石时至少留多少灵气（模拟玩家不会把灵气抽干） */
export const STONE_QI_FLOOR = 400

export function createBot(state, derived) {
  function assignJobs() {
    const idle = E.idleDisciples(state)
    if (idle <= 0) return
    // 派多少农民：按**基准口径**算，也就是「基准口粮 ÷ 阵徒基准产出」——
    // 把口粮里的境界倍率除掉，只留下与境界无关的那份。
    //
    // 为什么不在算式里乘上境界倍率：弟子口粮现在随境界上涨（DISCIPLE_UPKEEP_REALM_EXP），
    // 如果这里还按 `derived.upkeep / 0.6` 估，需求会被高估 realmMult 倍（渡劫期 20 倍），
    // 于是弟子全被塞进农田、没人当悟道者，推演直接失真。
    // 反过来，若按「实际边际产出」估（除以 0.6 × 共用乘区），派的人会随乘区一起缩水，
    // 参照玩家就随数值改动漂移了 —— 那样两次推演没法比。
    // 现在的口径两头都不沾：农民占比只跟「口粮 ÷ 产出」的基准值有关，
    // 与境界/士气/加成无关，所以**同一套策略在改动前后是同一个玩家**。
    // 实际产出因乘区 ≥ 基准，所以这份人手总是够覆盖账单的（还有富余去买楼）。
    const realmUpkeepMult = Math.max(
      1e-9,
      Math.pow(derived.realmMult || 1, CONFIG.DISCIPLE_UPKEEP_REALM_EXP),
    )
    const baseUpkeep = derived.upkeep / realmUpkeepMult
    const needFarmers = Math.ceil(baseUpkeep / 0.6) + 1
    const farmer = state.disciples.jobs.farmer || 0
    if (farmer < needFarmers) {
      E.setJob(state, derived, 'farmer', Math.min(farmer + idle, needFarmers))
    }

    // 剩下的按「感悟优先」分配：三成去悟道，其余平摊给产资源的职位
    const order = ['scholar', 'woodcutter', 'miner', 'herbalist', 'incenseKeeper'].filter((id) =>
      derived.unlockedJobs.includes(id),
    )
    let rest = E.idleDisciples(state)
    if (rest <= 0 || !order.length) return

    if (order.includes('scholar')) {
      const scholars = Math.max(1, Math.floor(rest / 3))
      E.setJob(state, derived, 'scholar', (state.disciples.jobs.scholar || 0) + scholars)
    }
    rest = E.idleDisciples(state)
    const others = order.filter((id) => id !== 'scholar')
    if (rest > 0 && others.length) {
      const share = Math.floor(rest / others.length)
      for (const jobId of others) {
        if (share <= 0) break
        E.setJob(state, derived, jobId, (state.disciples.jobs[jobId] || 0) + share)
      }
      const left = E.idleDisciples(state)
      if (left > 0) {
        const jobId = others[0]
        E.setJob(state, derived, jobId, (state.disciples.jobs[jobId] || 0) + left)
      }
    }
  }

  // 按「优先级 + 已有数量」打分买分数最低的那座，避免把钱全砸在最便宜的上面
  function buildStep(reserveQi = 0) {
    const qiBudget = Math.max(0, (state.resources.qi || 0) - reserveQi)
    let bestId = null
    let bestScore = Infinity
    for (let idx = 0; idx < PRIORITY.length; idx++) {
      const id = PRIORITY[idx]
      if (!derived.unlockedBuildings.includes(id)) continue
      const cost = E.buildingCost(state, id, 1)
      if ((cost.qi || 0) > qiBudget) continue
      if (!E.canAfford(state, cost)) continue
      const score = idx + E.countOf(state, id) * 0.6
      if (score < bestScore) {
        bestScore = score
        bestId = id
      }
    }
    if (!bestId) return false
    E.buyBuilding(state, derived, bestId, 1)
    return true
  }

  function act() {
    // —— 财政：灵气要见底时，把吃灵气的建筑停掉；缓过来再开 ——
    // （维护费让「停用」变成一个真选择，勤快玩家当然会看账）
    if (E.countOf(state, 'hut') > 0) {
      const qiEaters = E.BUILDINGS.filter((b) => b.upkeep?.qi).map((b) => b.id)
      const netBefore = derived.netQi
      const low = state.resources.qi < 20 && netBefore < 0
      const recovered = state.resources.qi > derived.max.qi * 0.5 && netBefore >= 0
      for (const id of qiEaters) {
        const e = state.buildings[id]
        if (!e || !e.count) continue
        if (low && e.on !== false) E.toggleBuilding(state, derived, id)
        else if (recovered && e.on === false) E.toggleBuilding(state, derived, id)
      }
    }

    // —— 开局：什么都没有，只能靠自己点 + 凝气成石（对标猫国的采集薄荷）——
    if (E.countOf(state, 'hut') === 0) {
      const fieldCost = E.BUILDING_MAP.spiritField.cost.qi
      const hutCost = E.BUILDING_MAP.hut.cost.qi
      const target = E.countOf(state, 'spiritField') === 0 ? fieldCost : hutCost + 45
      for (let i = 0; i < 12 && state.resources.qi < target; i++) E.drawQi(state, derived)
      E.recompute(state, derived)
      // 茅屋要一枚灵石：攒够灵气就凝一颗
      if ((state.resources.stone || 0) < 1 && state.resources.qi >= 45 + hutCost) {
        E.craft(state, derived, 'condenseStone', { times: 1 })
      }
    }

    assignJobs()

    // 参悟「最快能凑齐」的那条（修真与技艺·法宝两层合并的口径，所以要用 ALL_UPGRADES 查表）。
    // 注意不能按某一两种资源的数值排序 —— 技艺层不再吃感悟之后，
    // 「按感悟排序」会把所有技艺排在修真前面，机器人就永远不去点修真了（实测 8 小时卡在炼气期）。
    // 按「这一条最慢的那项资源还要等多久」排序，才是与资源结构无关的口径。
    const waitOf = (u) => {
      let worst = 0
      for (const res in u.cost) {
        const t = E.timeToAfford(state, derived, res, u.cost[res])
        if (!Number.isFinite(t)) worst = Math.max(worst, 1e9)
        else worst = Math.max(worst, t)
      }
      return worst
    }
    const ups = derived.availableUpgrades
      .map((id) => ALL_UPGRADES.find((u) => u.id === id))
      .filter(Boolean)
      .sort((a, b) => waitOf(a) - waitOf(b))
    if (ups.length) {
      const u = ups[0]
      if (E.canAfford(state, u.cost)) E.research(state, derived, u.id)
    }

    buildStep(0)

    // 制作（灵石留一点灵气余量，别把阵徒的口粮也花掉）
    for (const c of CRAFTS) {
      if (!derived.availableCrafts.includes(c.id)) continue
      if (c.id === 'condenseStone' && state.resources.qi < STONE_QI_FLOOR) continue
      if (E.canAfford(state, c.cost)) E.craft(state, derived, c.id, { times: 10 })
    }

    // 参悟《心有灵犀》之后，把配方都挂上「自动」——
    // 它按每份耗时一份一份地做，材料不够就先歇着，正好是玩家会做的事
    if (derived.autoCraftUnlocked) {
      state.settings.autoCraftOn = true
      for (const c of CRAFTS) {
        if (derived.availableCrafts.includes(c.id)) state.autoCraft[c.id] = true
      }
    }

    if (E.breakthrough(state, derived)) assignJobs()
  }

  return { act, assignJobs, buildStep }
}
