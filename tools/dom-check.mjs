/**
 * 真·DOM 端到端验证：用 jsdom 造浏览器环境，加载**客户端 bundle**，
 * 把 App 真正挂载起来并让主循环跑几秒，然后模拟玩家点击。
 *
 * 前提：先构建客户端 bundle
 *   node --import <shim> node_modules/vite/bin/vite.js build --config tools/vite.domcheck.config.js
 * 再运行：
 *   node tools/dom-check.mjs
 */
import { JSDOM } from 'jsdom'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CHANGELOG, CURRENT_VERSION } from '../src/data/changelog.js'
import { CRAFTS, ADVANCED_CRAFT_OUTPUTS } from '../src/data/crafts.js'
import { EVENT_MAP } from '../src/data/events.js'

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

// ---------- 1. 浏览器环境（必须在 import bundle 之前准备好） ----------
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost:5273/',
  pretendToBeVisual: true,
})
const { window } = dom
const visualViewport = new window.EventTarget()
Object.defineProperties(visualViewport, {
  width: { get() { return this.widthOverride ?? window.innerWidth } },
  height: { get() { return this.heightOverride ?? window.innerHeight } },
  offsetLeft: { value: 0, writable: true },
  offsetTop: { value: 0, writable: true },
})
Object.defineProperty(window, 'visualViewport', { value: visualViewport, configurable: true })

for (const key of [
  'HTMLElement',
  'Element',
  'Node',
  'SVGElement',
  'Text',
  'Comment',
  'DocumentFragment',
  'Document',
  'ShadowRoot',
  'MutationObserver',
  'CustomEvent',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'localStorage',
  'sessionStorage',
  'location',
  'navigator',
  'history',
]) {
  if (!(key in window)) continue
  try {
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true })
  } catch (err) {
    /* 忽略不可覆盖的全局量 */
  }
}
Object.defineProperty(globalThis, 'window', { value: window, configurable: true })
Object.defineProperty(globalThis, 'document', {
  value: window.document,
  configurable: true,
  writable: true,
})

const runtimeErrors = []
window.addEventListener('error', (e) => runtimeErrors.push(String(e.message)))
const consoleErrors = []
const origError = console.error
console.error = (...args) => consoleErrors.push(args.map(String).join(' '))
const warnings = []
const origWarn = console.warn
console.warn = (...args) => warnings.push(args.map(String).join(' '))

// ---------- 2. 加载客户端 bundle 并挂载 ----------
const bundlePath = fileURLToPath(new URL('../.smoke-dom-client/dom-check-app.js', import.meta.url))
const mod = await import(pathToFileURL(bundlePath).href)
const { state, derived, actions, startLoop, stopLoop, saveNow, engine } = mod

console.log('== 挂载 ==')
let mountError = null
try {
  mod.mount(window.document.getElementById('app'))
} catch (err) {
  mountError = err
}
ok('应用成功挂载', !mountError, mountError?.message || '')

const app = window.document.getElementById('app')
const text = () => app.textContent || ''
const html = () => app.innerHTML || ''

ok('标题渲染出来了', text().includes('摸鱼宗门'))
ok('资源栏渲染出来了', text().includes('灵气') && text().includes('灵木'))
ok('顶栏状态行带弟子与灵气账目', /弟子 \d+\/\d+/.test(text()) && text().includes('净额'))
ok(
  '宗门概况通栏已移除',
  !window.document.querySelector('.band') && !text().includes('宗门概况'),
  window.document.querySelector('.band') ? 'band 还在' : '干净',
)
ok('标签页渲染出来了', text().includes('弟子') && text().includes('修真') && text().includes('技艺'))
ok('侧栏历法渲染出来了', text().includes('历法') && /第 \d+ 年/.test(text()))
ok('侧栏累计项还在', text().includes('累计灵气'))
{
  const doc = window.document
  const entry = doc.querySelector('.changelog-entry')
  ok('右下角更新日志入口显示当前版本', !!entry && entry.textContent.includes(CURRENT_VERSION) && entry.getAttribute('aria-haspopup') === 'dialog')
  ok('更新日志默认关闭', !doc.querySelector('.changelog-dialog'))
  entry?.click()
  await new Promise((r) => setTimeout(r, 50))
  const dialog = doc.querySelector('.changelog-dialog')
  const releases = [...(dialog?.querySelectorAll('.changelog-release h2') || [])]
  ok('日志按最新到v0.01展示全部更新', releases.length === CHANGELOG.length && releases[0]?.textContent.includes(CURRENT_VERSION) && releases.at(-1)?.textContent.includes('v0.01'))
  ok('日志包含最近人口与仓储修改', dialog?.textContent.includes('24人') && dialog?.textContent.includes('0.15%') && dialog?.textContent.includes('药藏'))
  const closeButton = dialog?.querySelector('.dialog-foot button')
  ok('日志打开后聚焦关闭按钮', doc.activeElement === closeButton)
  closeButton?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  ok('键盘可以进入版本列表滚动', doc.activeElement === dialog?.querySelector('.dialog-body'))
  doc.activeElement?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await new Promise((r) => setTimeout(r, 50))
  ok('Esc关闭日志并返回入口焦点', !doc.querySelector('.changelog-dialog') && doc.activeElement === entry)
  entry?.click()
  await new Promise((r) => setTimeout(r, 50))
  doc.querySelector('.changelog-mask')?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('点击遮罩关闭更新日志', !doc.querySelector('.changelog-dialog'))
  entry?.click()
  await new Promise((r) => setTimeout(r, 50))
  doc.querySelector('.changelog-dialog .dialog-foot button')?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('关闭按钮关闭更新日志', !doc.querySelector('.changelog-dialog'))
}
ok(
  '累计默认折叠（<details> 未展开）',
  (() => {
    const d = [...window.document.querySelectorAll('details')].find((x) =>
      x.textContent.includes('累计灵气'),
    )
    return !!d && !d.open
  })(),
)
ok('宗门页没有批量选择控件（建筑一次一座）', !window.document.querySelector('.panel .filters .push'))
ok(
  '历法写明季节与节气',
  ['春', '夏', '秋', '冬'].some((s) => text().includes(`· ${s} ·`)) && text().includes('季影响'),
)
// 先垫一点进度，让建筑网格里有足够多的按钮、也有买不起的
state.resources.qi = 5000
state.resources.wood = 5000
state.buildings.hut = { count: 5, on: true }
state.buildings.spiritField = { count: 10, on: true }
engine.recompute(state, derived)
await new Promise((r) => setTimeout(r, 50))

// 界面结构：猫国风格 = 状态行 + 标签行 + 三列（左资源 / 中主区 / 右历法与纪事）
const doc = window.document
ok(
  '三列布局就位（左资源 / 中主区 / 右纪事）',
  !!(doc.querySelector('.left') && doc.querySelector('.main') && doc.querySelector('.right')),
)
ok(
  '标签行之上没有别的板块（通栏已移除）',
  [...doc.querySelector('.wrap').children].map((c) => c.className).join('|') ===
    'title-line|stat-line|status-line|tabs|cols',
  [...doc.querySelector('.wrap').children].map((c) => c.className).join('|'),
)
ok(
  '中列以唯一边框容器开始（与左栏资源同一水平线）',
  doc.querySelector('.main')?.firstElementChild?.classList.contains('panel') &&
    !!doc.querySelector('.panel .build-grid'),
  doc.querySelector('.main')?.firstElementChild?.className || '',
)
ok('资源栏在左列', !!doc.querySelector('.left .res-table'))
ok(
  '资源是一行行文字',
  doc.querySelectorAll('.left .res-table tr').length >= 2 &&
    doc.querySelector('.left .res-table .res-name')?.textContent.includes('灵气'),
  `${doc.querySelectorAll('.left .res-table tr').length} 行`,
)
ok(
  '资源行有 存量 / 上限 / 净额 / 加成 四列',
  (() => {
    const tds = doc.querySelector('.left .res-table tr')?.querySelectorAll('td') || []
    return (
      tds.length === 5 &&
      !!tds[1].classList.contains('res-amount') &&
      !!tds[2].classList.contains('res-max') &&
      !!tds[3].classList.contains('res-rate') &&
      !!tds[4].classList.contains('res-bonus')
    )
  })(),
)
ok('左列保留快捷炼制入口', !!doc.querySelector('.left .craft-row') && !!doc.querySelector('.left .craft-open'))

// 中列：筛选行 + 建筑按钮网格（猫国式的方格按钮）
ok(
  '建筑以按钮网格呈现',
  doc.querySelectorAll('.panel .build-grid .build-btn').length >= 3,
  `${doc.querySelectorAll('.build-btn').length} 个按钮`,
)
ok('有筛选行（全部 / 可建造 / 已建成 …）', doc.querySelectorAll('.panel .filters .filter').length >= 4)

