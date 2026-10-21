import { createInitialState, resetForRebirth, resetForReincarnation, resetForAscension } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { CONFIG } from '../../src/data/config.js'
import { REINCARNATE_REALM_INDEX } from '../../src/data/realms.js'
import { KARMA_PERKS, KARMA_PERK_MAP } from '../../src/data/karmaShop.js'
import { serialize, parseImport } from '../../src/game/save.js'
import { newGame } from './fixtures.mjs'

/**
 * 仙缘体系调整（方案A砍收益 + 方案C修持商店）的冒烟断言：
 * 新乘区刻度、购买与双写扣费、存档兼容、轮回保留、建筑折扣与离线上限接入。
 */
export function karmaShop({ ok, close, section }) {
  section('仙缘乘区新刻度（方案A）')
  {
    // 120/370/770 是实测参照玩家一/二/三轮转世的累计仙缘（第二轮起为估算）。
    const m120 = E.karmaMultipliers(E.money(120))
    ok('一转120点：产出 ×2.2（线性段，对齐猫国 Paragon 首轮量级）', m120.karmaMult.eq('2.2'), String(m120.karmaMult))
    ok('一转120点：仓储 ×1.06', m120.karmaStorageMult.eq('1.06'), String(m120.karmaStorageMult))
    const m370 = E.karmaMultipliers(E.money(370))
    ok('二转370点：产出渐近段 ×2.9074（二转边际 +32%）', close(E.moneyToNumber(m370.karmaMult), 2.9074074, 1e-6), String(m370.karmaMult))
    ok('二转370点：仓储线性段 ×1.185', m370.karmaStorageMult.eq('1.185'), String(m370.karmaStorageMult))
    const m770 = E.karmaMultipliers(E.money(770))
    ok('三转770点：产出 ×2.9627（接近 +200% 渐近上限）', close(E.moneyToNumber(m770.karmaMult), 2.9626866, 1e-6), String(m770.karmaMult))
    ok('三转770点：仓储渐近段 ×1.3843（软上限 +50%）', close(E.moneyToNumber(m770.karmaStorageMult), 1.3842593, 1e-6), String(m770.karmaStorageMult))
    ok('系数与软上限来自 CONFIG（0.01/2、0.0005/0.5）', CONFIG.KARMA_BONUS_PER_POINT === 0.01 && CONFIG.KARMA_BONUS_CAP === 2 &&
      CONFIG.KARMA_STORAGE_PER_POINT === 0.0005 && CONFIG.KARMA_STORAGE_CAP === 0.5)
  }

  section('仙缘修持购买与双写扣费（方案C）')
  {
    const { state: s, derived: d } = newGame()
    ok('无仙缘无轮迴时商店锁定', !E.karmaShopUnlocked(s))
    s.karma = E.money(100)
    s.resources.karma = s.karma
    ok('持有仙缘即解锁商店', E.karmaShopUnlocked(s))
    // 前置：因果田需 rebirths≥1
    ok('无轮迴时因果田前置不满足', !E.karmaNeedsMet(s, KARMA_PERK_MAP.karmaField.needs) &&
      E.karmaNeedsText(s, KARMA_PERK_MAP.karmaField.needs).join().includes('转世/飞升'))
    ok('缺前置拒绝购买且不扣款', !E.buyKarmaPerk(s, 'karmaField') && s.karma.eq(100))
    // 余额不足
    const poor = createInitialState()
    poor.karma = E.money(5)
    poor.resources.karma = poor.karma
    ok('余额不足拒绝购买且不扣款', !E.buyKarmaPerk(poor, 'foundationEcho') && poor.karma.eq(5) && poor.karmaProgression.levels.foundationEcho === 0)
    // 成功：双写扣费 + 等级 + 累计
    ok('首级道基共鸣花 8 仙缘', E.buyKarmaPerk(s, 'foundationEcho'))
    ok('购买后顶层与镜像双写同步', s.karma.eq(92) && s.resources.karma.eq(92), String(s.karma) + ' / ' + String(s.resources.karma))
    ok('等级与累计投入入账', s.karmaProgression.levels.foundationEcho === 1 && s.karmaProgression.totalSpent.eq(8))
    ok('报价按 1.5 精确增长', E.perkCost(s, 'foundationEcho').eq(12))
    // 超上限
    s.karmaProgression.levels.foundationEcho = 5
    s.karma = E.money(500)
    s.resources.karma = s.karma
    ok('满级拒绝购买且不扣款', !E.buyKarmaPerk(s, 'foundationEcho') && s.karma.eq(500))
  }

  section('效果接入：离线上限、仓储与建筑折扣')
  {
    const { state: s, derived: d } = newGame()
    s.karmaProgression.levels.dreamBreath = 3
    E.recompute(s, d)
    ok('梦息并入离线上限（8 + 6 小时）', d.offlineHours === 8 + 6, String(d.offlineHours))
    // 因果田乘在仙缘仓储乘区之上：120 点 ×1.06 基础 × 1.15（3 级）
    s.karma = E.money(120)
    s.resources.karma = s.karma
    s.karmaProgression.levels.karmaField = 3
    E.recompute(s, d)
    ok('因果田乘在仙缘仓储乘区之上', d.karmaStorageMult.eq(E.money('1.06').times('1.15')), String(d.karmaStorageMult))
    // 建筑折扣：道基共鸣 5 级 −15%
    const plain = createInitialState()
    const plainD = E.createDerived()
    E.recompute(plain, plainD)
    s.karmaProgression.levels.foundationEcho = 5
    E.recompute(s, d)
    const full = E.buildingCost(plain, 'hut', 1)
    const cut = E.buildingCost(s, 'hut', 1)
    ok('道基共鸣让建筑造价 ×0.85', cut.qi.eq(full.qi.times('0.85')) && cut.wood.eq(full.wood.times('0.85')),
      full.qi + '/' + full.wood + ' → ' + cut.qi + '/' + cut.wood)
    // maxAffordable 随折扣增加
    const probe = (st) => {
      st.resources.qi = E.money(350)
      st.resources.wood = E.money(1000)
      return E.maxAffordable(st, 'hut', 10)
    }
    const plainCount = probe(plain)
    const cutCount = probe(s)
    ok('同样资源下折扣可多买建筑', cutCount > plainCount, plainCount + ' → ' + cutCount)
    // 拆除按名义价退款：买入 68 灵气，退款仍按 80 的一半 = 40
    s.resources.qi = E.money(240)
    s.resources.wood = E.money(1000)
    s.buildings.spiritField = { count: 1, on: true }
    E.recompute(s, d)
    ok('满足聚灵阵前置后实际建造茅屋成功', E.buyBuilding(s, d, 'hut', 1) === 1)
    const beforeSell = E.money(s.resources.qi)
    E.sellBuilding(s, d, 'hut', 1)
    ok('拆除按名义价退款（买入打折退款不打折，无套利）', s.resources.qi.minus(beforeSell).eq(full.qi.times('0.5')),
      String(s.resources.qi.minus(beforeSell)))
  }

  section('结算接入：前世账簿与安魂符')
  {
    const setup = (levels) => {
      const s = createInitialState()
      const d = E.createDerived()
      s.realm = REINCARNATE_REALM_INDEX
      s.stats.lifeInsight = E.money(200000)
      Object.assign(s.karmaProgression.levels, levels)
      E.recompute(s, d)
      return { s, d }
    }
    const base = setup({})
    ok('基准：炼虚转世得 28 点', E.reincarnationGain(base.s, base.d).eq(28), String(E.reincarnationGain(base.s, base.d)))
    const ledger = setup({ insightLedger: 4 })
    ok('前世账簿满级让结算 ×1.32（28 → 36）', E.reincarnationGain(ledger.s, ledger.d).eq(36), String(E.reincarnationGain(ledger.s, ledger.d)))
    const charm = setup({ deathCharm: 3 })
    ok('安魂符满级让身死保留从 50% 升至 62%（14 → 17）',
      E.breakthroughPreview(charm.s, charm.d, {}).deathKarma.eq(17) &&
      E.breakthroughPreview(base.s, base.d, {}).deathKarma.eq(14),
      String(E.breakthroughPreview(base.s, base.d, {}).deathKarma) + ' → ' + String(E.breakthroughPreview(charm.s, charm.d, {}).deathKarma))
  }

  section('轮回保留与开局物资')
  {
    const { state: s } = newGame()
    s.karma = E.money(50)
    s.resources.karma = s.karma
    s.stats.reincarnations = 1
    s.karmaProgression.levels.heirloomRelics = 2
    s.karmaProgression.levels.samsaraPact = 1
    s.karmaProgression.totalSpent = E.money(30)
    resetForReincarnation(s, 20)
    ok('转世后修持等级与累计投入保留', s.karmaProgression.levels.heirloomRelics === 2 &&
      s.karmaProgression.levels.samsaraPact === 1 && s.karmaProgression.totalSpent.eq(30))
    ok('随身遗物 2 级发放开局灵气 80 / 灵机 30', s.resources.qi.eq(80) && s.resources.insight.eq(30) && s.seen.qi === true,
      s.resources.qi + '/' + s.resources.insight)
    ok('转世后轮迴计数解锁 rebirths≥2 条目', E.rebirthCount(s) === 2 && E.karmaNeedsMet(s, KARMA_PERK_MAP.samsaraPact.needs))
    // 飞升与身死路径同样保留
    const a = createInitialState()
    a.karmaProgression.levels.dreamBreath = 4
    resetForAscension(a, 0)
    ok('飞升后修持等级保留', a.karmaProgression.levels.dreamBreath === 4)
    const dd = createInitialState()
    dd.karmaProgression.levels.deathCharm = 2
    resetForRebirth(dd, 0, 'death')
    ok('身死后修持等级保留且计入身死次数', dd.karmaProgression.levels.deathCharm === 2 && dd.stats.breakthroughDeaths === 1)
  }

  section('存档兼容与损坏保护')
  {
    const { state: s } = newGame()
    s.karma = E.money(64)
    s.resources.karma = s.karma
    s.karmaProgression.levels.foundationEcho = 3
    s.karmaProgression.levels.dreamBreath = 2
    s.karmaProgression.totalSpent = E.money(60)
    const payload = serialize(s)
    const restored = parseImport(JSON.stringify(payload))
    ok('修持等级与累计投入随存档往返', restored.karmaProgression.levels.foundationEcho === 3 &&
      restored.karmaProgression.levels.dreamBreath === 2 && restored.karmaProgression.totalSpent.eq(60))
    // 旧档（v3 无 karmaProgression 字段）：等级全 0、新乘区生效
    const legacy = { ...payload }
    delete legacy.karmaProgression
    const old = parseImport(JSON.stringify(legacy))
    ok('旧档缺失切片补默认等级 0', old.karmaProgression.levels.foundationEcho === 0 &&
      KARMA_PERKS.every(meta => (old.karmaProgression.levels[meta.id] | 0) === 0))
    const oldD = E.createDerived()
    E.recompute(old, oldD)
    ok('旧档载入后新乘区生效（64 点 ×1.64）', oldD.karmaMult.eq('1.64'), String(oldD.karmaMult))
    // 结构损坏：阻止加载
    let rejected = false
    try { parseImport(JSON.stringify({ ...payload, karmaProgression: { levels: [] } })) } catch { rejected = true }
    ok('levels 结构损坏阻止加载', rejected)
    rejected = false
    try { parseImport(JSON.stringify({ ...payload, karmaProgression: 'broken' })) } catch { rejected = true }
    ok('切片整体损坏阻止加载', rejected)
    // 等级越界与未知 id 由归一化夹回
    const dirty = { ...payload, karmaProgression: { version: 1, levels: { foundationEcho: 99, nonsense: 5 }, totalSpent: '-3' } }
    const cleaned = parseImport(JSON.stringify(dirty))
    ok('越界等级夹回上限、未知条目丢弃、负投入归零', cleaned.karmaProgression.levels.foundationEcho === 5 &&
      !('nonsense' in cleaned.karmaProgression.levels) && cleaned.karmaProgression.totalSpent.isZero())
  }
}
