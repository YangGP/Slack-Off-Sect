import { createInitialState, normalizeState, resetForAscension, resetForReincarnation } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { RESOURCES } from '../../src/data/resources.js'
import { UPGRADE_MAP } from '../../src/data/upgrades.js'
import { CRAFTS } from '../../src/data/crafts.js'
import { REALMS, ASCEND_REALM_INDEX, REINCARNATE_REALM_INDEX, BREAKTHROUGH_AIDS } from '../../src/data/realms.js'
import { CONFIG } from '../../src/data/config.js'
import { exportSave, parseImport } from '../../src/game/save.js'
import { newGame, successfulBreakthrough } from './fixtures.mjs'

export function researchAndAscension({ ok, close, section }) {
  section('修真·技艺 / 境界 / 飞升')
  {
    const { state, derived } = newGame()
    ok('初始没有能支付的修真或技艺', derived.availableUpgrades.every(id => !E.canAfford(state, UPGRADE_MAP[id].cost)))

    state.resources.qi = E.money(5000)
    state.resources.wood = E.money(5000)
    state.resources.stone = E.money(500)
    state.resources.herb = E.money(500)
    state.buildings.spiritField = { count: 3, on: true } // 藏经阁现在要三座聚灵阵，且不要灵草
    E.buyBuilding(state, derived, 'hut', 1)
    E.buyBuilding(state, derived, 'library', 1)
    ok('建成藏经阁仍需研究灵源考才出现引气诀', !derived.availableUpgrades.includes('qiArt'))
    state.upgrades.qiOrigin = true
    E.recompute(state, derived)
    ok('研究灵源考后出现引气诀', derived.availableUpgrades.includes('qiArt'))

    state.resources.insight = E.money(100)
    const okResearch = E.research(state, derived, 'qiArt')
    ok('参悟成功', okResearch === true && state.upgrades.qiArt === true)
    // 引气诀 +10% 要作用在产出源上才看得出来：先补一座聚灵阵
    state.resources.qi = E.money(100)
    E.buyBuilding(state, derived, 'spiritField', 1)
    const fields = E.countOf(state, 'spiritField')
    ok(
      `灵气产出加成生效（聚灵阵 ${fields} × 0.3 × 引气诀 1.1 × 春季 1.2）`,
      close(derived.rates.qi, fields * 0.3 * 1.1 * 1.2, 1e-6),
      `实际 ${derived.rates.qi}`,
    )

    const { state: s2, derived: d2 } = newGame()
    // 破境材料横跨基础资源与进阶成品，逐项列举容易漏（每加一种料就断）—— 统一补满。
    for (const r of RESOURCES) s2.resources[r.id] = E.money(1e7)
    const okBreak = successfulBreakthrough(s2, d2)
    ok('破境成功', okBreak === true && s2.realm === 1)
    ok('境界倍率提升', d2.realmMult > 1)

    // 一路推到渡劫期
    let guard = 0
    while (successfulBreakthrough(s2, d2) && guard++ < 50) {
      // 补满**所有**资源：早先这里逐个列了 7 种，加了进阶品之后
      // 一路只推到第 8 境就断了（夹具的错，不是玩法的错）—— 改成通用写法，以后新增资源不会再犯。
      for (const r of RESOURCES) s2.resources[r.id] = E.money(1e7)
    }
    ok('可修到渡劫期', s2.realm === ASCEND_REALM_INDEX, `实际 ${s2.realm}`)
    ok('渡劫期即可飞升（不要求转世次数）', E.canAscend(s2) === true)
    s2.stats.reincarnations = 0
    ok('一次都没转世也能飞升（转世只是常见路线）', E.canAscend(s2) === true)
    s2.realm = ASCEND_REALM_INDEX - 1
    ok('境界不到渡劫期则不能飞升', E.canAscend(s2) === false)
    s2.realm = ASCEND_REALM_INDEX

    s2.stats.lifeInsight = E.money(2e6)
    const gain = E.ascensionGain(s2, d2)
    ok('飞升可获得仙缘', E.moneyIsPositive(gain), `实际 ${gain}`)

    resetForAscension(s2, gain)
    E.recompute(s2, d2)
    ok('飞升后境界归零', s2.realm === 0)
    ok('飞升后建筑清空', Object.keys(s2.buildings).length === 0)
    ok('飞升后保留仙缘', E.moneyEq(s2.karma, gain))
    ok('飞升后保留成就', true)
    ok('仙缘提供全局加成', E.moneyGt(d2.karmaMult, 1))
    ok('飞升次数 +1', s2.stats.ascensions === 1)

    // 回归：飞升后的第二世必须跟第一次开山一样从零起步（曾经漏改，一飞升就白送 2 人 1 阵徒）
    ok('飞升后弟子归零', s2.disciples.total === 0, `实际 ${s2.disciples.total}`)
    ok('飞升后职位清空', Object.values(s2.disciples.jobs).every((n) => n === 0))
    ok('飞升后弟子上限为 0（没有居所）', d2.maxDisciples === 0, `实际 ${d2.maxDisciples}`)
    ok('飞升后资源清空', E.RESOURCES.filter(r => r.id !== 'karma' && r.id !== 'dao').every(v => E.moneyIsZero(s2.resources[v.id])))
    // 永久货币在 resources 里有镜像（见 docs/ENGINEERING.md「数值与存档」）：两处必须一致。
    ok('飞升后永久货币镜像一致', s2.resources.karma.eq(s2.karma) && s2.resources.dao.eq(s2.dao))
    ok('飞升后修真与技艺清空', Object.keys(s2.upgrades).length === 0)
    ok('飞升后法宝祭炼等级清空', Object.keys(s2.treasureLevels).length === 0)
    ok('飞升后左栏回到只有灵气', Object.keys(s2.seen).join() === 'qi')
    ok('飞升后建筑列表回到开局（渐进露出重置）', !E.isBuildingUnlocked(s2, 'lumberYard'))
    ok('飞升后仍然没有任何建筑可造（连聚灵阵都还没露面）', !E.isBuildingUnlocked(s2, 'spiritField'))
    ok('飞升后制作进度与自动开关清空', Object.keys(s2.craftProgress).length === 0 && Object.keys(s2.autoCraft).length === 0)
  }
}

