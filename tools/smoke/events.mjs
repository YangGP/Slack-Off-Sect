import { normalizeState } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { EVENTS, EVENT_MAP, EVENT_LEVELS, getEventLevel, isEventInRealm } from '../../src/data/events.js'
import { REALMS } from '../../src/data/realms.js'
import { newGame } from './fixtures.mjs'

export function randomEvents({ ok, section }) {
  section('随机事件')
  {
    const { state, derived } = newGame()
    state.resources.qi = 1000
    state.resources.wood = 1000
    state.resources.ore = 1000

    const rain = EVENTS.find((e) => e.id === 'spiritRain')
    E.fireEvent(state, derived, rain)
    ok('增益类事件写入 buff', state.buffs.length === 1)
    const beforeMult = derived.globalMult
    E.recompute(state, derived)
    ok('增益提升全局倍率', derived.globalMult > beforeMult, `${derived.globalMult} vs ${beforeMult}`)

    const beast = EVENTS.find((e) => e.id === 'beastRaid')
    const woodBefore = state.resources.wood
    E.fireEvent(state, derived, beast)
    ok('天灾掠夺资源', state.resources.wood < woodBefore)
    ok('天灾计数 +1', state.stats.disasters === 1)

    const pilgrim = EVENTS.find((e) => e.id === 'pilgrims')
    const faithBefore = state.resources.faith
    E.fireEvent(state, derived, pilgrim)
    ok('奇遇发放资源', state.resources.faith > faithBefore)
    ok('事件会重排下次时间', state.nextEventAt > Date.now())
  }
}

