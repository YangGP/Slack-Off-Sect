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
import { discipleDismissalCost } from '../../src/data/disciples.js'

export function incomeBreakdown({ ok, close, section }) {
  section('进项来源明细')
  {
    const { state, derived } = newGame()
    state.realm = 4
    let dismissal = null
    for (const [population, multiplier] of [[20, 1], [21, 1.005], [100, 1.4], [220, 2], [400, 2]]) {
      state.disciples.total = population
      E.recompute(state, derived)
      ok(`人口${population}人的规模倍率为${multiplier}`, close(derived.populationUpkeepMult, multiplier, 1e-9))
      const base = derived.discipleWeight * CONFIG.DISCIPLE_UPKEEP * derived.realmMult ** CONFIG.DISCIPLE_UPKEEP_REALM_EXP
      ok('规模口粮计入实际扣费及来源总额', close(derived.upkeep, base * multiplier, 1e-9) &&
        close(derived.expenseSources.qi.reduce((sum, item) => sum + item.value, 0), -derived.upkeep, 1e-9))
      const fee = discipleDismissalCost(state.disciples.members[0], state.realm)
      if (dismissal === null) dismissal = fee
      ok('人口规模不改变逐出定价', fee === dismissal)
    }
    state.disciples.members[0].realm = 2
    state.resources.qi = 100000
    E.recompute(state, derived)
    const upkeep = derived.upkeep
    const consumed = state.disciples.members.reduce((sum, member) => sum + member.totalQiConsumed, 0)
    E.tick(state, derived, 1, { events: false })
    const consumedAfter = state.disciples.members.reduce((sum, member) => sum + member.totalQiConsumed, 0)
    ok('不同个体境界的口粮分摊包含规模成本且只扣一次',
      close(consumedAfter - consumed, upkeep, 1e-6) && close(100000 - state.resources.qi, upkeep, 1e-6))
  }
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
      // D4 后灵石不再垫底：需求÷仓容比全游戏最高（因果池 300,000），份额上调到矿石之上
      ok('份额按流量排序（灵木最多、矿石最少、灵石≥灵草）', st.wood > st.rock && st.rock > st.stone && st.stone >= st.herb && st.herb > st.ore, JSON.stringify(st))
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
