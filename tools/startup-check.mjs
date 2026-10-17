import { installBrowserGlobals } from './lib/browser-env.mjs'
import assert from 'node:assert/strict'
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { JSDOM } from 'jsdom'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { money, moneyEq, moneyGt } from '../src/game/decimal.js'

// 执行真正的 main 入口，并模拟 Vite 的 dispose / accept / 页面重载。
const root = fileURLToPath(new URL('../', import.meta.url))
await build({
  configFile: false,
  root,
  plugins: [vue()],
  resolve: { alias: { '@': root.replaceAll('\\', '/') + 'src' } },
  define: { 'import.meta.hot': 'globalThis.__gameHot' },
  build: {
    outDir: '.smoke-startup', emptyOutDir: true, minify: false,
    lib: { entry: root + 'tools/startup-entry.js', formats: ['es'], fileName: () => 'startup.js' },
  },
})

const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost:5273/', pretendToBeVisual: true })
const browser = dom.window
const restoreGlobals = installBrowserGlobals(browser, ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'localStorage', 'MutationObserver'])
const originalNow = Date.now
const originalSetInterval = globalThis.setInterval
const originalClearInterval = globalThis.clearInterval
const originalAnimationFrame = globalThis.requestAnimationFrame
// jsdom 内部用 setInterval 模拟动画帧；独立模拟帧，避免混入游戏循环计数。
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 16)
let now = originalNow()
let nextId = 0
const intervals = new Map()
Date.now = () => now
// 模拟浏览器的 Window 接收对象限制；Node 原生定时器不会暴露这个错误。
globalThis.setInterval = function (fn) {
  assert.equal(this, globalThis, 'setInterval 必须通过浏览器全局对象调用')
  const id = nextId++
  intervals.set(id, fn)
  return id
}
globalThis.clearInterval = function (id) {
  assert.equal(this, globalThis, 'clearInterval 必须通过浏览器全局对象调用')
  intervals.delete(id)
}
function hotContext() {
  return {
    accept(fn) { this.accepted = fn },
    dispose(fn) { this.disposed = fn },
    invalidate(message) { this.reloadReason = message },
  }
}
const url = pathToFileURL(root + '.smoke-startup/startup.js').href
try {
  const oldHot = globalThis.__gameHot = hotContext()
  const first = await import(url + '?first')
  assert.equal(intervals.size, 1, 'main 自动启动且只有一个主循环')
  first.state.buildings.spiritField = { count: 1, on: true }
  // 资源、仙缘与道果都是金额：入口夹具也必须构造成 Decimal。
  first.state.resources.qi = money(100)
  first.state.karma = money(44)
  first.state.dao = money(11)
  now += 1000
  for (const step of intervals.values()) await step()
  assert.ok(first.state.totalDays > 0, '真实入口推进历法')
  assert.ok(moneyGt(first.state.resources.qi, 100), '真实入口结算聚灵阵产出')
  const days = first.state.totalDays
  const qi = first.state.resources.qi

  assert.equal(typeof oldHot.accepted, 'function', 'store 成为游戏模块热更新边界')
  oldHot.disposed()
  assert.equal(intervals.size, 0, '热更新清理旧循环，包括句柄 0')
  const raw = browser.localStorage.getItem('slack-off-sect.save.v1')
  // 存档里的金额是十进制字符串，与运行时 Decimal 用 toString 对齐。
  assert.equal(JSON.parse(raw).resources.qi, qi.toString(), '热更新保存完整当前进度')
  oldHot.accepted()
  assert.ok(oldHot.reloadReason, '热更新请求完整重载，重新经过启动入口')

  browser.document.getElementById('app').__vue_app__.unmount()
  globalThis.__gameHot = hotContext()
  const reloaded = await import(url + '?reloaded')
  assert.equal(intervals.size, 1, '重载后重新启动一个主循环')
  assert.ok(moneyEq(reloaded.state.karma, 44), '重载后仙缘保持不变')
  assert.ok(moneyEq(reloaded.state.dao, 11), '重载后道果保持不变')
  assert.ok(moneyEq(reloaded.state.resources.qi, qi), '重载后灵气保持不变')
  assert.equal(reloaded.state.totalDays, days)
  now += 1000
  for (const step of intervals.values()) await step()
  assert.ok(reloaded.state.totalDays > days, '热更新后历法继续推进')
  assert.ok(moneyGt(reloaded.state.resources.qi, qi), '热更新后资源继续结算')
  const beforeCatchup = reloaded.state.stats.playTime
  now += 600000
  for (const step of intervals.values()) {
    const completion = step()
    assert.equal(reloaded.ui.offlineLoading, true, '补算开始先显示加载提示')
    assert.equal(reloaded.state.stats.playTime, beforeCatchup, '加载提示显示时收益尚未写回')
    await Promise.resolve()
    assert.ok(browser.document.querySelector('.offline-loading'), '补算之前先渲染加载符号')
    assert.equal(browser.document.querySelector('progress[aria-label="离线结算进度"]')?.getAttribute('max'), '100', '补算展示有明确上限的进度条')
    assert.equal(browser.document.querySelector('.wrap').getAttribute('aria-busy'), 'true', '加载期间页面标记为忙碌')
    await completion
  }
  assert.equal(reloaded.ui.offlineLoading, false, '补算结束收起加载提示')
  assert.equal(reloaded.ui.offlineProgress.percent, 100, '补算完成后进度达到100%')
  assert.equal(browser.document.querySelector('.offline-progress'), null, '补算完成后移除进度条')
  assert.equal(reloaded.state.stats.playTime, beforeCatchup + 600, '恢复页面只补算尚未推进的十分钟')
  assert.ok(reloaded.state.log.some(entry => entry.text.includes('挂机 600 秒')), '真实启动入口补算后生成挂机报告')
  for (const step of intervals.values()) await step()
  assert.equal(reloaded.state.stats.playTime, beforeCatchup + 600, '同一恢复时间重复触发循环不会重复领取')
  now += 1000
  for (const step of intervals.values()) await step()
  assert.equal(reloaded.state.stats.playTime, beforeCatchup + 601, '补算之后在线循环继续正常推进')
  reloaded.saveNow()
  const savedPlayTime = reloaded.state.stats.playTime
  reloaded.stopLoop()
  browser.document.getElementById('app').__vue_app__.unmount()
  now += 600000
  globalThis.__gameHot = hotContext()
  const awayReload = await import(url + '?awayReload')
  assert.equal(awayReload.ui.offlineLoading, true, '读档离线收益也先展示加载提示')
  assert.equal(intervals.size, 0, '初始离线未完成时不启动在线循环')
  assert.equal(awayReload.saveNow(), false, '加载期间不覆盖待补算存档')
  await awayReload.initializeGame()
  assert.equal(awayReload.ui.offlineLoading, false)
  assert.equal(awayReload.ui.offlineProgress.percent, 100, '读档离线异步结算完成后进度达到100%')
  assert.equal(awayReload.state.stats.playTime, savedPlayTime + 600, '读档离线只补算一次')
  assert.equal(intervals.size, 1, '初始离线结束后才启动在线循环')
  awayReload.stopLoop()
  browser.document.getElementById('app').__vue_app__.unmount()
  console.log('真实启动与热更新回归检查通过：时间、资源、保存和循环重启')
} finally {
  Date.now = originalNow
  globalThis.setInterval = originalSetInterval
  globalThis.clearInterval = originalClearInterval
  if (originalAnimationFrame) globalThis.requestAnimationFrame = originalAnimationFrame
  else delete globalThis.requestAnimationFrame
  delete globalThis.__gameHot
  dom.window.close()
  restoreGlobals()
}
