import { CRAFT_MAP, craftTime, craftCost } from '../src/data/crafts.js'
import { PROCESSING_STATIONS, RECIPE_STATIONS } from '../src/data/industry.js'
import { UPGRADE_MAP } from '../src/data/upgrades.js'
import { createInitialState, normalizeState, resetForReincarnation } from '../src/game/state.js'
import * as Engine from '../src/game/engine.js'

export function runIndustryChecks(E = Engine,
  ok = (name, valid, extra = '') => { if (!valid) throw new Error(`${name} ${extra}`); console.log(`✓ ${name}`) },
  close = (a, b) => Math.abs(a - b) < 1e-6,
  newGame = () => ({ state: createInitialState(), derived: E.createDerived() })) {
  const setup = () => {
    const game = newGame(), s = game.state, d = game.derived
    s.realm = 5
    for (const id of ['intuition', 'woodworking', 'steelWorking', 'arrayAssembly', 'liquidArt', 'crystalCraft', 'capacityRune', 'spiritMortarArt']) s.upgrades[id] = true
    for (const id of ['forge', 'workshop', 'talismanHall', 'alchemyRoom']) s.buildings[id] = { count: 1, on: true }
    s.buildings.warehouse = { count: 10, on: true }
    Object.assign(s.resources, { wood: 10000, ore: 10000, rock: 10000, qi: 10000, stone: 1000, herb: 1000, plank: 100, spiritLiquid: 10, steel: 0, faith: 1000 })
    E.recompute(s, d)
    return game
  }
  {
    const { state: s, derived: d } = setup()
    s.autoCraft.forgeArtifact = s.autoCraft.refineSteel = true
    E.recompute(s, d)
    let plan = E.processingPlan(s, d)
    ok('同一炼器坊的两种配方平分有限容量', close(plan.forgeArtifact.work, 0.5) && close(plan.refineSteel.work, 0.5))
    E.runAutoCraft(s, d, 8)
    const work = ['forgeArtifact', 'refineSteel'].reduce((sum, id) => sum + s.craftTimers[id].made * craftTime(CRAFT_MAP[id], d) + s.craftTimers[id].t, 0)
    ok('两条产线实际完成的总工作不超过设备容量', close(work, 8))
    s.upgrades.craftTempo = true
    s.settings.autoCraftSpeeds.forgeArtifact = s.settings.autoCraftSpeeds.refineSteel = 10
    E.recompute(s, d)
    const progress = s.craftTimers.forgeArtifact.t
    ok('可正常设置加工分配权重', E.setCraftWeight(s, d, 'forgeArtifact', 3))
    plan = E.processingPlan(s, d)
    ok('容量紧张时按三比一分配', close(plan.forgeArtifact.share, 0.75) && close(plan.refineSteel.share, 0.25))
    ok('改变分配保持已完成加工进度', close(s.craftTimers.forgeArtifact.t, progress))
    const oldCapacity = d.processingCapacity.forge
    s.buildings.forge.count = 2
    E.recompute(s, d)
    ok('扩建专业设施增加共享加工容量', close(d.processingCapacity.forge, oldCapacity * 2))
    ok('非法权重与未知配方不能写入设置', [0, -1, 101, 1.5, NaN, Infinity].every(n => !E.setCraftWeight(s, d, 'forgeArtifact', n)) && !E.setCraftWeight(s, d, 'constructor', 2))
    s.craftTargets.forgeArtifact = s.resources.artifact
    if (!s.craftTargets.forgeArtifact) s.craftTargets.forgeArtifact = 1
    s.resources.artifact = s.craftTargets.forgeArtifact
    plan = E.processingPlan(s, d)
    ok('达标配方释放全部工位给仍需加工的配方', plan.forgeArtifact.work === 0 && close(plan.refineSteel.work, d.processingCapacity.forge))
    s.resources.steel = d.max.steel
    ok('成品满仓不占用加工容量且状态明确', E.processingPlan(s, d).refineSteel.work === 0 && E.autoCraftStatus(s, d, 'refineSteel').reason.includes('满仓'))
    s.resources.steel = 0
    s.resources.ore = 0
    ok('缺料产线释放容量并标明缺少的材料', E.processingPlan(s, d).refineSteel.work === 0 && E.autoCraftStatus(s, d, 'refineSteel').reason.includes('玄铁'))
    s.resources.ore = 1000
    s.settings.craftReserves.ore = 1000
    ok('材料保留会暂停工业产线', E.autoCraftStatus(s, d, 'refineSteel').reason.includes('保留材料'))
    s.settings.craftReserves.ore = 0
    s.buildings.forge.on = false
    E.recompute(s, d)
    ok('停用设备同时停止自动加工容量', d.processingCapacity.forge === 0 && !E.autoCraftStatus(s, d, 'refineSteel').ready)
    const steelBefore = s.resources.steel
    E.runAutoCraft(s, d, 100)
    ok('停机不积攒加工时间且不自动出货', s.resources.steel === steelBefore)
    ok('工位停用仍允许手动救急制作', E.craft(s, d, 'refineSteel') > 0)
    s.buildings.forge.on = true
    s.resources.wood = 0
    E.recompute(s, d)
    ok('维护断供时专业设备不能免费加工', d.processingCapacity.forge === 0)
  }
  {
    const { state: s, derived: d } = setup()
    s.autoCraft.drawTalisman = s.autoCraft.assembleArrayBase = true
    s.craftTargets.drawTalisman = 1
    E.recompute(s, d)
    const clone = normalizeState(JSON.parse(JSON.stringify(s))), cd = E.createDerived()
    E.recompute(clone, cd)
    E.runAutoCraft(s, d, 20)
    for (let i = 0; i < 200; i++) E.runAutoCraft(clone, cd, 0.1)
    ok('一条产线达标后批量与小步容量重分配一致', ['wood', 'qi', 'ore', 'plank', 'talisman', 'arrayBase'].every(id => close(s.resources[id], clone.resources[id])) && close(s.craftTimers.assembleArrayBase.t, clone.craftTimers.assembleArrayBase.t))
    const { state: online, derived: od } = setup(), { state: offline, derived: fd } = setup()
    for (const state of [online, offline]) { state.autoCraft.drawTalisman = state.autoCraft.assembleArrayBase = true; state.craftTargets.drawTalisman = 1 }
    E.recompute(online, od); E.recompute(offline, fd)
    for (let i = 0; i < 20; i++) E.tick(online, od, 1, { offline: true, events: false })
    E.simulateOffline(offline, fd, 20)
    ok('在线与离线使用相同工位和供料规则', ['wood', 'qi', 'ore', 'talisman', 'arrayBase'].every(id => close(online.resources[id], offline.resources[id])))
  }
  {
    const { state: s, derived: d } = setup()
    ok('未建晶核阵仍有基础凝聚工位可启动产线', d.processingCapacity.condensation === 1 && !s.buildings.crystalArray)
    s.autoCraft.condenseLiquid = true
    E.runAutoCraft(s, d, 3)
    ok('第一批灵液不依赖灵晶设施产物', s.craftTimers.condenseLiquid.made >= 1)
    const oldCost = craftCost(d, CRAFT_MAP.condenseLiquid).qi
    Object.assign(s.resources, UPGRADE_MAP.liquidReflux.cost)
    ok('凝液回流可以实际参悟并扣除建材', E.research(s, d, 'liquidReflux') && s.resources.insight === 0 && s.resources.steel === 0 && s.resources.arrayBase === 0)
    ok('凝液回流减少实际每份耗气', close(craftCost(d, CRAFT_MAP.condenseLiquid).qi, oldCost * 0.85))
    s.resources.qi = 1000
    const before = s.resources.qi
    E.craft(s, d, 'condenseLiquid')
    ok('手动加工按节料后的费用支付', close(before - s.resources.qi, 127.5))
    s.upgrades.crystalPolishing = true
    E.recompute(s, d)
    ok('整数原料节料向上取整，存读档不丢半件', craftCost(d, CRAFT_MAP.condenseCrystal).spiritLiquid === 3 && craftCost(d, CRAFT_MAP.condenseCrystal).qi === 240)
    s.upgrades.arrayStandards = s.upgrades.runeStamping = true
    s.autoCraft.drawTalisman = s.autoCraft.assembleArrayBase = true
    s.resources.plank = 50; s.resources.ore = 1000
    E.recompute(s, d)
    const plan = E.processingPlan(s, d)
    ok('模刻提高低阶刻纹效率，灵符不获得模刻效率', plan.drawTalisman.speed === plan.drawTalisman.work * 2 && plan.assembleArrayBase.speed === plan.assembleArrayBase.work * 2.5 && !d.craftSpeedByRecipe.drawSpiritTalisman)
    const beforeYield = E.craftYield(d, CRAFT_MAP.sawPlank)
    s.upgrades.spiritSaw = true
    E.recompute(s, d)
    ok('锯阵升级改变设备容量与耗料，不虚增单份收益', d.processingCapacity.woodwork === 2 && close(craftCost(d, CRAFT_MAP.sawPlank).wood, 148.75) && E.craftYield(d, CRAFT_MAP.sawPlank) === beforeYield)
  }
  {
    const { state: s, derived: d } = setup()
    s.upgrades.craftTempo = true
    s.settings.autoCraftSpeeds.refineSteel = 5
    s.settings.craftWeights.refineSteel = 7
    s.craftTimers.refineSteel = { t: 0.2, made: 3 }
    const legacy = JSON.parse(JSON.stringify(s)); delete legacy.industryVersion
    const loaded = normalizeState(legacy)
    ok('旧高速计时迁移保持加工完成比例', close(loaded.craftTimers.refineSteel.t, 1) && loaded.craftTimers.refineSteel.made === 3)
    ok('重复读档不会重复换算加工进度', normalizeState(loaded).craftTimers.refineSteel.t === loaded.craftTimers.refineSteel.t)
    ok('权重和既有研究库存随存档保留', loaded.settings.craftWeights.refineSteel === 7 && loaded.upgrades.steelWorking && loaded.resources.ore === s.resources.ore)
    const invalid = normalizeState({ settings: { craftWeights: { refineSteel: -1, constructor: 5, sawPlank: 2.5, drawTalisman: 3 } } })
    ok('旧档默认同权重，非法设置被过滤', Object.keys(normalizeState({}).settings.craftWeights).length === 0 && Object.keys(invalid.settings.craftWeights).length === 1)
    resetForReincarnation(loaded, 0)
    ok('转世清空本世加工进度并保留分配偏好', !Object.keys(loaded.craftTimers).length && loaded.settings.craftWeights.refineSteel === 7)
    E.recompute(loaded, d)
    ok('金丹前仍沿用原自动制作节拍', !d.industrial)
  }
  ok('所有加工配方引用有效工位', Object.values(RECIPE_STATIONS).every(id => PROCESSING_STATIONS.some(station => station.id === id)))
  {
    const { state: s, derived: d } = setup()
    s.settings.autoCraftOn = false
    const ore = s.resources.ore
    ok('专业制作提交订单而非瞬发，材料不提前冻结', E.requestCraft(s, d, 'refineSteel', 3) === 3 && s.resources.steel === 0 && s.resources.ore === ore && s.craftOrders.refineSteel.remaining === 3)
    ok('订单无需勾选自动且总开关不阻止显式投单', E.processingPlan(s, d).refineSteel.work === 1)
    E.runAutoCraft(s, d, craftTime(CRAFT_MAP.refineSteel, d) / 2)
    ok('一半加工时间不出货也不扣配方材料', s.resources.steel === 0 && s.resources.ore === ore)
    const progress = s.craftTimers.refineSteel.t
    E.manageCraftOrder(s, d, 'refineSteel', 'pause')
    E.runAutoCraft(s, d, 10)
    ok('暂停订单释放工位且保留半份进度', E.processingPlan(s, d).refineSteel.work === 0 && s.craftTimers.refineSteel.t === progress)
    E.manageCraftOrder(s, d, 'refineSteel', 'resume')
    E.runAutoCraft(s, d, craftTime(CRAFT_MAP.refineSteel, d) / 2)
    ok('恢复订单完成一份时才扣料并减少订单份数', s.craftOrders.refineSteel.remaining === 2 && close(ore - s.resources.ore, craftCost(d, CRAFT_MAP.refineSteel).ore) && s.resources.steel > 0)
    const after = s.resources.ore
    E.manageCraftOrder(s, d, 'refineSteel', 'cancel')
    ok('取消未做订单不收费，不留下待加工数量', !s.craftOrders.refineSteel && s.resources.ore === after)
    s.resources.ore = 200
    s.resources.steel = 0
    const timerBeforeManual = JSON.stringify(s.craftTimers)
    ok('专业批量点击立即扣料出货，不排单也不改变自动进度', E.craftBatch(s, d, 'refineSteel') > 0 && E.craftBatch(s, d, 'refineSteel') === 0 && s.resources.steel > 0 && !s.craftOrders.refineSteel && JSON.stringify(s.craftTimers) === timerBeforeManual)
    s.resources.ore = 200
    s.resources.steel = 0
    E.requestCraft(s, d, 'refineSteel', 2)
    ok('订单流量出现在资源账目与供料缺口中', E.resourceFlow(d, 'ore').expenseItems.some(item => item.id === 'refineSteel') && E.processingBottleneck(s, d, 'refineSteel').inputs.some(input => input.res === 'ore'))
    s.settings.craftReserves.ore = 200
    E.recompute(s, d)
    ok('显式订单也遵守材料保留量', E.processingPlan(s, d).refineSteel.work === 0)
    const loaded = normalizeState(JSON.parse(JSON.stringify(s)))
    ok('订单剩余份数与暂停状态可以保存恢复', loaded.craftOrders.refineSteel.remaining === 2 && !loaded.craftOrders.refineSteel.paused)
    const invalid = normalizeState({ craftOrders: { refineSteel: { remaining: 2, paused: true }, constructor: { remaining: 2 }, sawPlank: { remaining: Infinity }, drawTalisman: { remaining: -1 } } })
    ok('订单读档过滤未知配方与非法数量', Object.keys(invalid.craftOrders).length === 1 && invalid.craftOrders.refineSteel.paused)
    resetForReincarnation(loaded, 0)
    ok('转世清空本世订单', !Object.keys(loaded.craftOrders).length)
  }
  {
    const { state: s, derived: d } = setup()
    s.craftTargets.refineSteel = 1
    s.autoCraft.refineSteel = true
    E.requestCraft(s, d, 'refineSteel', 3)
    E.runAutoCraft(s, d, craftTime(CRAFT_MAP.refineSteel, d) * 10)
    ok('订单可以超过自动目标，结束后恢复补库目标而不双重出货', s.craftTimers.refineSteel.made === 3 && !s.craftOrders.refineSteel && E.processingPlan(s, d).refineSteel.work === 0)
    s.autoCraft.refineSteel = false
    s.resources.steel = 0
    E.requestCraft(s, d, 'refineSteel', 10)
    E.requestCraft(s, d, 'forgeArtifact', 10)
    const a = s.craftTimers.refineSteel.made
    E.runAutoCraft(s, d, 4)
    const work = (s.craftTimers.refineSteel.made - a) * craftTime(CRAFT_MAP.refineSteel, d) + s.craftTimers.refineSteel.t +
      s.craftTimers.forgeArtifact.made * craftTime(CRAFT_MAP.forgeArtifact, d) + s.craftTimers.forgeArtifact.t
    ok('两份显式订单共同遵守一座炼器坊的总容量', close(work, 4))
    const online = normalizeState(JSON.parse(JSON.stringify(s))), offline = normalizeState(JSON.parse(JSON.stringify(s)))
    const od = E.createDerived(), fd = E.createDerived()
    E.recompute(online, od); E.recompute(offline, fd)
    for (let i = 0; i < 20; i++) E.tick(online, od, 1, { events: false, offline: true })
    E.simulateOffline(offline, fd, 20)
    ok('显式订单在线与离线结果一致', ['steel', 'artifact', 'ore', 'qi'].every(id => close(online.resources[id], offline.resources[id])) && JSON.stringify(online.craftOrders) === JSON.stringify(offline.craftOrders))
  }
  {
    const { state: s, derived: d } = setup()
    s.upgrades.craftTempo = s.upgrades.energyApplication = s.upgrades.energyCore = true
    s.settings.autoCraftSpeeds.refineSteel = 10
    s.autoCraft.refineSteel = true
    s.resources.qiEnergy = 100
    E.recompute(s, d)
    const base = d.processingCapacity.forge
    ok('能设置灵能驱动，非法工位与模式拒绝写入', E.setProcessingMode(s, d, 'forge', 'energy') && !E.setProcessingMode(s, d, 'constructor', 'energy') && !E.setProcessingMode(s, d, 'forge', 'invalid'))
    let line = E.processingPlan(s, d).refineSteel
    ok('额外工位同时受基础容量、供能和冷却约束', line.boost > 0 && line.boost <= base && line.boost <= d.processingPowerCapacity && line.boost <= d.processingCoolingCapacity)
    const fuel = s.resources.qiEnergy
    const step = Math.min(0.1, craftTime(CRAFT_MAP.refineSteel, d) / line.speed / 2)
    E.runAutoCraft(s, d, step)
    ok('加工未出货时也按实际工作时间扣动力', close(fuel - s.resources.qiEnergy, line.powerDrain.qiEnergy * step) && s.craftTimers.refineSteel.made === 0)
    const clone = normalizeState(JSON.parse(JSON.stringify(s))), cd = E.createDerived()
    s.resources.qiEnergy = clone.resources.qiEnergy = 0.02
    E.recompute(s, d); E.recompute(clone, cd)
    E.runAutoCraft(s, d, 3)
    for (let i = 0; i < 30; i++) E.runAutoCraft(clone, cd, 0.1)
    ok('动力耗尽后降回普通加工，批量与小步相同', close(s.resources.qiEnergy, 0) && close(s.resources.steel, clone.resources.steel) && close(s.craftTimers.refineSteel.t, clone.craftTimers.refineSteel.t) && E.processingPlan(s, d).refineSteel.capacity === base)
    s.resources.qiEnergy = 100
    s.settings.craftReserves.qiEnergy = 100
    ok('驱动保留灵能库存', E.processingPlan(s, d).refineSteel.boost === 0)
    s.settings.craftReserves.qiEnergy = 0
    s.resources.steel = d.max.steel
    const before = s.resources.qiEnergy
    E.runAutoCraft(s, d, 2)
    ok('满仓停线不耗加工动力', s.resources.qiEnergy === before)
    s.resources.steel = 0
    s.upgradeEnabled.energyCore = false
    E.recompute(s, d)
    ok('停用灵能枢释放维持费并停止灵能加速', d.processingPowerCapacity === 0 && E.processingPlan(s, d).refineSteel.boost === 0)
    s.upgradeEnabled.energyCore = true
    s.buildings.crystalArray = { count: 1, on: true }
    E.recompute(s, d)
    const cooling = d.processingCoolingCapacity
    s.upgrades.heatExchange = true
    E.recompute(s, d)
    ok('冷凝换热提升运行中晶核阵的冷却容量', close(d.processingCoolingCapacity - cooling, 2))
    s.buildings.crystalArray.on = false
    E.recompute(s, d)
    ok('停用晶核阵停止提供主动冷却', d.processingCoolingCapacity < cooling)
    E.setProcessingMode(s, d, 'forge', 'overload')
    line = E.processingPlan(s, d).refineSteel
    const qi = s.resources.qi
    E.runAutoCraft(s, d, 0.01)
    ok('灵气超载按额外容量耗气', line.powerDrain.qi > 0 && close(qi - s.resources.qi, line.powerDrain.qi * 0.01))
    const invalid = normalizeState({ settings: { processingModes: { forge: 'energy', constructor: 'energy', alchemy: 'bad' } } })
    ok('驱动存档过滤非法值且研究未解锁时不生效', Object.keys(invalid.settings.processingModes).length === 1 && !E.setProcessingMode(invalid, E.createDerived(), 'forge', 'energy'))
    const online = normalizeState(JSON.parse(JSON.stringify(s))), offline = normalizeState(JSON.parse(JSON.stringify(s)))
    const od = E.createDerived(), fd = E.createDerived()
    E.recompute(online, od); E.recompute(offline, fd)
    for (let i = 0; i < 10; i++) E.tick(online, od, 1, { offline: true, events: false })
    E.simulateOffline(offline, fd, 10)
    ok('带动力消耗的在线与离线加工一致', ['qi', 'qiEnergy', 'ore', 'steel'].every(id => close(online.resources[id], offline.resources[id])) && close(online.craftTimers.refineSteel.t, offline.craftTimers.refineSteel.t))
    s.resources.qi = craftCost(d, CRAFT_MAP.refineSteel).qi
    E.recompute(s, d)
    ok('超载先留下单份原料，不烧掉开工所需灵气', E.processingPlan(s, d).refineSteel.boost === 0)
  }
  {
    const { state: s, derived: d } = setup()
    s.upgrades.craftTempo = s.upgrades.energyApplication = s.upgrades.energyCore = true
    s.settings.autoCraftSpeeds.refineSteel = 10
    s.settings.autoCraftOn = false
    s.resources.qiEnergy = 100
    E.recompute(s, d)
    E.requestCraft(s, d, 'refineSteel', 10)
    E.setProcessingMode(s, d, 'forge', 'energy')
    const line = E.processingPlan(s, d).refineSteel
    const fuel = s.resources.qiEnergy
    E.runAutoCraft(s, d, 0.01)
    ok('仅显式订单也按额外工作量扣灵能', line.boost > 0 && close(fuel - s.resources.qiEnergy, line.powerDrain.qiEnergy * 0.01))
    E.manageCraftOrder(s, d, 'refineSteel', 'pause')
    const pausedFuel = s.resources.qiEnergy
    E.runAutoCraft(s, d, 1)
    ok('暂停订单不耗加工动力', s.resources.qiEnergy === pausedFuel)
  }
  {
    const { state: s, derived: d } = setup()
    s.realm = 9
    s.upgrades.yinyangSplit = s.upgrades.annihilationArt = true
    s.buildings.polarizeArray = { count: 2, on: true }
    s.resources.qiParticle = 1000
    E.recompute(s, d)
    s.resources.yangParticle = d.max.yangParticle
    s.resources.yinParticle = 0
    E.recompute(s, d)
    ok('任一极满仓时双极分流暂停，不白耗灵气分子', d.buildingSupply.polarizeArray === 0 && !(d.maintenance.qiParticle > 0))
    s.buildings.annihilationFurnace = { count: 1, on: true }
    E.recompute(s, d)
    ok('满仓双极分流按湮灭炉成对消耗补料', d.buildingSupply.polarizeArray > 0 && d.buildingSupply.polarizeArray < 1 && close(d.rates.yangParticle, -d.expense.yangParticle))
    s.buildings.annihilationFurnace.on = false
    E.recompute(s, d)
    ok('下游湮灭炉停用同步停止满仓补料', d.buildingSupply.polarizeArray === 0)
  }
}
