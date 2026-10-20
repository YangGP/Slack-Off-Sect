import { createInitialState, normalizeState, resetForAscension } from '../../src/game/state.js'
import { serialize, restoreSave, exportSave, parseImport, SAVE_VERSION } from '../../src/game/save.js'
import { money, ZERO, MONEY_INFINITY } from '../../src/game/decimal.js'
import { cloneRuntime } from '../../src/game/clone.js'
import { RESOURCES, RESOURCE_MAP } from '../../src/data/resources.js'
import { BUILDING_MAP } from '../../src/data/buildings.js'
import * as E from '../engine-fixture.mjs'
import { newGame } from './fixtures.mjs'

/**
 * 经济数值域回归：Decimal 语义、取整与仓容、存档 v3 与旧档迁移、运行时快照。
 *
 * 只断言「数值域契约」，不复算平衡数值；平衡口径在各自的专项检查里。
 */
export function moneyDomain({ ok, section }) {
  section('制作产量返回与大数文案')
  {
    const { state, derived } = newGame()
    state.buildings.quarry = { count: 1, on: true }
    E.recompute(state, derived)
    const copies = money('100000000000000000001')
    state.resources.qi = copies.times(15)
    state.resources.rock = copies.times(3)
    derived.max.stone = MONEY_INFINITY
    const made = E.craftBatch(state, derived, 'infuseStone')
    ok('批量制作返回精确金额，不丢失大库存中的个位', E.isMoney(made) && made.eq(copies) &&
      state.resources.stone.eq(copies) && state.resources.qi.isZero() && state.resources.rock.isZero())

    const huge = money('1e400')
    state.resources.stone = ZERO
    state.resources.qi = huge.times(15)
    state.resources.rock = huge.times(3)
    derived.max.stone = MONEY_INFINITY
    const hugeMade = E.craftBatch(state, derived, 'infuseStone')
    ok('超出 Number 范围的实际产量与返回值保持有限', E.isMoney(hugeMade) && hugeMade.isFinite() &&
      hugeMade.eq(huge) && state.resources.stone.eq(huge))
    const entry = state.log.find(item => item.text.includes('点石成灵'))
    ok('超大制作纪事使用科学计数，不显示 Infinity', entry?.text.includes('e+400') &&
      !entry.text.includes('Infinity'))
    ok('制作失败统一返回 Decimal 零值', E.isMoney(E.craft(state, derived, 'infuseStone')) &&
      E.craftBatch(state, derived, 'infuseStone').isZero() &&
      E.craftBatch(state, derived, 'infuseStone', 0).isZero())
  }

  section('经济数值：Decimal 语义')
  {
    const { state: s, derived: d } = newGame()
    s.resources.qi = money('0.1')
    E.addResource(s, 'qi', money('0.2'), d.max.qi)
    ok('0.1 + 0.2 精确等于 0.3', s.resources.qi.eq(money('0.3')))
    ok('恰好够用时判定为够用', E.canAfford(s, { qi: money('0.3') }))
    E.payCost(s, { qi: money('0.3') })
    ok('恰好支付后归零', s.resources.qi.isZero())
    s.resources.qi = money('0.2999999999999999')
    ok('不足时不能靠相对容差购买', !E.canAfford(s, { qi: money('0.3') }))

    s.resources.qi = money('1e30')
    E.addResource(s, 'qi', 1, MONEY_INFINITY)
    ok('1e30 可加一', s.resources.qi.eq(money('1e30').plus(1)))
    E.payCost(s, { qi: 1 })
    ok('1e30 加一减一可还原', s.resources.qi.eq(money('1e30')))

    s.resources.qi = money('1e400')
    ok('1e400 是有限金额而不是 Infinity', s.resources.qi.isFinite() && s.resources.qi.lt(MONEY_INFINITY))
    ok('1e400 参与一次有效比例结算后仍有限', E.moneyToRatio(s.resources.qi.div(money('2e400'))).valueOf() === 0.5)
    let rejected = false
    try { money(Infinity) } catch { rejected = true }
    ok('原生 Infinity 不能当金额构造', rejected)
    ok('超出 40 位有效数字时单位增量会舍入（已知精度边界）', money('1e40').plus(1).eq(money('1e40')))
  }

  section('经济数值：取整、仓容与运行时快照')
  {
    const { state: s, derived: d } = newGame()
    const cost = E.scaleCost({ stone: 3 }, money('1.1'))
    ok('整枚资源费用向上取整', cost.stone.eq(money(4)))
    const added = E.addResource(s, 'stone', money('2.9'), money('1e9'))
    ok('整枚资源入库向下取整', s.resources.stone.eq(money(2)) && added.eq(money(2)))
    ok('连续资源保留小数', E.addResource(s, 'wood', money('0.25'), money('1e9')).eq(money('0.25')))
    ok('未指定上限时按无金额上限处理', E.addResource(s, 'rock', money('1e5')).eq(money('1e5')))

    // 逐座报价：整枚资源的每座单价先向上取整，再逐座求和（不是几何总和）。
    const meta = BUILDING_MAP.warehouse
    const units = Array.from({ length: 6 }, (_, index) => E.buildingPriceAt(meta, index))
    ok('每座报价里的整枚资源已取整', units.every(price => Object.entries(price).every(([res, amount]) =>
      !RESOURCE_MAP[res]?.integer || amount.isInteger())))
    const total = E.buildingCostFrom(meta, 0, 6)
    ok('总价等于逐座报价之和', Object.keys(total).every(res =>
      total[res].eq(E.moneySum(units.map(price => price[res] ?? ZERO)))))
    ok('整枚资源仓容是整数（比例加仓后仍取整）', (() => {
      s.upgrades.storeFrameArt = true
      s.upgrades.storeFrameRefine = true
      E.recompute(s, d)
      return RESOURCES.filter(r => r.integer && d.max[r.id].isFinite()).every(r => d.max[r.id].isInteger())
    })())

    // 运行时快照必须保留 Decimal 才能继续运算。
    const snapshot = cloneRuntime(s)
    ok('运行时快照保留 Decimal 且可继续运算', snapshot.resources.wood.plus(1).gt(snapshot.resources.wood) &&
      snapshot.resources.wood.constructor.name === 'Decimal' && snapshot !== s)
  }

  section('经济数值：存档 v3 与旧档迁移')
  {
    const now = Date.UTC(2026, 9, 20)
    const s = createInitialState(now)
    s.resources.qi = money('1e400')
    s.resources.wood = money('0.3')
    s.karma = money('12345.6789')
    s.resources.karma = s.karma
    s.craftProgress.sawPlank = money('0.25')
    s.craftTargets.sawPlank = money(7)
    s.stats.totalQi = money('9e30')
    const payload = serialize(s, now)
    ok('存档结构版本为 3', SAVE_VERSION === 3 && payload.version === 3)
    ok('金额按白名单写成十进制字符串', typeof payload.resources.qi === 'string' && typeof payload.karma === 'string' &&
      typeof payload.craftProgress.sawPlank === 'string' && typeof payload.stats.totalQi === 'string')
    ok('写档返回独立副本，不暴露状态引用', payload.resources !== s.resources && payload.craftTimers !== s.craftTimers)
    const back = restoreSave(JSON.parse(JSON.stringify(payload)), { now })
    ok('读档还原超大金额与小数', back.resources.qi.eq(money('1e400')) && back.resources.wood.eq(money('0.3')))
    ok('读档还原制作进度、目标与经济累计', back.craftProgress.sawPlank.eq(money('0.25')) &&
      back.craftTargets.sawPlank.eq(money(7)) && back.stats.totalQi.eq(money('9e30')))
    ok('永久货币镜像一致', back.resources.karma.eq(back.karma))
    ok('base64 往返不丢数', parseImport(exportSave(s)).resources.qi.eq(money('1e400')))
    const once = normalizeState(JSON.parse(JSON.stringify(serialize(back, now))), { now })
    const twice = normalizeState(JSON.parse(JSON.stringify(serialize(once, now))), { now })
    ok('迁移幂等', JSON.stringify(serialize(twice, now)) === JSON.stringify(serialize(once, now)))

    // v2 旧档：number 金额迁入 Decimal，个体成员不被重建
    const legacy = createInitialState(now)
    legacy.karma = money(321)
    legacy.resources.karma = legacy.karma
    legacy.dao = money(2)
    legacy.resources.dao = legacy.dao
    legacy.resources.qi = money('1234.5')
    legacy.resources.stone = money('17.9')
    legacy.stats.totalQi = money('5000')
    legacy.disciples.total = 2
    legacy.disciples.nextId = 3
    legacy.disciples.members = [
      { id: 1, name: '林清禾', realm: 1, roleId: 'farmer', cultivation: 12, cooldown: 0, residenceSeconds: 30,
        totalQiConsumed: 4.5, spiritualRoot: 'triple', mentored: false, aidBonus: 0, talents: [] },
      { id: 2, name: '陈云舟', realm: 2, roleId: null, cultivation: 3, cooldown: 0, residenceSeconds: 10,
        totalQiConsumed: 2, spiritualRoot: 'dual', mentored: true, aidBonus: 0, talents: [] },
    ]
    const v2 = JSON.parse(JSON.stringify(serialize(legacy, now)))
    v2.version = 2
    for (const r of RESOURCES) v2.resources[r.id] = Number(v2.resources[r.id])
    v2.karma = Number(v2.karma)
    v2.dao = Number(v2.dao)
    v2.stats.totalQi = Number(v2.stats.totalQi)
    for (const m of v2.disciples.members) m.totalQiConsumed = Number(m.totalQiConsumed)
    const upgraded = restoreSave(v2, { now })
    ok('v2 → v3：金额升级为 Decimal', upgraded.resources.qi.eq(money('1234.5')) && upgraded.karma.eq(money(321)))
    ok('v2 → v3：整枚资源抹平小数、道果取整', upgraded.resources.stone.eq(money(17)) && upgraded.dao.isInteger())
    ok('v2 → v3：不重建弟子个体、保留培养状态', upgraded.disciples.members.length === 2 &&
      upgraded.disciples.members[0].name === '林清禾' && upgraded.disciples.members[1].mentored === true)
    ok('v2 → v3：口粮累计迁入 Decimal 且不截断', upgraded.disciples.members[0].totalQiConsumed.eq(money('4.5')))

    // 损坏字段与非法语法隔离
    const damaged = JSON.parse(JSON.stringify(payload))
    damaged.resources.qi = 'abc'
    damaged.resources.ore = '0x10'
    damaged.resources.rock = ''
    damaged.stats.totalQi = {}
    const repaired = restoreSave(damaged, { now })
    ok('损坏金额回退 0 且不清空其它进度', repaired.resources.qi.isZero() && repaired.resources.ore.isZero() &&
      repaired.resources.rock.isZero() && repaired.stats.totalQi.isZero() && repaired.resources.wood.eq(money('0.3')))
    ok('负数金额归零', restoreSave({ ...payload, resources: { ...payload.resources, wood: '-5' } }, { now })
      .resources.wood.isZero())
    const recovered = restoreSave({ ...payload, version: 99 }, { now })
    ok('未知版本按恢复策略保留仙缘与道果', recovered.__recoveryNotice.length > 0 &&
      recovered.karma.eq(money('12345.6789')) && recovered.resources.karma.eq(recovered.karma))
  }

  section('经济数值：永久货币镜像')
  {
    const now = Date.UTC(2026, 9, 20)
    const s = createInitialState(now)
    s.karma = money(100)
    s.resources.karma = s.karma
    s.dao = money(1)
    s.resources.dao = s.dao
    resetForAscension(s, money('12.5'))
    ok('飞升后仙缘是金额且累加正确', money(s.karma).eq(money('112.5')))
    ok('飞升后道果是整数金额', money(s.dao).eq(money(2)) && s.dao.isInteger())
    ok('飞升后永久货币镜像同步', s.resources.karma.eq(s.karma) && s.resources.dao.eq(s.dao))
    ok('飞升后控制字段仍是 Number', typeof s.realm === 'number' && typeof s.stats.ascensions === 'number')
  }
}