// 整枚计数的资源（灵石/丹药/符箓/法器）在界面上不出现小数
{
  const snapshot = { ...state.resources }
  state.resources.stone = 4.5 // 旧档/历史遗留的小数
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  const stoneText =
    [...doc.querySelectorAll('.left .res-table tbody tr')]
      .find((tr) => tr.textContent.includes('灵石'))
      ?.textContent.replace(/\s+/g, ' ')
      .trim() || ''
  ok('左栏灵石不显示小数', !/灵石\s*4\.5/.test(stoneText) && /灵石\s*4[^.\d]/.test(stoneText), stoneText.slice(0, 40))

  state.resources.qi = 12.34
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  const qiText =
    [...doc.querySelectorAll('.left .res-table tbody tr')]
      .find((tr) => tr.textContent.includes('灵气'))
      ?.textContent.replace(/\s+/g, ' ')
      .trim() || ''
  ok('连续资源仍然显示两位小数', /12\.34/.test(qiText), qiText.slice(0, 40))

  // 左栏以外的地方只显示整数：悬停明细的存量、花费的「现有/需要」都不带小数点
  {
    state.resources.qi = 1234.56
    state.resources.stone = 7
    state.buildings.hut = { count: 3, on: true } // 第 4 座茅屋：灵气 149.6、灵石 4.29 → 显示应为整数
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
    const tipTrigger = [...doc.querySelectorAll('.left .tip-trigger')].find((el) =>
      el.textContent.includes('灵气'),
    )
    tipTrigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise((r) => setTimeout(r, 320))
    const tipText = doc.querySelector('.tip')?.textContent.replace(/\s+/g, ' ').trim() || ''
    ok('悬停明细里的存量是整数', /灵气\s*1234(?!\.)/.test(tipText), tipText.slice(0, 60))

    // 加成倍率要拆成逐项（谁加了多少）
    {
      state.upgrades.qiArt = true
      state.buildings.gatheringArray = { count: 2, on: true }
      engine.recompute(state, derived)
      await new Promise((r) => setTimeout(r, 80))
      tipTrigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
      await new Promise((r) => setTimeout(r, 320))
      const tip = doc.querySelector('.tip')
      const rows = [...(tip?.querySelectorAll('.bonus-row') || [])].map((el) =>
        el.textContent.replace(/\s+/g, ' ').trim(),
      )
      ok('悬停提示里有加成倍率拆分', /加成倍率/.test(tip?.textContent || ''), (tip?.textContent || '').slice(0, 40))
      ok('拆分行里能看到具体条目', rows.some((r) => r.includes('引气诀')) && rows.some((r) => r.includes('聚灵大阵')), rows.join(' ｜ '))
      ok('拆分行带合计', rows.some((r) => /[+-]\d+%/.test(r)), rows.join(' ｜ '))
      tipTrigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
      await new Promise((r) => setTimeout(r, 60))
      state.upgrades.qiArt = false
      state.buildings.gatheringArray = { count: 0, on: true }
      engine.recompute(state, derived)
      await new Promise((r) => setTimeout(r, 60))
    }
    tipTrigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
    await new Promise((r) => setTimeout(r, 60))

    // 建筑悬停提示里的「价格」也要整数（第 4 座茅屋：灵气 297.91 → 298、灵石 14.9 → 15）
    const hutItem = [...doc.querySelectorAll('.panel .build-item')].find((el) =>
      el.querySelector('.build-btn')?.textContent.includes('茅屋'),
    )
    hutItem?.querySelector('.tip-trigger')?.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise((r) => setTimeout(r, 320))
    const priceTip = doc.querySelector('.tip')?.textContent.replace(/\s+/g, ' ').trim() || ''
    const priceSection = priceTip.slice(priceTip.indexOf('价格'), priceTip.indexOf('效果'))
    ok(
      '建筑提示的价格里没有小数点（需求向上取整）',
      priceSection.length > 0 && /灵气\s*298(?!\.)/.test(priceSection) && !/\d\.\d/.test(priceSection),
      priceSection.slice(0, 60),
    )
    hutItem?.querySelector('.tip-trigger')?.dispatchEvent(new window.MouseEvent('mouseleave'))
    await new Promise((r) => setTimeout(r, 60))
  }

  // 复原，后面还有一串依赖「买得起 / 高亮」的断言
  Object.assign(state.resources, snapshot)
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
}
ok(
  '网格最前面三个是核心按钮（吸气 / 拾石 / 制石）',
  [...doc.querySelectorAll('.panel .build-grid .build-btn')]
    .slice(0, 3)
    .map((b) => b.textContent.trim())
    .join('/') === '吸取天地灵气/拾取石材/凝气成石',
  [...doc.querySelectorAll('.panel .build-grid .build-btn')]
    .slice(0, 3)
    .map((b) => b.textContent.trim())
    .join(' / '),
)
ok(
  '建筑按钮上带已建数量',
  [...doc.querySelectorAll('.panel .build-btn')].some((b) => /\(\d+\)/.test(b.textContent)),
  [...doc.querySelectorAll('.panel .build-btn')].slice(0, 4).map((b) => b.textContent.trim()).join(' '),
)
{
  const rock = state.resources.rock
  state.resources.rock = 0
  await new Promise(r => setTimeout(r, 30))
  const gather = [...doc.querySelectorAll('.panel .build-btn')].find(b => b.textContent.trim() === '拾取石材')
  gather.click()
  ok('宗门页拾取按钮实际增加一块石材', state.resources.rock === 1)
  state.resources.rock = derived.max.rock
  await new Promise(r => setTimeout(r, 30))
  ok('石材满仓时拾取按钮禁用', gather.disabled)
  state.resources.rock = rock
}
ok(
  '买不起的建筑按钮置灰',
  doc.querySelectorAll('.panel .build-btn.poor').length > 0,
)
ok(
  '买得起的建筑按钮正常显示',
  doc.querySelectorAll('.panel .build-btn:not(.poor)').length > 0,
)

// 停用按钮只给带维护费的建筑（停用即停费，这才是一个真选择）
{
  state.buildings.spiritField = { count: 3, on: true } // 无维护费
  state.buildings.gatheringArray = { count: 2, on: true } // 有维护费
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  const item = (name) =>
    [...doc.querySelectorAll('.panel .build-item')].find((el) =>
      el.querySelector('.build-btn')?.textContent.includes(name),
    )
  const btn = (name, label) =>
    [...(item(name)?.querySelectorAll('.side-btn') || [])].find((b) => b.textContent.trim() === label)
  ok('没有维护费的建筑不显示「停」按钮', !btn('聚灵阵', '停'), item('聚灵阵')?.textContent.trim() || '')
  ok('带维护费的建筑显示「停」按钮', !!btn('聚灵大阵', '停'))
  ok('两者都能拆除（售）', !!btn('聚灵阵', '售') && !!btn('聚灵大阵', '售'))

  const qiExpenseBefore = -(derived.expense.qi || 0)
  ok('聚灵大阵在吃灵气', qiExpenseBefore > 0, `${qiExpenseBefore}`)
  btn('聚灵大阵', '停').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 60))
  ok('点「停」后不再吃灵气', (derived.maintenance.qi || 0) === 0, `${derived.maintenance.qi}`)
  ok('点「停」后按钮变成「启」', !!btn('聚灵大阵', '启'))
  ok('停用也不会挤掉别的东西（售还在）', !!btn('聚灵大阵', '售'))

  // 悬停提示里有维护费分节
  const tipTrigger = item('聚灵大阵')?.querySelector('.tip-trigger')
  tipTrigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise((r) => setTimeout(r, 320))
  const tipText = doc.querySelector('.tip')?.textContent.replace(/\s+/g, '') || ''
  ok('悬停提示里有「维护」分节', tipText.includes('维护') && tipText.includes('灵气'), tipText.slice(0, 60))
  tipTrigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
  await new Promise((r) => setTimeout(r, 60))

  // 提示里「一种资源一行」：库房这种多资源建筑不许挤成一长串
  {
    state.buildings.lumberYard = { count: 3, on: true }
    state.buildings.warehouse = { count: 2, on: true } // 已建 2 座 → 提示里应出现「合计」
    state.resources.wood = 9999
    state.resources.stone = 9999
    state.resources.ore = 9999
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 80))
    const storeItem = item('库房')
    storeItem?.querySelector('.tip-trigger')?.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise((r) => setTimeout(r, 330))
    const tip = doc.querySelector('.tip')
    const rows = [...(tip?.querySelectorAll('.tip-row') || [])].map((el) =>
      el.textContent.replace(/\s+/g, ' ').trim(),
    )
    const effectRows = rows.filter((r) => /上限/.test(r))
    ok(
      '库房的效果一种资源一行（灵木 / 灵石 / 玄铁 / 灵草）',
      ['灵木 上限', '灵石 上限', '玄铁 上限', '灵草 上限'].every((t) => rows.some((r) => r.startsWith(t))),
      rows.join(' ｜ '),
    )
    ok('一行里不带逗号顿号堆叠（每行只有一项）', effectRows.every((r) => !r.includes('，') && !r.includes('、')), effectRows.join(' ｜ '))
    ok('库房不再给灵气 / 感悟 / 丹药 / 符箓 / 香火 / 法器 加上限', !/灵气 上限|感悟 上限|丹药 上限|符箓 上限|香火 上限|法器 上限/.test(tip.textContent), tip.textContent.replace(/\s+/g, ' ').slice(-120))
    ok('合计写在同一条里', effectRows.some((r) => r.includes('（合计')), effectRows.join(' ｜ '))
    ok('悬停时高亮的正是这座建筑的造价（灵木 / 玄铁）', (() => {
      const lit = [...doc.querySelectorAll('.left .res-table tr.res-hl .res-name')].map((el) => el.textContent.trim())
      return lit.includes('灵木') && lit.includes('玄铁') && !lit.includes('灵气') && !lit.includes('灵石')
    })(), [...doc.querySelectorAll('.left .res-table tr.res-hl .res-name')].map((el) => el.textContent.trim()).join(','))
    storeItem?.querySelector('.tip-trigger')?.dispatchEvent(new window.MouseEvent('mouseleave'))
    await new Promise((r) => setTimeout(r, 60))
    state.buildings.lumberYard = { count: 1, on: true }
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
  }
  btn('聚灵大阵', '启')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 60))
  ok('重新启用后维护费回来', (derived.maintenance.qi || 0) > 0)
  state.buildings.gatheringArray = { count: 0, on: true }
  state.buildings.spiritField = { count: 1, on: true }
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
}

