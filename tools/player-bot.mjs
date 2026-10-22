/**
 * 模拟玩家策略（供 tools/balance.mjs 与长测脚本共用）。
 *
 * 行为设定：每 5 秒决策一次 —— 派活、参悟最便宜的条目（修真 / 技艺 / 法宝同一张表）、按「优先级 + 已有数量」打分买建筑、
 * 灵气富余就凝石、缺破境材料就专门去做、能破境就破境。
 * 目的是给出一个**稳定可复现**的参照玩家，而不是最优打法。
 */
import * as E from './engine-fixture.mjs'
import { JOB_MAP } from '../src/data/jobs.js'
import { CONFIG } from '../src/data/config.js'
import { ALL_UPGRADES, UPGRADE_MAP } from '../src/data/upgrades.js'
import { UNCAPPED_CRAFTED_RESOURCES } from '../src/data/resources.js'
import { CRAFTS, craftCost } from '../src/data/crafts.js'
import { ZERO, ceilMoney, money, moneyGt, moneyGte, moneyLt, moneyLte, moneyMax, moneyMin, moneySum } from '../src/game/decimal.js'


/** 建筑采购优先级：先居住，再产出与修行，再仓储/香火，最后奇观 */
export const PRIORITY = [
  'hut',
  'spiritField',
  'lumberYard',
  'library',
  'scriptureArchive',
  'granary',
  'logHouse',
  'ironFurnace',
  // 普通石料来源：采矿场喂灵石矿/聚灵大阵/库房的矿石造价，也供「点石成灵」
  // （参照玩家必须知道它，否则建筑永远卡在矿石上）
  'quarry',
  'workshop',
  'livingCourt',
  'communalHall',
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
  'cleansingBath',
  'quietGarden',
  'observatory',
  'mansion',
  'depot',
  'mysticVault',
  'medicineVault',
  'arcaneVault',
  'trialTower',
  'mountainArray',
  'ancestorHall',
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
  // 基础链头两环（伐木场 60 + 茅屋 60）都高过 20% 见底线（200×0.2=40）：
  // 没有樵夫的开局只能靠催生灵木自举，floor 给一个绝对保底（130 ≥ 60+60，留一口余量），
  // 让首两环攒得出来；cap 抬高后仍按 20% 见底、不再多占灵气。
  growWood: { watch: 'wood', below: 0.2, floor: 130 },
}

export const ADVANCED_CRAFTS = {
  mixSpiritMortar: { floors: {}, cap: 800 },
  reinforceSpiritMortar: { floors: {}, cap: 400 },
  refineMithril: { floors: {}, cap: 200 },
  smeltArcaneGold: { floors: {}, cap: 120 },
  fuseCrystalSilver: { floors: {}, cap: 100 },
  // 点石成灵吃矿石：矿要留够盖房砌阵（600 起）。
  // 灵石是硬通货，囤货上限交给需求侧（craftDemand 含破境/奇观费用），cap 只做保底 ——
  // 因果池单笔要 30 万灵石；保留 100 万囤货目标作为其它建设的余量（冒烟校验最大单笔需求）。
  infuseStone: { base: 'rock', floor: 10, cap: 1000000 },
  // 灵液吃硬通货（灵气），按需炼：灵气富余才凝液，囤到上限就停
  condenseLiquid: { base: 'qi', floor: 600, cap: 360 },
  condenseCrystal: { floors: { spiritLiquid: 12 }, cap: 600 },
  // 上限必须**高于游戏里的最大单笔需求**，否则参照玩家会卡在自己设的门槛上：
  // 早先玄钢上限 40、而渡劫期破境要 120，推演就永远停在 大乘期（96 小时都不动）。
  // 这条约束现在由冒烟断言守着（见「参照玩家的囤货上限」一节）。
  refineSteel: { base: 'ore', floor: 300, cap: 600 },
  growImmortalHerb: { floors: { herb: 400, spiritLiquid: 6 }, cap: 200 },
  // 二级丹：以丹药与仙草为料（见 docs/MATERIAL-RESEARCH.md §1.2），先炼它才够九转的料。
  condensePill: { floors: { pill: 25, immortalHerb: 3 }, cap: 400 },
  refineNineTurnPill: { floors: { condensePill: 25, immortalHerb: 5 }, cap: 100 },
  drawSpiritTalisman: { floors: { steel: 6, spiritLiquid: 6 }, cap: 300 },
  forgeSpiritArtifact: { base: 'artifact', floor: 160, cap: 100 },
  condenseAscensionSeal: { base: 'qiEnergy', floor: 80, cap: 350 },
  // 组合型进阶：三种料都要留够才动手（floors 支持多料，base/floor 是单料的简写）
  forgeSpiritTreasure: {
    floors: { spiritArtifact: 65, nineTurnPill: 45, spiritTalisman: 80 },
    cap: 40,
  },
}

/** 凝石时至少留多少灵气（模拟玩家不会把灵气抽干） */
export const STONE_QI_FLOOR = 400

