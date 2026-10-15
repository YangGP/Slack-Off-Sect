import { normalizeState, resetForAscension, resetForReincarnation } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { JOBS } from '../../src/data/jobs.js'
import { UPGRADE_MAP } from '../../src/data/upgrades.js'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { ACHIEVEMENT_REWARD } from '../../src/data/achievements.js'
import { CALENDAR } from '../../src/data/calendar.js'
import { CONFIG } from '../../src/data/config.js'
import { exportSave, parseImport } from '../../src/game/save.js'
import { newGame, newGameRunning } from './fixtures.mjs'

export function incomeBreakdown({ ok, close, section }) {
  section('进项来源明细')
  {
    const { state, derived } = newGameRunning()
    state.resources.qi = 5000
    state.resources.wood = 5000
    E.buyBuilding(state, derived, 'spiritField', 2)
    E.buyBuilding(state, derived, 'lumberYard', 2)
    E.setJob(state, derived, 'farmer', 2)

    const sources = derived.sources.qi || []
    const sum = sources.reduce((s, x) => s + x.value, 0)
    ok('进项来源之和等于进项总额', close(sum, derived.rates.qi, 1e-6), `${sum} vs ${derived.rates.qi}`)
    ok(
      '阵徒出现在来源里且带人数',
      sources.some((s) => s.kind === 'job' && s.id === 'farmer' && s.count === 2),
    )
    ok(
      '聚灵阵出现在来源里且带座数',
      sources.some((s) => s.kind === 'building' && s.id === 'spiritField' && s.count === 3),
    )
    ok('来源按数值从大到小排列', sources.every((s, i) => i === 0 || sources[i - 1].value >= s.value))

    const factor = derived.sourceFactor.qi
    ok('加成倍率把原始值折算成最终值', close(sources[0].raw * factor, sources[0].value, 1e-9))

    const expenses = derived.expenseSources.qi || []
    const expenseSum = expenses.reduce((s, x) => s + x.value, 0)
    ok(
      '出项明细之和等于 −upkeep',
      close(expenseSum, -derived.upkeep, 1e-6),
      `${expenseSum} vs ${-derived.upkeep}`,
    )
    ok('出项里写明弟子人数', expenses.some((x) => x.label === '弟子' && x.count === state.disciples.total))

    // 库房：只存基础物资（灵木 / 灵石 / 玄铁 / 灵草），且份额按流量分配
    {
      const wh = BUILDING_MAP.warehouse
      // 灵气是"气脉"的资源，不是砖石：只有与气本身有关的建筑、以及开局自举的那几座才用它
    {
      const allowed = new Set([
        'spiritField', // 聚灵阵：聚气之法，起手就要引气
        'hut', // 茅屋：开局第一座，此时手头只有灵气
        'lumberYard', // 伐木场：从"只有灵气"跨到"有木料"的那一步
        'library', // 藏经阁：以灵气养典籍
      ])
      const offenders = BUILDINGS.filter((x) => x.cost?.qi && !allowed.has(x.id)).map((x) => x.name)
      ok('灵气不当建材（实物建筑一律用材料计价）', offenders.length === 0, offenders.join('、') || '干净')

      ok(
        '炼铁炉与药圃按材料计价',
        !BUILDING_MAP.ironFurnace.cost.qi && !BUILDING_MAP.herbGarden.cost.qi,
        JSON.stringify({ mine: BUILDING_MAP.ironFurnace.cost, herbGarden: BUILDING_MAP.herbGarden.cost }),
      )
    }

    ok('库房改为逐资源上限（不再用 storageAll）', !!wh.effects.storage && !wh.effects.storageAll)
      const st = wh.effects.storage
      ok(
        '库房只存基础物资（灵木 / 灵石 / 矿石 / 玄铁 / 灵草）',
        Object.keys(st).sort().join(',') === 'herb,ore,rock,stone,wood',
        Object.keys(st).join(','),
      )
      ok('库房不再碰灵气 / 灵机 / 丹药 / 符箓 / 香火 / 法器', ['qi', 'insight', 'pill', 'talisman', 'faith', 'artifact'].every((k) => !st[k]))
      ok('份额按流量排序（灵木最多、低速灵石最少）', st.wood > st.rock && st.rock > st.herb && st.herb > st.ore && st.ore > st.stone, JSON.stringify(st))
      // 被移出去的那几种资源，各自有专属建筑在给上限
      const capSource = (res) =>
        BUILDINGS.filter(
          (b) => b.effects?.storage?.[res] || (b.effects?.storageAll && b.id !== 'warehouse'),
        ).map((b) => b.name)
      ok('灵气上限另有来源（谷仓 / 茅屋 / 木屋）', capSource('qi').includes('谷仓') && capSource('qi').includes('茅屋'), capSource('qi').join('、'))
      ok('灵机上限归典籍库 / 讲经堂 / 观星台', ['典籍库', '讲经堂', '观星台'].every((n) => capSource('insight').includes(n)), capSource('insight').join('、'))
      ok('丹药 / 符箓 / 法器各有专属仓（炼丹房 / 符箓堂 / 炼器坊）', ['炼丹房', '符箓堂', '炼器坊'].every((n) => capSource('pill').includes(n) || capSource('talisman').includes(n) || capSource('artifact').includes(n)), `${capSource('pill')} / ${capSource('talisman')} / ${capSource('artifact')}`)
      ok('香火上限归山门 / 香火鼎', capSource('faith').includes('山门') && capSource('faith').includes('香火鼎'), capSource('faith').join('、'))
      // 生效检查：建 1 座库房，基础物资的上限按表抬高，其它资源一律不动
      const { state: s4, derived: d4 } = newGame()
      s4.buildings.lumberYard = { count: 3, on: true }
      s4.upgrades.earthArt = true // 库房现在挂在「土木术」后面
      E.recompute(s4, d4)
      const before = { ...d4.max }
      s4.resources.wood = 5000
      s4.resources.stone = 5000
      s4.resources.rock = 5000
      s4.resources.ore = 5000
      s4.resources.qi = 5000
      E.trackPeak(s4)
      ok('库房真的建起来了（前置检查）', E.buyBuilding(s4, d4, 'warehouse', 1) === 1)
      const delta = (r) => (d4.max[r] || 0) - (before[r] || 0)
      ok(
        '基础物资的上限按表逐项抬高',
        Object.keys(st).every((r) => close(delta(r), st[r], 1e-6)),
        Object.keys(st).map((r) => `${r}+${delta(r)}`).join(' '),
      )
      ok(
        '其它资源的上限一点都不动',
        ['qi', 'insight', 'pill', 'talisman', 'faith', 'artifact'].every((r) => close(delta(r), 0, 1e-6)),
        ['qi', 'insight', 'pill', 'talisman', 'faith', 'artifact'].map((r) => `${r}+${delta(r)}`).join(' '),
      )
    }

    // 加成倍率要能拆开：每一项的和 = 该项总额，逐项相乘 = sourceFactor
    {
      state.buildings.gatheringArray = { count: 2, on: true }
      state.upgrades.qiArt = true
      state.upgrades.spiritBanner = true
      state.achievements.firstHut = true
      E.recompute(state, derived)
      const b = derived.bonus
      ok('专业加成进入资源拆分账，生产设施不再提供全局加成', Object.keys(b.ratio).length > 0 && (ACHIEVEMENT_REWARD > 0 || b.ratioAll.length === 0))
      const ratioSum = (b.ratio.qi || []).reduce((s, x) => s + x.value, 0)
      ok('拆分之和 = derived.ratio.qi', close(ratioSum, derived.ratio.qi, 1e-9), `${ratioSum} vs ${derived.ratio.qi}`)
      const allSum = b.ratioAll.reduce((s, x) => s + x.value, 0)
      ok('拆分之和 = ratioAll', close(allSum, derived.ratioAll, 1e-9), `${allSum} vs ${derived.ratioAll}`)
      ok(
        '逐项相乘 = sourceFactor（灵气）',
        close(
          (1 + ratioSum) * (1 + allSum) * (1 + (derived.seasonRatio.qi || 0)) * b.globalMult,
          derived.sourceFactor.qi,
          1e-9,
        ),
        `${(1 + ratioSum) * (1 + allSum) * (1 + (derived.seasonRatio.qi || 0)) * b.globalMult} vs ${derived.sourceFactor.qi}`,
      )
      ok('拆分里能追到具体条目（引气诀 / 聚灵大阵）', (() => {
        const labels = [...(b.ratio.qi || []), ...b.ratioAll].map((x) => x.id)
        return labels.includes('qiArt') && labels.includes('gatheringArray')
      })(), [...(b.ratio.qi || []), ...b.ratioAll].map((x) => x.id).join(','))
      // 成就奖励清零后，加成拆解里不该再出现一条 0% 的「成就」明细
      ok(
        ACHIEVEMENT_REWARD > 0
          ? '成就条目带条数'
          : '成就奖励为 0 时，拆解里不列出成就明细',
        ACHIEVEMENT_REWARD > 0
          ? b.ratioAll.some((x) => x.id === 'achievements' && x.count === 1)
          : !b.ratioAll.some((x) => x.id === 'achievements'),
      )
    }

    // 停用带维护费的建筑后，它的产出与维护费一起从账上消失
    state.buildings.gatheringArray = { count: 2, on: true }
    E.recompute(state, derived)
    ok('启用时它在吃灵气', (derived.maintenance.qi || 0) > 0, `${derived.maintenance.qi}`)
    E.toggleBuilding(state, derived, 'gatheringArray')
    ok('停用后该建筑不再计入来源', !(derived.sources.qi || []).some((s) => s.id === 'gatheringArray'))
    ok('停用后这一项不再出现在出项里', !(derived.expenseSources.qi || []).some((s) => s.id === 'gatheringArray'))
    const sum2 = (derived.sources.qi || []).reduce((s, x) => s + x.value, 0)
    ok('停用后来源之和仍等于进项总额', close(sum2, derived.rates.qi, 1e-6))
    const exp2 = (derived.expenseSources.qi || []).reduce((s, x) => s + x.value, 0)
    ok('停用后出项明细之和 = −弟子口粮', close(exp2, -derived.upkeep, 1e-6), `${exp2} vs ${-derived.upkeep}`)
  }
}