// 建筑顺序固定：资源变多（买得起的变了）也不许重排，否则按钮会在鼠标底下乱跳
{
  const coreNames = ['吸取天地灵气', '拾取石材', '凝气成石']
  const names = () =>
    [...doc.querySelectorAll('.panel .build-btn')]
      .map((b) => b.textContent.trim().replace(/\s*\(\d+\)$/, ''))
      .filter((n) => !coreNames.includes(n))
  const before = names()
  const qtBefore = state.resources.qi
  state.resources.qi = 9999999
  state.resources.wood = 9999999
  state.resources.stone = 9999999
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  const after = names()
  ok(
    '建筑顺序不随买得起与否变化（可见集合只增不重排）',
    after.filter((n) => before.includes(n)).join('|') === before.join('|'),
    `${before.slice(0, 4).join('/')} → ${after.slice(0, 4).join('/')}`,
  )
  ok('可见基础建筑按发展顺序排列（聚灵阵、茅屋、伐木场）', after.slice(0, 3).join(',') === '聚灵阵,茅屋,伐木场', after.slice(0, 3).join('/'))
  // 恢复成一个「部分买得起」的状态，后面的断言依赖这个
  state.resources.qi = qtBefore
  state.resources.wood = 5000
  state.resources.stone = 0
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
}

// 建筑 hover 提示：价格逐行（不足显示「现有 / 需要（还差多久）」并标红）+ 效果分节 + 风味小字
{
  // 让左栏把所有资源都显示出来（否则没见过的资源根本没有行可高亮）
  Object.assign(state.seen, { stone: true, ore: true, herb: true, insight: true, faith: true })
  await new Promise((r) => setTimeout(r, 60))
  // 挑一个买不起的建筑（它的价格里一定有不足的资源）
  const poorItem = [...doc.querySelectorAll('.panel .build-item')].find((i) =>
    i.querySelector('.build-btn.poor') && !['吸取天地灵气', '拾取石材', '凝气成石'].includes(i.querySelector('.build-btn').textContent.trim()),
  )
  const btnTipTrigger = poorItem?.querySelector('.tip-trigger')
  btnTipTrigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise((r) => setTimeout(r, 300))
  const btip = doc.querySelector('.tip')
  const btxt = btip?.textContent || ''
  ok('建筑悬停弹出提示', !!btip)
  ok('提示里有「价格」与「效果」分节', btxt.includes('价格') && btxt.includes('效果'))
  ok('提示里有风味小字', !!btip?.querySelector('.tip-flavor'), btip?.querySelector('.tip-flavor')?.textContent || '')
  ok(
    '不足的资源显示「现有 / 需要」并标红',
    /^[\d.]+\s*\/\s*[\d.]+/.test(btip?.querySelector('.tip-row .v.bad')?.textContent.trim() || ''),
    btip?.querySelector('.tip-row .v.bad')?.textContent.trim() || '(没有不足的资源)',
  )

  // 悬停购买项时，左栏对应资源行应被高亮（不够的额外标红）
  const litRows = () => [...doc.querySelectorAll('.left .res-table tr.res-hl')]
  const lackRows = () => [...doc.querySelectorAll('.left .res-table tr.res-lack')]
  ok('悬停时左栏高亮出该项花费的资源', litRows().length > 0, `${litRows().length} 行`)
  ok(
    '买不起的花费里有资源被标红',
    lackRows().length > 0,
    `${lackRows().length} 行：${lackRows().map((r) => r.querySelector('.res-name').textContent).join('、')}`,
  )
  ok(
    '高亮的行与提示里的价格对得上',
    litRows().length > 0 &&
      litRows().every((r) =>
        btip.textContent.includes(r.querySelector('.res-name').textContent.trim()),
      ),
  )

  btnTipTrigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
  await new Promise((r) => setTimeout(r, 50))
  ok('移开后建筑提示消失', !doc.querySelector('.tip'))
  ok('移开后左栏高亮也收掉', litRows().length === 0 && lackRows().length === 0)
}

// 悬停提示组件：默认行显示净额，悬停后弹出收支来源明细
ok(
  '资源行默认显示净额（带正负号）',
  /^[+-]/.test(doc.querySelector('.left .res-table .res-rate')?.textContent.trim() || ''),
  doc.querySelector('.left .res-table .res-rate')?.textContent.trim() || '',
)
const trigger = doc.querySelector('.left .tip-trigger')
ok('资源行是 tooltip 触发器', !!trigger)
if (trigger) {
  // 收支明细要有进项、出项与来源：先补一个「有聚灵阵 + 有阵徒」的状态
  state.disciples.total = Math.max(state.disciples.total, 2)
  actions.setJob('farmer', 1)
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  trigger.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise((r) => setTimeout(r, 300))
  const tip = doc.querySelector('.tip')
  const tipText = tip?.textContent || ''
  ok('悬停后弹出 tooltip', !!tip)
  ok(
    'tooltip 里有进项 / 出项 / 净额',
    tipText.includes('进项') && tipText.includes('出项') && tipText.includes('净额'),
    tipText.replace(/\s+/g, ' ').slice(0, 60),
  )
  ok('tooltip 列出进项来源（阵徒）', tipText.includes('阵徒'), tipText.replace(/\s+/g, ' ').slice(0, 80))
  trigger.dispatchEvent(new window.MouseEvent('mouseleave'))
  await new Promise((r) => setTimeout(r, 50))
  ok('移开后 tooltip 消失', !doc.querySelector('.tip'))
}
ok('标签页包含独立炼制页且保持纯文字形式', doc.querySelectorAll('.tabs .tab').length === 8 && [...doc.querySelectorAll('.tabs .tab')].some(el => el.textContent.trim() === '炼制'))
ok(
  '没有旧的卡片 / 斑马纹 / 进度条 / 气泡元素',
  doc.querySelectorAll('.card, .bcard, .progress, .toast, .box-head .hint.badge').length === 0,
)

// ---------- 3. 让主循环真实跑一会儿 ----------
console.log('\n== 主循环 ==')
startLoop()
const playTimeBefore = state.stats.playTime
state.resources.qi = 100
await new Promise((r) => setTimeout(r, 2200))
stopLoop()

ok(
  '主循环推进了游戏时间',
  state.stats.playTime > playTimeBefore + 1.5,
  `playTime=${state.stats.playTime.toFixed(2)}`,
)
ok('资源在自动增长', state.resources.qi > 100, `灵气 ${state.resources.qi.toFixed(2)}`)
ok('派生数据已刷新', derived.rates.qi > 0)
ok('顶栏数字已渲染', /灵气/.test(text()))

// ---------- 4. 模拟玩家操作 ----------
console.log('\n== 交互 ==')
state.resources.qi = 5000
state.resources.wood = 5000
state.resources.stone = 50
const built = actions.buy('hut', 1)
ok('建造成功', built === true && (state.buildings.hut?.count || 0) >= 1)
await new Promise((r) => setTimeout(r, 50))
const hutCountAfterBuy = state.buildings.hut.count
ok(
  '建造结果反映在按钮上',
  [...doc.querySelectorAll('.panel .build-btn')].some((b) =>
    b.textContent.includes(`茅屋 (${hutCountAfterBuy})`),
  ),
  [...doc.querySelectorAll('.panel .build-btn')]
    .map((b) => b.textContent.trim())
    .join(' / ')
    .slice(0, 60),
)

state.ui.tab = 'disciples'
await new Promise((r) => setTimeout(r, 50))
ok('切换到弟子面板', html().includes('职位分配'))

// 注意：顶部通栏里也有一张 table.grid，所以这里要限定到中列（.main）里找职位表
const jobRows = doc.querySelectorAll('.main table.grid tbody tr').length
ok('职位表渲染出职位行', jobRows >= 6, `${jobRows} 行`)

// 开局是 0 人 0 职位：先给座聚灵阵（阵徒的门槛）与几个人，再看职位表
state.buildings.spiritField = { count: 1, on: true }
state.disciples.total = 6
engine.recompute(state, derived)
await new Promise((r) => setTimeout(r, 60))

// 回归：曾经用「id 去 includes 对象数组」判断解锁，导致所有职位永远显示未解锁
const firstJobRow = doc.querySelector('.main table.grid tbody tr')
ok(
  '有聚灵阵后阵徒显示为已解锁',
  !!firstJobRow && !firstJobRow.textContent.includes('未解锁'),
  firstJobRow?.textContent.trim().slice(0, 40) || '',
)
ok(
  '已解锁职位的按钮可点（+1 派活）',
  (() => {
    const plus = [...(firstJobRow?.querySelectorAll('button') || [])].find(
      (b) => b.textContent.trim() === '+1',
    )
    return !!plus && !plus.disabled
  })(),
  `行=${firstJobRow?.textContent.trim().slice(0, 40)}`,
)

actions.setJob('farmer', 0)
actions.shiftJob('farmer', 2)
ok('分配职位生效', state.disciples.jobs.farmer === 2, `${state.disciples.jobs.farmer}`)

// 弟子不用手动招募：有空房就会自动来人
state.buildings.hut = { count: 5, on: true }
engine.recompute(state, derived)
const beforeArrival = state.disciples.total
const arrived = engine.recruitArrivals(state, derived, 120, { silent: true })
ok('有空房时弟子自动前来', arrived > 0 && state.disciples.total > beforeArrival, `来了 ${arrived} 名`)
engine.recompute(state, derived)
engine.recruitArrivals(state, derived, 9999, { silent: true })
ok(
  '住满之后不再来人',
  state.disciples.total === derived.maxDisciples,
  `${state.disciples.total} / ${derived.maxDisciples}`,
)
await new Promise((r) => setTimeout(r, 60))
ok('住满时给出「居所已满」提示', text().includes('居所已满'))
ok('界面上没有「招收弟子」按钮', !text().includes('招收弟子'))

