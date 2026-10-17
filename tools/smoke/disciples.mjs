import * as E from '../engine-fixture.mjs'
import { REALMS } from '../../src/data/realms.js'
import { newGame, newGameRunning } from './fixtures.mjs'

export function discipleArrivals({ ok, close, section }) {
  section('弟子自动前来')
  {
    const { state, derived } = newGame()
    // 开局一片空地：没有居所就没有弟子上限，自然也没人来
    ok('开局 0 人且上限为 0', state.disciples.total === 0 && derived.maxDisciples === 0)
    E.recruitArrivals(state, derived, 600, { silent: true })
    ok('没有居所时不会来人', state.disciples.total === 0)

    state.resources.qi = E.money(2000)
    state.resources.stone = E.money(100)
    state.resources.qi = E.money(2000)
    state.buildings.spiritField = { count: 1, on: true } // 茅屋现在要一座聚灵阵
    state.buildings.granary = { count: 20, on: true } // 抬灵气上限，才买得起一次九座
    E.buyBuilding(state, derived, 'hut', 1) // 上限 2
    const interval = E.arrivalInterval(derived)
    ok('间隔取配置值', close(interval, 15, 1e-9), `实际 ${interval}`)

    E.recruitArrivals(state, derived, interval - 1, { silent: true })
    ok('没到间隔不会来人', state.disciples.total === 0, `实际 ${state.disciples.total}`)
    E.recruitArrivals(state, derived, 1.5, { silent: true })
    ok('到点来一名', state.disciples.total === 1, `实际 ${state.disciples.total}`)

    E.recruitArrivals(state, derived, interval * 10, { silent: true })
    ok('一路来到住满为止', state.disciples.total === derived.maxDisciples)
    ok('住满后计时清零', state.arrivalTimer === 0)

    ok('nextArrivalIn 在满员时为 null', E.nextArrivalIn(state, derived) === null)
    state.resources.wood = E.money(100)
    E.buyBuilding(state, derived, 'hut', 1)
    const wait = E.nextArrivalIn(state, derived)
    ok('扩建后给出下一位的时间', wait !== null && wait > 0 && wait <= E.arrivalInterval(derived), `${wait}`)

    // 《广开山门》缩短间隔
    state.upgrades.recruitDrive = true
    state.resources.insight = E.money(9999)
    state.resources.stone = E.money(9999)
    state.resources.faith = E.money(9999)
    E.recompute(state, derived)
    ok('《广开山门》缩短前来间隔', close(E.arrivalInterval(derived), 15 * 0.7, 1e-9))

    // 弟子到达后应写进纪事
    const logBefore = state.log.length
    E.recruitArrivals(state, derived, E.arrivalInterval(derived) + 0.1)
    ok('弟子到来会写纪事', state.log.length > logBefore && state.log[0].text.includes('慕名而来'))
  }
}