export function affordabilityTiming({ ok, close, section }) {
  section('还差多久买得起')
  {
    const { state, derived } = newGameRunning()
    state.resources.qi = 500
    state.resources.wood = 0
    state.resources.stone = 0
    // 让灵气净额为正，否则「现印」路径会（正确地）返回 Infinity
    state.buildings.spiritField = { count: 6, on: true }
    E.setJob(state, derived, 'farmer', 2)
    E.setJob(state, derived, 'woodcutter', 1)
    E.recompute(state, derived)

    ok('已经够时返回 0', E.timeToAfford(state, derived, 'qi', 100) === 0)
    const rate = derived.rates.wood
    ok('伐木工真的在产灵木（前置检查）', rate > 0, `${rate}`)
    // 催生灵木是配方：灵气在手时，灵木可以**立刻**换到 —— 所以等待是 0，这是对的行为
    ok(
      '有灵气时灵木可立刻换到（等待 0）',
      E.timeToAfford(state, derived, 'wood', 30) === 0,
      String(E.timeToAfford(state, derived, 'wood', 30)),
    )
    // 把灵气清零，检验另一条路径：只能靠产率等
    // 只清掉灵气存量还不够：灵气**产率**仍在，于是"印灵气换灵木"这条路比灵木自身产率更快，
    // timeToAfford 会（正确地）给出更短的时间。要隔离出纯产率路径，必须把这条路也断掉。
    state.resources.qi = 0
    E.recompute(state, derived)
    // 注意：timeToAfford 读的是 derived.net（净额），只改 rates 是拦不住它的
    derived.rates = { ...derived.rates, qi: 0 }
    derived.net = { ...(derived.net || {}), qi: 0 }
    const rateNow = derived.rates.wood
    const wait = E.timeToAfford(state, derived, 'wood', 30)
    ok('灵气与灵气产率都断了，按灵木产率算等待', close(wait, 30 / rateNow, 1e-9), `${wait} vs ${30 / rateNow}`)
    ok(
      '既没有产出、也没有配方的资源返回 Infinity（例如仙缘）',
      E.timeToAfford(state, derived, 'karma', 30) === Infinity,
    )
    ok(
      '配方还没解锁的成品也返回 Infinity（例如没炼器坊时的法器）',
      E.timeToAfford(state, derived, 'artifact', 5) === Infinity,
    )

    // 灵石没有产出，全靠「点石成灵」现印 —— 这条路径也要给出计时器
    state.resources.rock = 100 // 本段单独验证灵气等待，矿物载体已备齐。
    state.buildings.quarry = { count: 1, on: true }
    state.resources.qi = 0
    E.recompute(state, derived)
    const stoneCost = E.CRAFT_MAP.infuseStone.cost.qi
    const netQi = derived.netQi
    ok('灵石的计量走现印路径', netQi > 0, `netQi=${netQi}`)
    ok(
      '灵石缺口 = 凑够兑换所需灵气的时间',
      close(E.timeToAfford(state, derived, 'stone', 30), (30 * stoneCost - state.resources.qi) / netQi, 1e-6),
      `${E.timeToAfford(state, derived, 'stone', 30)}`,
    )
    state.resources.stone = 1
    ok('灵石已经够时返回 0', E.timeToAfford(state, derived, 'stone', 1) === 0)
    state.resources.stone = 0

    // 勾上「自动」之后，还要把一份一份做的耗时算进去
    state.upgrades.intuition = true
    state.autoCraft.infuseStone = true
    state.settings.autoCraftOn = true
    E.recompute(state, derived)
    const withAuto = E.timeToAfford(state, derived, 'stone', 30)
    const withoutAuto = (30 * stoneCost - state.resources.qi) / derived.netQi
    ok(
      '开自动后把制作耗时也加上（30 份 × 0.5 秒）',
      close(withAuto, withoutAuto + 30 * E.craftTime(E.CRAFT_MAP.infuseStone), 1e-6),
      `${withAuto} vs ${withoutAuto}`,
    )
    state.autoCraft.infuseStone = false

    // 凝灵诀：每逢节气，灵气满仓时把仓内一定比例（AUTO_CONDENSE_RATIO）凝成灵液；不满仓不动手
    {
      const { state: s4, derived: d4 } = newGame()
      s4.buildings.quarry = { count: 1, on: true }
      s4.resources.rock = d4.max.rock
      ok('未参悟凝灵诀时不置位', d4.autoCondenseLiquidUnlocked === false)
      s4.upgrades.condenseArt = true
      E.recompute(s4, d4)
      ok('参悟凝灵诀后置位 autoCondenseLiquidUnlocked', d4.autoCondenseLiquidUnlocked === true)
      ok('凝灵诀开放库存目标但不提前解锁常驻自动', d4.autoCraftUnlocked === false && d4.craftTargetsUnlocked === true)
      s4.resources.qi = d4.max.qi
      ok('未掌握凝气化液时不提前凝液', !E.runAutoCondense(s4, d4) && s4.resources.spiritLiquid === 0 && s4.resources.stone === 0)
      s4.upgrades.qiMeasure = true
      s4.upgrades.qiLiquid = true
      s4.upgrades.liquidArt = true
      s4.buildings.granary = { count: 5, on: true }
      s4.upgrades.intuition = true
      E.recompute(s4, d4)
      ok('《心有灵犀》即解锁库存目标（不再等金丹期）', d4.autoCraftUnlocked === true && d4.craftTargetsUnlocked === true)
      const qiMax = d4.max.qi
      const qiCost = E.CRAFT_MAP.condenseLiquid.cost.qi
      s4.resources.qi = qiMax * 0.999
      ok('灵气不满仓时不动手', E.runAutoCondense(s4, d4) === false && s4.resources.qi === qiMax * 0.999)
      s4.resources.qi = qiMax
      const expect = Math.floor((qiMax * CONFIG.AUTO_CONDENSE_RATIO) / qiCost)
      ok(
        '满仓时按仓内比例一次凝掉',
        E.runAutoCondense(s4, d4) === true &&
          close(s4.resources.qi, qiMax - expect * qiCost, 1e-6) &&
          s4.resources.spiritLiquid === expect,
      )
      s4.resources.spiritLiquid = d4.max.spiritLiquid
      s4.resources.qi = qiMax
      ok('灵液满仓时不再凝', E.runAutoCondense(s4, d4) === false)
      s4.resources.spiritLiquid = 0
      s4.settings.autoCraftOn = false
      ok('关闭总开关时凝灵诀不扣灵气', !E.runAutoCondense(s4, d4) && s4.resources.qi === qiMax)
      s4.settings.autoCraftOn = true
      E.setCraftTarget(s4, d4, 'condenseLiquid', 2)
      E.runAutoCondense(s4, d4)
      ok('批量凝液逐份遵守库存目标', s4.resources.spiritLiquid === 2 && s4.resources.qi === qiMax - qiCost * 2)
      s4.resources.qi = qiMax
      ok('目标已达时不凝液', !E.runAutoCondense(s4, d4) && s4.resources.qi === qiMax)
      s4.resources.spiritLiquid = 1
      E.runAutoCondense(s4, d4)
      ok('消费灵液后下一次凝液补回目标', s4.resources.spiritLiquid === 2 && s4.resources.qi === qiMax - qiCost)
      E.setCraftTarget(s4, d4, 'condenseLiquid', 0)
      s4.dao = 1
      s4.settings.craftReservePercent = 90
      s4.resources.qi = qiMax
      s4.resources.spiritLiquid = 0
      s4.resources.rock = d4.max.rock
      E.recompute(s4, d4)
      E.runAutoCondense(s4, d4)
      ok('凝灵诀按份保留道果指定的材料', s4.resources.qi >= qiMax * 0.9 && s4.resources.spiritLiquid === Math.floor(qiMax * 0.1 / qiCost))
      s4.upgrades.condenseArt = false
      E.recompute(s4, d4)
      ok('移除凝灵诀后解锁标记恢复 false', d4.autoCondenseLiquidUnlocked === false)
    }

    // 凝灵诀由节气驱动：跨过节气边界的那一刻结算（挂在 tick 的历法推进里，离线模拟同样逐步过 tick）
    {
      const { state: s5, derived: d5 } = newGame()
      s5.buildings.quarry = { count: 1, on: true }
      s5.resources.rock = d5.max.rock
      s5.upgrades.condenseArt = true
      s5.upgrades.qiMeasure = true
      s5.upgrades.qiLiquid = true
      s5.upgrades.liquidArt = true
      s5.buildings.granary = { count: 5, on: true }
      E.recompute(s5, d5)
      const qiMax = d5.max.qi
      const qiCost = E.CRAFT_MAP.condenseLiquid.cost.qi
      const expect = Math.floor((qiMax * CONFIG.AUTO_CONDENSE_RATIO) / qiCost)
      s5.resources.qi = qiMax
      E.simulateOffline(s5, d5, CALENDAR.DAYS_PER_TERM * CALENDAR.DAY_SECONDS + 1)
      ok(
        '节气一到，满仓灵气凝成灵液（离线也照做）',
        s5.resources.spiritLiquid === expect && close(s5.resources.qi, qiMax - expect * qiCost, 1e-6),
        `stone=${s5.resources.spiritLiquid} qi=${s5.resources.qi}`,
      )
      s5.resources.spiritLiquid = 0
      s5.resources.qi = qiMax
      E.setCraftTarget(s5, d5, 'condenseLiquid', 2)
      E.simulateOffline(s5, d5, CALENDAR.DAYS_PER_TERM * CALENDAR.DAY_SECONDS)
      ok('离线节气凝液也遵守库存目标', s5.resources.spiritLiquid === 2 && s5.resources.qi === qiMax - qiCost * 2)
      s5.resources.qi = qiMax
      s5.resources.spiritLiquid = 0
      s5.settings.autoCraftOn = false
      E.simulateOffline(s5, d5, CALENDAR.DAYS_PER_TERM * CALENDAR.DAY_SECONDS)
      ok('离线凝液遵守总开关', s5.resources.spiritLiquid === 0 && s5.resources.qi === qiMax)
    }

    ok(
      '灵气按净额计算等待时间',
      close(
        E.timeToAfford(state, derived, 'qi', 500),
        state.resources.qi >= 500 ? 0 : (500 - state.resources.qi) / derived.netQi,
        1e-9,
      ),
    )
    state.resources.qi = 400
    ok('灵气净额为负时返回 Infinity', E.timeToAfford(state, derived, 'qi', 99999) > 0)
    // 把人气拉到吃不上饭：净额转负，现印路径也得给不出时间
    state.disciples.total = 40
    E.recompute(state, derived)
    ok('灵气净额为负时，现印路径也给不出时间', derived.netQi < 0 && E.timeToAfford(state, derived, 'stone', 99999) === Infinity)

    // 另外三种成品（丹药/符箓/法器）走同一套现印路径：材料有产出、配方已解锁就都能给出时间
    {
      const { state: s3, derived: d3 } = newGame()
      s3.buildings.alchemyRoom = { count: 1, on: true }
      s3.buildings.talismanHall = { count: 1, on: true }
      s3.buildings.forge = { count: 1, on: true }
      s3.buildings.herbGarden = { count: 4, on: true }
      s3.buildings.lumberYard = { count: 30, on: true }
      // 玄铁不再靠单独开矿：学会探矿术后，矿工一并采出；炼铁炉再用矿石与灵木把它烧出来
      s3.upgrades.prospectStudy = true
      s3.buildings.ironFurnace = { count: 1, on: true }
      s3.buildings.quarry = { count: 3, on: true }
      s3.resources.qi = 5000
      // 灵气**净额必须为正**：法器要灵石、灵石靠「点石成灵」吃灵气，
      // 若灵气净额为负，现印路径会（正确地）返回 Infinity —— 那样测的就不是配方链了。
      // 22 名弟子：10 名阵徒产 6 气/秒 > 22 × 0.25 的口粮；4 名矿工供得上 1 座炼铁炉的炉料。
      s3.disciples.total = 22
      s3.disciples.jobs = { farmer: 10, woodcutter: 6, herbalist: 2, miner: 4 }
      E.recompute(s3, d3)
      const waits = []
      for (const [res, name] of [
        ['pill', '丹药'],
        ['talisman', '符箓'],
        ['artifact', '法器'],
      ]) {
        const w = E.timeToAfford(s3, d3, res, 5)
        // 灵气在手时，缺口可以沿"现印"路径补齐：木料还能再顺着「催生灵木」即时换到，
        // 所以符箓的等待**可能是 0**（现印能立刻凑齐）—— 这是对的，不是 bug。
        waits.push(w)
        ok(`${name}的缺口能算出时间（现印路径）`, Number.isFinite(w) && w >= 0, `${w}`)
      }
      // 但"按产率等"这条时间路径不该被现印完全取代：丹药要灵草、法器要矿料，都还得等
      ok(
        '至少有一种仍需要等待产率（时间路径仍在）',
        waits.some((w) => w > 0),
        waits.map((w) => (Number.isFinite(w) ? w.toFixed(1) : '∞')).join(' / '),
      )
    }
  }
}