// 回归：可参悟的条目不应该同时出现在「条件未达成」折叠里
// 引气诀属于技艺层，所以这里看「技艺」页；修真页看的是另一类（炼丹术等）
state.resources.qi = 5000
state.resources.wood = 5000
state.resources.herb = 500
state.buildings.spiritField = { count: 3, on: true } // 藏经阁现在要三座聚灵阵
actions.buy('library', 1)
state.resources.insight = 500
engine.recompute(state, derived)
state.ui.tab = 'skills'
await new Promise((r) => setTimeout(r, 50))
ok('技艺页渲染出来了', html().includes('技艺与法宝'))
{
  // 可参悟的表是 box-body 下的第一张表；「条件未达成」的在 details.fold 里
  const rowNames = (sel) =>
    [...doc.querySelectorAll(sel)].map((tr) => tr.cells[0]?.textContent.trim() || '')
  const availNames = rowNames('.box-body > table.grid tbody tr')
  const lockedNames = rowNames('details.fold table.grid tbody tr')
  ok(
    '可参悟的技艺出现且只出现一次',
    availNames.filter((n) => n === '引气诀').length === 1,
    availNames.join(','),
  )
  ok('已可参悟的技艺不在「条件未达成」里', !lockedNames.includes('引气诀'), lockedNames.join(','))
  // 新加的链式前置要能被读出来：阵法精要 需要先参悟 引气诀
  ok(
    '链式前置写在「条件未达成」的说明里',
    lockedNames.includes('阵法精要') && html().includes('需参悟《引气诀》'),
  )
}

// 标签计数应与当前能点击的参悟 / 炼成按钮一致，并随资源变化。
{
  const snapshot = { ...state.resources }
  const badge = (name) => [...doc.querySelectorAll('.tabs .tab')]
    .find((el) => el.textContent.trim().startsWith(name))?.querySelector('.badge')?.textContent.trim() || ''
  for (const id of Object.keys(state.resources)) state.resources[id] = 0
  await new Promise((r) => setTimeout(r, 50))
  ok('材料不足的修真与技艺不计入括号', badge('修真') === '' && badge('技艺') === '')
  for (const id of Object.keys(state.resources)) state.resources[id] = 1e9
  for (const [tab, name] of [['cultivation', '修真'], ['skills', '技艺']]) {
    state.ui.tab = tab
    await new Promise((r) => setTimeout(r, 50))
    const enabled = [...doc.querySelectorAll('.box-body > table.grid tbody button')]
      .filter((el) => !el.disabled && ['参悟', '炼成'].includes(el.textContent.trim())).length
    ok(`${name}括号只统计可用项`, enabled > 0 && badge(name) === `(${enabled})`, badge(name))
  }
  state.resources = snapshot
}

// 纪事按类型与关键词组合过滤，清空 / 替换日志后仍然同步。
{
  const snapshot = state.log
  state.log = []
  engine.pushLog(state, '建成 测试聚灵阵', 'good')
  engine.pushLog(state, '测试妖兽侵袭', 'bad')
  engine.pushLog(state, '测试异象', 'event')
  await new Promise((r) => setTimeout(r, 50))
  const lines = () => [...doc.querySelectorAll('.log .log-text')].map((el) => el.textContent)
  const filterButton = (name) => [...doc.querySelectorAll('.log-filters button')]
    .find((el) => el.textContent.trim() === name)
  ok('替换日志数组后纪事显示最新内容', lines().length === 3)
  filterButton('进展').click()
  await new Promise((r) => setTimeout(r, 50))
  ok('纪事类型筛选只显示对应记录', lines().length === 1 && lines()[0].includes('聚灵阵'))
  const search = doc.querySelector('.log-search')
  search.value = '妖兽'
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 50))
  ok('类型与关键词组合过滤并提示空结果', !lines().length && text().includes('没有符合筛选条件的纪事'))
  filterButton('全部').click()
  await new Promise((r) => setTimeout(r, 50))
  ok('关键词搜索匹配日志内容', lines().length === 1 && lines()[0].includes('妖兽'))
  engine.pushLog(state, '测试妖兽退散', 'good')
  await new Promise((r) => setTimeout(r, 50))
  ok('新增日志自动应用当前过滤', lines().length === 2)
  filterButton('重置').click()
  await new Promise((r) => setTimeout(r, 50))
  ok('重置过滤恢复全部纪事', lines().length === 4 && search.value === '')
  actions.clearLog()
  await new Promise((r) => setTimeout(r, 50))
  ok('清空纪事立即刷新列表', !lines().length && text().includes('山中清静，暂无大事'))
  state.log = snapshot
}

// 等级和纪事类型、关键词独立组合；旧纪事不凭文案猜等级。
{
  const snapshot = state.log
  state.log = [
    { id: 93001, at: Date.now(), text: '灵雨润泽', kind: 'good', eventLevel: 1, eventId: 'spiritRain' },
    { id: 93002, at: Date.now(), text: '妖兽窥伺药圃', kind: 'event', eventLevel: 2, eventId: 'beastThreat' },
    { id: 93003, at: Date.now(), text: '天门一线', kind: 'good', eventLevel: 3, eventId: 'heavenGate' },
    { id: 93004, at: Date.now(), text: '旧纪事', kind: 'event' },
  ]
  await new Promise(r => setTimeout(r, 50))
  const lines = () => [...doc.querySelectorAll('.log .log-text')].map(el => el.textContent)
  const button = (name) => [...doc.querySelectorAll('.log-filters button')].find(b => b.textContent.trim() === name)
  ok('纪事显示三级标签，旧纪事照常展示', lines().length === 4 && lines()[0].includes('一级·金丹前') && lines()[3] === '旧纪事')
  button('二级·金丹至化神').click()
  await new Promise(r => setTimeout(r, 50))
  ok('等级筛选只显示相应事件', lines().length === 1 && lines()[0].includes('妖兽'))
  button('进展').click()
  await new Promise(r => setTimeout(r, 50))
  ok('等级与纪事类型可以组合筛选', lines().length === 0)
  button('重置').click()
  await new Promise(r => setTimeout(r, 50))
  ok('重置同时恢复等级和类型', lines().length === 4)
  button('三级·炼虚起').click()
  await new Promise(r => setTimeout(r, 50))
  ok('天地级可单独筛选且按钮表达选中状态', lines().length === 1 && lines()[0].includes('天门') && button('三级·炼虚起').getAttribute('aria-pressed') === 'true')
  ok('纪事移除全部等级按钮', !button('全部等级'))
  button('三级·炼虚起').click()
  await new Promise(r => setTimeout(r, 50))
  ok('再次点击已选等级取消筛选并显示全部纪事', lines().length === 4 && button('三级·炼虚起').getAttribute('aria-pressed') === 'false')
  state.log = snapshot
  await new Promise(r => setTimeout(r, 50))
}

state.ui.tab = 'cultivation'
await new Promise((r) => setTimeout(r, 50))
ok('修真页渲染出来了', html().includes('研究本源'))
ok('修真页不列技艺·法宝层的东西', !html().includes('引气诀') && !html().includes('聚灵珠'))

// 修真 / 技艺页的花费列只写「需要多少」，现有与还差多久都进悬停提示
{
  // 先把藏经阁铺起来，让修真页真的列出可参悟的条目
  state.buildings.library = { count: 3, on: true }
  state.resources.insight = 120
  state.resources.stone = 400
  state.resources.herb = 50
  state.resources.wood = 400
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 80))
  const rows = [...doc.querySelectorAll('.box-body > table.grid tbody tr')]
  // 修真表会插入「段标题行」（五段主线，见 RESEARCH.md），数据行要跳过它们
const dataRows = rows.filter((tr) => !tr.classList.contains('stage-row'))
const cells = dataRows.map((tr) => ({
    name: tr.cells[0]?.textContent.trim() || '',
    cost: tr.cells[1]?.textContent.replace(/\s+/g, ' ').trim() || '',
    tr,
  }))
  ok(
    '花费列只写需求值（没有「现有/需要」）',
    cells.length > 0 && cells.every((c) => !c.cost.includes('/') && !c.cost.includes('（')),
    cells.slice(0, 3).map((c) => `${c.name}:${c.cost}`).join(' ｜ '),
  )
  ok('需求值仍然按资源逐项写出', /^感悟\s*\d+/.test(cells[0]?.cost || ''), cells[0]?.cost || '')
  const target = dataRows.find((tr) => tr.querySelector('.cost .lack')) || dataRows[0]
  const trigger = target?.querySelector('.cost .tip-trigger')
  ok('花费单元格是 tooltip 触发器', !!trigger)
  // 悬停整行（不只是花费格）都该弹出同一条提示：行的 mouseenter 会把事件转发给触发器
  target?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise((r) => setTimeout(r, 340))
  ok(
    '悬停整行也弹出提示',
    !!doc.querySelector('.tip'),
    (doc.querySelector('.tip')?.textContent || '（没有提示）').replace(/\s+/g, ' ').slice(0, 40),
  )
  target?.dispatchEvent(new window.MouseEvent('mouseleave'))
  await new Promise((r) => setTimeout(r, 100))
  ok('离开整行后提示收起', !doc.querySelector('.tip'))
  if (trigger) {
    trigger.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise((r) => setTimeout(r, 340))
    const tip = doc.querySelector('.tip')?.textContent.replace(/\s+/g, ' ').trim() || ''
    // 与建筑（宗门）的提示同一套排版：标题 + 描述 → 价格（够的只写需求、不够的写「现有 / 需要（还差多久）」）→ 效果
    ok('提示沿用宗门的排版（价格 / 效果分节）', tip.includes('价格') && tip.includes('效果'), tip.slice(0, 70))
    const costRows = [...(doc.querySelector('.tip')?.querySelectorAll('.tip-section + .tip-row') || [])].map((el) =>
      el.textContent.replace(/\s+/g, ' ').trim(),
    )
    ok(
      '不够的花费写成「现有 / 需要（还差多久）」',
      /感悟\s*120 \/ 200（还差 .+）/.test(tip),
      costRows.join(' ｜ '),
    )
    ok('够的花费只写需求值', /灵木\s*120(?!\s*\/)/.test(tip), costRows.join(' ｜ '))
    trigger.dispatchEvent(new window.MouseEvent('mouseleave'))
    await new Promise((r) => setTimeout(r, 60))
  }
}