export function reincarnation({ ok, close, section }) {
  section('转世（化神期起，清空范围与飞升相同）')
  {
    const { state, derived } = newGame()
    state.realm = REINCARNATE_REALM_INDEX - 1
    E.recompute(state, derived)
    ok('元婴期还不能转世', !E.canReincarnate(state), REALMS[state.realm].name)

    state.realm = REINCARNATE_REALM_INDEX
    E.recompute(state, derived)
    ok(
      '化神期即可转世（且此时还不能飞升）',
      E.canReincarnate(state) && !E.canAscend(state),
      REALMS[state.realm].name + ' / 飞升需 ' + REALMS[ASCEND_REALM_INDEX].name,
    )

    // 同一条公式：越晚结算越值钱
    state.stats.lifeInsight = E.money(40000)
    E.recompute(state, derived)
    const atShen = E.reincarnationGain(state, derived)
    state.realm = ASCEND_REALM_INDEX
    E.recompute(state, derived)
    const atDujie = E.ascensionGain(state, derived)
    const gainRatio = E.moneyToNumber(atDujie.div(atShen))
    ok('化神期转世能结算仙缘', E.moneyIsPositive(atShen), String(atShen))
    ok('渡劫期飞升拿得更多（同一公式，门槛更高）', E.moneyGt(atDujie, atShen), atShen + ' → ' + atDujie)
    ok('两者用同一条公式（境界因子 1+境界×0.3）', close(gainRatio, (1 + ASCEND_REALM_INDEX * 0.3) / (1 + REINCARNATE_REALM_INDEX * 0.3), 0.02), gainRatio.toFixed(3))

    // 清空范围：与飞升完全一样（连修真 / 技艺·法宝 都不保留）
    const st = createInitialState()
    const dv = E.createDerived()
    E.recompute(st, dv)
    st.buildings.hut = { count: 3, on: true }
    st.upgrades.qiOrigin = true
    st.upgrades.qiArt = true
    st.treasureLevels.spiritBanner = 3
    st.resources.qi = E.money(1234)
    st.disciples.total = 5
    st.realm = REINCARNATE_REALM_INDEX
    st.karma = E.money(10)
    st.achievements.firstHut = true
    const gain = 22
    resetForReincarnation(st, gain)
    E.recompute(st, dv)
    ok('转世后境界回凡体', st.realm === 0, String(st.realm))
    ok('转世后修真 / 技艺·法宝清空（与飞升一致）', Object.keys(st.upgrades).length === 0, Object.keys(st.upgrades).join(','))
    ok('转世后法宝等级清空', Object.keys(st.treasureLevels).length === 0)
    ok('转世后建筑 / 弟子 / 资源清空', Object.keys(st.buildings).length === 0 && st.disciples.total === 0 && E.moneyIsZero(st.resources.qi))
    ok('转世结算仙缘', E.moneyEq(st.karma, E.money(10).plus(gain)), String(st.karma))
    ok('转世计数与飞升计数分开', st.stats.reincarnations === 1 && (st.stats.ascensions || 0) === 0, '转世 ' + st.stats.reincarnations + ' / 飞升 ' + (st.stats.ascensions || 0))
    ok('成就与统计保留', st.achievements.firstHut === true)
  }
}