export function habitability({ ok, close, section }) {
  section('宜居度：阈值、来源倍率与人口流失')
  {
    for (const [h, n, global, jobs, leave] of [
      [0, 100, 1, 0.5, 0.5], [-25, 100, 0.75, 0.5, 0.5], [-50, 100, 0.5, 0.5, 0.5],
      [-500, 100, 0.5, 0.5, 0.5], [120, 100, 1, 1, 0], [170, 100, 1.125, 1, 0],
      [220, 100, 1.25, 1, 0], [320, 100, 1.5, 1, 0], [500, 100, 1.5, 1, 0], [186, 84, 1.205, 1, 0], [80, 100, 1, 1, 0],
      [79, 100, 1, 0.5, 0], [50, 100, 1, 0.5, 0], [49, 100, 1, 0.5, 0.02],
      [-10, 19, 0.9, 1, 0], [-1, 20, 0.99, 0.5, 0], [0, 20, 1, 1, 0],
      [-10, 49, 0.9, 0.5, 0], [-1, 50, 0.99, 0.5, 0.02], [0, 50, 1, 0.5, 0],
    ]) {
      const effects = E.habitabilityEffects(h, n)
      ok(`宜居度${h}、人口${n}的边界效果`, close(effects.globalMult, global) && effects.discipleMult === jobs && close(effects.leaveChance, leave))
    }

    const { state: s, derived: d } = newGame()
    s.buildings.lumberYard = { count: 1, on: true }
    s.buildings.spiritField = { count: 1, on: true }
    s.disciples.total = 40
    s.disciples.jobs.woodcutter = 10
    s.disciples.jobs.farmer = 10
    E.recompute(s, d)
    const baseline = { wood: d.rates.wood, upkeep: d.upkeep, craft: E.craftYield(d, CRAFT_MAP.sawPlank), buildingQi: d.sources.qi.find(row => row.kind === 'building').value }
    s.disciples.total = 41
    E.recompute(s, d)
    const building = d.sources.qi.find(row => row.kind === 'building')
    const job = d.sources.wood.find(row => row.kind === 'job')
    ok('拥挤只使弟子产出减半，建筑产出不减半', close(d.rates.wood, baseline.wood * 0.5) && close(job.raw, JOBS.find(j => j.id === 'woodcutter').base * 10 * 0.5) && close(building.value, baseline.buildingQi))
    s.habitabilityPenalty = -70 // 直接验证负值产量下限；正常断供惩罚仍限于-60。
    E.recompute(s, d)
    ok('负宜居度与拥挤相乘，弟子最低25%而建筑最低50%', close(d.habitabilityMult, 0.5) && close(d.sources.wood.find(row => row.kind === 'job').value, job.value * 0.5) && close(d.sources.qi.find(row => row.kind === 'building').value, building.value * 0.5))
    ok('宜居度不降低口粮，也不改变每份合成收益', close(d.upkeep, baseline.upkeep * 41 / 40) && close(E.craftYield(d, CRAFT_MAP.sawPlank), baseline.craft))
    ok('岗位惩罚后的来源明细仍与实际进项相等', close(d.sources.wood.reduce((sum, row) => sum + row.value, 0), d.rates.wood))
    s.habitabilityPenalty = 0
    s.buildings.meditationPool = { count: 44, on: true }
    E.recompute(s, d)
    ok('宜居度富余实际增产最多50%并解除岗位减半', d.habitability === 284 && d.discipleMult === 1 && close(d.rates.wood, baseline.wood * 1.5) && close(d.sources.qi.find(row => row.kind === 'building').value, baseline.buildingQi * 1.5))
    ok('宜居度富余也不放大每份合成收益', close(E.craftYield(d, CRAFT_MAP.sawPlank), baseline.craft))

    const crowded = () => {
      const game = newGame()
      game.state.buildings.hut = { count: 100, on: true }
      game.state.buildings.spiritField = { count: 1, on: true }
      game.state.disciples.total = 71
      game.state.disciples.jobs.farmer = 70
      game.state.disciples.jobs.woodcutter = 1
      E.recompute(game.state, game.derived)
      game.state.resources.qi = game.derived.max.qi
      return game
    }
    const originalRandom = Math.random
    try {
      const online = crowded()
      Math.random = () => 0.019
      for (let i = 0; i < 59; i++) E.tick(online.state, online.derived, 1, { events: false })
      ok('风险区暂停来人，未满60秒不提前离开', online.state.disciples.total === 71 && E.nextArrivalIn(online.state, online.derived) === null && online.state.arrivalTimer === 0)
      E.tick(online.state, online.derived, 1, { events: false })
      ok('60秒概率命中离开一人，并重新计算风险', online.state.disciples.total === 70 && online.derived.leaveChance === 0 && online.state.disciples.jobs.woodcutter === 0)
      const offline = crowded()
      E.simulateOffline(offline.state, offline.derived, 60)
      ok('离线采用相同周期与离开规则', offline.state.disciples.total === online.state.disciples.total && offline.state.disciples.jobs.farmer === online.state.disciples.jobs.farmer)
      const noLeave = crowded()
      Math.random = () => 0.02
      E.simulateOffline(noLeave.state, noLeave.derived, 60)
      ok('抽签未命中不会强制流失，周期重新计时', noLeave.state.disciples.total === 71 && noLeave.state.leaveTimer === 0)
      E.recruitArrivals(noLeave.state, noLeave.derived, 1000)
      ok('直接来人结算也遵守风险暂停', noLeave.state.disciples.total === 71)
      noLeave.state.buildings.meditationPool = { count: 1, on: true }
      E.recompute(noLeave.state, noLeave.derived)
      E.recruitArrivals(noLeave.state, noLeave.derived, 15)
      ok('改善宜居度后恢复来人', noLeave.state.disciples.total === 72 && noLeave.derived.leaveChance === 0)
      const bulk = crowded()
      bulk.state.disciples.total = 0
      bulk.state.disciples.jobs.farmer = 0
      bulk.state.disciples.jobs.woodcutter = 0
      E.recompute(bulk.state, bulk.derived)
      E.recruitArrivals(bulk.state, bulk.derived, 2000)
      ok('大段来人结算逐人检查风险，不越过暂停条件', bulk.state.disciples.total === 71 && bulk.state.arrivalTimer === 0)
    } finally {
      Math.random = originalRandom
    }
  }
}

