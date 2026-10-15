import { createInitialState, normalizeState } from '../../src/game/state.js'
import { fmt, fmtAmount, fmtCost, fmtFixed, fmtInt, fmtResource, fmtStock } from '../../src/game/format.js'
import * as E from '../engine-fixture.mjs'
import { RESOURCES, RESOURCE_MAP } from '../../src/data/resources.js'
import { BUILDING_MAP } from '../../src/data/buildings.js'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { REALMS } from '../../src/data/realms.js'
import { nearlyEqual, atLeast, floorNumber, ceilNumber } from '../../src/game/numbers.js'
import { enough, costLabel } from '../../src/game/pricing.js'
import { newGame } from './fixtures.mjs'

export function precision({ ok, section }) {
  section('浮点精度边界')
  {
    ok('小数累加按容差比较', nearlyEqual(0.1 + 0.2, 0.3))
    ok('真实差额和极小花费不被容差吞掉', !atLeast(0.3 - 1e-10, 0.3) && !atLeast(0, 1e-12))
    ok('大数的舍入误差按量级处理', nearlyEqual(1e10 + 0.1 + 0.2, 1e10 + 0.3))
    ok('非有限数不误判相等', !nearlyEqual(Infinity, 1) && !nearlyEqual(NaN, NaN))
    ok('整份除法与价格取整吸收舍入误差', floorNumber(0.3 / 0.1) === 3 && ceilNumber((0.1 + 0.2) * 10) === 3)
    ok('真实小数仍按原方向取整', floorNumber(3 - 1e-10) === 2 && ceilNumber(3 + 1e-10) === 4)
    const s = createInitialState(), d = E.createDerived()
    s.resources.qi = 0.3
    const cost = { qi: 0.1 + 0.2 }
    ok('购买、价格提示与等待时间一致', E.canAfford(s, cost) && enough(s, 'qi', cost.qi) && E.timeToAfford(s, d, 'qi', cost.qi) === 0 && costLabel(s, d, 'qi', cost.qi) === fmtCost(cost.qi))
    s.resources.qi = 0.1 + 0.2
    E.payCost(s, { qi: 0.3 })
    ok('扣费后清除浮点残余', s.resources.qi === 0)
    s.resources.qi = 15 - Number.EPSILON * 8
    d.max.wood = 3 - Number.EPSILON * 2
    ok('材料与仓储边界不会少算一份', E.maxCraftable(s, d, 'growWood') === 3)
    ok('批量制作与材料判断一致', E.craftBatch(s, d, 'growWood') === 3 && s.resources.qi === 0 && s.resources.wood === 3)
    s.resources.qi = 5
    d.max.wood = 10
    d.craftBonus = 1 - Number.EPSILON * 2
    ok('制作进度取整后不留下负数尾差', E.craft(s, d, 'growWood', { times: 1 }) === 2 && s.craftProgress.growWood === 0)
    ok('整数显示消除浮点尾差', fmtStock(3 - Number.EPSILON * 2) === '3' && fmtCost((0.1 + 0.2) * 10) === '3')
    ok('旧存档整数边界保留数量', normalizeState({ resources: { stone: 3 - Number.EPSILON * 2 } }).resources.stone === 3)
  }
}

