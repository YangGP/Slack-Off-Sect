import { normalizeState } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { DIPLOMACY } from '../../src/modules/diplomacy/data.js'
import { newGame } from './fixtures.mjs'

/** 直接给出外交解锁条件：研究 + 境界（不依赖离线模拟跑到金丹）。 */
function diplomacyReady() {
  const { state, derived } = newGame()
  state.realm = DIPLOMACY.MIN_REALM
  state.upgrades.neighborContacts = true
  state.settings.modules.diplomacy = true
  E.recompute(state, derived)
  return { state, derived }
}

export function diplomacyTrade({ ok, section }) {
  section('宗门外交（首版：三宗固定汇率 + 机缘骰 + 信符限速）')
  {
    // 解锁门
    {
      const { state: s, derived: d } = newGame()
      ok('无研究无境界不开外交', E.isDiplomacyUnlocked(s) === false)
      s.realm = DIPLOMACY.MIN_REALM
      ok('有境界无研究仍不开', E.isDiplomacyUnlocked(s) === false)
      s.upgrades.neighborContacts = true
      s.realm = DIPLOMACY.MIN_REALM - 1
      ok('有研究境界不足仍不开', E.isDiplomacyUnlocked(s) === false)
      s.realm = DIPLOMACY.MIN_REALM
      ok('研究 + 境界齐备即开门', E.isDiplomacyUnlocked(s) === true)
      s.settings.modules.diplomacy = false
      ok('关闭模块后收回', E.isDiplomacyUnlocked(s) === false)
      void d
    }

    // 交易与信符
    {
      const { state: s, derived: d } = diplomacyReady()
      const sect = 'herbValley'
      s.resources.herb = E.money(100)
      s.resources.stone = E.money(0)
      s.resources.warrant = E.money(DIPLOMACY.WARRANT_COST)
      E.recompute(s, d)

      const denied = E.tradeWithSect(s, d, sect)
      ok('材料不足拒绝交易且不扣信符', denied.ok === false && s.diplomacy.statistics.trades === 0 &&
        E.moneyEq(s.resources.warrant, DIPLOMACY.WARRANT_COST))

      s.resources.herb = E.money(300)
      s.resources.warrant = E.money(DIPLOMACY.WARRANT_COST - 1)
      E.recompute(s, d)
      const noWarrant = E.tradeWithSect(s, d, sect)
      ok('信符不足拒绝交易且不扣材料', noWarrant.ok === false && E.moneyEq(s.resources.herb, 300))

      s.resources.warrant = E.money(DIPLOMACY.WARRANT_COST)
      E.recompute(s, d)
      const stoneBefore = s.resources.stone
      const result = E.tradeWithSect(s, d, sect)
      ok('支付 300 灵草', result.ok && E.money(s.resources.herb).abs().lt(1e-9))
      ok('固定回报灵石 25 入账', E.moneyEq(s.resources.stone, stoneBefore.plus(25)))
      ok(`扣信符 ${DIPLOMACY.WARRANT_COST} 枚`, E.money(s.resources.warrant).abs().lt(1e-9))
      ok('交易计入统计', s.diplomacy.statistics.trades === 1)
      ok('再交易被信符挡住', E.tradeWithSect(s, d, sect).ok === false)

      // 预览同步反映信符门槛
      const preview = E.tradePreview(s, d, sect)
      ok('预览显示信符不足', preview.warrantEnough === false)
    }

    // 机缘概率
    {
      const { state: s, derived: d } = diplomacyReady()
      ok('无缘山门时概率为基础值', Math.abs(E.fortuneChance(s) - DIPLOMACY.FORTUNE_BASE) < 1e-9)
      s.buildings.gate = { count: 5, on: true }
      E.recompute(s, d)
      ok('每座启用山门加 1 个百分点', Math.abs(E.fortuneChance(s) - (DIPLOMACY.FORTUNE_BASE + 0.05)) < 1e-9)
      s.buildings.gate.count = 100
      E.recompute(s, d)
      ok('概率封顶 35%', Math.abs(E.fortuneChance(s) - DIPLOMACY.FORTUNE_CAP) < 1e-9)

      const preview = E.tradePreview(s, d, 'ironMountain')
      ok('预览给出汇率与机缘候选', preview && preview.sect.id === 'ironMountain' &&
        Object.keys(preview.fortuneOptions).length > 0)
    }

    // 存档归一
    {
      const { state: s } = diplomacyReady()
      s.diplomacy.statistics.trades = -3
      s.diplomacy.randomSeed = NaN
      const reloaded = normalizeState(JSON.parse(JSON.stringify(s)))
      ok('读档修正非法统计与随机种子', reloaded.diplomacy.statistics.trades === 0 &&
        Number.isSafeInteger(reloaded.diplomacy.randomSeed))
    }

    // 旧档迁移：猎备并入信符
    {
      const { state: s } = diplomacyReady()
      s.resources.huntPreparation = E.money(120)
      delete s.resources.warrant
      const reloaded = normalizeState(JSON.parse(JSON.stringify(s)))
      ok('旧档猎备平移到信符', E.moneyEq(reloaded.resources.warrant, 120) && !('huntPreparation' in reloaded.resources))
    }

    // 旧档迁移：信符与猎备取大、seen/peak 转移、旧键清除、输入不变
    {
      const { state: s } = diplomacyReady()
      s.resources.warrant = E.money(60)
      s.resources.huntPreparation = 'oops' // 故意损坏的旧字段：迁移应把它当 0 处理
      s.seen.huntPreparation = true
      s.peak.huntPreparation = E.money(120)
      const inputResources = JSON.parse(JSON.stringify(s.resources))
      const inputSeen = JSON.parse(JSON.stringify(s.seen))
      const inputPeak = JSON.parse(JSON.stringify(s.peak))
      const reloaded = normalizeState(s)
      // 「输入不变」：normalizeState 现在会按字段**就地**把金额解析成 Decimal（decodeMoneyFields 的既有语义），
      // 所以唯一允许变化的就是那个刻意损坏的旧字段（'oops' → 0）。其余键与值必须原样保留。
      const inputUntouched = Object.keys(s.resources).join() === Object.keys(inputResources).join() &&
        Object.entries(inputResources).every(([id, before]) =>
          id === 'huntPreparation' || JSON.stringify(s.resources[id]) === JSON.stringify(before))
      ok('信符迁移取大、seen/peak 转移、旧键清除且输入不变',
        E.moneyEq(reloaded.resources.warrant, 60) && !Object.hasOwn(reloaded.resources, 'huntPreparation') &&
        reloaded.seen.warrant === true && !Object.hasOwn(reloaded.seen, 'huntPreparation') &&
        E.moneyEq(reloaded.peak.warrant, 120) && !Object.hasOwn(reloaded.peak, 'huntPreparation') &&
        inputUntouched &&
        JSON.stringify(s.seen) === JSON.stringify(inputSeen) &&
        JSON.stringify(s.peak) === JSON.stringify(inputPeak))
    }

    // 机缘保底：预览与结算一致，且预览不消耗随机数
    {
      const { state: s, derived: d } = diplomacyReady()
      s.resources.herb = E.money(300)
      s.resources.warrant = E.money(DIPLOMACY.WARRANT_COST)
      s.resources.insight = E.money(0)
      s.diplomacy.randomSeed = 1972
      E.recompute(s, d)
      d.max.insight = E.money(1000)
      const preview = E.tradePreview(s, d, 'herbValley')
      const seedBefore = s.diplomacy.randomSeed
      E.tradePreview(s, d, 'herbValley')
      const previewInsight = preview.fortuneOptions.insight
      const seedKept = s.diplomacy.randomSeed === seedBefore
      const result = E.tradeWithSect(s, d, 'herbValley')
      ok('机缘保底预览与结算一致且预览不消耗随机数',
        E.moneyEq(previewInsight, 40) && seedKept && result.ok && E.moneyEq(result.fortune?.insight, 40))
    }

    // 满仓拒绝 / 部分溢出
    {
      const { state: s, derived: d } = diplomacyReady()
      s.resources.herb = E.money(300)
      s.resources.warrant = E.money(DIPLOMACY.WARRANT_COST)
      s.resources.stone = d.max.stone
      E.recompute(s, d)
      const seedBefore = s.diplomacy.randomSeed
      const tradesBefore = s.diplomacy.statistics.trades
      const denied = E.tradeWithSect(s, d, 'herbValley')
      ok('固定回报无仓容时拒绝交易且不动资源/随机数/统计',
        denied.ok === false && denied.reason === '仓储已满' && E.moneyEq(s.resources.herb, 300) &&
        E.moneyEq(s.resources.warrant, DIPLOMACY.WARRANT_COST) && s.diplomacy.randomSeed === seedBefore &&
        s.diplomacy.statistics.trades === tradesBefore)

      s.resources.stone = E.money(d.max.stone).minus(10)
      E.recompute(s, d)
      const preview = E.tradePreview(s, d, 'herbValley')
      const stoneBefore = s.resources.stone
      const partial = E.tradeWithSect(s, d, 'herbValley')
      ok('部分仓容可交易且固定回报按仓容截断并给出溢出提示',
        preview.overflow === true && partial.ok === true && E.moneyEq(s.resources.stone, stoneBefore.plus(10)))
    }

    // 共享信符供给：只开外交也能靠执符使攒信符互市，读档保留执符使岗位
    {
      const { state: s, derived: d } = newGame()
      s.realm = DIPLOMACY.MIN_REALM
      s.settings.modules.hunting = false
      s.settings.modules.diplomacy = true
      s.upgrades.neighborContacts = true
      s.upgrades.herbStudy = true
      s.upgrades.waterSanitation = true
      s.resources.qi = E.money(5000)
      s.resources.wood = E.money(5000)
      s.resources.rock = E.money(5000)
      s.resources.stone = E.money(5000)
      s.resources.insight = E.money(100000)
      s.buildings.hut = { count: 2, on: true }
      s.buildings.spiritField = { count: 1, on: true }
      s.disciples.total = 4
      E.recompute(s, d)
      E.research(s, d, 'wildHunting')
      E.recompute(s, d)
      const campCount = E.buyBuilding(s, d, 'huntingCamp')
      E.setJob(s, d, 'huntPlanner', 1)
      E.recompute(s, d)
      const planner = s.disciples.members.find(m => m.roleId === 'huntPlanner')
      E.tick(s, d, 300, { events: false })
      s.resources.stone = E.money(0)
      s.resources.herb = E.money(300)
      const warrantReady = E.moneyGte(s.resources.warrant, DIPLOMACY.WARRANT_COST)
      const traded = E.tradeWithSect(s, d, 'herbValley')
      const reloaded = normalizeState(JSON.parse(JSON.stringify(s)))
      const roleKept = reloaded.disciples.members.some(m => m.roleId === 'huntPlanner')
      ok('只开外交时执符使供信符、互市成功且读档保留岗位',
        !!planner && campCount > 0 && warrantReady && traded.ok === true && roleKept)
    }
  }
}