export function eventCategories({ ok, section }) {
  section('事件三分类：自然环境 / 突发 / 选择')
  {
    const byType = (ty) => EVENTS.filter((e) => e.type === ty)
    ok('三类事件都有内容', byType('nature').length > 0 && byType('sudden').length > 0 && byType('choice').length > 0,
      '环境 ' + byType('nature').length + ' / 突发 ' + byType('sudden').length + ' / 选择 ' + byType('choice').length)
    ok('每个事件都标了类别', EVENTS.every((e) => ['nature', 'sudden', 'choice'].includes(e.type)),
      EVENTS.filter((e) => !e.type).map((e) => e.id).join(',') || '全部有')

    // 自然环境类：靠临时增益/减益，主要影响产出，且有正有负
    const nature = byType('nature')
    ok('自然环境类都是临时增益/减益（影响产出）',
      nature.every((e) => e.buff && typeof e.buff.mult === 'number'),
      nature.filter((e) => !e.buff).map((e) => e.id).join(',') || '全部有')
    ok('自然环境类有正有负', nature.some((e) => e.buff.mult > 0) && nature.some((e) => e.buff.mult < 0))

    // 突发事件类：立刻结算，收获与损失都要有
    const sudden = byType('sudden')
    ok('突发事件类都是立刻结算（收获或损失）',
      sudden.every((e) => e.lootRate || e.disaster || e.recruit),
      sudden.filter((e) => !e.lootRate && !e.disaster && !e.recruit).map((e) => e.id).join(',') || '全部有')
    ok('突发事件类里"发现资源""顿悟""丢失物资"三种都在',
      sudden.some((e) => e.lootRate) && sudden.some((e) => e.lootRate?.insight) && sudden.some((e) => e.disaster))

    // 选择类：每个选项都要有收获、也有代价
    const choice = byType('choice')
    ok('选择类每个事件都有两个以上选项', choice.every((e) => (e.options || []).length >= 2),
      choice.filter((e) => (e.options || []).length < 2).map((e) => e.id).join(',') || '全部有')

    // 收益 > 代价：平铺代价可直接比"资源当量"，百分比代价只要求确实有收获
    // 资源当量：按**后期实际丰度**定 —— 灵机与灵石到那时是海量（各自二十多万），
    // 整枚的精料与进阶品才是真贵的东西；弟子按 300 计（中期一名弟子的价值）。
    const WEIGHT = {
      qi: 0.005, wood: 0.01, faith: 0.02, stone: 0.02, ore: 0.1, herb: 0.1,
      plank: 4, insight: 0.02, pill: 1, talisman: 1, artifact: 2,
      spiritTalisman: 8, spiritArtifact: 15, nineTurnPill: 15, spiritTreasure: 60,
    }
    const RECRUIT_WORTH = 300
    const worth = (obj) => Object.entries(obj || {}).reduce((s, [r, v]) => s + (WEIGHT[r] || 1) * v, 0)
    const gainWorth = (eff) => worth(eff.floor) + (eff.recruit || 0) * RECRUIT_WORTH
    const problems = []
    for (const e of choice) {
      for (const o of e.options) {
        const eff = o.effect || {}
        if (eff.decline || e.threat) continue
        const hasGain = !!(eff.lootRate || eff.recruit)
        // 代价可以是比例（costShare，随资源缩放）、绝对值（cost）或按比例掠夺（disaster）
        const hasCost = !!(eff.cost || eff.costShare || eff.tradeCost || eff.disaster)
        if (!hasGain) problems.push(e.id + '/' + o.label + '：没有收获')
        if (!hasCost) problems.push(e.id + '/' + o.label + '：没有代价')
        // 绝对值代价仍按当量比较；比例代价由下面三条结构规则守（30% 上限 + 按产出发放）
        if (eff.cost && gainWorth(eff) < worth(eff.cost)) {
          problems.push(e.id + '/' + o.label + '：保底收益 ' + gainWorth(eff).toFixed(0) + ' < 平铺代价 ' + worth(eff.cost).toFixed(0))
        }
      }
    }
    ok('选择类：参与选项都有收获与代价', problems.length === 0, problems.slice(0, 3).join('；') || '全部合规')

    // 挂钩当前境界与资源（三条结构规则）
    {
      const flatCost = []
      const noRate = []
      const tooHeavy = []
      for (const e of EVENTS) {
        if (e.type !== 'choice') continue
        for (const o of e.options) {
          const eff = o.effect || {}
          if (eff.decline || e.threat) continue
          if (eff.cost) flatCost.push(e.id + '/' + o.label)
          // 收获必须是"当前产出的多少秒" —— 产出随境界与建筑缩放，奖励因此水涨船高
          if (!eff.lootRate) noRate.push(e.id + '/' + o.label)
          // 代价是存量比例，且不该一次拿走三成以上
          for (const [res, share] of Object.entries(eff.costShare || {})) {
            if (share > 0.3) tooHeavy.push(e.id + '/' + o.label + ' ' + res + ' ' + share)
          }
        }
      }
      ok('选择类使用产能交易或比例风险，避免固定价格随进度稀释', flatCost.length === 0, flatCost.join('、') || '全部动态')
      ok('选择类的收获都按"当前产出的多少秒"发放（随境界与资源缩放）', noRate.length === 0, noRate.join('、') || '全部按产出')
      ok('选择类的比例代价不超过存量的 30%', tooHeavy.length === 0, tooHeavy.join('、') || '全部在 30% 以内')

      // 高境界的选择要"更贵"：代价比例（costShare 与 disaster 中值）随 minRealm 抬升
      const costLevel = (e) => {
        const vals = []
        for (const o of e.options) {
          const eff = o.effect || {}
          for (const v of Object.values(eff.costShare || {})) vals.push(v)
          for (const cost of Object.values(eff.tradeCost || {})) vals.push(cost.seconds / 600)
          if (eff.disaster?.lossPercent) {
            vals.push((eff.disaster.lossPercent[0] + eff.disaster.lossPercent[1]) / 2)
          }
        }
        return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
      }
      const pick = (lo, hi) =>
        EVENTS.filter((e) => e.type === 'choice' && (e.minRealm || 0) >= lo && (e.minRealm || 0) <= hi)
      const avgLevel = (list) =>
        list.reduce((s, e) => s + costLevel(e), 0) / Math.max(list.length, 1)
      const lowTier = pick(0, 6)
      const highTier = pick(7, 10)
      ok(
        '高境界的选择更贵（交易时长与风险水平平均更高）',
        highTier.length >= 4 && avgLevel(highTier) > avgLevel(lowTier),
        '低境界 ' + (avgLevel(lowTier) * 100).toFixed(0) + '% vs 高境界 ' + (avgLevel(highTier) * 100).toFixed(0) + '%',
      )
      ok('高境界（≥7）的选择至少四条', highTier.length >= 4, String(highTier.length))

      // 行为验证：同一事件在不同产出下给的东西不同
      const gainAt = (rate) => {
        const { state: s, derived: d } = newGame()
        d.rates = { ...d.rates, artifact: rate }
        s.pendingChoice = { id: 'ancientCave', at: 0 }
        const before = s.resources.artifact || 0
        E.resolveChoice(s, d, 0)
        return (s.resources.artifact || 0) - before
      }
      const low = gainAt(0.01)
      const high = gainAt(1)
      ok('同一事件在高产出的存档里给得更多（与资源挂钩）', high > low, low + ' → ' + high)
    }
  }
}

