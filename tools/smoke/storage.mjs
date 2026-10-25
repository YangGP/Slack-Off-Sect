import { createInitialState, normalizeState, resetForAscension, resetForReincarnation } from '../../src/game/state.js'
import { ADVANCED_CRAFTS } from '../player-bot.mjs'
import * as E from '../engine-fixture.mjs'
import { RESOURCES, RESOURCE_MAP, UNCAPPED_CRAFTED_RESOURCES } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { ALL_UPGRADES, UPGRADE_MAP } from '../../src/data/upgrades.js'
import { TECHNIQUES } from '../../src/data/techniques.js'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { REALMS } from '../../src/data/realms.js'
import { exportSave, parseImport } from '../../src/game/save.js'
import { describeEffects } from '../../src/game/effectsText.js'
import { newGame } from './fixtures.mjs'
import { autoCraftReserve } from '../../src/game/systems/craftingRules.js'
import { discipleFactor, recruitCost } from '../../src/data/disciples.js'
import { effectiveBuildingStorage } from '../../src/game/systems/economy.js'
import { progressionDiagnostics } from '../progression-diagnostics.mjs'

export function warehouseConsolidation({ ok, section }) {
  section('四类仓储、工艺强化与旧档合并')
  ok('仓储目录仅保留四类', BUILDINGS.filter(b => b.group === 'store').map(b => b.id).sort().join(',') === 'arcaneVault,granary,grotto,warehouse')
  const { state: s, derived: d } = newGame()
  s.buildings.warehouse = { count: 2, on: true }
  s.buildings.granary = { count: 1, on: true }
  E.recompute(s, d)
  const before = d.max.wood, qi = d.max.qi, insight = d.max.insight
  s.upgrades.earthEssence = true
  E.recompute(s, d)
  ok('土木精要按库房数量强化原料，不放大基础仓容或灵机', d.max.wood.eq(before.plus(3000)) && d.max.qi.eq(qi) && d.max.insight.eq(insight))
  s.realm = 7
  for (const [id, amount] of Object.entries(BUILDING_MAP.grotto.cost)) { s.resources[id] = E.money(amount); s.peak[id] = E.money(amount) }
  ok('炼虚洞天不依赖合体工艺或玄金即可真实建造', !s.upgrades.grottoArt && E.isBuildingUnlocked(s, 'grotto') && E.buyBuilding(s, d, 'grotto') === 1)
  const space = d.max.immortalForce
  const diagnostic = progressionDiagnostics(s, d, { cost: { wood: E.money('1e12') } }).missing.find(row => row.resource === 'wood')
  ok('采购诊断使用工艺强化后的新建容量', diagnostic.expansions.find(row => row.id === 'warehouse').gain === 2500)
  s.upgrades.grottoArt = true
  E.recompute(s, d)
  ok('洞天福地强化已建空间容量', d.max.immortalForce.gt(space) && UPGRADE_MAP.grottoArt.effects.buildingStorageRatio.grotto === 0.6)

  const old = createInitialState()
  delete old.warehouseMergeVersion
  old.buildings = Object.fromEntries(['warehouse', 'materialYard', 'depot', 'mysticVault', 'medicineVault', 'grandStore', 'grotto'].map(id => [id, { count: 1, on: true }]))
  old.legacyWarehouseCounts = { depot: 1, mysticVault: 1 }
  const original = JSON.stringify(old)
  const merged = normalizeState(old)
  ok('合并实体数量且不修改输入、不赠研究', merged.buildings.warehouse.count === 5 && merged.buildings.grotto.count === 2 && !merged.buildings.depot && JSON.stringify(old) === original && !merged.upgrades.earthEssence)
  const raw = effectiveBuildingStorage(merged, 'warehouse')
  ok('旧材料库与玄库历史扩仓权益一并保留', raw.wood.gte(26400) && raw.qi.gte(15000) && raw.herb.gte(14700))
  const strengthened = effectiveBuildingStorage(merged, 'warehouse', 5)
  ok('旧权益作为容量下限，不随新工艺重复叠乘', strengthened.wood.gte(raw.wood) && strengthened.wood.lt(raw.wood.times(5)) && strengthened.qi.eq(raw.qi))
  const spaceRaw = effectiveBuildingStorage(merged, 'grotto')
  ok('旧广储库与洞天的通用仓储折算不丢失', spaceRaw.insight.gte(43000) && spaceRaw.immortalForce.gte(40000) && spaceRaw.beastHide.gte(16000))
  const again = parseImport(exportSave(normalizeState(merged)))
  ok('保存读回不重复合并，金额与保留数量不变', again.buildings.warehouse.count === 5 && effectiveBuildingStorage(again, 'warehouse').wood.eq(raw.wood) && again.legacyStorage.warehouse.count === 5)
  const converted = normalizeState({ buildings: { grandStore: { count: 1, on: true } } })
  ok('旧广储库转入洞天默认不额外消耗供能', converted.buildings.grotto.count === 1 && !converted.buildings.grotto.on)
  for (const id of Object.keys(again.resources)) again.resources[id] = E.money('1e20')
  const ad = E.createDerived()
  E.recompute(again, ad)
  E.sellBuilding(again, ad, 'warehouse', 5)
  again.upgrades.quarryArt = true
  E.buyBuilding(again, ad, 'warehouse')
  ok('拆除后重建不恢复旧仓容量权益', !again.legacyStorage.warehouse && effectiveBuildingStorage(again, 'warehouse').wood.eq(1000) && !effectiveBuildingStorage(again, 'warehouse').qi)
  resetForReincarnation(merged, E.ZERO)
  ok('轮回清空本世仓储保留权益', !Object.keys(merged.legacyStorage).length && !Object.keys(merged.buildings).length)
}