export function batchCrafting({ ok, close, section }) {
  section('整批制作与逐份制作一致')
  {
    let equivalent = true
    for (const id of ['infuseStone', 'growWood']) {
      const recipe = CRAFT_MAP[id]
      for (const bonus of [0, 0.1, 0.5, 2.75]) {
        for (const progress of [0, 0.2, 0.9]) {
          for (const room of [0, 0.5, 1, 5, 100]) {
            for (const copies of [1, 3, 20]) {
              const s = createInitialState(), d = E.createDerived()
              s.buildings.quarry = { count: 1, on: true }
              E.recompute(s, d)
              for (const [res, cost] of Object.entries(recipe.cost)) s.resources[res] = cost * 12
              s.resources[recipe.out] = 2
              s.craftProgress[id] = progress
              d.craftBonus = bonus
              d.max[recipe.out] = RESOURCE_MAP[recipe.out].integer ? Math.floor(2 + room) : 2 + room
              const expected = structuredClone(s)
              const gain = E.craftYield(d, recipe)
              let expectedMade = 0
              for (let i = 0; i < copies; i++) {
                if (!E.canAfford(expected, recipe.cost) || atLeast(expected.resources[recipe.out], d.max[recipe.out])) break
                E.payCost(expected, recipe.cost)
                const acc = expected.craftProgress[id] + gain
                const whole = floorNumber(acc)
                expected.craftProgress[id] = Math.max(0, acc - whole)
                if (whole > 0) {
                  E.addResource(expected, recipe.out, whole, d.max[recipe.out])
                  expected.stats.crafted[recipe.out] = (expected.stats.crafted[recipe.out] || 0) + whole
                }
                expected.stats.craftCount++
                expectedMade += whole
              }
              const made = E.craft(s, d, id, { times: copies, silent: true })
              const matches = made === expectedMade && s.stats.craftCount === expected.stats.craftCount &&
                close(s.craftProgress[id], expected.craftProgress[id]) &&
                s.stats.crafted[recipe.out] === expected.stats.crafted[recipe.out] &&
                Object.keys(s.resources).every(res => close(s.resources[res], expected.resources[res]))
              if (equivalent && !matches) console.log({ id, bonus, progress, room, copies, made, expectedMade, actualCount: s.stats.craftCount, expectedCount: expected.stats.craftCount })
              equivalent &&= matches
            }
          }
        }
      }
    }
    ok('360 种材料、加成、小数进度和仓储组合保持逐份语义', equivalent)
    const s = createInitialState(), d = E.createDerived()
    s.buildings.quarry = { count: 1, on: true }
    E.recompute(s, d)
    s.resources.qi = 150; s.resources.rock = 30
    const before = JSON.stringify(s)
    ok('异常批量参数不扣料', [NaN, Infinity, -1].every(times => E.craft(s, d, 'infuseStone', { times }) === 0) &&
      [NaN, Infinity, -1, 2].every(frac => E.craftBatch(s, d, 'infuseStone', frac) === 0) && JSON.stringify(s) === before)
  }
}

export function integerResources({ ok, close, section }) {
  section('整枚计数的资源不出现小数（灵石/丹药/符箓/法器/木板）')
  {
    const ints = E.RESOURCES.filter((r) => r.integer).map((r) => r.id)
    ok(
      '数据里标了整枚计数的资源（灵石/丹药/符箓/法器/木板）',
      ints.includes('stone') && ints.includes('pill') && ints.includes('talisman') && ints.includes('artifact') && ints.includes('plank'),
      ints.join(','),
    )
    ok(
      '正好是灵石 / 丹药 / 符箓 / 法器',
      ['stone', 'pill', 'talisman', 'artifact'].every((id) => ints.includes(id)),
      ints.join(','),
    )

    const { state, derived } = newGame()
    state.resources.qi = 1e6
    state.resources.wood = 1e6
    state.resources.stone = 1e6
    state.resources.insight = 1e6
    E.recompute(state, derived)

    // ① 涨价算出来的价格必须是整数（以前是 1.55 / 2.4 / 3.72 …）
    const prices = []
    for (let built = 0; built < 6; built++) {
      state.buildings.gatheringArray = { count: built, on: true }
      prices.push(E.buildingCost(state, 'gatheringArray', 1).stone)
    }
    ok(
      '建筑涨价后的灵石花费都是整数',
      prices.every((v) => Number.isInteger(v)),
      prices.join(','),
    )
    const gathering = BUILDING_MAP.gatheringArray
    ok('而且是向上取整（不会比真实值便宜）', prices.every((v, i) => v === Math.ceil(gathering.cost.stone * Math.pow(gathering.priceRatio, i) - 1e-9)), prices.join(','))
    ok('灵石价格单调递增', prices.every((v, i) => i === 0 || v >= prices[i - 1]), prices.join(','))

    // ② 破境折扣算出来的整数资源花费必须是整数
    state.upgrades.breakthroughArt = true
    E.recompute(state, derived)
    const bCosts = []
    for (let i = 1; i < REALMS.length; i++) {
      for (const [res, v] of Object.entries(E.realmCost(state, derived, i))) {
        if (RESOURCE_MAP[res]?.integer) bCosts.push(v)
      }
    }
    ok(
      '破境（含折扣）的整数资源花费都是整数',
      bCosts.length > 0 && bCosts.every((v) => Number.isInteger(v)),
      bCosts.join(','),
    )
    ok(
      '折扣后向上取整（26 × 0.85 = 22.1 → 23）',
      E.realmCost(state, derived, 3).pill === 23,
      `${E.realmCost(state, derived, 3).pill}`,
    )

    // ③ 法宝祭炼的花费也必须是整数
    state.upgrades.spiritBanner = true
    E.recompute(state, derived)
    const refine = []
    for (let lv = 0; lv < 4; lv++) {
      state.treasureLevels.spiritBanner = lv
      refine.push(E.refineCost(state, 'spiritBanner').stone)
    }
    ok('法宝祭炼的灵石花费都是整数', refine.every((v) => Number.isInteger(v)), refine.join(','))

    // ④ 加资源不会给整枚资源留下小数（事件按百分比、旧档都可能带小数）
    state.resources.stone = 10
    E.addResource(state, 'stone', 2.5)
    ok('给灵石加 2.5 只得到 2', state.resources.stone === 12, `${state.resources.stone}`)
    state.resources.stone = 10
    E.addResource(state, 'stone', 3.999)
    ok('给灵石加 3.999 得到 3（向下取整，不凭空多给一枚）', state.resources.stone === 13, `${state.resources.stone}`)
    state.resources.wood = 10
    E.addResource(state, 'wood', 2.5)
    ok('连续资源仍然保留小数', close(state.resources.wood, 12.5, 1e-9), `${state.resources.wood}`)

    // ⑤ 存档往返：旧档里的小数会被抹平
    const legacy = JSON.parse(JSON.stringify(state))
    legacy.resources.stone = 7.77
    legacy.resources.pill = 3.5
    const loaded = normalizeState(legacy)
    ok('读档时把灵石的小数抹平', loaded.resources.stone === 7, `${loaded.resources.stone}`)
    ok('读档时把丹药的小数抹平', loaded.resources.pill === 3, `${loaded.resources.pill}`)

    // ⑥ 显示与判定一致：整数需求下「有 5 就能买 5」不再出现看着够其实不够
    state.buildings.hut = { count: 4, on: true } // 第 5 座要灵石 6
    const fifth = E.buildingCost(state, 'hut', 1)
    state.resources.wood = fifth.wood
    ok('凑齐整数需求就真的买得起', E.canAfford(state, fifth) === true, `${state.resources.stone} vs ${fifth.stone}`)
    state.resources.wood = fifth.wood - 1
    ok('差一枚就买不起（不会显示成「够」）', E.canAfford(state, fifth) === false)
  }
}

