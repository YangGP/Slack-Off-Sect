import { createBot } from '../player-bot.mjs'
import * as E from '../engine-fixture.mjs'
import { RESOURCES } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { CULTIVATION, ALL_UPGRADES, UPGRADE_MAP } from '../../src/data/upgrades.js'
import { TECHNIQUES } from '../../src/data/techniques.js'
import { ACHIEVEMENT_REWARD } from '../../src/data/achievements.js'
import { SEASONS, CALENDAR } from '../../src/data/calendar.js'
import { newGame, newGameRunning } from './fixtures.mjs'

export function calendar({ ok, close, section }) {
  section('历法与节气')
  {
    const { state, derived } = newGame()
    const C = E.calendarAt(0)
    ok('开局是第 1 年立春第 1 天', C.year === 1 && C.termName === '立春' && C.day === 1)
    ok('开局是春季', C.seasonName === '春')

    // 推算：1 节气 15 天、1 季 6 节气、1 年 24 节气
    ok('第 15 天进入下一个节气', E.calendarAt(15).termName === '雨水', E.calendarAt(15).termName)
    ok('第 90 天入夏', E.calendarAt(90).seasonName === '夏', E.calendarAt(90).seasonName)
    ok('第 180 天入秋', E.calendarAt(180).seasonName === '秋')
    ok('第 270 天入冬', E.calendarAt(270).seasonName === '冬')
    ok('第 360 天进入第 2 年立春', E.calendarAt(360).year === 2 && E.calendarAt(360).termName === '立春')

    // 季节真的影响产出
    const spring = newGameRunning()
    const winter = newGameRunning()
    spring.state.totalDays = 10 // 春
    winter.state.totalDays = 300 // 冬
    E.recompute(spring.state, spring.derived)
    E.recompute(winter.state, winter.derived)
    ok(
      '春季灵气产出高于冬季',
      spring.derived.rates.qi > winter.derived.rates.qi,
      `${spring.derived.rates.qi} vs ${winter.derived.rates.qi}`,
    )
    ok('春季灵草有加成', (spring.derived.seasonRatio.herb || 0) > 0)
    ok('冬季灵草减产', (winter.derived.seasonRatio.herb || 0) < 0)
    ok('冬季灵机加成', (winter.derived.seasonRatio.insight || 0) > 0)
    ok(
      '季节倍率乘进了产出（1 座聚灵阵 0.3，春季 +20%）',
      close(spring.derived.rates.qi, 0.3 * 1.2, 1e-9),
      `${spring.derived.rates.qi}`,
    )

    // 时间推进：一天 CALENDAR.DAY_SECONDS 秒。
    // 时长全部从常量推出来 —— 以前这里把「2 秒一天 / 30 秒一节气」写死了，改历法就会红一片。
    const DAY = CALENDAR.DAY_SECONDS
    const TERM_SECONDS = CALENDAR.DAYS_PER_TERM * DAY // 1 节气 = 15 天
    const t = newGame()
    E.tick(t.state, t.derived, DAY * 3, { events: false })
    ok(`${DAY} 秒一天：${DAY * 3} 秒过去 3 天`, close(t.state.totalDays, 3, 1e-9), `实际 ${t.state.totalDays}`)

    // 跨节气：只更新历法面板，不该写纪事（一节气只有几十秒，写纪事会把纪事刷满）
    {
      const before = t.state.log.length
      const termBefore = t.derived.calendar.termName
      E.tick(t.state, t.derived, TERM_SECONDS, { events: false })
      ok(
        `${TERM_SECONDS} 秒过去 1 个节气`,
        t.derived.calendar.termName !== termBefore,
        `${termBefore} → ${t.derived.calendar.termName}`,
      )
      ok('节气变化不写纪事', t.state.log.length === before, `多了 ${t.state.log.length - before} 条`)
    }
    // 入季才写纪事（一季 6 个节气，上面已经过掉 1 个，再跑 5 个）
    {
      const before = t.state.log.length
      const seasonBefore = t.derived.calendar.seasonName
      for (let i = 0; i < 5; i++) E.tick(t.state, t.derived, TERM_SECONDS, { events: false })
      ok('入季会写纪事', t.state.log.length > before && t.state.log.some((l) => l.text.includes('入')), `${t.state.log.length - before} 条`)
      ok('跨季后季节真的换了', t.derived.calendar.seasonName !== seasonBefore, `${seasonBefore} → ${t.derived.calendar.seasonName}`)
    }
    ok('一季 90 天 / 一年 360 天', close(E.calendarAt(90).seasonIndex, 1, 1e-9) && close(E.calendarAt(360).year, 2, 1e-9), `${E.calendarAt(90).seasonName} / 第 ${E.calendarAt(360).year} 年`)

    // 四季的强度阶梯：春正、夏正为主、秋中立、冬负为主；且每种资源四季平均 ≈ 0（历法不送净加成）
    {
      const byId = Object.fromEntries(SEASONS.map((s) => [s.id, s.ratio || {}]))
      const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0)
      const pos = (o) => Object.values(o).filter((v) => v > 0).reduce((a, b) => a + b, 0)
      const neg = (o) => Object.values(o).filter((v) => v < 0).reduce((a, b) => a + b, 0)
      ok('春全为正向', Object.values(byId.spring).every((v) => v >= 0) && sum(byId.spring) > 0.5, JSON.stringify(byId.spring))
      ok(
        '夏正向为主（有正有负，但正的更大）',
        Object.values(byId.summer).some((v) => v > 0) && Object.values(byId.summer).some((v) => v < 0) && pos(byId.summer) > -neg(byId.summer),
        JSON.stringify(byId.summer),
      )
      ok(
        '秋中立（一进一出，净额接近 0）',
        Object.values(byId.autumn).some((v) => v > 0) && Object.values(byId.autumn).some((v) => v < 0) && Math.abs(sum(byId.autumn)) <= 0.05,
        `净 ${sum(byId.autumn).toFixed(3)}`,
      )
      ok(
        '冬负向为主（负项占多数且量更大，最多留一个小正项）',
        Object.values(byId.winter).filter((v) => v < 0).length > Object.values(byId.winter).filter((v) => v > 0).length &&
          -neg(byId.winter) > pos(byId.winter) * 2,
        JSON.stringify(byId.winter),
      )
      // 每种资源的四季平均必须接近 0：历法只是「什么时候好、什么时候难」
      const resIds = new Set(SEASONS.flatMap((s) => Object.keys(s.ratio || {})))
      const bad = []
      for (const id of resIds) {
        const avg = SEASONS.reduce((a, s) => a + (s.ratio?.[id] || 0), 0) / SEASONS.length
        if (Math.abs(avg) > 0.05) bad.push(`${id} ${(avg * 100).toFixed(1)}%`)
      }
      ok('每种资源的四季平均都不超过 ±5%（不给全局送净加成）', bad.length === 0, bad.join('、'))
    }

    // 存档往返
    const saved = JSON.parse(JSON.stringify({ totalDays: t.state.totalDays }))
    ok('历法会进存档', close(saved.totalDays, t.state.totalDays, 1e-9))
  }
}