export function uncappedCrafting({ ok, close, section }) {
  section('转世生产、无限加工库存与旧档保留')
  const { state: s, derived: d } = newGame()
  s.realm = 10
  s.karma = E.money(100)
  E.recompute(s, d)
  ok('26种稳定加工品无仓容，原料、猎物与粒子仍有限', UNCAPPED_CRAFTED_RESOURCES.size === 26 &&
    [...UNCAPPED_CRAFTED_RESOURCES].every(id => !d.max[id].isFinite()) &&
    ['qi', 'insight', 'faith', 'wood', 'stone', 'beastHide', 'qiParticle', 'qiEnergy', 'immortalForce', 'warrant'].every(id => d.max[id].isFinite()))
  ok('100仙缘生产2倍、有限仓储1.05倍，信符独立', d.karmaMult.eq(2) && d.karmaStorageMult.eq('1.05') && d.max.warrant.eq(100))
  ok('渡劫全局境界5.5倍，个人系数仍10倍', d.realmProductionMult === 5.5 && discipleFactor({ realm: 10 }, 10) === 10)
  s.faithProgression.cultivation.realmDevotion = 10
  E.recompute(s, d)
  ok('万民归心强化削减后的奖励，口粮基准不叠加修持', d.realmProductionMult === 10 && d.realmBaseProductionMult === 5.5)
  ok('招募按削减后的口粮基准报价', E.moneyEq(recruitCost({ qi: 100 }, 10).qi, 550))
  s.dao = E.money(1)
  s.settings.craftReservePercent = 20
  s.settings.craftReserves.plank = E.money(7)
  E.recompute(s, d)
  ok('无限仓容不产生NaN或无限保留，有限原料仍按比例', autoCraftReserve(s, d, 'plank').eq(7) && autoCraftReserve(s, d, 'wood').eq(d.max.wood.times(0.2)))
  s.settings.craftReservePercent = 0
  ok('零比例乘无限仓容仍是有限定额', autoCraftReserve(s, d, 'plank').eq(7))
  s.upgrades.woodworking = true
  s.resources.wood = E.money(1000)
  s.resources.plank = E.money('1e30')
  E.recompute(s, d)
  const available = E.maxCraftableMoney(s, d, 'sawPlank')
  ok('无限成品仓仍由有限原料约束完整份数', available.isFinite() && available.gt(0))
  E.craftBatch(s, d, 'sawPlank', 1)
  ok('超大加工品库存可继续制作且库存始终有限', s.resources.plank.gt('1e30') && Object.values(s.resources).every(v => v.isFinite() && !v.isNegative()))

  delete s.uncappedCraftVersion
  s.settings.craftReservePercent = 20
  s.resources.plank = E.money(40)
  s.settings.craftReserves.plank = E.money(50)
  s.resources.steel = E.money(12)
  const old = normalizeState(s)
  ok('旧档保守保留库存和较高定额，保留原设置输入', old.settings.craftReserves.plank.eq(50) && old.settings.craftReserves.steel.eq(12) && !s.settings.craftReserves.steel)
  old.resources.steel = E.money(20)
  const restored = parseImport(exportSave(old))
  ok('迁移标记随保存恢复，不反复抬高保留量', restored.uncappedCraftVersion === 1 && restored.settings.craftReserves.steel.eq(12) && restored.resources.steel.eq(20))

  const { state: early, derived: ed } = newGame()
  early.upgrades.condenseArt = early.upgrades.qiLiquid = true
  early.buildings.granary = { count: 10, on: true }
  E.recompute(early, ed)
  early.resources.qi = ed.max.qi
  early.settings.craftReserves.qi = ed.max.qi
  ok('仅凝灵诀时可设目标且尊重定额保留', ed.autoCondenseLiquidUnlocked && !ed.autoCraftUnlocked &&
    E.setCraftTarget(early, ed, 'condenseLiquid', 2) && !E.runAutoCondense(early, ed) && early.resources.qi.eq(ed.max.qi))
  early.settings.craftReserves.qi = E.ZERO
  const batch = E.cloneRuntime(early), bd = E.createDerived()
  E.recompute(batch, bd)
  E.runAutoCondense(early, ed)
  E.runAutoCondenseBatch(batch, bd, 0, 360, 1080)
  ok('无仓容凝液在线与离线批量都按有限目标停止', early.resources.spiritLiquid.eq(2) && batch.resources.spiritLiquid.eq(2) && early.resources.qi.eq(batch.resources.qi))
}

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
        let cap = RESOURCE_MAP.wood.baseMax + wh.effects.storage.wood
        for (let n = 1; n < 5; n++) {
          const need = wh.cost.wood * Math.pow(wh.priceRatio, n)
          if (need > cap) return false
          cap += wh.effects.storage.wood
        }
        return true
      })(),
    )
  }
}