export function karmaSoftCap({ ok, close, section }) {
  section('道果与仙缘软上限（第 3 步）')
  {
    const { state, derived } = newGame()
    state.realm = ASCEND_REALM_INDEX
    state.stats.reincarnations = 0 // 转世不是门槛：一次都没转世也能飞升
    state.stats.lifeInsight = E.money(2e6)
    E.recompute(state, derived)
    const before = { dao: E.money(state.dao), mult: derived.daoMult, gain: E.ascensionGain(state, derived) }
    ok('飞升前没有道果', E.moneyIsZero(before.dao), String(before.dao))

    // 模拟一次飞升的结算（只跑重置函数，不动其它）
    resetForAscension(state, 0)
    E.recompute(state, derived)
    ok('飞升结一颗道果', E.moneyEq(state.dao, 1), String(state.dao))
    ok('道果提升全局产出（+5%/颗）', close(derived.daoMult, 1.05, 1e-9), '×' + E.moneyToNumber(derived.daoMult).toFixed(3))

    // 道果反哺下层：同一份「本世灵机」，有 1 颗道果时仙缘多 10%
    const probe = (dao) => {
      const s3 = createInitialState()
      const d3 = E.createDerived()
      s3.realm = REINCARNATE_REALM_INDEX
      s3.stats.lifeInsight = E.money(40000)
      s3.dao = E.money(dao)
      E.recompute(s3, d3)
      return E.reincarnationGain(s3, d3)
    }
    const g0 = probe(0)
    const g1 = probe(1)
    ok('道果让转世拿到的仙缘更多（+10%/颗）', E.moneyGt(g1, g0), g0 + ' → ' + g1)

    // 仙缘软上限：前 75% 不打折，之后渐近到 +200%
    ok('软上限：小数值不打折', close(E.softCap(1, 2), 1, 1e-9), String(E.softCap(1, 2)))
    ok('软上限：超过 75% 后打折但仍在涨', E.moneyGt(E.softCap(1.8, 2), 1.5) && E.moneyLt(E.softCap(1.8, 2), 2), E.moneyToNumber(E.softCap(1.8, 2)).toFixed(3))
    ok('软上限：永远到不了上限', E.moneyLt(E.softCap(1000, 2), 2) && E.moneyGt(E.softCap(1000, 2), 1.99), E.moneyToNumber(E.softCap(1000, 2)).toFixed(4))

    const s4 = createInitialState()
    const d4 = E.createDerived()
    s4.karma = E.money(50)
    E.recompute(s4, d4)
    const low = d4.karmaMult
    s4.karma = E.money(500)
    E.recompute(s4, d4)
    const high = d4.karmaMult
    ok('仙缘加成随点数上涨但被压住（500 点 < 线性外推）',
      E.moneyLt(high, 1 + 500 * CONFIG.KARMA_BONUS_PER_POINT) && E.moneyGt(high, low),
      E.moneyToNumber(low).toFixed(2) + ' → ' + E.moneyToNumber(high).toFixed(2))
  }
}

