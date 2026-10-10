/**
 * 模拟玩家策略（供 tools/balance.mjs 与 tools/resource-audit.mjs 共用）。
 *
 * 行为设定：每 5 秒决策一次 —— 派活、参悟最便宜的条目（修真 / 技艺 / 法宝同一张表）、按「优先级 + 已有数量」打分买建筑、
 * 灵气富余就凝石、缺破境材料就专门去做、能破境就破境。
 * 目的是给出一个**稳定可复现**的参照玩家，而不是最优打法。
 */
import * as E from '../src/game/engine.js'
import { JOB_MAP } from '../src/data/jobs.js'
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
  'ironFurnace',
  // 普通石料来源：采矿场喂灵石矿/聚灵大阵/库房的矿石造价，也供「点石成灵」
  // （参照玩家必须知道它，否则建筑永远卡在矿石上）
  'quarry',
  // 天然灵石来源：与炼铁炉同一条寻脉线，排在旁边（参照玩家必须知道它，
  // 否则新建筑永远不出现在推演里 —— 实测加进去之前，10 小时曲线一字不差）
  'spiritQuarry',
  'herbGarden',
'warehouse',
  'gate',
  'gatheringArray',
  'crystalArray',
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
  'mysticVault',
  'medicineVault',
  'arcaneVault',
  'trialTower',
  'mountainArray',
  'ancestorHall',
  'beastGarden',
  'grotto',
  'caveDwelling',
  'spiritLockArray',
  'heavenTower',
  'karmaPool',
  // 第二种驱动：分灵阵烧灵气离析出灵气分子，偏极阵解离成正负灵子，湮灭炉把粒子换成灵能（灵能会逸散，所以要持续产）
  'splitArray',
  'polarizeArray',
  'annihilationFurnace',
]

/**
 * 进阶配方（把基础材料炼上去）的"按需"阈值。
 *
 * 它们吃的是硬通货（玄钢一次要 20 玄铁 + 30 灵石），所以不能见着就做 ——
 * 早先参照玩家对**所有**可用配方一律 `times: 10`，加了进阶品之后
 * 24 小时从合体期直接掉到筑基期（灵石与玄铁被抽干）。
 * 这里模拟玩家会做的事：基础材料留够才炼，成品也囤到够用就停。
 */
/**
 * 「救急」配方：把全局第一资源（灵气）换成基础材料的兑换。
 *
 * 它们开局就可用，若混进"所有可用配方一律批量制作"的循环，参照玩家会把灵气抽干
 * （实测：参悟 0 条、前 30 分钟灵木有一成时间贴顶 —— 整局被这一条配方拖垮）。
 * 所以这里按玩家会做的事处理：**只在材料见底时才用**。
 */
export const RESCUE_CRAFTS = {
  growWood: { watch: 'wood', below: 0.2 },
}

export const ADVANCED_CRAFTS = {
  // 点石成灵吃矿石：矿要留够盖房砌阵（600 起）。
  // 灵石是硬通货，囤货上限交给需求侧（craftDemand 含破境/奇观费用），cap 只做保底 ——
  // 因果池单笔要 100 万灵石，cap 低于它就会卡参照玩家（冒烟断言守着这条）。
  infuseStone: { base: 'rock', floor: 10, cap: 1000000 },
  // 灵液吃硬通货（灵气），按需炼：灵气富余才凝液，囤到上限就停
  condenseLiquid: { base: 'qi', floor: 600, cap: 360 },
  condenseCrystal: { floors: { spiritLiquid: 12, talisman: 10 }, cap: 600 },
  // 上限必须**高于游戏里的最大单笔需求**，否则参照玩家会卡在自己设的门槛上：
  // 早先玄钢上限 40、而渡劫期破境要 120，推演就永远停在 大乘期（96 小时都不动）。
  // 这条约束现在由冒烟断言守着（见「参照玩家的囤货上限」一节）。
  refineSteel: { base: 'ore', floor: 300, cap: 600 },
  growImmortalHerb: { floors: { herb: 400, spiritLiquid: 6 }, cap: 200 },
  refineNineTurnPill: { base: 'pill', floor: 160, cap: 100 },
  drawSpiritTalisman: { base: 'talisman', floor: 220, cap: 300 },
  forgeSpiritArtifact: { base: 'artifact', floor: 160, cap: 100 },
  // 组合型进阶：三种料都要留够才动手（floors 支持多料，base/floor 是单料的简写）
  forgeSpiritTreasure: {
    floors: { spiritArtifact: 65, nineTurnPill: 45, spiritTalisman: 80 },
    cap: 40,
  },
}