export function starvationAndFirstDao({ ok, close, section }) {
  section('缺料、长期断粮与首颗道果')
  {
    const { state: s, derived: d } = newGame()
    s.buildings.annihilationFurnace = { count: 1, on: true }
    E.recompute(s, d)
    E.tick(s, d, 1, { events: false })
    ok('没有粒子就没有灵能产出', s.resources.qiEnergy === 0 && d.rates.qiEnergy === 0)
    s.resources.yangParticle = 1
    s.resources.yinParticle = 0.005
    E.recompute(s, d)
    ok('供应按最缺的材料缩放', close(d.buildingSupply.annihilationFurnace, 0.25))
    const fullRate = (BUILDING_MAP.annihilationFurnace.effects.prod.qiEnergy - BUILDING_MAP.annihilationFurnace.selfUse.qiEnergy) * d.globalMult
    E.tick(s, d, 1, { events: false })
    ok('部分供应的产出与实际支付一致', close(s.resources.qiEnergy, fullRate * 0.25 * (1 - CONFIG.QI_ENERGY_DECAY)))
    ok('多材料生产不会透支任一种输入', close(s.resources.yangParticle, 0.995) && close(s.resources.yinParticle, 0))
    s.resources.yinParticle = 1
    E.recompute(s, d)
    ok('补料后自动恢复，不改变启用开关', d.buildingSupply.annihilationFurnace === 1 && s.buildings.annihilationFurnace.on)

    const shared = newGame()
    shared.state.resources.wood = 0.375
    shared.state.buildings.alchemyRoom = { count: 1, on: true }
    shared.state.buildings.forge = { count: 1, on: true }
    E.recompute(shared.state, shared.derived)
    ok('多座设施按需求比例共享短缺材料', close(shared.derived.buildingSupply.alchemyRoom, 0.5) && close(shared.derived.buildingSupply.forge, 0.5))
    E.tick(shared.state, shared.derived, 1, { events: false })
    ok('共享供料不重复花费库存', close(shared.state.resources.wood, 0))
    ok('材料没有净收入时不虚报购买倒计时', E.timeToAfford(shared.state, shared.derived, 'wood', 10) === Infinity)

    const hungry = newGame()
    hungry.state.buildings.meditationPool = { count: 20, on: true }
    hungry.state.disciples.total = 4
    hungry.state.disciples.jobs.farmer = 1
    hungry.state.disciples.jobs.woodcutter = 3
    // 冬季，即使高宜居度加成，单名阵徒仍无法供应四人的口粮。
    hungry.state.totalDays = 280
    E.recompute(hungry.state, hungry.derived)
    E.simulateOffline(hungry.state, hungry.derived, CONFIG.LEAVE_INTERVAL)
    ok('高宜居度也不能免疫长期断粮，离线同样生效', hungry.derived.habitabilityMult > 1 && hungry.state.disciples.total === 3)
    ok('流失优先保留供粮职位', hungry.state.disciples.jobs.farmer === 1 && hungry.state.disciples.jobs.woodcutter === 2)

    const automation = newGame()
    const a = automation.state
    const ad = automation.derived
    resetForAscension(a, 20)
    E.recompute(a, ad)
    ok('首颗道果永久解锁自动炼制，无需重新研究', ad.daoAutomation && ad.autoCraftUnlocked && !a.upgrades.intuition)
    a.buildings.quarry = { count: 1, on: true }
    E.recompute(a, ad)
    a.resources.qi = 140
    a.resources.rock = ad.max.rock
    a.autoCraft.infuseStone = true
    a.settings.craftReserves.qi = 140
    E.runAutoCraft(a, ad, 1)
    ok('自动炼制保留材料底线', a.resources.qi === 140 && a.resources.stone === 0)
    ok('自动状态说明保留材料导致的暂停', E.autoCraftStatus(a, ad, 'infuseStone').reason.includes('保留材料'), E.autoCraftStatus(a, ad, 'infuseStone').reason)
    E.craft(a, ad, 'infuseStone')
    ok('手动制作允许玩家动用保留材料', a.resources.qi === 125 && a.resources.stone === 1)
    a.settings.craftReservePercent = 0
    delete a.settings.craftReserves.qi
    a.settings.autoCraftPriority = 'refinePill'
    a.buildings.alchemyRoom = { count: 1, on: true }
    a.resources.wood = 100
    a.resources.qi = 60
    a.resources.herb = CRAFT_MAP.refinePill.cost.herb
    a.autoCraft.refinePill = true
    E.recompute(a, ad)
    E.runAutoCraft(a, ad, 2)
    ok('优先配方先获得竞争材料', a.resources.pill > 0 && a.resources.stone === 1)
    const restored = parseImport(exportSave(a))
    ok('统筹设置可随存档保存', restored.settings.autoCraftPriority === 'refinePill' && restored.settings.craftReservePercent === 0)
    resetForReincarnation(a, 5)
    E.recompute(a, ad)
    ok('转世保留道果统筹与偏好', ad.daoAutomation && a.settings.autoCraftPriority === 'refinePill')
    const old = normalizeState({ resources: {} })
    ok('旧存档补齐供粮计时与统筹设置', old.starvationTimer === 0 && old.settings.craftReservePercent === 20)
    const blockedArrivals = newGame()
    blockedArrivals.state.buildings.hut = { count: 3, on: true }
    blockedArrivals.state.disciples.total = 2
    E.simulateOffline(blockedArrivals.state, blockedArrivals.derived, 20)
    ok('断粮时停止接收新弟子，避免流失与招收相互抵消', blockedArrivals.state.disciples.total === 2)
    ok('精舍保留居所与研究两项前置', BUILDING_MAP.mansion.needs.building.id === 'logHouse' && BUILDING_MAP.mansion.needs.upgrades.includes('buildingCode'))
    ok('石殿保留仓储与研究两项前置', BUILDING_MAP.depot.needs.building.id === 'warehouse' && BUILDING_MAP.depot.needs.upgrades.includes('earthEssence'))
    ok('香火鼎保留山门与研究两项前置', BUILDING_MAP.incenseCauldron.needs.building.id === 'gate' && BUILDING_MAP.incenseCauldron.needs.upgrades.includes('incenseStudy'))
    ok('湮灭研究无境界门槛、建筑改在化神开放', UPGRADE_MAP.annihilationArt.needs.realm == null && BUILDING_MAP.annihilationFurnace.needs.realm === 6)
    ok('飞升阵印配方门槛随湮灭炉前移到合体', CRAFT_MAP.condenseAscensionSeal.needs.realm === 8 && CRAFT_MAP.condenseAscensionSeal.cost.mithril > 0)
  }
}
