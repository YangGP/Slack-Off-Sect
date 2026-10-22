import { createInitialState, normalizeState, resetForReincarnation } from '../../src/game/state.js'
import { createBot } from '../player-bot.mjs'
import * as E from '../engine-fixture.mjs'
import { RESOURCES } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { JOBS } from '../../src/data/jobs.js'
import { UPGRADE_MAP } from '../../src/data/upgrades.js'
import { CRAFTS } from '../../src/data/crafts.js'
import { REALMS, ASCEND_REALM_INDEX } from '../../src/data/realms.js'
import { CONFIG } from '../../src/data/config.js'
import { describeEffects } from '../../src/game/effectsText.js'
import { newGame } from './fixtures.mjs'

export function initialState({ ok, close, section }) {
  section('初始状态：什么都没有（对标猫国开局）')
  {
    const { state, derived } = newGame()
    ok('初始灵气为 0', E.moneyIsZero(state.resources.qi))
    ok('初始弟子为 0', state.disciples.total === 0)
    ok('初始没有任何职位', Object.values(state.disciples.jobs).every((n) => n === 0))
    ok('初始没有任何建筑', Object.keys(state.buildings).length === 0)
    ok('弟子上限为 0（要靠茅屋）', derived.maxDisciples === 0, `实际 ${derived.maxDisciples}`)
    ok('开局没有任何产出', E.moneyIsZero(derived.rates.qi) && E.moneyIsZero(derived.rates.wood))
    ok('开局宜居度20且没有额外全局加成', derived.habitability === 20 && derived.habitabilityMult === 1)

    // 点一下「吸取天地灵气」
    // 基础 +2.5，第一座聚灵阵 25 → 正好 10 下；每座聚灵阵按其每秒基础产出（0.3）线性叠加点击收益
    ok('没有聚灵阵时每次点击 +2.5 灵气', close(E.clickGain(state, derived), 2.5, 1e-9))
    E.drawQi(state, derived)
    ok('吸取一次得到 2.5 灵气', close(state.resources.qi, 2.5, 1e-9))
    ok('点击次数记在统计里', state.stats.clicks === 1)
    ok('点 10 下攒得出第一座聚灵阵（25 ÷ 2.5）', close(E.BUILDING_MAP.spiritField.cost.qi, 25, 1e-9))

    // 聚灵阵是第一座建筑，也是第一个产出源
    state.resources.qi = E.money(25)
    E.trackPeak(state)
    ok('灵气够了就能建聚灵阵', E.buyBuilding(state, derived, 'spiritField', 1) === 1)
    ok('聚灵阵产出灵气（春季 +20% 后 0.36/s）', close(derived.rates.qi, 0.36), `实际 ${derived.rates.qi}`)
    ok('有聚灵阵后点击收益提高到 2.8', close(E.clickGain(state, derived), 2.5 + E.BUILDING_MAP.spiritField.effects.prod.qi, 1e-9))

    // 伐木场：基础链第二环（聚灵阵 → 伐木场 → 茅屋 → 藏经阁）。
    const yard = E.BUILDING_MAP.lumberYard
    ok('伐木场要一座聚灵阵，造价与茅屋同档（150 气 + 60 木）',
      yard.needs?.building?.id === 'spiritField' && E.moneyEq(E.buildingCost(state, 'lumberYard').qi, 150))
    state.resources.qi = E.money(150)
    state.resources.wood = E.money(60)
    E.trackPeak(state)
    ok('材料齐了能建伐木场', E.buyBuilding(state, derived, 'lumberYard', 1) === 1)

    // 茅屋：第三环，消耗灵气与灵木，并且要先有一座伐木场。
    const hut = E.BUILDING_MAP.hut
    ok('首屋同样需要灵气150与灵木60', E.moneyEq(E.buildingCost(state, 'hut').qi, 150) && E.moneyEq(E.buildingCost(state, 'hut').wood, 60) && hut.cost.wood === 60)
    ok('茅屋要一座伐木场（基础链第三环）', hut.needs?.building?.id === 'lumberYard', JSON.stringify(hut.needs))
    state.resources.qi = E.money(150)
    state.resources.wood = E.money(60)
    state.resources.stone = E.money(4)
    E.trackPeak(state)
    ok('材料齐了能建茅屋', E.buyBuilding(state, derived, 'hut', 1) === 1)
    ok('茅屋把弟子上限抬到 2', derived.maxDisciples === 2, `实际 ${derived.maxDisciples}`)

    // 弟子住进来之后才有产出
    state.disciples.total = 2
    E.setJob(state, derived, 'farmer', 1)
    E.recompute(state, derived)
    ok('有阵徒之后灵气产出叠加', E.moneyGt(derived.rates.qi, 0.36), `实际 ${derived.rates.qi}`)
    ok(
      `灵气消耗按弟子数算（2 人 × ${CONFIG.DISCIPLE_UPKEEP}，凡体倍率 1.0）`,
      close(derived.upkeep, CONFIG.DISCIPLE_UPKEEP * 2, 1e-9),
      `实际 ${derived.upkeep}`,
    )

    // 口粮随境界倍率一起上涨：同样两名弟子，破境之后养人就贵了
    // （这条是行为断言：以后谁把 DISCIPLE_UPKEEP_REALM_EXP 改回 0，这里会直接报错）
    {
      const before = derived.upkeep
      const beforeUnit = derived.discipleUpkeep
      state.realm = 4 // 金丹期 ×2.0
      E.recompute(state, derived)
      const mult = 1 + (REALMS[4].mult - 1) * CONFIG.REALM_PRODUCTION_BONUS_RATIO
      ok(
        `口粮随境界倍率上涨（金丹期 ×${mult}）`,
        close(derived.upkeep, before.times(mult), 1e-9),
        `${before} → ${derived.upkeep}`,
      )
      ok(
        `每人口粮 = ${CONFIG.DISCIPLE_UPKEEP} × 境界倍率`,
        close(derived.discipleUpkeep, beforeUnit.times(mult), 1e-9),
        `实际 ${derived.discipleUpkeep}`,
      )
      // 渡劫期（×20）：口粮占「一名阵徒毛产出」的比例不该再往下掉。
      // 注意要用边际产出（裸 0.6 × 共用乘区），不能拿 rates.qi ÷ 人数 —— 那里面还混着聚灵阵的产出。
      state.realm = ASCEND_REALM_INDEX
      E.recompute(state, derived)
      const factor = E.moneyIsPositive(derived.prodRaw.qi)
        ? E.moneyToNumber(derived.rates.qi.div(derived.prodRaw.qi))
        : E.moneyToNumber(derived.globalMult)
      const grossPerFarmer = 0.6 * factor
      ok(
        '渡劫期口粮仍占阵徒毛产出的 30% 以上（弟子没有随境界变免费）',
        E.moneyToNumber(derived.discipleUpkeep) / grossPerFarmer > 0.3,
        `口粮 ${E.moneyToNumber(derived.discipleUpkeep).toFixed(3)} / 毛产出 ${grossPerFarmer.toFixed(3)}`,
      )
      state.realm = 0
      E.recompute(state, derived)
    }
  }
}
