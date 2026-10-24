import assert from 'node:assert/strict'
import { createKittensRuntime } from './lib/runtime.mjs'
import { createKittensBudget } from './lib/budget.mjs'
import { createKittensBot } from './lib/bot.mjs'

const runtime = createKittensRuntime('cat-zh-master', 12345)
try {
  const { game: g, window: w } = runtime
  assert.equal(g.village.getKittens(), 0)
  assert.ok(g.resPool.resources.every(r => r.value === 0))
  assert.equal(g.ticksPerSecond, 5)
  assert.equal(g.getResetPrestige().paragonPoints, 0)
  const controller = new w.classes.ui.btn.BuildingBtnModernController(g)
  const model = controller.fetchModel({ building: 'field' })
  controller.buyItem(model, {}, () => {})
  assert.equal(g.bld.get('field').val, 0)
  for (let i = 0; i < 10; i++) g.bld.gatherCatnip()
  runtime.step()
  controller.buyItem(controller.fetchModel({ building: 'field' }), {}, () => {})
  assert.equal(g.bld.get('field').val, 1)
  assert.ok(g.resPool.get('catnip').value < 1)
  for (let i = 0; i < 10; i++) runtime.step()
  assert.ok(g.resPool.get('catnip').value > 0)
  assert.ok(Math.abs(g.calendar.day - 1.1) < 1e-8)
  g.save()
  const food = g.resPool.get('catnip').value
  g.resetState()
  assert.equal(g.bld.get('field').val, 0)
  assert.notEqual(g.load(), false)
  assert.equal(g.bld.get('field').val, 1)
  assert.equal(g.resPool.get('catnip').value, food)
  runtime.step()
  assert.ok(g.resPool.get('catnip').value > food)

  // 仅验证重置结算的定向夹具，不作为自然推进或首转时间样本。
  for (let i = 0; i < 71; i++) g.village.sim.kittens.push(new w.com.nuclearunicorn.game.village.Kitten())
  g.resPool.get('kittens').value = 71
  const expected = g.getResetPrestige()
  assert.equal(expected.paragonPoints, 1)
  // 上述人口夹具也验证冬储预算；预测只能读状态，不能消耗随机数或切换真实季节。
  g.village.updateResourceProduction(); g.updateCaches()
  const budget = createKittensBudget(g)
  const calendar = { season: g.calendar.season, weather: g.calendar.weather, day: g.calendar.day }
  const random = runtime.randomState
  const forecast = budget.winterNet()
  assert.deepEqual({ season: g.calendar.season, weather: g.calendar.weather, day: g.calendar.day }, calendar)
  assert.equal(runtime.randomState, random)
  try {
    g.calendar.season = 3; g.calendar.weather = 'cold'
    assert.ok(Math.abs(forecast - g.calcResourcePerTick('catnip') - g.getResourcePerTickConvertion('catnip')) < 1e-9)
  } finally { Object.assign(g.calendar, calendar) }
  assert.ok(budget.reserve('catnip') >= -forecast * g.calendar.daysPerSeason * g.calendar.ticksPerDay)
  g.resPool.get('catnip').value = 5000
  assert.equal(budget.available('catnip'), 0, '仓容装不下冬储时不得继续提炼口粮')
  g.resPool.get('wood').value = 200
  assert.equal(budget.craftCopies('beam', 1), 1, '定向备料可使用保留库存以外的原料')
  assert.equal(budget.craftCopies('beam', 1, { surplus: true }), 0, '顺手加工限制为余量的60%')
  g.resPool.get('furs').value = budget.reserve('furs')
  assert.equal(budget.available('furs'), 0, '毛皮保留量不参与支付')
  const shop = g.bld.get('workshop'); shop.val = 2; shop.on = 2
  g.calculateAllEffects(); g.updateCaches()
  g.resPool.get('wood').value = 1000
  const beam = g.resPool.get('beam'); beam.value = 0; beam.maxValue = 1
  assert.ok(g.getResCraftRatio('beam') > 0)
  assert.equal(budget.craftCopies('beam', 1, { surplus: true }), 0, '加工加成计入剩余仓容')
  assert.equal(budget.craftCopies('beam', 1), 1, '定向备料允许最后一份在原版仓容处截断')
  // 原版幸福度会增加已就业猫的口粮消耗；先派农民再派其他岗位后须重新核对。
  g.calendar.season = 0; g.calendar.weather = null
  g.village.happiness = 1.3
  const farmer = g.village.getJob('farmer'); farmer.unlocked = true
  g.village.clearJobs(true); g.village.assignJob(farmer, 71)
  g.village.updateResourceProduction(); g.updateCaches(); g.updateResources()
  assert.ok(g.getResourcePerTick('catnip', true) > 0)
  createKittensBot(runtime, { kittens: 71, decisionSeconds: 5 }).act()
  assert.ok(g.calcResourcePerTick('catnip') + g.getResourcePerTickConvertion('catnip') >= 0.3,
    '全部派工后须覆盖就业与幸福度增加的口粮消耗')
  // 原版千年奖励可能已在第一次重置前入账，重置后必须保留。
  g.resPool.get('paragon').value = 2
  g.reset(); g.timer.updateScheduledEvents()
  const save = g._parseLSSaveData()
  assert.equal(save.resources.find(r => r.name === 'paragon').value, 3)
  assert.equal(save.game.karmaKittens, expected.karmaKittens)
  assert.equal(save.village.kittens.length, 0)
  assert.equal(save.buildings.length, 0)
  assert.equal(save.stats.find(s => s.name === 'totalResets').val, 1)
  console.log('猫国适配快速检查通过：新局、真实扣费/生产/日历、读档、冬储只读预测、库存与加工预算、重置结算；夹具不计入耗时样本。')
} finally { runtime.dispose() }