export function eventRewardsAndTrades({ ok, close, section }) {
  section('事件工艺奖励与交易')
  {
    const { state: s, derived: d } = newGame()
    s.realm = 4
    s.upgrades.woodworking = true
    s.upgrades.talismanArt = true
    s.upgrades.arrayAssembly = true
    s.buildings.forge = { count: 1, on: true }
    s.buildings.talismanHall = { count: 1, on: true }
    s.buildings.workshop = { count: 1, on: true }
    s.resources.wood = 1000 // 为专业工位提供持续维护。
    E.recompute(s, d)
    d.rates = { ...d.rates, wood: 350, qi: 500, ore: 100, stone: 30 }
    const rate = E.eventResourceRate(s, d, 'arrayBase')
    ok('组合工艺奖励可沿木板、玄铁与灵气追溯产能', rate > 0 && rate <= E.craftYield(d, CRAFT_MAP.assembleArrayBase) / 4)
    const low = E.eventOutcome(s, d, { lootRate: { artifact: 30 }, floor: { artifact: 1 } }).rows[0].gained
    d.craftBonus += 1
    const high = E.eventOutcome(s, d, { lootRate: { artifact: 30 }, floor: { artifact: 1 } }).rows[0].gained
    ok('工艺品奖励随制作加成成长', high > low)
    // 断掉灵木产率之后，木作产能仍可沿"催生灵木"追到灵气 —— 这是新增的一条上游路径
    d.rates.wood = 0
    ok(
      '灵木产率断了，但灵气在手时仍可沿"催生灵木"追到产能',
      E.eventResourceRate(s, d, 'arrayBase') > 0,
      String(E.eventResourceRate(s, d, 'arrayBase')),
    )
    // 再把灵气也断了，才是真的"上游短板"
    d.rates.qi = 0
    ok('灵气与灵木都断了，工艺产能归零', E.eventResourceRate(s, d, 'arrayBase') === 0)
    s.buildings.forge.count = 0
    ok('未解锁配方不虚构加工产能', E.eventResourceRate(s, d, 'artifact') === 0)

    const trade = EVENT_MAP.caravan.options[0].effect
    d.rates.herb = 1
    s.resources.herb = 0
    const empty = E.eventOutcome(s, d, trade)
    s.resources.herb = d.max.herb
    const stocked = E.eventOutcome(s, d, trade)
    ok('交易价格不随囤货增加', empty.required.herb === stocked.required.herb)
    ok('空库存无法领取交易奖励', !empty.affordable && stocked.affordable)
    d.rates.herb = 100000
    const capped = E.eventOutcome(s, d, trade)
    ok('交易价格有仓储比例上限', capped.required.herb <= Math.max(40, d.max.herb * 0.1))
    d.disasterGuard = 0.9
    ok('护山减损不抵扣交易用料', E.eventOutcome(s, d, trade).required.herb === capped.required.herb)
    s.resources.herb = 0
    s.pendingChoice = { id: 'caravan', at: 0 }
    const before = JSON.stringify(s.resources)
    ok('引擎拒绝材料不足的选择并保留待决', E.resolveChoice(s, d, 0) === null && s.pendingChoice?.id === 'caravan')
    ok('失败交易不扣料、不发奖', JSON.stringify(s.resources) === before)
    const skip = EVENT_MAP.caravan.options.findIndex(o => o.effect.decline)
    E.resolveChoice(s, d, skip)
    ok('不介入可退出且不改变资源', !s.pendingChoice && JSON.stringify(s.resources) === before)
    s.resources.herb = d.max.herb
    s.pendingChoice = { id: 'caravan', at: 0 }
    const expected = E.eventOutcome(s, d, trade)
    const stocks = { ...s.resources }
    E.resolveChoice(s, d, 0)
    ok('付费交易的预览和实际结算相符', expected.rows.every(row => close(s.resources[row.res], (stocks[row.res] || 0) - row.lost + row.gained)))
    ok('普通机会可无代价退出，威胁必须提供默认防守', EVENTS.filter(e => e.type === 'choice').every(e => e.options.some(o => e.threat ? o.effect.beastResponse === 'default' : o.effect.decline)))
    ok('阵基接入至少三条现有事件', EVENTS.filter(e => e.lootRate?.arrayBase || e.options?.some(o => o.effect.lootRate?.arrayBase)).length >= 3)
    ok('交易最低用料和产能时长有效', EVENTS.every(e => (e.options || []).every(o => Object.values(o.effect.tradeCost || {}).every(c => c.floor > 0 && c.seconds > 0))))
  }
}