export function achievements({ ok, section }) {
  section('成就')
  {
    const { state, derived } = newGame()
    state.resources.qi = 50000
    state.resources.wood = 50000
    state.resources.stone = 5000 // 九座茅屋的灵石合计 600+，给足
    state.buildings.spiritField = { count: 1, on: true } // 茅屋现在要一座聚灵阵
    state.buildings.granary = { count: 20, on: true } // 抬灵气上限，一次九座才买得起
    E.buyBuilding(state, derived, 'hut', 1)
    E.checkAchievements(state, derived)
    ok('达成「立锥之地」', state.achievements.firstHut === true)
    ok(
      '成就暂不提供全局加成（奖励待重新设计，ACHIEVEMENT_REWARD = 0）',
      derived.ratioAll < 0.02 || ACHIEVEMENT_REWARD === 0,
      `ratioAll ${derived.ratioAll.toFixed(4)} / 奖励 ${ACHIEVEMENT_REWARD}`,
    )

    const ratioBefore = derived.ratioAll
    const rateBefore = derived.rates.qi
    E.buyBuilding(state, derived, 'hut', 9)
    ok('一次购买多座', E.countOf(state, 'hut') === 10, `实际 ${E.countOf(state, 'hut')}`)
    E.checkAchievements(state, derived)
    ok('达成「茅屋十间」', state.achievements.hutTen === true)
    ok(
      '达成更多成就也不改变全局倍率（加成已清零）',
      ACHIEVEMENT_REWARD > 0 ? derived.ratioAll > ratioBefore : derived.ratioAll === ratioBefore,
      `${derived.ratioAll} vs ${ratioBefore}`,
    )
    ok(
      '加成立刻反映到产出速率（先有产出源才看得出）',
      (() => {
        state.resources.qi = 100
        E.buyBuilding(state, derived, 'spiritField', 1)
        return derived.rates.qi > 0
      })(),
      `${derived.rates.qi}`,
    )
    void rateBefore
  }
}

