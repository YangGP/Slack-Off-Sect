import * as E from '../engine-fixture.mjs'
import { runRecruitUnlockChecks } from '../recruit-unlock-check.mjs'
import { REALMS } from '../../src/data/realms.js'
import { TALENT_MAP, rollTalent, birthTalents } from '../../src/data/talents.js'
import { RECRUIT_TIER_MAP, rollRecruitRealm } from '../../src/data/disciples.js'
import { exportSave, parseImport } from '../../src/game/save.js'
import { newGame, newGameRunning } from './fixtures.mjs'

export function discipleArrivals({ ok, close, section }) {
  section('弟子自动前来')
  {
    const { state, derived } = newGame()
    // 开局一片空地：没有居所就没有弟子上限，自然也没人来
    ok('开局 0 人且上限为 0', state.disciples.total === 0 && derived.maxDisciples === 0)
    E.recruitArrivals(state, derived, 600, { silent: true })
    ok('没有居所时不会来人', state.disciples.total === 0)

    state.resources.qi = 2000
    state.resources.stone = 100
    state.resources.qi = 2000
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
    state.resources.wood = 100
    E.buyBuilding(state, derived, 'hut', 1)
    const wait = E.nextArrivalIn(state, derived)
    ok('扩建后给出下一位的时间', wait !== null && wait > 0 && wait <= E.arrivalInterval(derived), `${wait}`)

    // 《广开山门》缩短间隔
    state.upgrades.recruitDrive = true
    state.resources.insight = 9999
    state.resources.stone = 9999
    state.resources.faith = 9999
    E.recompute(state, derived)
    ok('《广开山门》缩短前来间隔', close(E.arrivalInterval(derived), 15 * 0.7, 1e-9))

    // 弟子到达后应写进纪事
    const logBefore = state.log.length
    E.recruitArrivals(state, derived, E.arrivalInterval(derived) + 0.1)
    ok('弟子到来会写纪事', state.log.length > logBefore && state.log[0].text.includes('慕名而来'))
  }
}