// 技艺页的筛选：全部 / 技艺 / 法宝（此时法宝还没解锁，会出现在「条件未达成」里）
state.ui.tab = 'skills'
state.ui.skillFilter = 'treasure'
await new Promise((r) => setTimeout(r, 60))
ok(
  '筛选「法宝」后只剩法宝（技艺条目不再出现）',
  html().includes('聚灵珠') && !html().includes('引气诀'),
)
ok('法宝的门禁写成「需参悟《灵源考》」', html().includes('需参悟《灵源考》'))
state.ui.skillFilter = 'skill'
await new Promise((r) => setTimeout(r, 60))
ok('筛选「技艺」后不出现法宝', !html().includes('聚灵珠') && html().includes('引气诀'))
state.ui.skillFilter = 'all'
await new Promise((r) => setTimeout(r, 40))
ok('筛选「全部」时两类都在', html().includes('聚灵珠') && html().includes('引气诀'))

// 法宝祭炼：炼成之后出现「已炼成的法宝」表，点祭炼会升级、效果与花费都往上走
{
  state.ui.tab = 'skills'
  state.ui.skillFilter = 'treasure'
  state.resources.insight = 20000
  state.resources.stone = 100
  // 直接给上修真前置，专心测祭炼（不然聚灵珠还锁在《灵源考》后面）
  state.upgrades.qiOrigin = true
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  // 炼成与祭炼都要「材料 + 感悟」，按当前花费把两种都给足（花费形状以后变了也不会假失败）
  const affordRefine = (id, times = 4) => {
    const c = engine.refineCost(state, id) || {}
    const research = engine.UPGRADE_MAP[id]?.cost || {}
    for (const res of new Set([...Object.keys(c), ...Object.keys(research)])) {
      const need = Math.max(c[res] || 0, research[res] || 0)
      state.resources[res] = Math.max(state.resources[res] || 0, need * times)
    }
    engine.recompute(state, derived)
  }
  affordRefine('spiritPearl')
  actions.research('spiritPearl')
  await new Promise((r) => setTimeout(r, 60))
  ok('炼成后出现「已炼成的法宝」表', html().includes('已炼成的法宝') && html().includes('Lv.0'))

  const refineBtn = () =>
    [...doc.querySelectorAll('.box-body > table.grid .btn')].find((b) => b.textContent.trim() === '祭炼')
  const costBefore = engine.refineCost(state, 'spiritPearl').insight
  const qiRateBefore = derived.rates.qi
  affordRefine('spiritPearl')
  await new Promise((r) => setTimeout(r, 60))
  refineBtn()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 60))
  ok('点祭炼升到 Lv.1', engine.treasureLevel(state, 'spiritPearl') === 1)
  ok('行里显示等级与倍率', /Lv\.1/.test(html()) && /×1\.30/.test(html()))
  ok('祭炼后产出变高', derived.rates.qi > qiRateBefore, `${qiRateBefore.toFixed(2)} → ${derived.rates.qi.toFixed(2)}`)
  ok(
    '下次祭炼更贵（×1.7）',
    Math.abs(engine.refineCost(state, 'spiritPearl').insight - costBefore * 1.7) < 1e-6,
    `${costBefore} → ${engine.refineCost(state, 'spiritPearl').insight}`,
  )
  state.ui.skillFilter = 'all'
}

const learned = actions.research('qiArt')
ok('参悟技艺生效', learned === true && state.upgrades.qiArt === true)

state.resources.qi = 5000
state.resources.rock = derived.max.rock
engine.recompute(state, derived)
const stoneBefore = state.resources.stone || 0
actions.craft('condenseStone')
ok('制作生效', (state.resources.stone || 0) > stoneBefore)