/** 凝石时至少留多少灵气（模拟玩家不会把灵气抽干） */
export const STONE_QI_FLOOR = 400

export function createBot(state, derived) {
  function assignJobs() {
    // 新设施只开放职位，不再自带原料。即使人口住满，也为新开放产业调配一人。
    for (const id of ['scholar', 'woodcutter', 'miner', 'herbalist', 'incenseKeeper']) {
      if (!derived.unlockedJobs.includes(id) || (state.disciples.jobs[id] || 0) > 0) continue
      if (E.idleDisciples(state) === 0) {
        const donor = Object.entries(state.disciples.jobs)
          .filter(([job, count]) => job !== 'farmer' && count > 1)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
        if (donor) E.setJob(state, derived, donor[0], donor[1] - 1)
      }
      if (E.idleDisciples(state) > 0) E.setJob(state, derived, id, 1)
    }
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

    // 剩下的按「谁最缺」分配：每次把一个人派给"存量 ÷ 上限"最低的职位，直到人手用完。
    //
    // 早先这里是"三成悟道、其余平摊"，结果在 v0.2 的世界里直接卡死：
    // 灵气与灵机各自顶格（占比接近 1），灵木却只剩 1/3840，而平摊只给樵夫 1 个人 ——
    // 灵木断供，灵石矿/炼器坊/符箓堂全都建不起来，推演 24 小时后就完全不动了。
    // 稀缺度口径与"境界/加成"无关，所以同一套策略在改动前后仍然是同一个玩家。
    const order = ['scholar', 'woodcutter', 'miner', 'herbalist', 'incenseKeeper'].filter((id) =>
      derived.unlockedJobs.includes(id),
    )
    for (let guard = 0; guard < 200 && E.idleDisciples(state) > 0; guard++) {
      let best = null
      let bestScore = Infinity
      for (const id of order) {
        const job = JOB_MAP[id]
        if (!job) continue
        const res = job.resource
        const cap = derived.max[res] || 1
        const score = (state.resources[res] || 0) / cap
        if (score < bestScore - 1e-9) {
          bestScore = score
          best = id
        }
      }
      if (!best) break
      E.setJob(state, derived, best, (state.disciples.jobs[best] || 0) + 1)
    }
  }

  // 按「优先级 + 已有数量」打分买分数最低的那座，避免把钱全砸在最便宜的上面
  function buildStep(reserveQi = 0, reserveCost = null, shortRes = [], requiredBuildings = new Map()) {
    const qiBudget = Math.max(0, (state.resources.qi || 0) - reserveQi)
    let bestId = null
    let bestScore = Infinity
    for (let idx = 0; idx < PRIORITY.length; idx++) {
      const id = PRIORITY[idx]
      if (!derived.unlockedBuildings.includes(id)) continue
      const cost = E.buildingCost(state, id, 1)
      // 攒破境前置研究期间：先别买吃这些资源的建筑，把手头那份攒够再去点研究。
      const required = E.countOf(state, id) < (requiredBuildings.get(id) || 0)
      const storageFix = shortRes.some((r) => (E.BUILDING_MAP[id]?.effects?.storage?.[r] || 0) > 0)
      if (reserveCost && !required && !storageFix && Object.keys(cost).some((k) =>
        (state.resources[k] || 0) - cost[k] < (reserveCost[k] || 0))) continue
      // 开局自举期：先伐木场、后谷仓，再攒首座采矿场 —— 避免反复扩屋把开局木料花光。
      //
      // 但这条锁必须留一个例外，否则会死锁：采矿场自己也要木材（前置还得先有谷仓），
      // 而木材又被制作目标持续吃掉；于是"没采矿场 → 不许买任何吃木材的建筑 → 永远攒不出采矿场"，
      // 人口住满、房子盖不了，推演能从 24 小时一路平到 96 小时。
      // 例外 = 人口已住满、且这座建筑正是扩屋时放行：多一个人就多一份产出，扩屋永远是划算的。
      const bootstrapLocked =
        E.countOf(state, 'hut') > 0 &&
        E.countOf(state, 'quarry') === 0 &&
        !!cost.wood &&
        id !==
          (E.countOf(state, 'lumberYard') === 0
            ? 'lumberYard'
            : E.countOf(state, 'granary') === 0
              ? 'granary'
              : 'quarry')
      if (bootstrapLocked) {
        const housingCapped = state.disciples.total >= (derived.maxDisciples || 0)
        const isHousing = (E.BUILDING_MAP[id]?.effects?.maxDisciples || 0) > 0
        if (!(housingCapped && isHousing)) continue
      }
      if ((cost.qi || 0) > qiBudget) continue
      if (!E.canAfford(state, cost)) continue
      let score = idx + E.countOf(state, id) * 0.6
      if (required) score -= 2000
      // 下一境要的资源超过当前上限时，优先盖能扩这块仓储的建筑，否则会永久卡在仓储上限。
      if (shortRes.length) {
        const st = E.BUILDING_MAP[id]?.effects?.storage
        if (st && shortRes.some((r) => (st[r] || 0) > 0)) score -= 1000
      }
      if (score < bestScore) {
        bestScore = score
        bestId = id
      }
    }
    if (!bestId) return false
    E.buyBuilding(state, derived, bestId, 1)
    return true
  }

  /**
   * 追踪下一境材料的研究、加工、生产建筑与供料前置。
   * 返回待研究 id 与必需建筑数量；循环依赖通过访问集合终止。
   */
  function breakthroughPrereqs() {
    const next = E.realmCost(state, derived, state.realm + 1)
    const buildings = new Map()
    if (!next) return { upgrades: new Set(), buildings }
    const chain = new Set()
    const resources = new Set()
    const visitNeeds = (needs) => {
      for (const dep of [...(needs?.upgrades || []), ...(needs?.upgrade ? [needs.upgrade] : [])]) visit(dep)
      for (const b of [needs?.building, ...(needs?.buildings || [])].filter(Boolean)) visitBuilding(b.id, b.count)
    }
    const visitBuilding = (id, count = 1) => {
      if (E.countOf(state, id) >= count || (buildings.get(id) || 0) >= count) return
      const b = E.BUILDING_MAP[id]
      if (!b) return
      buildings.set(id, count)
      visitNeeds(b.needs)
      for (const res of Object.keys(b.cost)) visitResource(res)
    }
    const visitResource = (res) => {
      if (resources.has(res)) return
      resources.add(res)
      const recipe = CRAFTS.find(c => c.out === res)
      if (recipe) {
        visitNeeds(recipe.needs)
        for (const input of Object.keys(recipe.cost)) visitResource(input)
      } else {
        const producer = E.BUILDINGS.find(b => (b.effects?.prod?.[res] || 0) > 0)
        if (producer) {
          visitBuilding(producer.id)
          for (const input of Object.keys(producer.upkeep || {})) visitResource(input)
        }
      }
    }
    const visit = (id) => {
      if (chain.has(id) || state.upgrades[id]) return
      const u = E.UPGRADE_MAP[id]
      if (!u) return
      chain.add(id)
      visitNeeds(u.needs)
      for (const res of Object.keys(u.cost || {})) visitResource(res)
    }
    // 金丹投资本身的材料前置也必须追踪，例如土木精要需要木板工艺。
    for (const id of ['flowField', 'earthEssence']) {
      if (derived.availableUpgrades.includes(id)) visit(id)
    }
    for (const res of Object.keys(next)) visitResource(res)
    return { upgrades: chain, buildings }
  }

  function act() {
    let craftDemand = {}
    // 金丹后按近期建筑/研究/破境需求设置加工库存目标，避免把原料无限加工。
    // 这是新目标控件允许玩家执行的策略，手动与自动制作使用同一目标。
    if (derived.craftTargetsUnlocked) {
      const demand = { ...(E.realmCost(state, derived, state.realm + 1) || {}) }
      for (const id of derived.availableUpgrades) {
        for (const [res, amount] of Object.entries(E.UPGRADE_MAP[id].cost)) demand[res] = Math.max(demand[res] || 0, amount)
      }
      for (const id of derived.unlockedBuildings) {
        for (const [res, amount] of Object.entries(E.buildingCost(state, id, 1))) demand[res] = Math.max(demand[res] || 0, amount)
      }
      craftDemand = demand
      for (const c of CRAFTS) {
        // 灵石（stone）必须在这张名单里：破境与研究都要它，而它的唯一来源就是点石成灵。
        // 早先漏了它，参照玩家于是把矿石与灵气堆到满仓、却一件灵石都不做（实测卡在筑基期/元婴期）。
        if (!['plank', 'pill', 'talisman', 'artifact', 'arrayBase', 'stone'].includes(c.out)) continue
        // 阵基的下料也是短期需求；普通成品还预留进阶配方的一份料。
        let inputDemand = 0
        for (const recipe of CRAFTS) {
          if (!derived.availableCrafts.includes(recipe.id)) continue
          const policy = ADVANCED_CRAFTS[recipe.id]
          const floor = policy?.floors?.[c.out] || (policy?.base === c.out ? policy.floor : 0)
          inputDemand = Math.max(inputDemand, recipe.cost[c.out] || 0, floor)
        }
        E.setCraftTarget(state, derived, c.id, Math.ceil(Math.max(20, demand[c.out] || 0, inputDemand) * 1.25))
      }
    }
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

    // —— 开局：手动吸气建第一间茅屋，弟子随后采木、采石 ——
    if (E.countOf(state, 'hut') === 0) {
      const fieldCost = E.BUILDING_MAP.spiritField.cost.qi
      const hutCost = E.BUILDING_MAP.hut.cost.qi
      const target = E.countOf(state, 'spiritField') === 0 ? fieldCost : hutCost
      for (let i = 0; i < 12 && state.resources.qi < target; i++) E.drawQi(state, derived)
      E.recompute(state, derived)
    }

    assignJobs()

    // 破境相关的「优先研究」两类：①链上前置（凝液法…）②补仓储上限（storageRatio 那类）。
    // 若暂时买不起，就进入「攒料」状态（暂停吃这些资源的建筑与配方），先把料攒够。
    const { upgrades: prereq, buildings: requiredBuildings } = breakthroughPrereqs()
    if (state.upgrades.earthEssence && E.countOf(state, 'depot') === 0) {
      requiredBuildings.set('warehouse', E.BUILDING_MAP.depot.needs.building.count)
      requiredBuildings.set('depot', 1)
    }
    const nextNeed = E.realmCost(state, derived, state.realm + 1) || {}
    const shortRes = Object.keys(nextNeed).filter((r) => (derived.max[r] || 0) < nextNeed[r])
    const storageFixIds = new Set(
      derived.availableUpgrades.filter((id) => {
        const sr = E.UPGRADE_MAP[id]?.effects?.storageRatio
        return !!sr && shortRes.some((r) => (sr[r] || 0) > 0)
      }),
    )
    let reserveCost = null
    const investmentOrder = [...new Set(['flowField', 'earthEssence', ...derived.availableUpgrades])]
      .filter(id => derived.availableUpgrades.includes(id))
    for (const id of investmentOrder) {
      if (!prereq.has(id) && !storageFixIds.has(id)) continue
      const u = E.UPGRADE_MAP[id]
      // 仓容不足时先扩仓；不能一边攒永远装不下的费用，一边禁止买仓库。
      if (u && Object.entries(u.cost).every(([r, v]) => v <= derived.max[r]) && !E.canAfford(state, u.cost)) {
        reserveCost = u.cost
        break
      }
    }
    // 必需设施也要攒首座费用；否则持续买普通建筑会把灵石等用料花光。
    if (!reserveCost) {
      for (const [id, count] of requiredBuildings) {
        const b = E.BUILDING_MAP[id]
        if (E.countOf(state, id) >= count || !E.checkNeeds(state, b.needs)) continue
        const cost = E.buildingCost(state, id, 1)
        if (Object.entries(cost).every(([r, v]) => v <= derived.max[r]) && !E.canAfford(state, cost)) {
          reserveCost = cost
          break
        }
      }
    }
    // 下一境仓容不足时先攒扩仓建筑的用料，避免木材一直被加工成木板。
    if (!reserveCost && shortRes.length) {
      const expansion = E.BUILDINGS.filter(b => E.checkNeeds(state, b.needs) &&
        shortRes.some(r => (b.effects?.storage?.[r] || 0) > 0 || (b.effects?.storageAll || 0) > 0))
        .map(b => E.buildingCost(state, b.id, 1))
        .filter(cost => Object.entries(cost).every(([r, v]) => v <= derived.max[r]))
        .sort((a, b) => Object.values(a).reduce((sum, v) => sum + v, 0) - Object.values(b).reduce((sum, v) => sum + v, 0))[0]
      if (expansion && !E.canAfford(state, expansion)) reserveCost = expansion
    }
    // 材料只差少数几项时攒一次完整破境费用，并预留缺失加工品的一份投入。
    // 金丹以前仅由加工品触发，以免开局攒基础资源时把自举建筑一起停掉。
    if (!reserveCost) {
      const PRIMARY = new Set(['qi', 'wood', 'rock', 'stone', 'herb', 'ore', 'insight', 'faith'])
      const need = E.realmCost(state, derived, state.realm + 1) || {}
      const missing = Object.entries(need).filter(([r, v]) => (state.resources[r] || 0) < v)
      const craftedMissing = missing.filter(([r]) => !PRIMARY.has(r))
      if (missing.length > 0 && missing.length <= 3 && (craftedMissing.length > 0 || state.realm >= 4)) {
        const reserve = Object.fromEntries(Object.entries(need).filter(([r, v]) => v <= derived.max[r]))
        for (const [r, v] of craftedMissing) {
          if (v > derived.max[r]) continue
          reserve[r] = v
          for (const recipe of CRAFTS) {
            if (recipe.out !== r || !E.isCraftUnlocked(state, recipe)) continue
            for (const [k, val] of Object.entries(recipe.cost)) reserve[k] = Math.max(reserve[k] || 0, val)
          }
        }
        if (Object.keys(reserve).length) reserveCost = reserve
      }
    }

    // 参悟「最快能凑齐」的那条（修真与技艺·法宝两层合并的口径，所以要用 ALL_UPGRADES 查表）。
    // 注意不能按某一两种资源的数值排序 —— 技艺层不再吃灵机之后，
    // 「按灵机排序」会把所有技艺排在修真前面，机器人就永远不去点修真了（实测 8 小时卡在炼气期）。
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
      // 并列时不能退化成「数组顺序」—— 否则改一次数据顺序，推演结果就跟着变
    // （实测：只把修真表按五段重排，12 小时弟子就从 42 变成 70）。
    // 所以并列时用「总花费 → id」做稳定的第二、第三关键字，让参照玩家与数据顺序无关。
    .sort((a, b) => {
      const d = waitOf(a) - waitOf(b)
      if (Math.abs(d) > 1e-9) return d
      const cost = (u) => Object.values(u.cost || {}).reduce((s, v) => s + v, 0)
      const dc = cost(a) - cost(b)
      if (Math.abs(dc) > 1e-9) return dc
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    if (ups.length) {
      // 优先：破境链上的前置研究、以及补仓储上限的研究；其余仍只点队首那条以免过度参悟。
      const u =
        ups.find((x) => x.id === 'flowField' && E.canAfford(state, x.cost)) ||
        ups.find((x) => x.id === 'earthEssence' && E.canAfford(state, x.cost)) ||
        ups.find((x) => prereq.has(x.id) && E.canAfford(state, x.cost)) ||
        ups.find((x) => storageFixIds.has(x.id) && E.canAfford(state, x.cost)) ||
        ups[0]
      const spendsReserve = reserveCost && !prereq.has(u.id) && !storageFixIds.has(u.id) &&
        Object.entries(u.cost).some(([r, v]) => (state.resources[r] || 0) - v < (reserveCost[r] || 0))
      if (!spendsReserve && E.canAfford(state, u.cost)) E.research(state, derived, u.id)
    }

    buildStep(0, reserveCost, shortRes, requiredBuildings)

    const blocksCraft = (c) => reserveCost && Object.keys(c.cost).some((k) =>
      (reserveCost[k] || 0) > 0) && !((reserveCost[c.out] || 0) > (state.resources[c.out] || 0))

    // 制作（灵石留一点灵气余量，别把阵徒的口粮也花掉）
    for (const c of CRAFTS) {
      if (!derived.availableCrafts.includes(c.id)) continue
      // 攒破境前置期间：跳过会吃掉这些资源的配方（但它本身若产的就是要攒的资源，则放行）。
      if (blocksCraft(c)) continue
      const target = E.craftTarget(state, derived, c.id)
      if (target > 0 && (state.resources[c.out] || 0) >= target) continue
      if (c.id === 'infuseStone' && state.resources.qi < STONE_QI_FLOOR) continue
      const rescue = RESCUE_CRAFTS[c.id]
      if (rescue) {
        // 只在「看的那个资源」低于上限的两成时才催生一次
        const cap = derived.max[rescue.watch] || 0
        if ((state.resources[rescue.watch] || 0) > cap * rescue.below) continue
        if (E.canAfford(state, c.cost)) E.craft(state, derived, c.id, { times: 1 })
        continue
      }
      const adv = ADVANCED_CRAFTS[c.id]
      if (adv) {
        // 进阶品按需炼：料要留够（单料 base/floor，多料 floors），成品囤够就停（一次一份）
        const floors = adv.floors || { [adv.base]: adv.floor }
        let enough = true
        for (const [res, need] of Object.entries(floors)) {
          if ((state.resources[res] || 0) < need) enough = false
        }
        if (!enough) continue
        const cap = Math.min(derived.max[c.out], Math.max(adv.cap, craftDemand[c.out] || 0))
        if ((state.resources[c.out] || 0) >= cap) continue
        if (E.canAfford(state, c.cost)) E.craft(state, derived, c.id, { times: 1 })
        continue
      }
      if (E.canAfford(state, c.cost)) {
        const needed = target > 0 ? Math.ceil((target - (state.resources[c.out] || 0)) / E.craftYield(derived, c)) : 10
        E.craft(state, derived, c.id, { times: Math.min(10, needed) })
      }
    }

    // 参悟《心有灵犀》之后，把配方都挂上「自动」——
    // 它按每份耗时一份一份地做，材料不够就先歇着，正好是玩家会做的事
    if (derived.autoCraftUnlocked) {
      state.settings.autoCraftOn = true
      // 住满又买不起下一座居所时，先别把灵木全加工掉 —— 真人会停一下加工、先把房盖上。
      //
      // v0.2 的中段就卡在这：木屋 4/5（精舍的前置是 logHouse ≥ 5），第 5 座要约 1730 灵木，
      // 而灵木 +24/秒的富余每一跳都被自动制作换成了木板/符箓 —— 永远攒不出来，
      // 于是 24 到 72 小时一直停在"住满 44 人"。
      const housingCapped = state.disciples.total >= (derived.maxDisciples || 0)
      const homeCandidates = ['hut', 'logHouse', 'mansion', 'caveDwelling']
        .filter((id) => derived.unlockedBuildings.includes(id))
        .map((id) => ({ id, cost: E.buildingCost(state, id, 1) }))
        .filter((x) => (x.cost.wood || 0) > 0)
        .sort((x, y) => x.cost.wood - y.cost.wood)
      const savingForHome =
        housingCapped && homeCandidates.length > 0 && (state.resources.wood || 0) < homeCandidates[0].cost.wood
      const RESERVE_HOUSING = ['sawPlank', 'drawTalisman', 'assembleArrayBase']
      for (const c of CRAFTS) {
        if (ADVANCED_CRAFTS[c.id]) {
          state.autoCraft[c.id] = false // 进阶配方按需手动制作，不能绕过库存与预留规则
          continue
        }
        state.autoCraft[c.id] = derived.availableCrafts.includes(c.id) &&
          !blocksCraft(c) && !(savingForHome && RESERVE_HOUSING.includes(c.id))
      }
    }

    if (E.breakthrough(state, derived)) assignJobs()
  }

  return { act, assignJobs, buildStep }
}