export function eventChoices({ ok, close, section }) {
  section('选择类的结算流程')
  {
    const { state, derived } = newGame()
    const ev = EVENT_MAP.ancientCave
    state.resources.wood = 100
    state.nextEventAt = Date.now() - 1000
    E.fireEvent(state, derived, ev)
    ok('选择触发时立即重排计时，避免下个 tick 连发', state.nextEventAt > Date.now())
    const plannedAt = state.nextEventAt
    ok('显式触发也不会覆盖未决选择', E.fireEvent(state, derived, EVENT_MAP.stoneStele) === null && state.pendingChoice.id === ev.id)
    const preview = E.eventOutcome(state, derived, ev.options[0].effect)
    ok('选择预览包含实际损失', preview.rows.find(r => r.res === 'wood').lost === 12)
    E.resolveChoice(state, derived, 0)
    ok('收益与灾损同时结算，不再吞掉损失', state.resources.wood === 88 && state.resources.artifact === 2)
    ok('结算选择不推迟下一次自然事件', state.nextEventAt === plannedAt)
    ok('预览与结算的收益一致', preview.rows.every(r => state.resources[r.res] === ({ wood: 100 }[r.res] || 0) - r.lost + r.gained))
    state.stats.choicesMade = 0
    E.fireEvent(state, derived, ev)
    ok('选择类触发后进入待决，不立即生效', !!state.pendingChoice && state.pendingChoice.id === ev.id,
      JSON.stringify(state.pendingChoice))

    let sawChoice = false
    for (let i = 0; i < 300; i++) {
      const fired = E.fireEvent(state, derived)
      if (fired && fired.type === 'choice') sawChoice = true
    }
    ok('待决期间不会再抽到选择类', !sawChoice)

    const before = { ...state.resources }
    E.resolveChoice(state, derived, 0)
    ok('结算后清空待决', !state.pendingChoice)
    ok('结算应用了所选选项的效果', Object.entries(state.resources).some(([k, v]) => v > (before[k] || 0)))
    ok('结算记了一笔（stats.choicesMade）', state.stats.choicesMade === 1, String(state.stats.choicesMade))
    ok('待决为空时结算不报错', E.resolveChoice(state, derived, 0) === null)
  }
  {
    const { state, derived } = newGame()
    state.resources.herb = derived.max.herb
    const herbBefore = state.resources.herb
    const spec = { costShare: { herb: 0.1 }, disaster: { resources: ['herb'], lossPercent: [0.1, 0.1] }, lootRate: { herb: 100 }, floor: { herb: 100 } }
    const result = E.eventOutcome(state, derived, spec).rows[0]
    E.fireEvent(state, derived, { id: 'testMixed', type: 'sudden', text: '混合结算', kind: 'event', ...spec })
    ok('同资源先付代价再收奖励，预览与结算一致', close(state.resources.herb, herbBefore - result.lost + result.gained))
    ok('仓储截断在预览中显示', result.overflow > 0 && state.resources.herb === derived.max.herb)
    state.resources.wood = 100
    derived.disasterGuard = 0.5
    const guarded = E.eventOutcome(state, derived, EVENT_MAP.ancientCave.options[0].effect)
    ok('预览包含护山减损', guarded.rows.find(r => r.res === 'wood').lost === 6)
    state.disciples.total = derived.maxDisciples
    ok('满员时预览不会许诺收徒', E.eventOutcome(state, derived, { recruit: 1 }).recruits === 0)
  }
}