// 完整炼制页的手动批量与自动功能：
//   制作 = 瞬发固定 1 份
//   ¼料 / ½料 / 全部 = 把「材料能做出来的份数」取 1/4、1/2、全部，一次做掉
//   自动 = 一份一份定时做（需《心有灵犀》），关掉总开关就停
{
  state.ui.tab = 'craft'
  state.resources.qi = 50000
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))

  ok('炼制块里没有全局倍数行了（改成每行自己的按钮）', !doc.querySelector('.left .filters'))

  const rowBtns = () => [...doc.querySelectorAll('.main .craft-row .btn')]
  const btn = (label) => rowBtns().find((b) => b.textContent.trim() === label)
  ok('每个配方一行四个按钮：制作 / ¼料 / ½料 / 全部', ['制作', '¼料', '½料', '全部'].every((l) => !!btn(l)), rowBtns().map((b) => b.textContent.trim()).join(' '))

  // 炼制的悬停提示：不再写「制作怎么点」的说明，只留价格 / 产出（含这批能做多少）/ 自动制作
  {
    const craftItem = doc.querySelector('.main .craft-row .tip-trigger') || doc.querySelector('.main .craft-row')
    craftItem?.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise((r) => setTimeout(r, 330))
    const tip = doc.querySelector('.tip')
    const text = tip?.textContent.replace(/\s+/g, ' ') || ''
    const sections = [...(tip?.querySelectorAll('.tip-section') || [])].map((el) => el.textContent.trim())
    ok('炼制提示里没有「制作（瞬发）」那套说明', !/制作（瞬发）|点一下立刻结算|取 ?\d+ 的 1\/4/.test(text), sections.join(' / '))
    ok('炼制提示只留 价格 / 产出 / 自动制作 三节', sections.join(',') === '价格,产出,自动制作', sections.join(','))
    ok('「这批能做」的份数还在（搬到产出一节）', /这批能做/.test(text) && /¼料 \d+ 份/.test(text), text.slice(0, 120))
    craftItem?.dispatchEvent(new window.MouseEvent('mouseleave'))
    await new Promise((r) => setTimeout(r, 60))
  }

  // 制作：固定 1 份
  const before1 = state.resources.stone || 0
  const qi1 = state.resources.qi || 0
  btn('制作')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  ok(
    '点「制作」正好做 1 份',
    (state.resources.stone || 0) - before1 === 1 && Math.abs(qi1 - (state.resources.qi || 0) - 45) < 1e-6,
    `灵石 +${(state.resources.stone || 0) - before1}，灵气 -${qi1 - (state.resources.qi || 0)}`,
  )

  // ½料：按「材料能做出来的份数」取一半
  state.buildings.warehouse = { count: 30, on: true }
  state.resources.qi = 45 * 20 // 能做 20 份
  state.resources.stone = 0
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  const canMake = engine.maxCraftable(state, derived, 'condenseStone')
  const beforeHalf = state.resources.stone || 0
  btn('½料')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  ok(
    `点「½料」做掉一半（${canMake} → ${Math.floor(canMake / 2)} 份）`,
    (state.resources.stone || 0) - beforeHalf === Math.floor(canMake / 2),
    `实际 +${(state.resources.stone || 0) - beforeHalf}`,
  )

  // ¼料：取四分之一
  state.resources.qi = 45 * 20
  state.resources.stone = 0
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  const beforeQ = state.resources.stone || 0
  btn('¼料')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  ok(
    '点「¼料」做掉四分之一（20 → 5 份）',
    (state.resources.stone || 0) - beforeQ === 5,
    `实际 +${(state.resources.stone || 0) - beforeQ}`,
  )

  // 材料只够 3 份时，¼料 取整为 0 → 按钮置灰
  state.resources.qi = 45 * 3
  state.resources.stone = 0
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  ok('材料只够 3 份时「¼料」置灰（取整为 0）', btn('¼料')?.disabled === true)
  ok('此时「½料」还能用（3 → 1 份）', btn('½料')?.disabled === false)

  // 自动：没参悟《心有灵犀》时是禁用的
  const autoBox = () => doc.querySelector('.main .craft-row .sw input[type=checkbox]')
  ok('未参悟《心有灵犀》时「自动」复选框禁用', !!autoBox()?.disabled)

  // 参悟后：勾上自动 = 一份一份定时做（不是瞬间刷满）
  state.upgrades.intuition = true
  state.settings.autoCraftOn = true
  state.resources.qi = 9000
  state.resources.stone = 0
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  ok('参悟后「自动」可勾选', autoBox()?.disabled === false)
  const stoneAtStart = state.resources.stone || 0
  autoBox()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  ok('勾上自动这一瞬间还没产出（它是一份一份做的）', (state.resources.stone || 0) === stoneAtStart)
  await new Promise((r) => setTimeout(r, 60))
  ok('行里显示自动进度', /自动中/.test(doc.querySelector('.main .craft-row')?.textContent || ''))

  // 真跑一会儿：0.5 秒一份，1.2 秒只该多出几份（主循环前面已 stopLoop，这里临时再开一段）
  startLoop()
  await new Promise((r) => setTimeout(r, 1200))
  stopLoop()
  const gained = (state.resources.stone || 0) - stoneAtStart
  ok('1.2 秒真跑下来只多出几份（约 2~4 份）', gained >= 1 && gained <= 6, `实际 +${gained}`)

  // 再点一下取消勾选就停
  autoBox()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 60))
  ok('取消勾选后不再自动做', engine.isAutoCrafting(state, derived, 'condenseStone') === false)
  ok(
    '取消后行里的「自动中」消失',
    !/自动中/.test(doc.querySelector('.main .craft-row')?.textContent || ''),
  )
}
state.ui.tab = 'realm'
await new Promise((r) => setTimeout(r, 50))
ok('境界面板渲染', html().includes('飞升'))
{
  const oldKarma = state.karma
  state.karma = 202
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 50))
  ok('境界页显示仙缘仓储增益精度', text().includes('仓储 +30.3%'))
  const karmaCell = [...doc.querySelectorAll('.main td')].find(el => el.textContent.trim() === '仙缘')?.nextElementSibling
  const trigger = karmaCell?.querySelector('.tip-trigger')
  trigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise((r) => setTimeout(r, 180))
  const tip = doc.querySelector('.tip')?.textContent || ''
  ok('仙缘悬停展示每点仓储增益与递减门槛', tip.includes('0.15%') && tip.includes('250点之后递减') && tip.includes('30.3%'))
  ok('仙缘产出软上限提示为75点起递减', tip.includes('75') && !tip.includes('133'))
  trigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
  const resourceTrigger = doc.querySelector('.left .res-table .tip-trigger')
  resourceTrigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise((r) => setTimeout(r, 180))
  const resourceTip = doc.querySelector('.tip')?.textContent || ''
  ok('资源悬停说明仙缘总容量加成', resourceTip.includes('仙缘仓储') && resourceTip.includes('30.3%'))
  resourceTrigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
  state.karma = oldKarma
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 50))
}
// 境界页：里程碑写进标题、转世与飞升分成两段、门槛未达成时不报可得数字
{
  const oldTab = state.ui.tab
  const oldTotal = state.disciples.total
  state.disciples.total = derived.maxDisciples + 1
  state.ui.tab = 'disciples'
  await new Promise((r) => setTimeout(r, 50))
  ok('弟子页说明超额旧人口保留并暂停收徒', text().includes('现有弟子超过居所容量') && text().includes('原有弟子与分工保留'))
  state.disciples.total = oldTotal
  state.ui.tab = oldTab
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 50))
}
{
  state.realm = 4
  state.ui.tab = 'realm'
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  ok('境界页标出转世与飞升的门槛', html().includes('化神期起可转世') && html().includes('渡劫期起可飞升'))
  ok('转世与飞升分成两段', html().includes('转世与飞升'))
  ok(
    '门槛未达成时不报「可得」数字（免得误导）',
    html().includes('待修到 化神期 结算') && html().includes('待修到 渡劫期 结算'),
    html().includes('待修到') ? '有占位文案' : '（没找到占位）',
  )
}
// 转世：化神期起可做，点击后与飞升一样清空（连修真/技艺·法宝都不保留）
{
  const savedConfirm = window.confirm
  window.confirm = () => true
  state.realm = 5
  state.ui.tab = 'realm'
  await new Promise((r) => setTimeout(r, 60))
  const btn = () => [...doc.querySelectorAll('.panel .btn')].find((b) => b.textContent.includes('转世'))
  ok('境界页有转世按钮', !!btn())
  ok('未到化神期时转世按钮禁用', btn()?.disabled === true)

  // 造一个「有修真/技艺/法宝、有建筑」的化神期存档，点转世
  state.realm = 6
  state.upgrades.qiOrigin = true
  state.upgrades.qiArt = true
  state.treasureLevels.spiritPearl = 2
  state.buildings.hut = { count: 4, on: true }
  state.resources.qi = 999
  state.karma = 7
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  ok('化神期时转世按钮可用', btn()?.disabled === false)
  btn()?.click()
  await new Promise((r) => setTimeout(r, 80))
  ok('点击转世后境界回凡体', state.realm === 0, String(state.realm))
  ok('点击转世后修真 / 技艺·法宝清空', Object.keys(state.upgrades).length === 0 && Object.keys(state.treasureLevels).length === 0)
  ok('点击转世后建筑与资源清空', Object.keys(state.buildings).length === 0 && (state.resources.qi || 0) === 0)
  ok('点击转世后仙缘增加', state.karma > 7, String(state.karma))
  window.confirm = savedConfirm
  // 道果：飞升才给；转世次数不足时界面要说明「飞升还需先转世」
  state.realm = 10
  state.dao = 0
  state.stats.reincarnations = 0
  state.stats.lifeInsight = 2e6
  state.ui.tab = 'realm'
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  ok('境界页显示道果行', html().includes('道果'))
  ok('界面写明转世不是飞升的必需条件', html().includes('转世是常见路线，但不是必需'))
  const ascBtn = () => [...doc.querySelectorAll('.panel .btn')].find((b) => b.textContent.includes('飞升'))
  ok('渡劫期即可飞升（一次都没转世也行）', ascBtn() && ascBtn().disabled === false)
  const savedConfirm2 = window.confirm
  window.confirm = () => true
  ascBtn().click()
  await new Promise((r) => setTimeout(r, 80))
  ok('点击飞升后道果 +1', state.dao === 1, String(state.dao))
  ok('飞升后自动炼制立即解锁', derived.daoAutomation && derived.autoCraftUnlocked)
  state.ui.tab = 'craft'
  await new Promise((r) => setTimeout(r, 50))
  ok('炼制页显示统筹控制', text().includes('道果统筹') && doc.querySelectorAll('.main .craft-settings select').length === 2)
  const controls = doc.querySelectorAll('.main .craft-settings select')
  controls[0].value = '30'
  controls[0].dispatchEvent(new window.Event('change', { bubbles: true }))
  ok('材料保留设置通过界面保存', state.settings.craftReservePercent === 30)
  ok('重修后配方自动开关可用', !doc.querySelector('.left .craft-row input[type="checkbox"]').disabled)
  const targetInput = doc.querySelector('.main [aria-label="凝气成石库存目标"]')
  ok('道果重修后可设置配方库存目标', !!targetInput)
  targetInput.focus()
  targetInput.value = ''
  targetInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  state.resources.qi += 1
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 40))
  ok('清空目标准备输入时刷新不会填回旧值', targetInput.value === '')
  targetInput.value = '12'
  targetInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  state.resources.qi += 1
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 40))
  ok('目标尚未提交时刷新保留正在输入的数字', targetInput.value === '12')
  ok('编辑草稿不会提前改变自动炼制目标', !state.craftTargets.condenseStone)
  targetInput.dispatchEvent(new window.Event('change', { bubbles: true }))
  targetInput.blur()
  ok('多位数目标提交后保存', state.craftTargets.condenseStone === 12 && JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).craftTargets.condenseStone === 12)
  targetInput.value = '3'
  targetInput.dispatchEvent(new window.Event('change', { bubbles: true }))
  ok('输入库存目标更新并保存', state.craftTargets.condenseStone === 3 && JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).craftTargets.condenseStone === 3)
  targetInput.value = '-1'
  targetInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  targetInput.dispatchEvent(new window.Event('change', { bubbles: true }))
  state.resources.qi += 1
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 40))
  ok('非法目标输入恢复原值', targetInput.value === '3' && state.craftTargets.condenseStone === 3)
  window.confirm = savedConfirm2
  // 后面的存档用例要用到一间茅屋，这里补回来
  state.buildings.hut = { count: 1, on: true }
  state.resources.qi = 100
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 40))
}

// 灵石缺口也要有计时器：它没有产出，但能靠凝气成石现印（见 engine.timeToAfford）
{
  state.ui.tab = 'realm'
  state.realm = 3 // 筑基期 → 金丹期，要灵石 540
  state.resources.stone = 0
  state.resources.qi = 100
  state.buildings.spiritField = { count: 20, on: true }
  state.buildings.quarry = { count: 2, on: true }
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 80))
  const etas = engine.timeToAfford(state, derived, 'stone', 540)
  const realmText = html()
  ok('灵石缺口能算出等待时间（现印路径）', Number.isFinite(etas) && etas > 0, `${etas}`)
  // 破境表的花费列同样只写需求值，倒计时在它自己的悬停提示里
  const realmCostText = doc.querySelector('.main .cost')?.textContent.replace(/\s+/g, ' ').trim() || ''
  ok(
    '破境表的花费列只有需求值',
    realmCostText.includes('感悟') && !realmCostText.includes('/') && !realmCostText.includes('（'),
    realmCostText.slice(0, 70),
  )
  const realmCostCell = doc.querySelector('.main .cost .tip-trigger')
  ok('破境花费单元格是 tooltip 触发器', !!realmCostCell)
  if (realmCostCell) {
    realmCostCell.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise((r) => setTimeout(r, 340))
    const tip = doc.querySelector('.tip')?.textContent.replace(/\s+/g, ' ').trim() || ''
    ok('破境提示沿用宗门排版（价格 / 效果分节）', tip.includes('价格') && tip.includes('效果'), tip.slice(0, 70))
    ok('破境提示里灵石带倒计时', /灵石\s*0 \/ 540（还差 .+）/.test(tip), tip.slice(0, 120))
    // 口粮随境界上涨（DESIGN §5.4）：破境提示要写明「养人也要涨价」，
    // 否则玩家会在破境那一刻突然发现灵气净额变负，却不知道是谁涨的
    ok(
      '破境提示写明每人口粮会涨',
      /每人口粮/.test(tip) && /\/秒 → [\d.]+\/秒（↑\d+%）/.test(tip),
      (tip.match(/每人口粮[^效]*/) || [''])[0].slice(0, 80),
    )
    realmCostCell.dispatchEvent(new window.MouseEvent('mouseleave'))
    await new Promise((r) => setTimeout(r, 60))
  }
}

state.ui.tab = 'settings'
await new Promise((r) => setTimeout(r, 50))
ok('设置面板渲染', html().includes('存档'))

// ---------- 5. 存档 ----------
console.log('\n== 存档 ==')
const saved = saveNow()
ok('写入 localStorage 成功', saved === true && !!window.localStorage.getItem('slack-off-sect.save.v1'))
const exported = actions.exportText()
ok('导出存档文本', typeof exported === 'string' && exported.length > 100)
const hutCount = state.buildings.hut.count
state.buildings.hut.count = 1
actions.importText(exported)
ok('导入后数据被还原', state.buildings.hut.count === hutCount)
const raw = JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1'))
ok('存档结构完整', !!(raw.resources && raw.disciples && raw.stats && raw.buildings))