export function createBot(state, derived, policy = {}) {
  const submitCraft = (id, times = 1) => E.craft(state, derived, id, { times })
  const realmNeed = () => {
    const cost = policy.realmCost ? policy.realmCost(state, derived) : E.realmCost(state, derived, state.realm + 1)
    const goals = policy.resourceGoals?.(state, derived)
    if (!goals) return cost
    const plan = { ...(cost || {}) }
    for (const [id, amount] of Object.entries(goals)) plan[id] = moneyMax(plan[id] ?? ZERO, amount)
    return plan
  }
  const normalHabitability = () => derived.habitability - (state.habitabilityPenalty || 0)
  const comfortFloor = () => state.disciples.total + (state.realm >= 5 ? 100 : 40)
  const comfortCeiling = () => state.disciples.total + (state.realm >= 5 ? 120 : 60)
  const comfortOnly = (meta) => Object.keys(meta.effects || {}).length > 0 &&
    Object.keys(meta.effects).every(key => ['habitability', 'habitabilityPerHousing'].includes(key))
  const wantsComfortUpgrade = (meta) => !comfortOnly(meta) || meta.effects.habitabilityPerHousing > 0 ||
    normalHabitability() + (meta.effects.habitability || 0) <= comfortCeiling()
  const wantsComfortBuilding = (meta) => !comfortOnly(meta) || normalHabitability() < comfortFloor()
  const capacityDemand = (next, upgrades, buildings) => {
    const demand = { ...next }
    const include = cost => {
      for (const [res, amount] of Object.entries(cost || {})) demand[res] = moneyMax(demand[res] ?? ZERO, amount)
    }
    for (const id of upgrades) {
      const u = E.UPGRADE_MAP[id]
      if (u && E.isUpgradeUnlocked(state, u)) include(u.cost)
    }
    for (const [id, count] of buildings) {
      const b = E.BUILDING_MAP[id]
      if (b && E.countOf(state, id) < count && E.checkNeeds(state, b.needs)) include(E.buildingCost(state, id, 1))
    }
    return demand
  }

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
    // 与境界/宜居度/加成无关，所以**同一套策略在改动前后是同一个玩家**。
    // 宜居度试行后拥挤可让岗位减半；此处保留原基准分工策略，用于观察同一参照玩家受到的影响。
    const realmUpkeepMult = Math.max(
      1e-9,
      Math.pow(derived.realmBaseProductionMult || 1, CONFIG.DISCIPLE_UPKEEP_REALM_EXP),
    )
    // 口粮是金额：除出来的仍是金额，只在最后转成人数（Number 计数）。
    const baseUpkeep = E.moneyToNumber(money(derived.upkeep).div(realmUpkeepMult))
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
        // 稀缺度 = 存量 / 仓容，两侧都是金额：必须用 Decimal 比较，原生关系运算会按字符串排序。
        const cap = derived.max[res] ?? ZERO
        const score = cap.gt(0) ? money(state.resources[res] ?? ZERO).div(cap) : ZERO
        if (best === null || score.lt(bestScore)) {
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
    const qiBudget = moneyMax(ZERO, money(state.resources.qi ?? ZERO).minus(reserveQi))
    let bestId = null
    let bestScore = Infinity
    const decisions = policy.onBuildDecision ? [] : null
    const reject = (id, reason, cost) => decisions?.push({ id, reason, cost })
    // 依赖追踪选中的设施必须可买，不能因旧的可选采购表遗漏而永久等仓容。
    const candidates = [...new Set([...PRIORITY, ...requiredBuildings.keys()])]
    for (let idx = 0; idx < candidates.length; idx++) {
      const id = candidates[idx]
      if (!derived.unlockedBuildings.includes(id)) { reject(id, 'locked'); continue }
      const cost = E.buildingCost(state, id, 1)
      const meta = E.BUILDING_MAP[id]
      // 攒破境前置研究期间：先别买吃这些资源的建筑，把手头那份攒够再去点研究。
      const required = E.countOf(state, id) < (requiredBuildings.get(id) || 0)
      // 居所是硬前置：人口已满（或还没有任何床位）时，必须允许买床位建筑，
      // 否则首屋涨价后会出现「没弟子→没灵机→不能参悟」的开局死锁。
      const housing = (meta?.effects?.maxDisciples || 0) > 0 &&
        state.disciples.total >= (derived.maxDisciples || 0)
      if (!required && !housing && !wantsComfortBuilding(meta)) { reject(id, 'comfort-target', cost); continue }
      const storageFix = shortRes.some((r) => (meta?.effects?.storage?.[r] || 0) > 0)
      if (policy.onlyBreakthrough && !required && !storageFix) {
        const support = ['hut', 'spiritField', 'lumberYard', 'library', 'granary', 'quarry'].includes(id) && E.countOf(state, id) === 0
        const comfort = comfortOnly(meta) && normalHabitability() < state.disciples.total
        if (!support && !housing && !comfort) { reject(id, 'optional-project', cost); continue }
      }
      // 床位不足时不能因为「在攒破境材料」把住房一起锁死：首屋现在要灵木，
      // 木料一旦被预留就再也买不起房，开局会永久停在无弟子状态。
      if (reserveCost && !required && !housing && !storageFix && Object.keys(cost).some((k) =>
        moneyLt(money(state.resources[k] ?? ZERO).minus(cost[k]), reserveCost[k] ?? ZERO))) { reject(id, 'reserve', cost); continue }
      // 开局自举期：按基础链的书写顺序放行 —— 伐木场 → 藏经阁 → 谷仓 → 首座采矿场，
      // 其余吃木材的建筑先等一等，避免反复扩屋把开局木料花光。
      // 藏经阁必须进链条：谷仓改挂藏经阁之后（且免研究），漏了它谷仓永远锁着，
      // 木料也就永远花不出去 —— 实测 12 小时零参悟。
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
            : E.countOf(state, 'library') === 0
              ? 'library'
              : E.countOf(state, 'granary') === 0
                ? 'granary'
                : 'quarry')
      if (bootstrapLocked) {
        const housingCapped = state.disciples.total >= (derived.maxDisciples || 0)
        const isHousing = (E.BUILDING_MAP[id]?.effects?.maxDisciples || 0) > 0
        if (!(housingCapped && isHousing)) { reject(id, 'bootstrap', cost); continue }
      }
      if (moneyGt(cost.qi ?? ZERO, qiBudget)) { reject(id, 'qi-budget', cost); continue }
      if (!E.canAfford(state, cost)) { reject(id, 'materials', cost); continue }
      let score = idx + E.countOf(state, id) * 0.6
      if (comfortOnly(E.BUILDING_MAP[id]) && normalHabitability() < comfortFloor()) score -= 500
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
      decisions?.push({ id, reason: 'eligible', cost, score, required, housing, storageFix })
    }
    policy.onBuildDecision?.({ candidates: decisions, selected: bestId, reserveCost, shortRes })
    if (!bestId) return false
    const cost = E.buildingCost(state, bestId, 1)
    const bought = E.buyBuilding(state, derived, bestId, 1)
    policy.onBuildResult?.({ id: bestId, cost, bought })
    return true
  }

  /**
   * 追踪下一境材料的研究、加工、生产建筑与供料前置。
   * 返回待研究 id 与必需建筑数量；循环依赖通过访问集合终止。
   */
  function breakthroughPrereqs() {
    const next = realmNeed()
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
        } else {
          // 香火、灵机等由弟子生产，不能只追踪 effects.prod 的建筑。
          const job = E.JOBS.find(j => j.resource === res || j.additionalOutputs?.some(o => o.resource === res))
          if (job) {
            visitNeeds(job.needs)
            if (job.building) visitBuilding(job.building)
            const output = job.additionalOutputs?.find(o => o.resource === res)
            if (output?.upgrade) visit(output.upgrade)
            if (output?.building) visitBuilding(output.building)
          }
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
      if (policy.onlyBreakthrough) continue
      if (derived.availableUpgrades.includes(id)) visit(id)
    }
    for (const id of policy.upgrades?.(state, derived) || []) visit(id)
    for (const res of Object.keys(next)) visitResource(res)
    // 专项审计可主动投资当前阶段的设施；仍走真实研究、材料和建设动作。
    for (const project of policy.projects?.(state, derived) || []) {
      if (typeof project === 'string') visitBuilding(project)
      else visitBuilding(project.id, project.count)
    }
    // 土木精要可在低境界掌握；建库前仍须追踪玄钢及其研究用法器。
    if (!policy.onlyBreakthrough && state.upgrades.earthEssence && E.countOf(state, 'depot') === 0) visitBuilding('depot')
    // 扩仓设施的建材也属于破境前置，不能只追踪破境配方。
    // 药藏改用混灵土后，忽略这条链会让机器人一直攒丹药却不研究建材。
    const canOpenForCapacity = (needs, res, path = new Set()) => {
      if ((needs?.realm || 0) > state.realm) return false
      for (const id of [...(needs?.upgrades || []), ...(needs?.upgrade ? [needs.upgrade] : [])]) {
        if (state.upgrades[id]) continue
        const u = E.UPGRADE_MAP[id]
        if (!u || path.has(id) || moneyGt(u.cost?.[res] ?? ZERO, derived.max[res] ?? ZERO)) return false
        if (!canOpenForCapacity(u.needs, res, new Set([...path, id]))) return false
      }
      for (const requirement of [needs?.building, ...(needs?.buildings || [])].filter(Boolean)) {
        if (E.countOf(state, requirement.id) >= requirement.count) continue
        const b = E.BUILDING_MAP[requirement.id]
        const key = `building:${requirement.id}`
        if (!b || path.has(key) || moneyGt(E.buildingCost(state, b.id, 1)[res] ?? ZERO, derived.max[res] ?? ZERO)) return false
        if (!canOpenForCapacity(b.needs, res, new Set([...path, key]))) return false
      }
      return true
    }
    for (const [res, amount] of Object.entries(capacityDemand(next, chain, buildings))) {
      if (moneyLte(amount, derived.max[res] ?? ZERO)) continue
      const expansion = E.BUILDINGS.filter(b => (b.needs?.realm == null || b.needs.realm <= state.realm) &&
        ((b.effects?.storage?.[res] || 0) > 0 || (b.effects?.storageAll || 0) > 0))
        .map(b => ({ id: b.id, cost: E.buildingCost(state, b.id, 1) }))
        // 优先选择前置能由当前目标仓容承接的设施，避免研究自锁；
        // 同时允许学习可支付的前置，不能永远堆典籍库而不开放讲经堂。
        // 目标仓库的建材若超仓，也必须追踪：capacityDemand会把它暴露为下一层扩仓需求。
        .sort((a, b) => Number(canOpenForCapacity(E.BUILDING_MAP[b.id].needs, res)) - Number(canOpenForCapacity(E.BUILDING_MAP[a.id].needs, res)) ||
          E.moneySum(Object.values(a.cost)).cmp(E.moneySum(Object.values(b.cost))))[0]
      if (expansion) visitBuilding(expansion.id, E.countOf(state, expansion.id) + 1)
    }
    return { upgrades: chain, buildings }
  }

  function act() {
    // 4.4：秘银是凝晶催化剂。参考玩家在缺秘银时先解锁外交，再用富余玄铁／灵石去银溪谷换。
    // 只换到够用即止，避免把建屋与炼器的玄铁掏空。
    if (state.realm >= 5) {
      const contact = UPGRADE_MAP.neighborContacts
      if (!state.upgrades.neighborContacts && E.isUpgradeUnlocked(state, contact) && E.canAfford(state, contact.cost)) {
        E.research(state, derived, 'neighborContacts')
      }
      if (E.isDiplomacyUnlocked(state) && E.countOf(state, 'huntingCamp') === 0) {
        E.buyBuilding(state, derived, 'huntingCamp')
        E.recompute(state, derived)
      }
      if (E.isDiplomacyUnlocked(state) && (state.disciples.jobs.huntPlanner || 0) < 1 && E.idleDisciples(state) > 0) {
        E.setJob(state, derived, 'huntPlanner', 1)
        E.recompute(state, derived)
      }
      if (E.isDiplomacyUnlocked(state) && moneyLt(state.resources.mithril ?? ZERO, money(2)) &&
          moneyGte(state.resources.ore ?? ZERO, money(800)) && moneyGte(state.resources.stone ?? ZERO, money(500)) &&
          moneyGte(state.resources.warrant ?? ZERO, money(50))) {
        E.tradeWithSect(state, derived, 'silverGorge')
        E.recompute(state, derived)
      }
    }
    if (derived.industrial && derived.autoCraftSpeedUnlocked) {
      for (const id of derived.availableCrafts) if (derived.autoCraftSpeeds[id] !== 5) E.setAutoCraftSpeed(state, derived, id, 5)
      const capacity = Object.values(derived.processingCapacity).reduce((sum, n) => sum + n, 0)
      const energyReady = derived.energyCraftUnlocked && derived.processingPowerCapacity > 0 &&
        moneyGt(state.resources.qiEnergy ?? ZERO,
          moneyMax(100, state.settings.craftReserves?.qiEnergy ?? ZERO))
      const overloadReady = moneyGt(derived.netQi, money(capacity).times(10).plus(20)) &&
        moneyGt(state.resources.qi ?? ZERO, (derived.max.qi ?? ZERO).times('0.3'))
      for (const id of Object.keys(derived.processingCapacity)) {
        const mode = energyReady ? 'energy' : overloadReady ? 'overload' : 'normal'
        if ((state.settings.processingModes[id] || 'normal') !== mode) E.setProcessingMode(state, derived, id, mode)
      }
    }
    // 固印时先暂停耗能法宝，待渡劫材料备齐再启用；使用玩家同样可用的启停操作。
    if (state.upgrades.energyCore && state.realm >= 9) {
      const next = realmNeed() || {}
      const sealNeed = money(next.ascensionSeal ?? 0)
      // 固印条件里两项都是金额：不足判断必须走 Decimal。
      const ready = sealNeed.isZero() || (moneyGte(state.resources.ascensionSeal ?? ZERO, sealNeed) &&
        moneyGte(state.resources.qiEnergy ?? ZERO, next.qiEnergy ?? 0))
      if ((state.upgradeEnabled.energyCore !== false) !== ready) E.toggleUpkeepUpgrade(state, derived, 'energyCore')
    }
    let craftDemand = {}
    const manualTargets = {}
    let rushDemand = null
    if (policy.onlyBreakthrough) {
      rushDemand = { ...(realmNeed() || {}) }
      const include = cost => {
        for (const [res, amount] of Object.entries(cost || {})) rushDemand[res] = moneyMax(rushDemand[res] ?? ZERO, amount)
      }
      const requirements = breakthroughPrereqs()
      for (const id of requirements.upgrades) include(E.UPGRADE_MAP[id]?.cost)
      for (const [id, count] of requirements.buildings) if (E.countOf(state, id) < count) include(E.buildingCost(state, id, 1))
      for (const id of derived.availableUpgrades) {
        const u = E.UPGRADE_MAP[id]
        if (u.effects?.storageRatio || u.effects?.buildingStorageRatio || (comfortOnly(u) && normalHabitability() < state.disciples.total)) include(u.cost)
      }
      for (const id of derived.unlockedBuildings) {
        const b = E.BUILDING_MAP[id]
        if (b.effects?.maxDisciples > 0 || (comfortOnly(b) && normalHabitability() < state.disciples.total)) include(E.buildingCost(state, id, 1))
      }
      const visited = new Set()
      const inputs = res => {
        if (visited.has(res)) return
        visited.add(res)
        const recipe = CRAFTS.find(c => c.out === res)
        if (!recipe) return
        // 份数是金额：缺口 ÷ 单份产出后向上取整，不能先转 Number。
        const copies = ceilMoney(money(rushDemand[res] ?? ZERO).div(E.craftYield(derived, recipe)))
        include(Object.fromEntries(Object.entries(recipe.cost).map(([id, amount]) => [id, money(amount).times(copies)])))
        for (const id of Object.keys(recipe.cost)) inputs(id)
      }
      for (const res of Object.keys(rushDemand)) inputs(res)
      craftDemand = rushDemand
    }
    // 金丹后按近期建筑/研究/破境需求设置加工库存目标，避免把原料无限加工。
    // 这是新目标控件允许玩家执行的策略，手动与自动制作使用同一目标。
    // 自动目标尚未解锁时，玩家仍会按近期需要手动停产，不能每轮炼十份直到满仓。
    {
      const demand = { ...(realmNeed() || {}) }
      for (const id of derived.availableUpgrades) {
        if (!wantsComfortUpgrade(E.UPGRADE_MAP[id])) continue
        for (const [res, amount] of Object.entries(E.UPGRADE_MAP[id].cost)) demand[res] = moneyMax(demand[res] ?? ZERO, amount)
      }
      for (const id of derived.unlockedBuildings) {
        if (!wantsComfortBuilding(E.BUILDING_MAP[id])) continue
        for (const [res, amount] of Object.entries(E.buildingCost(state, id, 1))) demand[res] = moneyMax(demand[res] ?? ZERO, amount)
      }
      craftDemand = demand
      if (rushDemand) craftDemand = rushDemand
      for (const c of CRAFTS) {
        // 灵石（stone）必须在这张名单里：破境与研究都要它，而它的唯一来源就是点石成灵。
        // 早先漏了它，参照玩家于是把矿石与灵气堆到满仓、却一件灵石都不做（实测卡在筑基期/元婴期）。
        const knowledge = ['daoNote', 'daoTreatise', 'arrayDiagram'].includes(c.out)
        if (!knowledge && !UNCAPPED_CRAFTED_RESOURCES.has(c.out) && c.out !== 'stone') continue
        // 阵基的下料也是短期需求；普通成品还预留进阶配方的一份料。
        let inputDemand = ZERO
        for (const recipe of CRAFTS) {
          if (!derived.availableCrafts.includes(recipe.id)) continue
          const policy = ADVANCED_CRAFTS[recipe.id]
          const floor = policy?.floors?.[c.out] || (policy?.base === c.out ? policy.floor : 0)
          inputDemand = moneyMax(inputDemand, recipe.cost[c.out] ?? ZERO, floor ?? ZERO)
        }
        // 库存目标是金额：先用 Decimal 取最大的需求，再乘预留系数并在金额域向上取整。
        manualTargets[c.id] = ceilMoney(moneyMax(knowledge ? 1 : 20,
          craftDemand[c.out] ?? ZERO, rushDemand ? ZERO : inputDemand).times(knowledge ? 1 : 1.25))
        E.setCraftTarget(state, derived, c.id, manualTargets[c.id])
      }
    }
    // —— 财政：灵气要见底时，把吃灵气的建筑停掉；缓过来再开 ——
    // （维护费让「停用」变成一个真选择，勤快玩家当然会看账）
    if (E.countOf(state, 'hut') > 0) {
      const qiEaters = E.BUILDINGS.filter((b) => b.upkeep?.qi).map((b) => b.id)
      const netBefore = derived.netQi
      const low = moneyLt(state.resources.qi ?? ZERO, 20) && moneyLt(netBefore, 0)
      const recovered = moneyGt(state.resources.qi ?? ZERO, (derived.max.qi ?? ZERO).times('0.5')) &&
        moneyGte(netBefore, 0)
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
      for (let i = 0; i < 12 && moneyLt(state.resources.qi ?? ZERO, target); i++) E.drawQi(state, derived)
      E.recompute(state, derived)
    }

    assignJobs()

    // 破境相关的「优先研究」两类：①链上前置（凝液法…）②补仓储上限（storageRatio 那类）。
    // 若暂时买不起，就进入「攒料」状态（暂停吃这些资源的建筑与配方），先把料攒够。
    const { upgrades: prereq, buildings: requiredBuildings } = breakthroughPrereqs()
    // 入住配套是正常人口发展的基础投资，先学会再持续扩屋。
    if (derived.availableUpgrades.includes('homePlanning')) prereq.add('homePlanning')
    const nextNeed = realmNeed() || {}
    const capacityNeed = capacityDemand(nextNeed, prereq, requiredBuildings)
    const shortRes = Object.keys(capacityNeed).filter((r) => moneyLt(derived.max[r] ?? ZERO, capacityNeed[r]))
    const storageFixIds = new Set(
      derived.availableUpgrades.filter((id) => {
        const effects = E.UPGRADE_MAP[id]?.effects
        return shortRes.some(r => (effects?.storageRatio?.[r] || 0) > 0) ||
          Object.entries(effects?.buildingStorageRatio || {}).some(([building, ratio]) => ratio > 0 &&
            E.countOf(state, building) > 0 && shortRes.some(r => (E.BUILDING_MAP[building]?.effects?.storage?.[r] || 0) > 0))
      }),
    )
    let reserveCost = null
    let reserveSource = null
    // 专题页研究（如凝愿法）不在普通页列表；只纳入策略明确请求且真实已解锁的条目。
    const availableUpgrades = [...new Set([...derived.availableUpgrades,
      ...(policy.upgrades?.(state, derived) || []).filter(id => E.UPGRADE_MAP[id] && !state.upgrades[id] && E.isUpgradeUnlocked(state, E.UPGRADE_MAP[id]))])]
    const investmentOrder = [...new Set(['homePlanning', 'flowField', 'earthEssence', ...availableUpgrades])]
      .filter(id => availableUpgrades.includes(id))
    for (const id of investmentOrder) {
      if (!prereq.has(id) && !storageFixIds.has(id)) continue
      const u = E.UPGRADE_MAP[id]
      // 仓容不足时先扩仓；不能一边攒永远装不下的费用，一边禁止买仓库。
      if (u && Object.entries(u.cost).every(([r, v]) => moneyLte(v, derived.max[r] ?? ZERO)) && !E.canAfford(state, u.cost)) {
        reserveCost = u.cost
        reserveSource = { kind: 'research', id }
        break
      }
    }
    // 必需设施也要攒首座费用；否则持续买普通建筑会把灵石等用料花光。
    if (!reserveCost) {
      for (const [id, count] of requiredBuildings) {
        const b = E.BUILDING_MAP[id]
        if (E.countOf(state, id) >= count || !E.checkNeeds(state, b.needs)) continue
        const cost = E.buildingCost(state, id, 1)
        if (Object.entries(cost).every(([r, v]) => moneyLte(v, derived.max[r] ?? ZERO)) && !E.canAfford(state, cost)) {
          reserveCost = cost
          reserveSource = { kind: 'building', id }
          break
        }
      }
    }
    // 下一境仓容不足时先攒扩仓建筑的用料，避免木材一直被加工成木板。
    if (!reserveCost && shortRes.length) {
      const expansion = E.BUILDINGS.filter(b => E.checkNeeds(state, b.needs) &&
        shortRes.some(r => (b.effects?.storage?.[r] || 0) > 0 || (b.effects?.storageAll || 0) > 0))
        .map(b => ({ id: b.id, cost: E.buildingCost(state, b.id, 1) }))
        .filter(({ cost }) => Object.entries(cost).every(([r, v]) => moneyLte(v, derived.max[r] ?? ZERO)))
        .sort((a, b) => moneySum(Object.values(a.cost)).cmp(moneySum(Object.values(b.cost))))[0]
      if (expansion && !E.canAfford(state, expansion.cost)) {
        reserveCost = expansion.cost
        reserveSource = { kind: 'capacity', id: expansion.id }
      }
    }
    // 材料只差少数几项时攒一次完整破境费用，并预留缺失加工品的一份投入。
    // 金丹以前仅由加工品触发，以免开局攒基础资源时把自举建筑一起停掉。
    if (!reserveCost) {
      const PRIMARY = new Set(['qi', 'wood', 'rock', 'stone', 'herb', 'ore', 'insight', 'faith'])
      const need = realmNeed() || {}
      const missing = Object.entries(need).filter(([r, v]) => moneyLt(state.resources[r] ?? ZERO, v))
      const craftedMissing = missing.filter(([r]) => !PRIMARY.has(r))
      const protectReadyQi = policy.protectBreakthrough && state.realm > 0 && E.countOf(state, 'hut') > 0 &&
        missing.length === 1 && missing[0][0] === 'qi'
      if (missing.length > 0 && missing.length <= 3 && (craftedMissing.length > 0 || state.realm >= 4 || protectReadyQi)) {
        const reserve = Object.fromEntries(Object.entries(need).filter(([r, v]) => moneyLte(v, derived.max[r] ?? ZERO)))
        for (const [r, v] of craftedMissing) {
          if (moneyGt(v, derived.max[r] ?? ZERO)) continue
          reserve[r] = v
          for (const recipe of CRAFTS) {
            if (recipe.out !== r || !E.isCraftUnlocked(state, recipe)) continue
            for (const [k, val] of Object.entries(recipe.cost)) reserve[k] = moneyMax(reserve[k] ?? ZERO, val)
          }
        }
        if (Object.keys(reserve).length) {
          reserveCost = reserve
          reserveSource = { kind: 'breakthrough', target: state.realm + 1 }
        }
      }
    }

    // 攒研究/设施的成品时同时预留其上游投入，避免基础建设每轮花光木料，
    // 研究要的符箓永远做不出来。只追踪已开放配方，不虚构解锁或库存。
    if (reserveCost) {
      reserveCost = { ...reserveCost }
      const visited = new Set()
      const reserveInputs = (res, amount) => {
        if (moneyGte(state.resources[res] ?? ZERO, amount) || visited.has(res)) return
        visited.add(res)
        const recipe = CRAFTS.find(c => c.out === res && E.isCraftUnlocked(state, c))
        if (!recipe) return
        // 缺口与份数都是金额：向上取整后按完整份额预留上游投入。
        const copies = ceilMoney(money(amount).minus(state.resources[res] ?? ZERO).div(E.craftYield(derived, recipe)))
        for (const [input, cost] of Object.entries(craftCost(derived, recipe))) {
          const needed = moneyMin(derived.max[input] ?? E.MONEY_INFINITY, money(cost).times(copies))
          reserveCost[input] = moneyMax(reserveCost[input] ?? ZERO, needed)
          reserveInputs(input, reserveCost[input])
        }
      }
      for (const [res, amount] of Object.entries(reserveCost)) reserveInputs(res, amount)
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
    const ups = availableUpgrades
      .map((id) => ALL_UPGRADES.find((u) => u.id === id))
      .filter(Boolean)
      .filter(u => !policy.allowUpgrade || policy.allowUpgrade(u))
      .filter(u => !policy.onlyBreakthrough || prereq.has(u.id) || storageFixIds.has(u.id) ||
        (comfortOnly(u) && normalHabitability() < state.disciples.total))
      .filter(u => prereq.has(u.id) || storageFixIds.has(u.id) ||
        (policy.focusProjects?.(state, derived) ? comfortOnly(u) && wantsComfortUpgrade(u) : wantsComfortUpgrade(u)))
      // 并列时不能退化成「数组顺序」—— 否则改一次数据顺序，推演结果就跟着变
    // （实测：只把修真表按五段重排，12 小时弟子就从 42 变成 70）。
    // 所以并列时用「总花费 → id」做稳定的第二、第三关键字，让参照玩家与数据顺序无关。
    .sort((a, b) => {
      const d = waitOf(a) - waitOf(b)
      if (Math.abs(d) > 1e-9) return d
      // 总花费是金额：Decimal 相加必须走 moneySum，原生 + 会拼成字符串。
      const cost = (u) => E.moneySum(Object.values(u.cost || {}))
      return cost(a).cmp(cost(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    })
    let researchDecision = null
    if (ups.length) {
      // 优先：破境链上的前置研究、以及补仓储上限的研究；其余仍只点队首那条以免过度参悟。
      const u =
        ups.find((x) => x.id === 'homePlanning' && E.canAfford(state, x.cost)) ||
        ups.find((x) => x.id === 'flowField' && E.canAfford(state, x.cost)) ||
        ups.find((x) => x.id === 'earthEssence' && E.canAfford(state, x.cost)) ||
        ups.find((x) => prereq.has(x.id) && E.canAfford(state, x.cost)) ||
        ups.find((x) => storageFixIds.has(x.id) && E.canAfford(state, x.cost)) ||
        ups.find((x) => comfortOnly(x) && normalHabitability() < comfortFloor() && E.canAfford(state, x.cost)) ||
        ups[0]
      const spendsReserve = reserveCost && !prereq.has(u.id) && !storageFixIds.has(u.id) &&
        Object.entries(u.cost).some(([r, v]) => moneyLt(money(state.resources[r] ?? ZERO).minus(v), reserveCost[r] ?? ZERO))
      const affordable = E.canAfford(state, u.cost)
      researchDecision = { id: u.id, cost: u.cost, spendsReserve: !!spendsReserve, affordable, purchased: false }
      if (!spendsReserve && affordable) researchDecision.purchased = E.research(state, derived, u.id)
    }

    policy.onDecision?.({ reserveSource, reserveCost, shortRes, capacityNeed,
      research: researchDecision, requiredBuildings: Object.fromEntries(requiredBuildings), prerequisites: [...prereq] })
    buildStep(0, reserveCost, shortRes, requiredBuildings)

    const housingNeed = state.disciples.total >= derived.maxDisciples
      ? ['hut', 'logHouse', 'mansion', 'caveDwelling'].filter(id => derived.unlockedBuildings.includes(id))
        .map(id => E.buildingCost(state, id, 1)).filter(cost => moneyGt(cost.wood ?? ZERO, 0))
        .sort((a, b) => (a.wood ?? ZERO).cmp(b.wood ?? ZERO))[0]
      : null

    // 只暂停会侵占预留量的加工；库存充足时仍可准备突破材料的上游原料。
    // 四档费用清单更短，若仅凭输入出现在预留表就禁做，会把固印所需晶银一起停掉。
    const blocksCraft = (c) => reserveCost && Object.entries(c.cost).some(([k, amount]) =>
      moneyGt(reserveCost[k] ?? ZERO, 0) &&
      moneyLt(money(state.resources[k] ?? ZERO).minus(amount), reserveCost[k] ?? ZERO)) &&
      !moneyGt(reserveCost[c.out] ?? ZERO, state.resources[c.out] ?? ZERO)

    // 制作（灵石留一点灵气余量，别把阵徒的口粮也花掉）
    for (const c of CRAFTS) {
      if (!derived.availableCrafts.includes(c.id)) continue
      if (rushDemand && !rushDemand[c.out]) {
        if (state.craftOrders?.[c.id] && !state.craftOrders[c.id].paused) E.manageCraftOrder(state, derived, c.id, 'pause')
        state.autoCraft[c.id] = false
        continue
      }
      if (rushDemand && moneyGte(state.resources[c.out] ?? ZERO, rushDemand[c.out])) continue
      // 攒破境前置期间：跳过会吃掉这些资源的配方（但它本身若产的就是要攒的资源，则放行）。
      const savingWood = !(reserveCost && moneyGt(reserveCost[c.out] ?? ZERO, state.resources[c.out] ?? ZERO)) &&
        housingNeed && moneyLt(state.resources.wood ?? ZERO, housingNeed.wood ?? ZERO) &&
        moneyGt(c.cost.wood ?? ZERO, 0) &&
        moneyGte(state.resources[c.out] ?? ZERO, housingNeed[c.out] ?? ZERO)
      const blocked = blocksCraft(c) || savingWood
      const order = state.craftOrders?.[c.id]
      if (order && order.paused !== !!blocked) E.manageCraftOrder(state, derived, c.id, blocked ? 'pause' : 'resume')
      if (blocked) continue
      // 库存目标是金额：Decimal 恒为真（包括 0），必须先判定再取「手工备料目标」。
      const explicitTarget = E.craftTarget(state, derived, c.id)
      const target = explicitTarget.gt(0) ? explicitTarget : money(manualTargets[c.id] ?? ZERO)
      if (target.gt(0) && moneyGte(state.resources[c.out] ?? ZERO, target)) continue
      if (c.id === 'infuseStone' && moneyLt(state.resources.qi ?? ZERO, STONE_QI_FLOOR)) continue
      const rescue = RESCUE_CRAFTS[c.id]
      if (rescue) {
        // 只在「看的那个资源」低于上限的两成（或开局保底线）时才催生一次
        const cap = derived.max[rescue.watch] ?? ZERO
        const floor = moneyMax(cap.times(rescue.below), money(rescue.floor ?? 0))
        if (moneyGt(state.resources[rescue.watch] ?? ZERO, floor)) continue
        if (E.canAfford(state, c.cost)) submitCraft(c.id)
        continue
      }
      const adv = ADVANCED_CRAFTS[c.id]
      if (adv) {
        // 进阶品按需炼：料要留够（单料 base/floor，多料 floors），成品囤够就停（一次一份）
        const floors = rushDemand ? {} : adv.floors || { [adv.base]: adv.floor }
        let enough = true
        for (const [res, need] of Object.entries(floors)) {
          if (moneyLt(state.resources[res] ?? ZERO, need)) enough = false
        }
        if (!enough) continue
        const cap = moneyMin(derived.max[c.out] ?? E.MONEY_INFINITY, moneyMax(adv.cap, craftDemand[c.out] ?? ZERO))
        if (moneyGte(state.resources[c.out] ?? ZERO, cap)) continue
        if (E.canAfford(state, c.cost)) submitCraft(c.id)
        continue
      }
      if (E.canAfford(state, c.cost)) {
        const needed = target.gt(0)
          ? E.moneyToCount(ceilMoney(target.minus(state.resources[c.out] ?? ZERO).div(E.craftYield(derived, c))))
          : 10
        submitCraft(c.id, Math.min(10, needed))
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
        .filter((x) => moneyGt(x.cost.wood ?? ZERO, 0))
        .sort((x, y) => (x.cost.wood ?? ZERO).cmp(y.cost.wood ?? ZERO))
      const savingForHome =
        housingCapped && homeCandidates.length > 0 && moneyLt(state.resources.wood ?? ZERO, homeCandidates[0].cost.wood ?? ZERO)
      const RESERVE_HOUSING = ['sawPlank', 'drawTalisman', 'assembleArrayBase']
      for (const c of CRAFTS) {
        if (ADVANCED_CRAFTS[c.id]) {
          state.autoCraft[c.id] = false // 进阶配方按需手动制作，不能绕过库存与预留规则
          continue
        }
        state.autoCraft[c.id] = derived.availableCrafts.includes(c.id) &&
          (!rushDemand || !!rushDemand[c.out]) &&
          !blocksCraft(c) && !(savingForHome && RESERVE_HOUSING.includes(c.id))
      }
    }

    const advanced = policy.breakthrough ? policy.breakthrough(state, derived) : E.breakthrough(state, derived)
    if (advanced) assignJobs()
  }

  return { act, assignJobs, buildStep, prerequisites: breakthroughPrereqs }
}