export function numberFormatting({ ok, section }) {
  section('数字格式（只有左栏资源表保留小数）')
  {
    // 资源栏：连续资源两位小数，整枚资源取整
    ok('资源栏连续资源两位小数', fmtResource('qi', 12.345) === '12.35', fmtResource('qi', 12.345))
    ok('资源栏整枚资源不带小数', fmtResource('stone', 4.5) === '4', fmtResource('stone', 4.5))
    ok('资源栏的 fmtFixed 仍然固定两位', fmtFixed(12) === '12.00', fmtFixed(12))

    // 其它地方：整数
    ok('存量向下取整', fmtStock(234.56) === '234', fmtStock(234.56))
    ok('花费向上取整', fmtCost(148.955) === '149', fmtCost(148.955))
    ok('累计量取整后缩写', fmtAmount(1234.6) === '1.24k', fmtAmount(1234.6))
    ok('fmtInt 取整后缩写', fmtInt(1234.5) === '1.24k', fmtInt(1234.5))
    ok('大数用千进制并最多两位小数', fmtAmount(123456) === '123.46k', fmtAmount(123456))
    ok('整数缩写省略小数尾零', fmtAmount(80000) === '80k', fmtAmount(80000))
    // 缩放后不保留小数时，整数末尾的 0 不能被当作小数尾零删掉。
    for (const [value, expected] of [
      [1000, '1k'],
      [1000000, '1m'],
      [1200000, '1.2m'],
      [1204000, '1.2m'],
      [10000000, '10m'],
      [12000000000, '12b'],
      [-1200000, '-1.2m'],
    ]) {
      for (const format of [fmt, fmtInt, fmtStock, fmtCost, fmtAmount]) {
        ok(`${format.name}(${value}) 保留整数尾零`, format(value) === expected, format(value))
      }
    }
    ok('资源栏整枚资源采用千进制缩写', fmtResource('stone', 1200000) === '1.2m', fmtResource('stone', 1200000))
    ok('资源栏连续资源缩写仍固定两位', fmtResource('qi', 1200000) === '1.20m', fmtResource('qi', 1200000))
    ok('小数尾零仍正确省略', fmt(120000) === '120k' && fmt(125000) === '125k')
    ok('舍入进位时切换单位，不出现1000k', fmt(999999) === '1m' && fmtFixed(999999) === '1.00m')
    ok('超过b级别使用科学计数法', fmt(1e12) === '1.00e+12' && fmtCost(1e48) === '1.00e+48')
    ok('负数也保持整数', fmtStock(-12.7) === '-13', fmtStock(-12.7))
    ok('0 与 Infinity 不出错', fmtStock(0) === '0' && fmtCost(0) === '0' && fmtAmount(Infinity) === '∞')
  }
}