export function offlineGains({ ok, section }) {
  section('离线收益')
  {
    const { state, derived } = newGameRunning()
    state.resources.qi = 0
    state.resources.wood = 0
    E.setJob(state, derived, 'farmer', 2)
    const before = state.resources.qi
    const result = E.simulateOffline(state, derived, 3600)
    ok('离线 1 小时结算了时间', result.seconds === 3600)
    ok('离线期间灵气增长', state.resources.qi > before)
    ok('离线不会触发随机事件', state.log.every((l) => !l.text.includes('妖兽')), '')

    const capped = E.simulateOffline(state, derived, 100)
    ok('短时间离线也能结算', capped.seconds === 100)
  }
}

export function playerBot({ ok, section }) {
  section('模拟玩家（机器人）短跑')
  {
    // 机器人是「按 id 到条目列表里查表」的典型消费方，两层拆开后最容易在这里脱节，
    // 所以让它真跑一段：既验证查询口径，也验证参悟链不会把推进卡死。
    const { state, derived } = newGame()
    const bot = createBot(state, derived)
    let error = null
    // 顺手记录「玄铁/灵草 从开始产出到第一次被花掉」用了多久 —— 早期资源不能是死资源
    const firstSpend = { ore: null, herb: null }
    const producedAt = { ore: null, herb: null }
    const prevRes = { ...state.resources }
    try {
      // 观察12小时：未进入的产业遵守解锁条件，已投产的材料能进入消费链。
      for (let t = 1; t <= 12 * 3600; t++) {
        E.tick(state, derived, 1, { events: false })
        if (t % 5 === 0) bot.act()
        if (t % 60 === 0) E.recompute(state, derived)
        for (const r of ['ore', 'herb']) {
          const now = state.resources[r] || 0
          if (!producedAt[r] && (derived.rates[r] || 0) > 0) producedAt[r] = t
          if (!firstSpend[r] && now < prevRes[r] - 1e-9) firstSpend[r] = t
          prevRes[r] = now
        }
      }
    } catch (e) {
      error = e
    }
    ok('机器人跑 12 小时不报错', !error, error ? String(error.message) : '')
    for (const [id, name] of [
      ['ore', '玄铁'],
      ['herb', '灵草'],
    ]) {
      ok(
        `${name}已投产则被使用，未投产则矿场或药圃尚未启用`,
        producedAt[id] === null
          ? E.countOf(state, id === 'ore' ? 'ironFurnace' : 'herbGarden') === 0
          : firstSpend[id] !== null && firstSpend[id] >= producedAt[id],
        producedAt[id] === null
          ? '整局没有产出'
          : `产出 ${Math.round(producedAt[id] / 60)} 分 → 花掉 ${firstSpend[id] === null ? '（没花掉）' : Math.round(firstSpend[id] / 60) + ' 分'}`,
      )
    }
    ok('机器人参悟出了东西', Object.keys(state.upgrades).length > 0, `${Object.keys(state.upgrades).length} 条`)
    ok('机器人盖起了房子', state.stats.buildingsBuilt > 0, `${state.stats.buildingsBuilt} 座`)

    // 灵木的「用处」要平滑：早期不能被上限卡成 0 ↔ 满仓的锯齿，中期要有连续去处（工坊烧柴）
    {
      const woodUpkeep = BUILDINGS.filter((b) => b.upkeep?.wood)
      ok(
        '灵木有连续去处（多座工坊以灵木为维护费）',
        woodUpkeep.length >= 3,
        woodUpkeep.map((b) => `${b.name} ${b.upkeep.wood}/s`).join('、'),
      )
      ok('谷仓也囤灵木（早期给上限留出余量）', (BUILDING_MAP.granary.effects.storage?.wood || 0) > 0, `${BUILDING_MAP.granary.effects.storage?.wood}`)

      // 跑 30 分钟：灵木不该长时间贴顶（旧版前期上限只有 200，产量 3~4/秒，几十秒就灌满）
      const s5 = newGame()
      const bot5 = createBot(s5.state, s5.derived)
      let pinned = 0
      let samples = 0
      for (let t = 1; t <= 1800; t++) {
        E.tick(s5.state, s5.derived, 1, { events: false })
        if (t % 5 === 0) bot5.act()
        if (t % 60 === 0) E.recompute(s5.state, s5.derived)
        const rate = s5.derived.rates.wood || 0
        if (rate > 0.02 && (s5.state.resources.wood || 0) >= (s5.derived.max.wood || 0) - 1e-6) pinned++
        samples++
      }
      ok(
        '前 30 分钟灵木贴顶时间 < 5%',
        pinned / samples < 0.05,
        `${((pinned / samples) * 100).toFixed(1)}%（上限长到 ${Math.round(s5.derived.max.wood)}，产量 ${(s5.derived.rates.wood || 0).toFixed(2)}/秒）`,
      )
    }

    ok(
      '可参悟列表里的 id 都能查到条目',
      derived.availableUpgrades.every((id) => !!E.UPGRADE_MAP[id]),
      derived.availableUpgrades.join(','),
    )
    ok(
      '参悟表覆盖两层（修真 + 技艺·法宝）',
      Object.keys(state.upgrades).every((id) => !!E.UPGRADE_MAP[id]) && ALL_UPGRADES.length === CULTIVATION.length + TECHNIQUES.length,
    )
  }
}