export function manualRecruitment({ ok, section }) {
  section('主动招募（《招贤纳士》）')
  runRecruitUnlockChecks(E, ok)
  {
    const { state, derived } = newGameRunning()
    state.realm = 4 // 金丹期（mult 2.0）
    state.resources.qi = 1e6
    state.resources.faith = 1e6
    state.resources.insight = 1e6
    state.disciples.total = 2
    state.buildings.hut = { count: 3, on: true }
    E.recompute(state, derived)

    // 未解锁：派生标记为假、招募被拒
    ok('未研究《招贤纳士》不解锁主动招募', !derived.recruitModeUnlocked)
    ok('未解锁时招募被拒绝', E.recruitDisciple(state, derived, 'small').recruited === 0)

    state.upgrades.seekTalents = true
    E.recompute(state, derived)
    ok('研究《招贤纳士》后解锁主动招募', derived.recruitModeUnlocked)

    // 默认自动模式：自动前来照常
    const autoBefore = state.disciples.total
    E.recruitArrivals(state, derived, E.arrivalInterval(derived) + 0.1, { silent: true })
    ok('默认自动前来照常来人', state.disciples.total === autoBefore + 1)

    // 切到主动招募：停止自动来人并清零计时
    state.settings.recruitMode = 'manual'
    E.recompute(state, derived)
    state.arrivalTimer = 10
    E.recruitArrivals(state, derived, 600, { silent: true })
    ok('主动招募模式停止自动来人并清零计时', state.disciples.total === autoBefore + 1 && state.arrivalTimer === 0)
    ok('主动招募模式下 nextArrivalIn 为 null', E.nextArrivalIn(state, derived) === null)

    // 花费随宗门境界倍率缩放；起点境界为概率区间
    ok('薄礼花费随宗门境界倍率缩放', E.recruitPreview(state, derived, 'small').cost.qi === Math.ceil(300 * REALMS[state.realm].mult))
    const grand = E.recruitPreview(state, derived, 'grand')
    ok('重金起点区间覆盖宗门下移四境', grand.realmMin === Math.max(0, state.realm - 4) && grand.realmMax === state.realm)
    ok('厚礼附带着香火材料', E.recruitPreview(state, derived, 'thick').cost.faith === 150)

    // 招募扣料、人数 +1、起点境界落在区间内
    const qiBefore = state.resources.qi
    const countBefore = state.disciples.total
    const result = E.recruitDisciple(state, derived, 'grand')
    const recruit = state.disciples.members.at(-1)
    ok('招募成功并扣费', result.recruited === 1 && state.resources.qi < qiBefore && state.disciples.total === countBefore + 1)
    ok('新弟子起点境界落在区间内且修为为零', recruit.realm >= grand.realmMin && recruit.realm <= grand.realmMax && recruit.cultivation === 0)

    // 付不起不招募、不扣料
    state.resources.qi = 0
    state.resources.faith = 0
    state.resources.insight = 0
    E.recompute(state, derived)
    const poorBefore = state.disciples.total
    const poor = E.recruitDisciple(state, derived, 'grand')
    ok('资源不足不招募也不扣料', poor.recruited === 0 && poor.reason === 'insufficient' && state.disciples.total === poorBefore)

    // 满员不招募
    state.resources.qi = 1e6
    state.resources.faith = 1e6
    state.resources.insight = 1e6
    state.disciples.total = derived.maxDisciples
    E.recompute(state, derived)
    const full = E.recruitDisciple(state, derived, 'small')
    ok('居所已满不招募', full.recruited === 0 && full.reason === 'full')

    // 招募模式随存档保留，非法值回落
    state.settings.recruitMode = 'manual'
    ok('招募模式随存档保留', parseImport(exportSave(state)).settings.recruitMode === 'manual')
    state.settings.recruitMode = 'bogus'
    ok('非法招募模式回落到自动', parseImport(exportSave(state)).settings.recruitMode === 'auto')

    // 礼聘权重：偏向天级、可保证两条天赋
    const tian = rollTalent([], () => 0.999, RECRUIT_TIER_MAP.grand.tierWeights)
    ok('礼聘权重可偏向天级', TALENT_MAP[tian.id].tier === 'tian')
    const basic = rollTalent([], () => 0.999, null)
    ok('未传权重沿用基础分布末档为天级', TALENT_MAP[basic.id].tier === 'tian')
    const two = birthTalents(() => 0.9, { countWeights: [0, 0, 1], tierWeights: RECRUIT_TIER_MAP.grand.tierWeights })
    ok('礼聘权重可保证两条不重复天赋', two.length === 2 && new Set(two.map(entry => entry.id)).size === 2)

    // 起点境界：宗门越高、档位越高则平均起点越高（用独立招募序列抽样）
    const averageRealm = (tier, sectRealm) => {
      const data = { recruitSeed: 20261 }
      let sum = 0
      for (let i = 0; i < 4000; i++) sum += rollRecruitRealm(data, tier, sectRealm)
      return sum / 4000
    }
    const low = averageRealm(RECRUIT_TIER_MAP.small, 9)
    const mid = averageRealm(RECRUIT_TIER_MAP.thick, 9)
    const high = averageRealm(RECRUIT_TIER_MAP.grand, 9)
    ok('档位越高平均起点境界越高', low < mid && mid < high, `${low.toFixed(2)}/${mid.toFixed(2)}/${high.toFixed(2)}`)
    ok('宗门越高平均起点境界越高', averageRealm(RECRUIT_TIER_MAP.small, 4) < averageRealm(RECRUIT_TIER_MAP.small, 9))
    ok('起点境界不低于凡体', rollRecruitRealm({ recruitSeed: 7 }, RECRUIT_TIER_MAP.grand, 0) === 0)
  }
}