// ---------- 6. 报错检查 ----------
console.log('\n== 统一资源净额 ==')
derived.rates.qi = 10
derived.expenseSources.qi = [{ label: '弟子口粮', value: -2 }]
derived.autoCraftDrain.qi = [{ label: '自动·凝气成石', value: -12 }]
derived.expense.qi = -2
derived.netQi = 8
await new Promise((r) => setTimeout(r, 50))
ok('顶部净额计入加工耗料', /净额\s*-4\/秒/.test(window.document.querySelector('.stat-line')?.textContent || ''))
ok('顶部出项计入口粮与加工耗料', /出项\s*-14\/秒/.test(window.document.querySelector('.stat-line')?.textContent || ''))
const qiRow = [...window.document.querySelectorAll('.res-table tr')].find(row => row.querySelector('.res-name')?.textContent === '灵气')
ok('资源列表净额与顶部一致', qiRow?.querySelector('.res-rate')?.textContent.trim() === '-4/秒')
qiRow?.dispatchEvent(new window.MouseEvent('mouseenter'))
await new Promise((r) => setTimeout(r, 350))
const flowTip = window.document.querySelector('.tip')
ok('悬停净额与资源列表一致', [...(flowTip?.querySelectorAll('.tip-total') || [])].some(row => /净额\s*-4\/秒/.test(row.textContent)))
ok('展示耗料没有并入实际结算费用', derived.expense.qi === -2 && derived.netQi === 8)
qiRow?.dispatchEvent(new window.MouseEvent('mouseleave'))
engine.recompute(state, derived)
await new Promise((r) => setTimeout(r, 50))

console.log('\n== 凝灵诀状态 ==')
{
  const previous = actions.exportText()
  state.realm = 10
  for (const id of Object.keys(engine.UPGRADE_MAP)) state.upgrades[id] = true
  for (const b of engine.BUILDINGS) state.buildings[b.id] = { count: b.id === 'herbGarden' ? 3 : 1, on: true }
  state.ui.tab = 'sect'
  state.ui.craftFilter = 'all'
  actions.setSetting('quickCrafts', ['condenseStone', 'refinePill', 'sawPlank'])
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 50))
  const buildingNames = [...doc.querySelectorAll('.main .build-btn')].map(el => el.textContent.trim().replace(/\s*\(\d+\)$/, ''))
  ok('全解锁时基础居所在矿业前、药藏在精舍前、因果池最后', buildingNames.indexOf('茅屋') < buildingNames.indexOf('玄铁矿') && buildingNames.indexOf('药藏') < buildingNames.indexOf('精舍') && buildingNames.at(-1) === '因果池')
  doc.querySelector('.left .craft-open')?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('快捷入口能打开完整炼制页', state.ui.tab === 'craft' && !!doc.querySelector('.main .craft-full'))
  ok('所有配方解锁时完整页仍能全部列出', doc.querySelectorAll('.main .craft-row').length === CRAFTS.length)
  ok('左栏只有三个默认快捷且无目标统筹及未解锁列表', doc.querySelectorAll('.left .craft-row').length === 3 && !doc.querySelector('.left .craft-quick input[type=number], .left .craft-quick select, .left .craft-quick details'))
  ok('快捷按钮简化为制作半料全部', [...doc.querySelectorAll('.left [data-craft="condenseStone"] .btn')].map(el => el.textContent.trim()).join(',') === '制作,½料,全部')
  const filterButton = name => [...doc.querySelectorAll('.main .filters button')].find(el => el.textContent.trim() === name)
  filterButton('进阶')?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('进阶筛选只显示进阶配方', [...doc.querySelectorAll('.main .craft-row')].every(el => ADVANCED_CRAFT_OUTPUTS.includes(CRAFTS.find(c => c.id === el.dataset.craft).out)) && doc.querySelectorAll('.main .craft-row').length === ADVANCED_CRAFT_OUTPUTS.length)
  const bulkAuto = () => doc.querySelector('.main input[aria-label="全部自动"]')
  actions.setSetting('autoCraftOn', false)
  bulkAuto().click()
  await new Promise(r => setTimeout(r, 50))
  const enabledSave = JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1'))
  ok('全部自动跨筛选开启所有已解锁配方并保存，总开关仍关闭', CRAFTS.every(c => state.autoCraft[c.id] && enabledSave.autoCraft[c.id]) && !state.settings.autoCraftOn && !enabledSave.settings.autoCraftOn && bulkAuto().checked)
  ok('批量开启同步左栏自动选择', [...doc.querySelectorAll('.left .craft-row .sw input')].every(el => el.checked))
  doc.querySelector('.left [data-craft="condenseStone"] .sw input').click()
  await new Promise(r => setTimeout(r, 50))
  ok('取消单个配方后全部自动呈半选状态', !bulkAuto().checked && bulkAuto().indeterminate)
  bulkAuto().click()
  await new Promise(r => setTimeout(r, 50))
  ok('半选状态勾选后补齐所有配方', CRAFTS.every(c => state.autoCraft[c.id]) && bulkAuto().checked && !bulkAuto().indeterminate)
  actions.setSetting('autoCraftOn', true)
  bulkAuto().click()
  await new Promise(r => setTimeout(r, 50))
  const disabledSave = JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1'))
  ok('取消勾选清除选择并保存，总开关仍开启', Object.values(state.autoCraft).every(on => !on) && Object.values(disabledSave.autoCraft).every(on => !on) && state.settings.autoCraftOn && disabledSave.settings.autoCraftOn && !bulkAuto().checked && !bulkAuto().indeterminate)
  actions.setSetting('autoCraftOn', true)
  filterButton('全部')?.click()
  await new Promise((r) => setTimeout(r, 50))
  doc.querySelector('[aria-label="淬炼法器快捷炼制"]')?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('勾选快捷后左栏立即同步并保存偏好', doc.querySelectorAll('.left .craft-row').length === 4 && JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).settings.quickCrafts.includes('forgeArtifact'))
  const fifthPin = doc.querySelector('[aria-label="淬玄成钢快捷炼制"]')
  fifthPin?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('第五个快捷可选且左栏同步', state.settings.quickCrafts.length === 5 && state.settings.quickCrafts.includes('refineSteel') && fifthPin.checked && doc.querySelectorAll('.left .craft-row').length === 5)
  doc.querySelector('[aria-label="刨木成板快捷炼制"]')?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('取消快捷只移除指定配方', !doc.querySelector('.left [data-craft="sawPlank"]') && !!doc.querySelector('.left [data-craft="refineSteel"]'))
  const auto = doc.querySelector('.main [data-craft="condenseStone"] .sw input')
  auto?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('完整页与快捷自动开关同步', doc.querySelector('.left [data-craft="condenseStone"] .sw input').checked === auto.checked)
  state.resources.qi = 500
  state.resources.stone = derived.max.stone
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 50))
  ok('成品满仓时两处手动制作均禁用', doc.querySelector('.main [data-craft="condenseStone"] .primary').disabled && doc.querySelector('.left [data-craft="condenseStone"] .primary').disabled)
  state.resources.stone = 0
  state.resources.rock = 10
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 50))
  doc.querySelector('.left [data-craft="condenseStone"] .primary')?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('快捷制作结果立即反映到完整页', state.resources.stone > 0 && doc.querySelector('.main [data-craft="condenseStone"] .have').textContent.includes(String(state.resources.stone)))
  for (const craft of CRAFTS) if (!state.settings.quickCrafts.includes(craft.id)) actions.toggleQuickCraft(craft.id)
  const pinnedSave = actions.exportText()
  actions.importText(pinnedSave)
  await new Promise(r => setTimeout(r, 50))
  ok('所有配方可同时固定且读档不截断', doc.querySelectorAll('.left .craft-row').length === CRAFTS.length && state.settings.quickCrafts.length === CRAFTS.length)
  actions.importText(previous)
  await new Promise((r) => setTimeout(r, 50))
}
console.log('\n== 长 tooltip 边界与滚动 ==')
{
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect
  const originalWidth = window.innerWidth
  const originalHeight = window.innerHeight
  let tipContentHeight = 480
  window.innerWidth = 800
  window.innerHeight = 600
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains('tip')) return { width: Math.min(350, parseFloat(this.style.maxWidth)), height: Math.min(tipContentHeight, parseFloat(this.style.maxHeight)) }
    return { top: window.innerHeight - 30, left: window.innerWidth - 60, right: window.innerWidth - 20, bottom: window.innerHeight - 10 }
  }
  const trigger = doc.querySelector('.left .res-table .tip-trigger')
  trigger.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 180))
  const tip = doc.querySelector('.tip')
  ok('长提示按实际高度上移且在右边界翻转', tip?.style.top === '112px' && tip.style.left === '382px' && tip.style.visibility === 'visible')
  visualViewport.widthOverride = 500
  visualViewport.heightOverride = 340
  visualViewport.offsetLeft = 10
  visualViewport.offsetTop = 20
  visualViewport.dispatchEvent(new window.Event('resize'))
  ok('可见视口小于页面时同步限制提示尺寸及底边', tip.style.maxHeight === '324px' && tip.style.top === '28px' && tip.style.left === '152px')
  tipContentHeight = 150
  visualViewport.dispatchEvent(new window.Event('resize'))
  ok('较短提示贴住可见视口底部安全距离', tip.style.top === '202px')
  tipContentHeight = 900
  visualViewport.heightOverride = 260
  visualViewport.offsetTop = 40
  visualViewport.dispatchEvent(new window.Event('scroll'))
  ok('可见视口平移或提示变长后仍保留底部安全距离', tip.style.maxHeight === '244px' && tip.style.top === '48px')
  visualViewport.widthOverride = undefined
  visualViewport.heightOverride = undefined
  visualViewport.offsetLeft = 0
  visualViewport.offsetTop = 0
  window.innerWidth = 240
  window.innerHeight = 300
  window.dispatchEvent(new window.Event('resize'))
  await new Promise(r => setTimeout(r, 20))
  ok('缩小视口时提示重新限制到安全边距', tip?.style.top === '8px' && tip.style.left === '8px')
  Object.defineProperty(tip, 'scrollHeight', { configurable: true, value: 900 })
  Object.defineProperty(tip, 'clientHeight', { configurable: true, value: 284 })
  const wheel = new window.WheelEvent('wheel', { deltaY: 100, cancelable: true })
  trigger.dispatchEvent(wheel)
  tip.dispatchEvent(new window.Event('scroll'))
  await new Promise(r => setTimeout(r, 20))
  ok('触发器滚轮可阅读长提示且提示自身滚动不关闭', wheel.defaultPrevented && tip.scrollTop === 100 && doc.querySelector('.tip') === tip)
  trigger.dispatchEvent(new window.MouseEvent('mouseleave'))
  await new Promise(r => setTimeout(r, 20))
  ok('离开触发器仍关闭提示', !doc.querySelector('.tip'))
  window.HTMLElement.prototype.getBoundingClientRect = originalRect
  window.innerWidth = originalWidth
  window.innerHeight = originalHeight
}

