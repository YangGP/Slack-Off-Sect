/**
 * 渲染检查：用 Vue 的 SSR 渲染器把 App 完整渲染一遍。
 * 目的不是做 SSR，而是把每个组件的 setup / 模板都真实执行一次，
 * 抓出「模板引用了不存在的变量」「数据缺失导致渲染报错」这类问题。
 *
 * 用法：
 *   node --import <shim> node_modules/vite/bin/vite.js build --ssr tools/render-check.mjs --outDir .smoke-render
 *   node .smoke-render/render-check.js
 */
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import App from '../src/App.vue'
import { state, derived, ui } from '../src/game/store.js'
import * as E from '../src/game/engine.js'
import { BUILDINGS } from '../src/data/buildings.js'
import { ALL_UPGRADES } from '../src/data/upgrades.js'
import { ACHIEVEMENTS } from '../src/data/achievements.js'
import { JOBS } from '../src/data/jobs.js'
import { REALMS } from '../src/data/realms.js'

let passed = 0
let failed = 0
const problems = []

function ok(name, condition, extra = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    problems.push(name)
    console.log(`  ✗ ${name} ${extra}`)
  }
}

// 捕获 Vue 的警告：模板里访问未定义变量会走这里
const warnings = []
const origWarn = console.warn
console.warn = (...args) => {
  warnings.push(args.map((a) => (typeof a === 'string' ? a : String(a?.message || a))).join(' '))
}
const origError = console.error
const errors = []
console.error = (...args) => {
  errors.push(args.map((a) => (typeof a === 'string' ? a : String(a?.message || a))).join(' '))
}

// 造一个“什么都有”的存档，让所有面板都有内容可渲染
function makeRichState() {
  state.buildings = {}
  for (const b of BUILDINGS) state.buildings[b.id] = { count: 4, on: true }
  state.upgrades = {}
  for (const u of ALL_UPGRADES) state.upgrades[u.id] = true
  state.achievements = {}
  for (const a of ACHIEVEMENTS.slice(0, 6)) state.achievements[a.id] = true
  state.resources = {
    qi: 12345,
    wood: 4321,
    stone: 999,
    ore: 555,
    herb: 321,
    pill: 42,
    talisman: 17,
    artifact: 9,
    insight: 8888,
    faith: 666,
    karma: 30,
  }
  state.seen = Object.fromEntries(Object.keys(state.resources).map((k) => [k, true]))
  state.disciples.total = 40
  state.disciples.jobs = {}
  for (const j of JOBS) state.disciples.jobs[j.id] = 4
  state.craftProgress = { infuseStone: 0.5 }
  state.autoCraft = { infuseStone: true }
  state.realm = 8
  state.karma = 30
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

console.warn = origWarn
console.error = origError

console.log('\n== 控制台警告 ==')
const renderWarnings = warnings.filter(
  (w) => w.includes('was accessed during render') || w.includes('is not defined'),
)
for (const w of warnings.slice(0, 20)) console.log('  ! ' + w.slice(0, 200))
ok('模板中没有未定义变量', renderWarnings.length === 0, renderWarnings[0]?.slice(0, 160) || '')
ok('渲染过程中没有 console.error', errors.length === 0, errors[0]?.slice(0, 160) || '')

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`)
if (failed) {
  console.log('失败清单：')
  for (const p of problems) console.log('  - ' + p)
  process.exit(1)
}
console.log('渲染检查全部通过 ✅')