export function storageAndRefinement({ ok, close, section }) {
  section('分层仓储、点击与进阶祭炼')
  {
    const { state: s, derived: d } = newGame()
    s.buildings.mansion = { count: 6, on: true }
    s.buildings.warehouse = { count: 2, on: true }
    s.upgrades.caseStackArt = true
    E.recompute(s, d)
    ok('基础物资通用扩仓仍全额计入', E.moneyEq(d.max.wood,
      E.money(RESOURCE_MAP.wood.baseMax).plus(6 * 200).plus(4 * BUILDING_MAP.warehouse.effects.storage.wood).plus(1200)))
    ok('稳定加工品不受仓容约束', ['plank', 'arrayBase', 'spiritArtifact', 'spiritTreasure'].every(id => !d.max[id].isFinite()))
    const pillBefore = d.max.pill
    s.buildings.alchemyRoom = { count: 1, on: true }
    E.recompute(s, d)
    ok('专属成品仓储不被通用折算削弱', E.moneyEq(d.max.pill, pillBefore))
    ok('资源目录不再标记强制整数', RESOURCES.every(r => !Object.hasOwn(r, 'integer')))
    const old = normalizeState({ ...s, resources: { ...s.resources, nineTurnPill: E.money(1000) } })
    E.recompute(old, d)
    E.addResource(old, 'nineTurnPill', 10, d.max.nineTurnPill)
    ok('旧档加工品保留库存且可继续累积', E.moneyEq(old.resources.nineTurnPill, 1010))
    E.payCost(old, { nineTurnPill: 3 })
    E.tick(old, d, 1, { events: false })
    ok('旧档超额成品可正常消费', E.moneyEq(old.resources.nineTurnPill, 1007))
    s.buildings.spiritField = { count: 5, on: true }
    ok('五座聚灵阵点击收益按每秒基础产出线性叠加（4.0）', close(E.clickGain(s, d), 2.5 + 5 * E.BUILDING_MAP.spiritField.effects.prod.qi, 1e-9))
    s.buildings.spiritField.count = 45
    ok('多聚灵阵点击收益继续线性叠加（16）', close(E.clickGain(s, d), 2.5 + 45 * E.BUILDING_MAP.spiritField.effects.prod.qi, 1e-9))
    s.upgrades.flyingSword = true
    s.treasureLevels.flyingSword = 1
    ok('低层祭炼不要求尚未需要的进阶材料', E.moneyIsZero(E.refineCost(s, 'flyingSword').spiritArtifact))
    s.treasureLevels.flyingSword = 2
    const first = E.refineCost(s, 'flyingSword')
    ok('进阶祭炼开始支付灵器与玄钢', E.moneyEq(first.spiritArtifact, 1) && E.moneyEq(first.steel, 2))
    for (const [res, amount] of Object.entries(first)) s.resources[res] = amount
    const denied = { ...s.resources }
    s.resources.spiritArtifact = E.money(0)
    ok('缺进阶材料不能祭炼', E.refineTreasure(s, d, 'flyingSword') === 0 && s.treasureLevels.flyingSword === 2)
    s.resources.spiritArtifact = denied.spiritArtifact
    E.refineTreasure(s, d, 'flyingSword')
    ok('祭炼实际扣除进阶材料并提升层数', E.moneyIsZero(s.resources.spiritArtifact) && E.moneyIsZero(s.resources.steel) && s.treasureLevels.flyingSword === 3)
    ok('进阶用料随层数增长并保留小数', E.moneyEq(E.refineCost(s, 'flyingSword').spiritArtifact, '1.7'))
    ok('仙草增加可重复消费去向', UPGRADE_MAP.alchemyCauldron.refine.materials.immortalHerb > 0)
  }
}
