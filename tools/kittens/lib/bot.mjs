/** 有限操作的首转参照玩家；所有购买、加工、派工与观察走猫国自身动作。 */
import { createKittensBudget, KITTENS_BUDGET } from './budget.mjs'
export const KITTENS_STRATEGY = 'first-reset-v6-employed-food'
const technologies = ['calendar', 'agriculture', 'archery', 'mining', 'animal', 'construction', 'metal',
  'engineering', 'math', 'civil', 'currency', 'writing', 'steel', 'philosophy', 'theology', 'astronomy', 'navigation']
const upgrades = ['mineralHoes', 'mineralAxes', 'ironHoes', 'ironAxes', 'reinforcedSaw', 'steelSaw',
  'stoneBarns', 'reinforcedBarns', 'reinforcedWarehouses', 'ironwood', 'advancedRefinement', 'bolas', 'compositeBow',
  'huntingArmor', 'steelAxe', 'steelArmor', 'goldOre', 'coalFurnace', 'deepMining', 'celestialMechanics']

export function createKittensBot(runtime, options, record = () => {}) {
  const { game: g, window: w } = runtime
  const buildController = new w.classes.ui.btn.BuildingBtnModernController(g)
  const techController = new w.com.nuclearunicorn.game.ui.TechButtonController(g)
  const upgradeController = new w.com.nuclearunicorn.game.ui.UpgradeButtonController(g)
  const budget = createKittensBudget(g, options.decisionSeconds)
  let turn = 0, assignedPopulation = -1, assignedSeason = -1
  const value = id => g.resPool.get(id).value
  const count = id => g.bld.get(id).val
  const refresh = () => { g.village.updateResourceProduction(); g.updateCaches() }
  const bmodel = id => buildController.fetchModel({ building: id })
  const allowed = id => !!g.bld.get(id).unlocked
  const reachable = id => allowed(id) || g.bld.get(id).unlockable || g.bld.get(id).defaultUnlockable
  const wait = prices => prices.reduce((sum, p) => {
    const missing = Math.max(0, p.val - value(p.name))
    if (!missing) return sum
    const recipe = g.workshop.crafts.find(c => c.name === p.name)
    if (recipe && p.name !== 'wood') return sum + wait(g.workshop.getCraftPrice(recipe)
      .map(c => ({ ...c, val: c.val * missing / (1 + g.getResCraftRatio(p.name)) })))
    return sum + missing / Math.max(0.02, g.getResourcePerTick(p.name, true))
  }, 0)
  const foodReserve = () => budget.reserve('catnip')
  const coldNet = () => budget.winterNet()
  const foodNet = () => g.getResourcePerTick('catnip', true)
  // 暖季利用田地产量释放劳力，入冬及秋末再按最冷天气保障口粮。
  const seasonalNet = () => g.calendar.season === 3 || g.calendar.season === 2 && g.calendar.day > 85
    ? coldNet() : foodNet()
  function assign() {
    const population = g.village.getKittens()
    if (population === assignedPopulation && g.calendar.season === assignedSeason && turn % 12 !== 0 && seasonalNet() >= 0) return
    assignedPopulation = population; assignedSeason = g.calendar.season
    g.village.clearJobs(true)
    refresh()
    const farmer = g.village.getJob('farmer')
    if (farmer.unlocked) {
      while (g.village.getFreeKittens() && seasonalNet() < 0.3) {
        g.village.assignJob(farmer, 1); refresh()
      }
    }
    // 初期先有一名悟道者研究农业，再保木料；后期按固定权重分配。
    for (const id of ['scholar', 'miner', 'hunter', 'woodcutter']) {
      if (g.village.getFreeKittens() && g.village.getJob(id).unlocked) g.village.assignJob(g.village.getJob(id), 1)
    }
    const weights = [['woodcutter', 8], ['miner', 4], ['scholar', 1], ['hunter', 2]]
    while (g.village.getFreeKittens()) {
      const job = weights.filter(([id]) => g.village.getJob(id).unlocked)
        .sort(([a, wa], [b, wb]) => g.village.getJob(a).value / wa - g.village.getJob(b).value / wb)[0]
      if (!job) break
      g.village.assignJob(g.village.getJob(job[0]), 1)
    }
    refresh()
    // 就业会增加幸福度带来的口粮消耗，全部派工后再次保障粮食净产。
    while (farmer.unlocked && seasonalNet() < 0.3) {
      const worker = g.village.sim.kittens.find(k => k.job && k.job !== 'farmer')
      if (!worker) break
      g.village.unassignJob(worker)
      g.village.assignJob(farmer, 1)
      refresh()
    }
  }
  function buy(id) {
    const model = bmodel(id)
    if (!allowed(id) || !model.enabled || !budget.canPay(model.prices)) return false
    const before = count(id)
    const prices = model.prices.map(p => ({ ...p }))
    buildController.buyItem(model, {}, () => {})
    if (count(id) <= before) return false
    record('building', { id, count: count(id), prices }); refresh()
    return true
  }
  function expand(resource, path) {
    const candidates = (resource === 'science' ? ['library', 'academy', 'observatory']
      : resource === 'culture' ? ['amphitheatre', 'temple'] : ['barn', 'warehouse', 'harbor'])
      .filter(id => reachable(id) && !path.has(`building:${id}`))
      .map(id => ({ id, model: bmodel(id) }))
      .filter(row => (row.model.metadata.effects?.[`${resource}Max`] || 0) > 0 || row.id === 'library' && resource === 'science')
      .sort((a, b) => wait(a.model.prices) - wait(b.model.prices))
    const next = candidates[0]
    if (!next) return false
    if (prepare(next.model.prices, new Set([...path, `building:${next.id}`]))) return buy(next.id)
    return false
  }
  function prepare(prices, path = new Set()) {
    for (const p of prices) {
      const r = g.resPool.get(p.name)
      if (r.value >= p.val) continue
      if (r.maxValue > 0 && p.val > r.maxValue) { expand(p.name, path); return false }
      const craft = g.workshop.crafts.find(c => c.name === p.name && c.unlocked)
      if (!craft || path.has(p.name)) return false
      const unit = g.workshop.getCraftPrice(craft)
      if (!prepare(unit, new Set([...path, p.name]))) return false
      // 分批做料，不要求先在原料仓中装下整批投入；猫薄荷始终留下过冬口粮。
      const copies = budget.craftCopies(p.name, p.val - r.value)
      if (copies <= 0) return false
      if (!g.workshop.craft(p.name, copies)) return false
      record('craft', { id: p.name, copies }); refresh()
    }
    return g.resPool.hasRes(prices) && budget.canPay(prices)
  }
  function research(controller, meta, type) {
    if (!meta?.unlocked || meta.researched) return false
    const model = controller.fetchModel({ id: meta.name })
    if (!model.visible || !prepare(model.prices)) return false
    controller.buyItem(model, {}, () => {})
    if (!meta.researched) return false
    record(type, { id: meta.name }); refresh(); return true
  }
  function housingChoices() {
    return ['hut', 'logHouse'].filter(reachable).map(id => ({ id, model: bmodel(id) }))
      .map(row => ({ ...row, limited: row.model.prices.some(p => {
        const cap = g.resPool.get(p.name).maxValue
        return cap > 0 && p.val > cap
      }) }))
      .sort((a, b) => Number(a.limited) - Number(b.limited) || wait(a.model.prices) / (a.model.metadata.effects.maxKittens || 1)
        - wait(b.model.prices) / (b.model.metadata.effects.maxKittens || 1))
  }
  function housing() {
    // 开局保护放在动作入口，避免从后面的通用住宅计划绕过首屋条件。
    if (!count('hut') && (count('field') < 20 || value('catnip') < 2000)) return false
    // 新来的猫也要吃粮。农业开放前保持首屋，避免扩大人口后第一个冬季即饿死。
    if (g.village.getKittens() && (!g.science.get('agriculture').researched ||
      seasonalNet() < 0 || value('catnip') < foodReserve())) return false
    const choices = housingChoices()
    if (!choices.length) return false
    const { id, model } = choices[0]
    if (prepare(model.prices)) return buy(id)
    return false
  }
  function surplusCraft() {
    const plan = housingChoices().find(row => !row.limited)
    const protect = {}
    if (plan && g.getEffect('maxKittens') < options.kittens) {
      for (const p of plan.model.prices) protect[p.name] = (protect[p.name] || 0) + p.val
    }
    for (const [id, input, goal] of [['wood', 'catnip', Infinity], ['beam', 'wood', 200],
      ['slab', 'minerals', 200], ['plate', 'iron', 200], ['parchment', 'furs', 200]]) {
      const source = g.resPool.get(input)
      if (source.maxValue > 0 && source.value / source.maxValue < KITTENS_BUDGET.craftTrigger) continue
      const copies = budget.craftCopies(id, goal - value(id), { surplus: true, protect })
      if (!copies) continue
      g.workshop.craft(id, copies); record('craft', { id, copies, purpose: 'surplus' }); refresh()
      break
    }
  }
  function act() {
    turn++
    if (g.calendar.observeRemainingTime > 0) g.calendar.observeHandler()
    // 每5秒最多五次采集，只在前10分钟或即将断粮时使用。
    if (runtime.ticks / 5 < 600 || coldNet() < 0 && value('catnip') < foodReserve()) {
      for (let i = 0; i < Math.min(5, options.decisionSeconds); i++) g.bld.gatherCatnip()
    }
    assign()
    const huntBatch = g.resPool.get('manpower').maxValue * KITTENS_BUDGET.huntTrigger
    if (g.village.getJob('hunter').unlocked && value('manpower') >= Math.max(100, huntBatch)) {
      g.village.huntAll(); refresh()
    }
    if (foodNet() < 0.1 || count('field') < 20 || coldNet() < 0 && turn % 12 === 0) {
      const field = bmodel('field')
      if (g.resPool.hasRes(field.prices) && value('catnip') - field.prices[0].val >= (g.village.getKittens() ? foodReserve() : 0)) { buy('field'); return }
    }
    if (!count('hut')) {
      if (value('catnip') >= 2000 && count('field') >= 20) {
        prepare([{ name: 'wood', val: 5 }])
        housing()
      }
      return
    }
    if (count('hut') && !count('library')) {
      if (prepare(bmodel('library').prices)) buy('library')
      return
    }
    if (count('mine') && !count('workshop')) {
      if (prepare(bmodel('workshop').prices)) buy('workshop')
      return
    }
    const tech = technologies.map(id => g.science.get(id)).find(t => t.unlocked && !t.researched)
    const readyTech = tech && value('science') >= Math.min((tech.prices.find(p => p.name === 'science')?.val || 0) * 0.8, g.resPool.get('science').maxValue * 0.85)
    if (readyTech && (!g.science.get('construction').researched || turn % 12 === 0)) {
      if (research(techController, tech, 'technology')) return
    }
    // 初次置办与按人口增长的适量产能；不把永久投资或后期太空工程当首转条件。
    const n = g.village.getKittens()
    const targets = { workshop: Math.max(1, Math.ceil(n / 3)), mine: Math.max(1, n),
      lumberMill: Math.max(1, Math.ceil(n * 0.75)), smelter: Math.max(1, Math.ceil(n / 6)),
      library: Math.max(1, Math.ceil(n / 8)), pasture: Math.ceil(n / 3), aqueduct: Math.ceil(n / 4),
      amphitheatre: Math.ceil(n / 4), tradepost: Math.ceil(n / 12), academy: Math.ceil(n / 15) }
    const primary = { workshop: 'wood', mine: 'wood', lumberMill: 'wood', smelter: 'minerals',
      library: 'wood', academy: 'wood', pasture: 'catnip', aqueduct: 'catnip', amphitheatre: 'minerals', tradepost: 'gold' }
    const candidates = Object.entries(targets).filter(([id, goal]) => reachable(id) && count(id) < goal)
      .filter(([id]) => !count(id) || value(primary[id]) >= g.resPool.get(primary[id]).maxValue * KITTENS_BUDGET.buildTrigger)
      .map(([id]) => ({ id, model: bmodel(id) })).sort((a, b) => wait(a.model.prices) - wait(b.model.prices))
    const support = candidates[0]
    if (support && turn % 3 === 0 && prepare(support.model.prices) && buy(support.id)) return
    for (const id of upgrades) {
      const upgrade = g.workshop.get(id)
      // 高价后期升级不提前挤占住宅与生产线预算；基础农具及仓储优先。
      if (upgrade?.unlocked && !upgrade.researched && (['mineralHoes', 'mineralAxes', 'stoneBarns', 'reinforcedBarns', 'reinforcedWarehouses', 'ironwood', 'advancedRefinement'].includes(id)
        || g.resPool.hasRes(upgrade.prices)) && research(upgradeController, upgrade, 'upgrade')) return
    }
    if (g.getEffect('maxKittens') < options.kittens && (n >= g.getEffect('maxKittens') - 1 || turn % 6 === 0)) housing()
    else if (readyTech && turn % 12 === 0) research(techController, tech, 'technology')
    surplusCraft()
  }
  return { act, get turn() { return turn }, restoreTurn(value) { turn = value; assignedPopulation = -1 } }
}
