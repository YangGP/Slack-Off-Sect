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

export function storageFixedPoints({ ok, section }) {
  section('仓储定点（终局上限不能被自己的涨价率锁死）')
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
    //            《湮灭法》30 万灵机 vs 上限 26.8 万）—— 我把分灵阵改回 25 万验证过，
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
}

export function botStorageTargets({ ok, section }) {
  section('参照玩家的囤货上限：不能低于游戏里的需求')
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

export function specializedStorage({ ok, section }) {
  section('分类仓库与扩仓可达性')
  {
    const { state: s, derived: d } = newGame()
    s.realm = 3
    for (const id of ['alchemyArt', 'forgeArt', 'talismanArt', 'woodworking', 'earthArt']) s.upgrades[id] = true
    s.buildings.warehouse = { count: 2, on: true }
    E.recompute(s, d)
    ok('专藏在金丹前不提前出现', !d.unlockedBuildings.includes('medicineVault') && !d.unlockedBuildings.includes('arcaneVault'))
    // 渐进露出要求见过造价的 30%：金丹档把法藏的建材备齐
    for (const [res, n] of Object.entries(BUILDING_MAP.arcaneVault.cost)) s.resources[res] = Math.max(s.resources[res] || 0, n)
    s.realm = 4
    E.recompute(s, d)
    ok('金丹重排后药藏延后到元婴、法藏随符器仓容留在金丹', !d.unlockedBuildings.includes('medicineVault') && d.unlockedBuildings.includes('arcaneVault'))
    s.realm = 5
    for (const id of ['medicineVault', 'arcaneVault']) {
      for (const [res, n] of Object.entries(BUILDING_MAP[id].cost)) s.resources[res] = Math.max(s.resources[res] || 0, n)
    }
    E.recompute(s, d)
    ok('元婴掌握对应手艺且有材料后显示两类专藏', d.unlockedBuildings.includes('medicineVault') && d.unlockedBuildings.includes('arcaneVault'))
    for (const id of ['medicineVault', 'arcaneVault']) {
      const cost = E.buildingCost(s, id, 1)
      ok(`${BUILDING_MAP[id].name}首座费用未超过既有容量`, Object.entries(cost).every(([res, n]) => n <= d.max[res]))
      for (const [res, n] of Object.entries(cost)) s.resources[res] = n
      const before = { ...d.max }
      ok(`${BUILDING_MAP[id].name}可以实际建成`, E.buyBuilding(s, d, id, 1) === 1)
      if (id === 'medicineVault') {
        ok('药藏增加药材丹药容量并支撑终阶投料', d.max.pill - before.pill === 1000 && d.max.nineTurnPill - before.nineTurnPill === 100 && d.max.immortalHerb - before.immortalHerb === 80)
        ok('药藏不扩符器及灵机容量', d.max.artifact === before.artifact && d.max.insight === before.insight && d.max.talisman === before.talisman)
      } else {
        ok('法藏覆盖普通符器与进阶品', d.max.talisman - before.talisman === 1000 && d.max.spiritArtifact - before.spiritArtifact === 100 && d.max.spiritTreasure - before.spiritTreasure === 10)
        ok('法藏不扩丹药及原料容量', d.max.pill === before.pill && d.max.stone === before.stone)
      }
    }
    const before = { ...d.max }
    s.buildings.mansion = { count: 1, on: true }
    E.recompute(s, d)
    ok('扩人口不再顺带扩成品及灵机', d.max.pill === before.pill && d.max.insight === before.insight && d.max.qi === before.qi + 400)
    const restored = normalizeState(JSON.parse(JSON.stringify(s)))
    ok('分类仓库数量随存档保留', restored.buildings.medicineVault.count === 1 && restored.buildings.arcaneVault.count === 1)
    ok('旧石殿沿用同一个存档编号', BUILDING_MAP.depot.name === '材料库' && !BUILDING_MAP.depot.effects.storageAll)
    restored.resources.wood = 10000
    restored.buildings.lumberYard = { count: 1, on: true }
    E.recompute(restored, d)
    E.tick(restored, d, 1, { events: false })
    ok('扩仓调整后旧档超额原料不会被产出截掉', restored.resources.wood === 10000)
    E.payCost(restored, { wood: 20 })
    E.tick(restored, d, 1, { events: false })
    ok('超额原料正常消费且停止补入', restored.resources.wood === 9980)
  }
}

export function karmaStorage({ ok, close, section }) {
  section('仙缘仓储永久加成')
  {
    const { state: s, derived: d } = newGame()
    s.buildings.medicineVault = { count: 2, on: true }
    s.buildings.arcaneVault = { count: 1, on: true }
    s.upgrades.caseStackArt = true
    E.recompute(s, d)
    const initial = { ...d.max }
    ok('无仙缘时仓储倍率为1', d.karmaStorageMult === 1)
    s.karma = 202
    E.recompute(s, d)
    ok('202仙缘增加30.3%仓储', close(d.karmaStorageMult, 1.303, 1e-9))
    ok('仙缘统一放大基础、通用及专属容量，最后才整件取整', RESOURCES.filter(r => Number.isFinite(initial[r.id])).every(r => {
      const ratio = TECHNIQUES.filter((u) => s.upgrades[u.id]).reduce((sum, u) => sum + (u.effects?.storageRatio?.[r.id] || 0), 0)
      const raw = (r.baseMax + 1200 * (r.storageWeight ?? 1) + 2 * (BUILDING_MAP.medicineVault.effects.storage[r.id] || 0) + (BUILDING_MAP.arcaneVault.effects.storage[r.id] || 0)) * (1 + ratio)
      return close(d.max[r.id], r.integer ? Math.floor(raw * 1.303 + 1e-9) : raw * 1.303, 1e-8)
    }))
    ok('仙缘及道果自身容量仍为无限', d.max.karma === Infinity && d.max.dao === Infinity)
    const enlarged = { ...d.max }
    E.recompute(s, d)
    ok('重复重算不会复利放大仓储', RESOURCES.every(r => d.max[r.id] === enlarged[r.id]))
    ok('仙缘扩仓不会直接增加库存', s.resources.pill === 0 && s.resources.qi === 0)
    // 此截图使用旧版库房与石殿造价；保留历史容量回归，不绑定当前建筑价格。
    const warehouseWood = Math.ceil(200 * Math.pow(1.18, 45))
    const depotStone = Math.ceil(1500 * Math.pow(1.25, 25))
    ok('截图下一座库房从容量不足变为可支付', warehouseWood > 336000 && warehouseWood <= 336000 * d.karmaStorageMult)
    ok('历史截图石殿需求落在仙缘增加后的容量内', depotStone > 321000 && depotStone <= 321000 * d.karmaStorageMult)
    s.karma = 250
    E.recompute(s, d)
    ok('250仙缘前仓储增益不递减', close(d.karmaStorageMult, 1.375, 1e-9))
    s.karma = 500
    E.recompute(s, d)
    const high = d.karmaStorageMult
    s.karma = 100000
    E.recompute(s, d)
    ok('高仙缘继续增益但低于50%软上限', high > 1.375 && high < d.karmaStorageMult && d.karmaStorageMult < 1.5)
    s.karma = 202
    resetForReincarnation(s, 0)
    E.recompute(s, d)
    ok('转世后基础容量保留仙缘增益', s.karma === 202 && close(d.max.qi, RESOURCE_MAP.qi.baseMax * 1.303, 1e-9) && d.karmaStorageMult > 1)
  }
}

export function lateStorageReachability({ ok, section }) {
  section('高级建筑与仓储逐级自举')
  {
    const { state: s, derived: d } = newGame()
    s.realm = 5
    for (const id of ['earthArt', 'earthEssence', 'alchemyArt', 'forgeArt', 'talismanArt', 'woodworking', 'crystalTheory']) s.upgrades[id] = true
    for (const [id, count] of Object.entries({ warehouse: 5, granary: 4, workshop: 1, library: 8, alchemyRoom: 1, forge: 1, talismanHall: 1 })) s.buildings[id] = { count, on: true }
    E.recompute(s, d)
    for (const id of ['depot', 'medicineVault', 'arcaneVault', 'crystalArray']) {
      const price = E.buildingCost(s, id, 1)
      ok(`${BUILDING_MAP[id].name}首座能在自身建成前存够材料`, Object.entries(price).every(([res, amount]) => d.max[res] >= amount), JSON.stringify(price))
    }
    s.realm = 8
    s.upgrades.grottoArt = true
    s.buildings.depot = { count: 5, on: true }
    s.buildings.academy = { count: 10, on: true }
    s.buildings.observatory = { count: 2, on: true }
    E.recompute(s, d)
    ok('洞天首座由材料库和修行设施承接，不依赖自己的扩仓', Object.entries(E.buildingCost(s, 'grotto', 1)).every(([res, n]) => d.max[res] >= n))
    s.realm = 9
    s.upgrades.towerPlan = true
    s.buildings.grotto = { count: 5, on: true }
    s.buildings.arcaneVault = { count: 1, on: true }
    E.recompute(s, d)
    ok('通天塔首座可由洞天与专藏承接所有单笔用料', Object.entries(E.buildingCost(s, 'heavenTower', 1)).every(([res, n]) => d.max[res] >= n))
    s.buildings.heavenTower = { count: 1, on: true }
    E.recompute(s, d)
    ok('涨价后的第二座通天塔仍有可达的存料空间', Object.entries(E.buildingCost(s, 'heavenTower', 1)).every(([res, n]) => d.max[res] >= n))
  }
}

export function scriptureArchiveMigration({ ok, close, section }) {
  section('典籍库拆分与旧档迁移')
  {
    const fresh = createInitialState()
    fresh.buildings.library = { count: 3, on: true }
    const fd = E.createDerived()
    E.recompute(fresh, fd)
    ok('新建藏经阁只增产、不增加灵机容量', fd.max.insight === RESOURCE_MAP.insight.baseMax && close(fd.ratio.insight, 0.3))
    Object.assign(fresh.resources, { wood: 60, rock: 80 })
    ok('首座典籍库无需研究或额外灵机即可营造', E.buyBuilding(fresh, fd, 'scriptureArchive', 1) === 1 && fd.max.insight === 280 && close(fd.ratio.insight, 0.35))
    const legacy = { buildings: { library: { count: 26, on: true } }, upgrades: { oralTeaching: true, caseStackArt: true, catalogArt: true } }
    const migrated = normalizeState(legacy)
    const md = E.createDerived()
    E.recompute(migrated, md)
    ok('旧档26座藏经阁迁入26座典籍库并保留原仓容和合计产出', migrated.buildings.scriptureArchive.count === 26 && close(md.max.insight, 5605.6) && close(md.ratio.insight, 4))
    ok('移除典籍编目及旧档已学记录', !UPGRADE_MAP.catalogArt && !migrated.upgrades.catalogArt)
    E.sellBuilding(migrated, md, 'scriptureArchive', 1)
    const restored = parseImport(exportSave(migrated))
    ok('迁移标记进存档，出售后读档不重复补送典籍库', restored.scriptureArchiveVersion === 1 && restored.buildings.scriptureArchive.count === 25)
    resetForAscension(migrated, 0)
    const reset = parseImport(exportSave(migrated))
    ok('转世清空典籍库，新档不补送典籍库', !reset.buildings.scriptureArchive && !normalizeState(createInitialState()).buildings.scriptureArchive)
  }
}

export function oralTeachingStorage({ ok, close, section }) {
  section('口传心授的早期灵机仓容增益')
  {
    const { state: s, derived: d } = newGame()
    s.upgrades.qiOrigin = true
    s.buildings.library = { count: 2, on: true }
    Object.assign(s.resources, { insight: 35, wood: 400 })
    s.buildings.scriptureArchive = { count: 2, on: true }
    E.recompute(s, d)
    const capacity = d.max.insight
    const productionBonus = d.ratio.insight
    ok('口传心授正常扣费后仅放大典籍库容量，不放大基础仓容',
      E.research(s, d, 'oralTeaching') && close(d.max.insight, capacity + 64) && s.resources.insight === 0 && s.resources.wood === 0)
    ok('口传心授仍保留一成灵机产出加成', close(d.ratio.insight - productionBonus, 0.1))
    s.buildings.scriptureArchive.count = 10
    E.recompute(s, d)
    ok('十座典籍库每座只额外提供32灵机容量', close(d.max.insight, 1320))
    s.buildings.scriptureArchive.count = 2
    for (const [id, count] of [['academy', 3], ['observatory', 2], ['warehouse', 3], ['depot', 2], ['grotto', 1]]) s.buildings[id] = { count, on: true }
    s.upgrades.oralTeaching = false
    E.recompute(s, d)
    const otherCapacity = d.max.insight
    s.upgrades.oralTeaching = true
    E.recompute(s, d)
    ok('讲经堂、观星台、库房、材料库和洞天容量均不被口传放大', close(d.max.insight - otherCapacity, 64))
    s.upgrades.starReading = true
    s.upgrades.caseStackArt = true
    s.karma = 75
    s.upgrades.oralTeaching = false
    E.recompute(s, d)
    const scaledCapacity = d.max.insight
    s.upgrades.oralTeaching = true
    s.buildings.scriptureArchive.on = false
    E.recompute(s, d)
    ok('专项容量按实体数量计算，再与仙缘和全局仓容规则一致叠加',
      close(d.max.insight - scaledCapacity, 64 * d.karmaStorageMult * 1.8))
    const rows = describeEffects(UPGRADE_MAP.oralTeaching.effects)
    ok('效果提示明确指向典籍库灵机上限而非全局上限', rows.some(row => row.label === '典籍库 灵机上限' && row.value === '+40%') && !rows.some(row => row.label === '灵机 上限'))
    s.buildings = { library: { count: 2, on: true }, scriptureArchive: { count: 2, on: true } }
    s.upgrades = { qiOrigin: true, oralTeaching: true }
    s.karma = 0
    s.buildings.library.count = 2
    s.resources.insight = 500
    const restored = parseImport(exportSave(s))
    const rd = E.createDerived()
    E.recompute(restored, rd)
    ok('旧档按新加成计算仓容且保留已学资格和超仓库存',
      restored.upgrades.oralTeaching && close(rd.max.insight, 424) && restored.resources.insight === 500)
  }
}