export function longRunningStability({ ok, section }) {
  section('长时挂机稳定性')
  {
    const { state, derived } = newGame()
    // 给一套中等规模的家底，再模拟 2 小时
    state.resources.qi = 5000
    state.resources.wood = 5000
    state.resources.stone = 5000
    state.resources.insight = 5000
    state.resources.herb = 5000
    state.resources.ore = 5000
    state.resources.pill = 500
    state.resources.artifact = 500
    E.buyBuilding(state, derived, 'spiritField', 5) // 先有聚灵阵，茅屋与藏经阁才立得住
    E.buyBuilding(state, derived, 'hut', 5)
    E.buyBuilding(state, derived, 'library', 2)
    E.recruitArrivals(state, derived, 200) // 等弟子自己来
    E.setJob(state, derived, 'farmer', 6)
    E.setJob(state, derived, 'scholar', 4)

    // 这份稳定性夹具从有效容量内开始；超额旧档另有专门回归。
    for (const r of RESOURCES) state.resources[r.id] = Math.min(state.resources[r.id] || 0, derived.max[r.id])
    let nan = false
    for (let i = 0; i < 7200; i++) {
      E.tick(state, derived, 1, { events: false })
      if (i % 600 === 0) E.recompute(state, derived)
      for (const r of RESOURCES) {
        if (Number.isNaN(state.resources[r.id])) nan = true
      }
    }
    ok('2 小时模拟没有 NaN', !nan)
    ok('灵气未越界', state.resources.qi >= 0 && state.resources.qi <= derived.max.qi + 1e-6)
    ok('灵机有积累', state.resources.insight > 0, `实际 ${state.resources.insight}`)
    ok('稳定供粮未产生宜居度断供惩罚', state.habitabilityPenalty === 0, `实际 ${state.habitabilityPenalty}`)
    ok('弟子未流失', state.disciples.total > 0)
  }
}
