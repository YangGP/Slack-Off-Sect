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
