/**
 * 渲染检查：用 Vue 的 SSR 渲染器把 App 完整渲染一遍。
 * 目的不是做 SSR，而是把每个组件的 setup / 模板都真实执行一次，
 * 抓出「模板引用了不存在的变量」「数据缺失导致渲染报错」这类问题。
 *
 * 用法：
 *   npm run check:render
 */
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { JSDOM } from 'jsdom'
import App from '../src/App.vue'
import { state, derived, ui } from '../src/game/store.js'
import * as E from './engine-fixture.mjs'
import { BUILDINGS } from '../src/data/buildings.js'
import { ALL_UPGRADES } from '../src/data/upgrades.js'
import { ACHIEVEMENTS } from '../src/data/achievements.js'
import { JOBS } from '../src/data/jobs.js'


import { createCheckHarness, captureConsole } from './lib/checks.mjs'

const harness = createCheckHarness()
const { ok } = harness
const captured = captureConsole()
const { warnings, errors } = captured
try {
  function makeRichState() {
    state.buildings = {}
    for (const b of BUILDINGS) state.buildings[b.id] = { count: 4, on: true }
    state.upgrades = {}
    for (const u of ALL_UPGRADES) state.upgrades[u.id] = true
    state.achievements = {}
    for (const a of ACHIEVEMENTS.slice(0, 6)) state.achievements[a.id] = true
    state.resources = {
      qi: E.money(12345),
      wood: E.money(4321),
      stone: E.money(999),
      ore: E.money(555),
      herb: E.money(321),
      pill: E.money(42),
      talisman: E.money(17),
      artifact: E.money(9),
      insight: E.money(8888),
      faith: E.money(666),
      karma: E.money(30),
    }
    state.seen = Object.fromEntries(Object.keys(state.resources).map((k) => [k, true]))
    state.disciples.total = 40
    state.disciples.jobs = {}
    for (const j of JOBS) state.disciples.jobs[j.id] = 4
    state.craftProgress = { infuseStone: E.money(0.5) }
    state.autoCraft = { infuseStone: true }
    state.realm = 8
    state.karma = E.money(30)
    state.habitabilityPenalty = -10
    state.buffs = [
      { id: 'spiritRain', name: '灵雨润泽', mult: 0.35, target: null, until: Date.now() + 60000 },
      { id: 'coldWave', name: '寒潮', mult: -0.3, target: null, until: Date.now() + 30000 },
    ]
    state.log = [
      { id: 2, at: Date.now(), text: '建成 聚灵阵 ×5', kind: 'good' },
      { id: 1, at: Date.now() - 5000, text: '妖兽侵袭', kind: 'bad' },
    ]
    state.stats.playTime = 7200
    state.stats.buildingsBuilt = 88
    E.recompute(state, derived)
  }

  const TABS = [
    ['sect', '可建造'],
    ['disciples', '职位分配'],
    ['cultivation', '修真'],
    ['skills', '技艺与法宝'],
    ['craft', '库存'],
    ['realm', '飞升'],
    ['achievements', '成就'],
    ['settings', '存档'],
  ]

  console.log('== 组件渲染 ==')
  makeRichState()

  for (const [tab, keyword] of TABS) {
    state.ui.tab = tab
    const app = createSSRApp(App)
    let html = ''
    let error = null
    try {
      html = await renderToString(app)
    } catch (err) {
      error = err
    }
    ok(
      `标签页「${tab}」渲染成功`,
      !error && html.length > 500,
      error ? error.message : `长度 ${html.length}`,
    )
    if (!error) {
      ok(`标签页「${tab}」包含关键内容（${keyword}）`, html.includes(keyword))
    }
  }

  // 转世预览：真实永久收益与可证心提醒，不替玩家消耗愿力。
  {
    state.ui.tab = 'realm'
    state.realm = 6
    state.karma = E.money(10)
    state.stats.lifeInsight = E.money(40000)
    state.resources.vow = E.money(10000)
    E.recompute(state, derived)
    const html = await renderToString(createSSRApp(App))
    // 说明在悬浮后才挂载；只检查默认可见的标签与收益，避免依赖标签间的HTML长度。
    const dom = new JSDOM(html)
    const rows = [...dom.window.document.querySelectorAll('.tip-row')]
    const benefit = label => rows.find(row => row.textContent.includes(label))?.querySelector('.v')?.textContent.trim() || ''
    ok('转世预览显示永久仙缘生产与仓储变化',
      /^\+10\.00%\s*→\s*\+\d+\.\d{2}%$/.test(benefit('仙缘产出加成')) &&
      /^\+0\.50%\s*→\s*\+\d+\.\d{2}%$/.test(benefit('仙缘仓储加成')) && !html.includes('NaN'))
    dom.window.close()
    ok('现成愿力可证心时显示提醒且不自动兑换', html.includes('已有愿力可证心') && state.resources.vow.eq(10000) && state.karma.eq(10))
    state.resources.vow = E.money(9999)
    const noAttest = await renderToString(createSSRApp(App))
    ok('不足完整道心时不提示已有愿力可证心', !noAttest.includes('已有愿力可证心'))
    makeRichState()
  }

  // 离线报告弹窗
  ui.offlineReport = {
    awaySeconds: 3600,
    simulatedSeconds: 3600,
    capped: true,
    gains: [{ id: 'qi', name: '灵气', amount: 1234 }],
  }
  {
    state.ui.tab = 'sect'
    const app = createSSRApp(App)
    let html = ''
    let error = null
    try {
      html = await renderToString(app)
    } catch (err) {
      error = err
    }
    ok('离线报告弹窗渲染成功', !error && html.includes('闭关归来'), error?.message || '')
    ui.offlineReport = null
  }


  console.log('\n== 控制台警告 ==')
  const renderWarnings = warnings.filter(
    (w) => w.includes('was accessed during render') || w.includes('is not defined'),
  )
  for (const w of warnings.slice(0, 20)) console.log('  ! ' + w.slice(0, 200))
  ok('模板中没有未定义变量', renderWarnings.length === 0, renderWarnings[0]?.slice(0, 160) || '')
  ok('渲染过程中没有 console.error', errors.length === 0, errors[0]?.slice(0, 160) || '')

  harness.finish()
} finally {
  captured.restore()
}