const beforeCondense = actions.exportText()
state.ui.tab = 'craft'
state.upgrades.condenseArt = true
state.upgrades.intuition = false
state.dao = 0
state.settings.autoCraftOn = false
state.resources.stone = 0
engine.recompute(state, derived)
await new Promise((r) => setTimeout(r, 50))
ok('凝灵诀在常驻自动解锁前提供库存目标', !derived.autoCraftUnlocked && !!window.document.querySelector('input[aria-label="凝气成石库存目标"]'))
ok('自动炼制未解锁时全部自动复选框禁用', doc.querySelector('.main input[aria-label="全部自动"]')?.disabled)
ok('凝灵诀展示总开关暂停状态', text().includes('凝灵诀 · 总开关已暂停'))
state.settings.autoCraftOn = true
actions.setCraftTarget('condenseStone', 2)
state.resources.stone = 2
engine.recompute(state, derived)
await new Promise((r) => setTimeout(r, 50))
ok('凝灵诀展示库存目标已达状态', text().includes('凝灵诀 · 目标已达'))
state.resources.stone = 0
state.resources.rock = 0
engine.recompute(state, derived)
await new Promise(r => setTimeout(r, 50))
ok('凝灵诀向玩家显示缺石材暂停', text().includes('凝灵诀 · 缺石材暂停'))
actions.importText(beforeCondense)
await new Promise((r) => setTimeout(r, 50))

console.log('\n== 事件选择 ==')
state.resources.wood = 100
engine.recompute(state, derived)
engine.fireEvent(state, derived, { id: 'ancientCave', type: 'choice', text: '发现古洞' })
await new Promise((r) => setTimeout(r, 50))
ok('未决选择正常渲染', !!window.document.querySelector('.choice'))
ok('选择展示实际代价', window.document.querySelector('.choice-preview')?.textContent.includes('灵木 −12'))
window.document.querySelector('.choice-row button')?.click()
await new Promise((r) => setTimeout(r, 50))
ok('点击选择清除待决并扣除代价', !state.pendingChoice && state.resources.wood === 88)
ok('选择结算立即保存', JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).pendingChoice === null)
ok('选择结算后按钮消失', !window.document.querySelector('.choice'))
state.resources.herb = 0
engine.fireEvent(state, derived, { id: 'caravan', type: 'choice', text: '商队到访' })
await new Promise((r) => setTimeout(r, 50))
ok('不足用料的交易选项禁用且说明所需材料', window.document.querySelector('.choice-row button')?.disabled && window.document.querySelector('.choice-preview')?.textContent.includes('材料不足'))
const decline = [...window.document.querySelectorAll('.choice-row button')].find(b => b.textContent === '暂不介入')
ok('材料不足时仍可不介入', !!decline && !decline.disabled)
decline?.click()
await new Promise((r) => setTimeout(r, 50))
ok('不介入按钮可正常结束事件', !state.pendingChoice && !window.document.querySelector('.choice'))

const beforeThreat = JSON.stringify(state)
state.realm = 4
state.affairs = { beastPeaceUntil: 0, beastCooldownUntil: 0 }
state.resources.arrayBase = 0
state.resources.talisman = 0
state.resources.herb = 100
engine.recompute(state, derived)
engine.fireEvent(state, derived, EVENT_MAP.beastThreat)
await new Promise((r) => setTimeout(r, 50))
const threatButtons = [...window.document.querySelectorAll('.choice-row button')]
ok('妖兽事务展示四种应对且不能免费取消', threatButtons.length === 4 && !threatButtons.some(b => b.textContent === '暂不介入'))
ok('妖兽事务展示期限与默认方案', text().includes('到期依现有阵法防守'))
ok('待决事务显示宗门等级', window.document.querySelector('.choice-head')?.textContent.includes('二级·金丹至化神'))
ok('缺料时加固禁用，默认防守可操作', threatButtons[0]?.disabled && !threatButtons[3]?.disabled)
state.resources.arrayBase = 1
state.resources.talisman = 2
await new Promise((r) => setTimeout(r, 50))
window.document.querySelector('.choice-row button')?.click()
await new Promise((r) => setTimeout(r, 50))
ok('点击加固实际扣料并清除威胁', !state.pendingChoice && state.resources.arrayBase === 0 && state.resources.talisman === 0)
ok('处理后展示药圃安宁且立即存档', text().includes('药圃安宁') && JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).affairs.beastPeaceUntil > Date.now())
actions.importText(beforeThreat)
await new Promise((r) => setTimeout(r, 50))

console.log('\n== 凝晶工艺与专业收益界面 ==')
{
  const previous = actions.exportText()
  actions.importText(JSON.stringify({
    realm: 4,
    resources: { insight: 2000, qi: 3000, spiritLiquid: 10, talisman: 100, ore: 500, wood: 500, plank: 20 },
    upgrades: { qiOrigin: true, qiGazing: true, condenseArt: true, liquidArt: true, talismanArt: true },
    buildings: { talismanHall: { count: 1, on: true }, workshop: { count: 1, on: true } },
  }))
  actions.research('crystalTheory')
  state.ui.tab = 'craft'
  state.ui.craftFilter = 'all'
  await new Promise(r => setTimeout(r, 50))
  ok('研究原理后配方仍锁定并说明所需工艺', !doc.querySelector('.main [data-craft="condenseCrystal"]') && doc.querySelector('.main details')?.textContent.includes('凝晶工艺'))
  actions.research('crystalCraft')
  await new Promise(r => setTimeout(r, 50))
  const row = doc.querySelector('.main [data-craft="condenseCrystal"]')
  ok('掌握工艺后出现灵晶配方及专业加成', !!row && /灵液\s*3/.test(row.textContent) && /符箓\s*10/.test(row.textContent) && /专业加成\s*\+5%/.test(row.textContent))
  ok('配方展示通用加成与专业加成合计产出', /灵晶\s*1\.11/.test(row?.querySelector('.craft-cost')?.textContent || ''))
  row?.querySelector('.btn.primary')?.click()
  await new Promise(r => setTimeout(r, 50))
  ok('灵晶制作按钮实际扣料且整数入库', state.resources.crystal === 1 && state.resources.talisman === 84 && state.resources.spiritLiquid === 7 && Math.abs(state.resources.qi - 3000) < 1e-6)
  row?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 340))
  ok('配方悬停明确专业收益及小数结转', doc.querySelector('.tip')?.textContent.includes('专业制作加成') && doc.querySelector('.tip')?.textContent.includes('小数累积'))
  row?.dispatchEvent(new window.MouseEvent('mouseleave'))
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 50))
}

console.log('\n== 灵能枢实时供能与早期空间技艺移除 ==')
{
  const previous = actions.exportText()
  actions.importText(JSON.stringify({
    resources: { qiParticle: 0, qiEnergy: 0 },
    upgrades: { energyCore: true },
    ui: { tab: 'skills', skillFilter: 'all' },
  }))
  await new Promise(r => setTimeout(r, 50))
  const coreRow = () => [...doc.querySelectorAll('.box-body > table.grid tr')].find(row => row.textContent.includes('灵能枢') && row.textContent.includes('Lv.0'))
  ok('无供能的灵能枢显示停效与实际零加成', coreRow()?.textContent.includes('缺灵能停效') && !coreRow()?.querySelector('.eff')?.textContent.includes('+50%'))
  ok('技艺页不再出现储物袋与纳物诀', !doc.querySelector('.main')?.textContent.includes('储物袋') && !doc.querySelector('.main')?.textContent.includes('纳物诀'))
  state.resources.qiEnergy = 10
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  ok('补充灵能后界面恢复满供效果', coreRow()?.textContent.includes('供能 100%') && coreRow()?.querySelector('.eff')?.textContent.includes('+50%'))
  coreRow()?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 340))
  ok('法宝提示显示持续耗能和缺供规则', doc.querySelector('.tip')?.textContent.includes('满供消耗') && doc.querySelector('.tip')?.textContent.includes('供能不足按比例运行'))
  coreRow()?.dispatchEvent(new window.MouseEvent('mouseleave'))
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 50))
}

console.warn = origWarn
console.error = origError

console.log('\n== 运行时报错 ==')
const templateWarnings = warnings.filter(
  (w) => w.includes('was accessed during render') || w.includes('is not defined'),
)
for (const w of warnings.slice(0, 10)) console.log('  ! ' + w.slice(0, 200))
for (const e of consoleErrors.slice(0, 10)) console.log('  ! ' + e.slice(0, 200))
for (const e of runtimeErrors.slice(0, 10)) console.log('  ! ' + e.slice(0, 200))
ok('没有模板 / 响应式警告', templateWarnings.length === 0, templateWarnings[0]?.slice(0, 160) || '')
ok('控制台没有 error', consoleErrors.length === 0, consoleErrors[0]?.slice(0, 160) || '')
ok('没有未捕获异常', runtimeErrors.length === 0, runtimeErrors[0]?.slice(0, 160) || '')

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`)
if (failed) {
  console.log('失败清单：')
  for (const p of problems) console.log('  - ' + p)
  process.exit(1)
}
console.log('DOM 端到端检查全部通过 ✅')
process.exit(0)