export function eventRewardCaps({ ok, close, section }) {
  section('单次事件奖励上限')
  {
    const { state: s, derived: d } = newGame()
    s.realm = 10
    s.resources.insight = 0
    d.rates.insight = 1000
    const spec = EVENT_MAP.tribulationTrial.options[0].effect
    const reward = E.eventOutcome(s, d, spec).rows.find(row => row.res === 'insight')
    ok('后期巨额产能奖励与保底均受20%仓储上限约束', reward.gained === 40 && reward.overflow === 0)
    s.resources.insight = d.max.insight - 10
    const nearFull = E.eventOutcome(s, d, spec).rows.find(row => row.res === 'insight')
    ok('奖励限额与实际仓储溢出分开结算', nearFull.gained === 10 && nearFull.overflow === 30)
    s.resources.insight = d.max.insight
    const full = E.eventOutcome(s, d, spec).rows.find(row => row.res === 'insight')
    ok('满仓时不产生虚假到账', full.gained === 0 && full.overflow === 40)
    const fractional = E.eventOutcome(s, d, { lootRate: { stone: 1000 }, floor: { stone: 1000 } }).rows[0]
    ok('整数资源的奖励上限向下取整', fractional.gained === Math.floor(d.max.stone * 0.2))
    s.resources.insight = 0
    s.resources.stone = 100
    s.resources.spiritTalisman = 10
    s.pendingChoice = { id: 'tribulationTrial', at: Date.now() }
    const preview = E.eventOutcome(s, d, spec)
    const before = { ...s.resources }
    E.resolveChoice(s, d, 0)
    ok('限额后的付费事件预览、扣料与到账一致', preview.affordable && preview.rows.every(row => close(s.resources[row.res], before[row.res] - row.lost + row.gained)))
  }
}

