import { createInitialState, normalizeState, resetForAscension, resetForReincarnation } from '../../src/game/state.js'
import { ADVANCED_CRAFTS } from '../player-bot.mjs'
import * as E from '../engine-fixture.mjs'
import { RESOURCES, RESOURCE_MAP } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { ALL_UPGRADES, UPGRADE_MAP } from '../../src/data/upgrades.js'
import { TECHNIQUES } from '../../src/data/techniques.js'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { REALMS } from '../../src/data/realms.js'
import { exportSave, parseImport } from '../../src/game/save.js'
import { describeEffects } from '../../src/game/effectsText.js'
import { newGame } from './fixtures.mjs'

export function purchaseReachability({ ok, section }) {
  section('可购买性：不会被仓储上限卡死')
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
}

export function storageAndRefinement({ ok, section }) {
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
    ok('专属成品仓储不被通用折算削弱', d.max.pill === pillBefore + BUILDING_MAP.alchemyRoom.effects.storage.pill)
    ok('整枚资源容量是整数', RESOURCES.filter(r => r.integer).every(r => Number.isInteger(d.max[r.id])))
    const old = normalizeState({ ...s, resources: { ...s.resources, nineTurnPill: 1000 } })
    E.recompute(old, d)
    E.addResource(old, 'nineTurnPill', 10, d.max.nineTurnPill)
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
}