export function breakthroughRisk({ ok, close, section }) {
  section('破境概率与失败结算')
  {
    const setup = (realm) => {
      const s = createInitialState(), d = E.createDerived()
      s.realm = realm
      s.stats.lifeInsight = E.money(200000)
      s.karma = E.money(50)
      s.dao = E.money(2)
      E.recompute(s, d)
      for (const id of Object.keys(s.resources)) s.resources[id] = E.money(100000)
      // 风险边界用例先备足当前境界的完整护道报价，避免调价后变成材料不足用例。
      const aids = Object.fromEntries((BREAKTHROUGH_AIDS[realm + 1] || []).map(aid => [aid.id, true]))
      for (const [id, amount] of Object.entries(E.breakthroughPreview(s, d, aids).cost)) {
        s.resources[id] = E.moneyMax(s.resources[id] ?? E.ZERO, amount)
      }
      return [s, d]
    }
    for (let realm = 0; realm < 10; realm++) {
      const [s, d] = setup(realm)
      const p = E.breakthroughPreview(s, d)
      ok(`境界${realm}基础概率遵守阶段`, close(p.baseChance, realm < 3 ? 0.95 : realm === 3 ? 0.70 : realm >= 7 ? 0.20 - (realm - 7) * 0.05 : 0.6 - (realm - 4) * 0.05))
      ok(`境界${realm}身死风险遵守金丹分界`, realm < 4 ? p.deathRisk === 0 : p.deathRisk > 0)
      ok(`境界${realm}退境风险遵守炼虚分界`, realm < 7 ? p.regressionRisk === 0 : close(p.regressionOnFailure + p.deathOnFailure, 1))
      const options = Object.fromEntries(p.availableAids.map(aid => [aid.id, true]))
      const aided = E.breakthroughPreview(s, d, options)
      ok(`目标境界${realm + 1}独立配置两组护道与香火`, p.availableAids.length === 3 && p.availableAids[2].cost.faith > 0)
      ok(`目标境界${realm + 1}满配概率符合设计`, close(aided.chance, realm < 3 ? 0.99 : realm === 3 ? 0.90 : 0.85 - (realm - 4) * 0.05) && close(p.maxChance, aided.chance))
      const expected = { ...E.realmCost(s, d, realm + 1) }
      for (const aid of p.availableAids) {
        for (const [res, amount] of Object.entries(aid.cost)) expected[res] = E.money(expected[res]).plus(amount)
      }
      ok(`目标境界${realm + 1}基础和辅助费用相加`, Object.entries(expected).every(([res, amount]) => close(aided.cost[res], amount)))
      for (const aid of p.availableAids) {
        for (const [res, amount] of Object.entries(aid.cost)) {
          const [poor, pd] = setup(realm)
          const base = E.realmCost(poor, pd, realm + 1)
          poor.resources[res] = E.money(base[res]).plus(amount).minus(1)
          const before = { ...poor.resources }
          ok(`目标境界${realm + 1}方案${aid.name}缺${res}不可支付`, !E.breakthrough(poor, pd, { [aid.id]: true }, () => { throw Error('不应掷骰') }) && Object.entries(before).every(([id, have]) => E.moneyEq(poor.resources[id], have)))
        }
      }
      const obsolete = Object.fromEntries((BREAKTHROUGH_AIDS[realm === 0 ? 10 : realm] || []).map(aid => [aid.id, true]))
      ok(`目标境界${realm + 1}不沿用其他境界方案`, close(E.breakthroughPreview(s, d, obsolete).chance, p.baseChance))
      // 所有护道加工品在冲关前即可解锁生产，不要求下一境的配方。
      for (const aid of p.availableAids) {
        for (const res of Object.keys(aid.cost)) {
          const recipe = CRAFTS.find(c => c.out === res)
          if (recipe) ok(`目标境界${realm + 1}的${res}可提前生产`, (recipe.needs?.realm || 0) <= realm)
        }
      }
    }
    const [early, ed] = setup(3)
    const ec = E.realmCost(early, ed, 4)
    ok('金丹70%边界失败不倒退、只扣突破材料', !E.breakthrough(early, ed, {}, () => 0.70) && early.realm === 3 && E.moneyEq(early.resources.pill, E.money(100000).minus(ec.pill)) && early.buffs.length === 0)
    const [golden, gd] = setup(3)
    ok('金丹低于70%边界时突破成功', E.breakthrough(golden, gd, {}, () => 0.699) && golden.realm === 4)
    const [s, d] = setup(4)
    const all = Object.fromEntries(BREAKTHROUGH_AIDS[5].map(aid => [aid.id, true]))
    const p = E.breakthroughPreview(s, d, all)
    ok('元婴护道叠加25个百分点且计入报价', close(p.chance, 0.85) && E.moneyEq(p.cost.faith, 250) && E.moneyEq(p.cost.immortalHerb, 8) && E.moneyEq(p.cost.arrayBase, 4) && E.moneyEq(p.cost.talisman, REALMS[5].cost.talisman + 20))
    const [capped, cd] = setup(0)
    const earlyOptions = Object.fromEntries(BREAKTHROUGH_AIDS[1].map(aid => [aid.id, true]))
    ok('成功率最高99%', E.breakthroughPreview(capped, cd, earlyOptions).chance === 0.99)
    const [poor, pd] = setup(4)
    poor.resources.faith = E.money(249)
    ok('辅助材料不足不支付、不掷骰', !E.breakthrough(poor, pd, all, () => { throw Error('不应掷骰') }) && E.moneyEq(poor.resources.qi, 100000))
    ok('渡劫失败境界不变', !E.breakthrough(s, d, all, () => 0.99) && s.realm === 4)
    {
      // 渡劫失败：先扣基础与辅助材料，再按剩余库存的 2% 额外没收（逐项向下取整）。
      const pillLeft = E.money(100000).minus(p.cost.pill)
      const talismanLeft = E.money(100000).minus(p.cost.talisman)
      ok('失败扣基础与辅助材料及2%相关库存',
        E.moneyEq(s.resources.pill, pillLeft.minus(pillLeft.times(0.02).floor())) &&
        E.moneyEq(s.resources.faith, 99750) &&
        E.moneyEq(s.resources.immortalHerb, 99992) &&
        E.moneyEq(s.resources.arrayBase, 99996) &&
        E.moneyEq(s.resources.talisman, talismanLeft.minus(talismanLeft.times(0.02).floor())))
    }
    ok('失败减产5%且有恢复期限', s.buffs.some(b => b.id === 'breakthroughInjury' && b.mult === -0.05 && b.until > Date.now()))
    E.breakthrough(s, d, {}, () => 0.99)
    ok('连续失败减产不叠加', s.buffs.filter(b => b.id === 'breakthroughInjury').length === 1)
    for (let realm = 4; realm <= 9; realm++) {
      const fatal = { 4: 0.01, 5: 0.02, 6: 0.03, 7: 0.10, 8: 0.15, 9: 0.20 }[realm]
      // 护道可带 deathReduce（渡劫「立愿应劫」），满配身死概率相应下调（见 MATERIAL-RESEARCH.md §2.3）。
      const deathReduce = BREAKTHROUGH_AIDS[realm + 1].reduce((sum, aid) => sum + (aid.deathReduce || 0), 0)
      const expectedDeath = Math.max(0, fatal - deathReduce)
      const [below, bd] = setup(realm)
      const full = Object.fromEntries(BREAKTHROUGH_AIDS[realm + 1].map(aid => [aid.id, true]))
      const preview = E.breakthroughPreview(below, bd, full)
      ok(`境界${realm}满配身死风险符合调参`, close(preview.deathOnFailure, expectedDeath) && close(preview.deathRisk, (1 - preview.chance) * expectedDeath))
      let deathRoll = 0
      ok(`境界${realm}低于身死边界时强制重开`, !E.breakthrough(below, bd, full, () => deathRoll++ === 0 ? 0.99 : expectedDeath - 0.001) && below.realm === 0 && below.stats.breakthroughDeaths === 1)
      const [edge, edgeDerived] = setup(realm)
      let edgeRoll = 0
      ok(`境界${realm}身死边界及以上存活且遵守退境分界`, !E.breakthrough(edge, edgeDerived, full, () => edgeRoll++ === 0 ? 0.99 : fatal) && edge.realm === (realm < 7 ? realm : realm - 1) && edge.stats.breakthroughDeaths === 0)
      if (realm < 7) {
        ok(`境界${realm}身死同样减半仙缘且保留永久进度`, E.moneyEq(below.karma, E.money(50).plus(preview.deathKarma)) && E.moneyEq(below.dao, 2) && below.stats.reincarnations === 0 && below.stats.ascensions === 0 && E.moneyIsZero(below.resources.qi))
        ok(`境界${realm}存活失败只减产扣料不退境`, edge.buffs.some(b => b.id === 'breakthroughInjury' && b.mult === -0.05) && E.moneyEq(edge.stats.lifeInsight, 200000))
        continue
      }
      const [alive, ad] = setup(realm)
      alive.stats.bestRealm = realm
      const cost = E.realmCost(alive, ad, realm + 1)
      const material = Object.keys(cost).find(id => id !== 'qi' && id !== 'insight')
      const remaining = E.moneySubtract(alive.resources[material], cost[material])
      ok(`境界${realm}失败存活必退一境`, !E.breakthrough(alive, ad, {}, () => 0.99) && alive.realm === realm - 1)
      ok(`境界${realm}退境仍减产扣料并保留本世`, E.moneyEq(alive.resources[material], remaining.minus(remaining.times(0.02).floor())) && alive.buffs.some(b => b.id === 'breakthroughInjury' && b.mult === -0.05) && alive.stats.bestRealm === realm && E.moneyEq(alive.stats.lifeInsight, 200000) && E.moneyEq(alive.karma, 50) && E.moneyEq(alive.dao, 2))
      ok(`境界${realm}退境后产出倍率立即更新`, ad.realmMult === REALMS[realm - 1].mult)
    }
    const [dead, dd] = setup(7)
    dead.achievements.firstQi = true
    dead.stats.bestRealm = 7
    const gain = E.floorMoney(E.reincarnationGain(dead, dd).div(2))
    let roll = 0
    ok('炼虚失败可身死重开', !E.breakthrough(dead, dd, {}, () => roll++ === 0 ? 0.99 : 0) && dead.realm === 0)
    ok('只减半本次仙缘且不误计转世飞升', E.moneyEq(dead.karma, E.money(50).plus(gain)) && E.moneyEq(dead.dao, 2) && dead.stats.breakthroughDeaths === 1 && dead.stats.reincarnations === 0 && dead.stats.ascensions === 0)
    ok('身死保留历史、清空本世', dead.achievements.firstQi && dead.stats.bestRealm === 7 && E.moneyIsZero(dead.stats.lifeInsight) && E.moneyIsZero(dead.resources.pill) && dead.buffs.length === 0)
    const restored = parseImport(exportSave(dead))
    ok('身死记录可保存恢复', restored.stats.breakthroughDeaths === 1 && E.moneyEq(restored.karma, dead.karma) && E.moneyEq(restored.dao, 2))
    const [win, wd] = setup(4)
    ok('低于成功率时正常破境', E.breakthrough(win, wd, {}, () => 0.599) && win.realm === 5 && win.stats.bestRealm === 5)
  }
}