export function eventLogMigration({ ok, section }) {
  section('事件三级分类与纪事兼容')
  {
    ok('事件目录定义三级且等级标识唯一', EVENT_LEVELS.map(l => l.id).join(',') === '1,2,3')
    ok('全部正式事件显式声明合法等级', EVENTS.every(e => EVENT_LEVELS.some(l => l.id === e.level)))
    ok('三个等级均有实际内容', EVENT_LEVELS.every(l => EVENTS.some(e => e.level === l.id)))
    ok('等级按境界阶段划分，处理类型独立', EVENT_MAP.ancestorBless.level === 1 && EVENT_MAP.ancientCave.level === 1 && EVENT_MAP.heavenGate.type === 'nature' && EVENT_MAP.heavenGate.level === 3 && EVENT_MAP.beastThreat.level === 2)
    ok('全部事件的境界门槛与阶段存在交集', EVENTS.every(e => REALMS.some((_, realm) => isEventInRealm(e, realm))))
    ok('筑基到金丹切换一级二级事件池', isEventInRealm(EVENT_MAP.spiritRain, 3) && !isEventInRealm(EVENT_MAP.spiritRain, 4) && !isEventInRealm(EVENT_MAP.beastThreat, 3) && isEventInRealm(EVENT_MAP.beastThreat, 4))
    ok('化神到炼虚切换二级三级事件池', isEventInRealm(EVENT_MAP.beastThreat, 6) && !isEventInRealm(EVENT_MAP.beastThreat, 7) && !isEventInRealm(EVENT_MAP.thunderTemper, 6) && isEventInRealm(EVENT_MAP.thunderTemper, 7))
    ok('阶段内仍遵守细分境界门槛', !isEventInRealm(EVENT_MAP.beastCub, 4) && isEventInRealm(EVENT_MAP.beastCub, 6) && !isEventInRealm(EVENT_MAP.heavenGate, 7) && isEventInRealm(EVENT_MAP.heavenGate, 8))
    for (const realm of [3, 4, 6, 7]) {
      const { state: stage, derived: sd } = newGame()
      stage.realm = realm
      const expected = realm < 4 ? 1 : realm < 7 ? 2 : 3
      let valid = true
      for (let i = 0; i < 100; i++) {
        stage.pendingChoice = null
        const event = E.fireEvent(stage, sd)
        if (event && event.level !== expected) valid = false
      }
      ok(`${REALMS[realm].name}随机抽取只来自当前阶段`, valid)
    }
    ok('旧调试事件缺失或无效等级时归日常', getEventLevel({}).id === 1 && getEventLevel({ level: 99 }).id === 1)
    const { state: s, derived: d } = newGame()
    E.fireEvent(s, d, EVENT_MAP.spiritRain)
    ok('即时事件纪事保留事件id和等级', s.log[0].eventId === 'spiritRain' && s.log[0].eventLevel === 1 && s.log[0].kind === 'good')
    E.fireEvent(s, d, EVENT_MAP.grottoRift)
    ok('选择预兆纪事记录天地级', s.log[0].eventId === 'grottoRift' && s.log[0].eventLevel === 3)
    E.resolveChoice(s, d, EVENT_MAP.grottoRift.options.findIndex(o => o.effect.decline))
    ok('选择结束后保留来源等级', s.log[0].eventId === 'grottoRift' && s.log[0].eventLevel === 3)
    s.realm = 4
    E.fireEvent(s, d, EVENT_MAP.beastThreat)
    s.pendingChoice.deadline = Date.now() - 1
    E.settleExpiredThreat(s, d)
    ok('自动防守及安宁纪事均保留宗门级', s.log.slice(0, 2).every(row => row.eventId === 'beastThreat' && row.eventLevel === 2))
    const saved = normalizeState(JSON.parse(JSON.stringify(s)))
    ok('等级元数据可随纪事存读档', saved.log[0].eventLevel === 2 && saved.log[0].eventId === 'beastThreat')
    const old = normalizeState({ log: [{ id: 1, text: '旧纪事', kind: 'event' }] })
    ok('旧纪事保留原文且不臆测等级', old.log[0].text === '旧纪事' && old.log[0].eventLevel === undefined)
    const reclassified = normalizeState({ log: [{ id: 1, text: '祖师显灵', eventId: 'ancestorBless', eventLevel: 2 }] })
    ok('有来源的旧纪事按修正后的阶段归属读档', reclassified.log[0].eventLevel === 1)
    const { state: crossed, derived: cd } = newGame()
    E.fireEvent(crossed, cd, EVENT_MAP.ancientCave)
    crossed.realm = 4
    ok('突破后仍能结束前阶段未决事务', !!E.resolveChoice(crossed, cd, EVENT_MAP.ancientCave.options.findIndex(o => o.effect.decline)) && crossed.pendingChoice === null)
    E.pushLog(s, '日常建造', 'good')
    ok('普通操作纪事不被标成事件', s.log[0].eventLevel === undefined && s.log[0].eventId === undefined)
  }
}
