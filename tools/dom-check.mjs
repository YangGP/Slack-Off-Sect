/**
 * 真·DOM 端到端验证：用 jsdom 造浏览器环境，加载**客户端 bundle**，
 * 把 App 真正挂载起来并让主循环跑几秒，然后模拟玩家点击。
 *
 * 用法：npm run check:dom（先构建客户端 bundle，再运行交互检查）
 */
import { JSDOM } from 'jsdom'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { JOBS } from '../src/data/jobs.js'
import { CHANGELOG, CURRENT_VERSION } from '../src/data/changelog.js'
import { CRAFTS, ADVANCED_CRAFT_OUTPUTS } from '../src/data/crafts.js'
import { EVENT_MAP } from '../src/data/events.js'
import { CALENDAR, DAYS_PER_YEAR } from '../src/data/calendar.js'

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
  'FileReader',
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
const { state, derived, ui, actions, startLoop, stopLoop, saveNow, engine } = mod

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

async function ruleText(label) {
  const trigger = window.document.querySelector(`[aria-label="${label}说明"]`)?.closest('.tip-trigger')
  trigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 180))
  const result = [...window.document.querySelectorAll('[role="tooltip"]')]
    .find(el => el.querySelector('.tip-title')?.textContent === label)?.textContent || ''
  trigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
  await new Promise(r => setTimeout(r, 30))
  return result
}

function tipSectionRows(tip, title) {
  const section = [...(tip?.querySelectorAll('.tip-section') || [])].find(el => el.textContent.trim() === title)
  const rows = []
  for (let el = section?.nextElementSibling; el && !el.classList.contains('tip-section'); el = el.nextElementSibling) {
    if (el.classList.contains('tip-row')) rows.push(el)
  }
  return rows
}

ok('标题渲染出来了', text().includes('摸鱼宗门'))
{
  const notice = window.document.querySelector('.update-notice')
  ok('页面顶部更新提示精简为版本入口', notice?.textContent.includes(CURRENT_VERSION) && notice.textContent.includes('更新说明') && !notice.textContent.includes('建议旧档'))
  const label = notice?.querySelector('.tip-label')
  label?.focus()
  await new Promise(r => setTimeout(r, 180))
  ok('说明标题支持键盘聚焦，完整建议只出现在提示内', window.document.querySelector('[role="tooltip"]')?.textContent.includes('建议旧档达到转世条件后转世') && !text().includes('建议旧档'))
  const ruleTip = window.document.querySelector('[role="tooltip"]')
  ok('规则提示使用统一正文与标题外壳', ruleTip?.querySelectorAll('.tip-body').length === 1 && ruleTip.querySelectorAll('.tip-title').length === 1)
  ok('提示触发器关联可见的提示内容', label?.closest('.tip-trigger').getAttribute('aria-describedby') === ruleTip?.id && !!ruleTip?.id)
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await new Promise(r => setTimeout(r, 30))
  ok('Escape关闭说明提示', !window.document.querySelector('[role="tooltip"]'))
  label?.blur()
  const previousTab = state.ui.tab
  notice?.querySelector('button')?.click()
  await new Promise(r => setTimeout(r, 50))
  ok('更新提示入口打开境界页', state.ui.tab === 'realm' && !!window.document.querySelector('.main .realm-track'))
  state.ui.tab = previousTab
  await new Promise(r => setTimeout(r, 50))
}
ok('资源栏渲染出来了', text().includes('灵气') && text().includes('灵木'))
ok('顶栏状态行带弟子与灵气账目', /弟子 \d+\/\d+/.test(text()) && text().includes('净额'))
ok('顶栏宜居度使用点数而非士气百分比', /宜居度\s*-?\d+(?![\d.%])/.test(window.document.querySelector('.stat-line')?.textContent || '') && !window.document.querySelector('.stat-line')?.textContent.includes('士气'))
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
state.resources.qi = 500
state.resources.wood = 500
state.buildings.hut = { count: 5, on: true }
state.buildings.quarry = { count: 1, on: true }
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
    'title-line|update-notice|stat-line|status-line|tabs|cols',
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
  '网格首个按钮保留吸气',
  [...doc.querySelectorAll('.panel .build-grid .build-btn')]
    .slice(0, 1)
    .map((b) => b.textContent.trim())
    .join('/') === '吸取天地灵气',
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
  ok('宗门页移除拾石和凝石按钮', ![...doc.querySelectorAll('.panel .build-btn')].some(b => /拾取石材|凝气成石|点石成灵/.test(b.textContent)))
}
const affordabilityQi = state.resources.qi
state.resources.qi = 0
await new Promise(r => setTimeout(r, 60))
ok(
  '买不起的建筑按钮置灰',
  doc.querySelectorAll('.panel .build-btn.poor').length > 0,
)
ok(
  '买得起的建筑按钮正常显示',
  doc.querySelectorAll('.panel .build-btn:not(.poor)').length > 0,
)
state.resources.qi = affordabilityQi

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

  const sellButton = btn('聚灵阵', '售')
  sellButton.focus()
  await new Promise(r => setTimeout(r, 180))
  const sellTip = doc.querySelector('[role="tooltip"]')
  ok('出售按钮聚焦时显示统一操作提示', sellTip?.querySelector('.tip-title')?.textContent === '出售建筑' && sellTip.querySelector('.tip-desc')?.textContent.includes('返还一半材料') && !sellButton.hasAttribute('title'))
  sellButton.blur()
  await new Promise(r => setTimeout(r, 30))

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
  ok('详细建筑提示与规则提示共用单一外壳', doc.querySelector('.tip')?.querySelectorAll('.tip-body').length === 1 && doc.querySelector('.tip')?.querySelectorAll('.tip-title').length === 1)
  tipTrigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
  await new Promise((r) => setTimeout(r, 60))

  // 提示里「一种资源一行」：库房这种多资源建筑不许挤成一长串
  {
    state.buildings.lumberYard = { count: 3, on: true }
    state.buildings.warehouse = { count: 2, on: true } // 已建 2 座 → 提示里应出现「合计」
    state.resources.wood = 9999
    state.resources.stone = 9999
    state.resources.ore = 9999
    state.resources.herb = 9999
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
    ok('库房不再给灵气 / 灵机 / 丹药 / 符箓 / 香火 / 法器 加上限', !/灵气 上限|灵机 上限|丹药 上限|符箓 上限|香火 上限|法器 上限/.test(tip.textContent), tip.textContent.replace(/\s+/g, ' ').slice(-120))
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
   const coreNames = ['吸取天地灵气', '催生灵木']
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
  state.resources.wood = 0
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
    i.querySelector('.build-btn.poor') && !['吸取天地灵气', '拾取石材', '点石成灵'].includes(i.querySelector('.build-btn').textContent.trim()),
  )
  const btnTipTrigger = poorItem?.querySelector('.tip-trigger')
  btnTipTrigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise((r) => setTimeout(r, 300))
  const btip = doc.querySelector('.tip')
  const btxt = btip?.textContent || ''
  ok('建筑悬停弹出提示', !!btip)
  ok('提示里有「价格」与「效果」分节', btxt.includes('价格') && btxt.includes('效果'))
  ok('建筑提示移除最多可建', !btxt.includes('最多可建'))
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
ok('标签页包含独立炼制页且保持纯文字形式', doc.querySelectorAll('.tabs .tab').length === 9 && [...doc.querySelectorAll('.tabs .tab')].some(el => el.textContent.trim() === '炼制'))
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
ok('弟子管理默认隐藏，只显示展开入口', !doc.querySelector('#disciple-management') && !doc.querySelector('.disciple-list') && doc.querySelector('[aria-controls="disciple-management"]')?.getAttribute('aria-expanded') === 'false')
{
  const trigger = doc.querySelector('.main [data-habitability]')?.closest('.tip-trigger')
  trigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 180))
  const tip = doc.querySelector('[role="tooltip"]')?.textContent || ''
  ok('宜居设施建议移入提示，弟子页收起长段说明', !text().includes('清风小院和膳养堂') && tip.includes('弟子数+40～60') && tip.includes('5%～10%') && tip.includes('清风小院和膳养堂'))
  trigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
}

// 注意：顶部通栏里也有一张 table.grid，所以这里要限定到中列（.main）里找职位表
const jobRows = doc.querySelectorAll('.main table.job-grid tbody tr').length
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
await new Promise(r => setTimeout(r, 50))
{
  const jobInput = firstJobRow.querySelector('input[type="number"]')
  jobInput.focus()
  jobInput.stepUp()
  jobInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  ok('人数输入框原生增加按钮立即分配，刷新不回退', state.disciples.jobs.farmer === 1 && jobInput.value === '1' && document.activeElement === jobInput)
  jobInput.stepDown()
  jobInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  await new Promise(r => setTimeout(r, 50))
  ok('人数输入框原生减少按钮立即释放弟子', state.disciples.jobs.farmer === 0 && jobInput.value === '0')
  jobInput.value = ''
  jobInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  ok('清空编辑草稿时实时刷新不补回数字', jobInput.value === '' && state.disciples.jobs.farmer === 0)
  jobInput.value = '999'
  jobInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  jobInput.dispatchEvent(new window.Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 50))
  ok('输入过大人数按可用弟子限制并归一化显示', state.disciples.jobs.farmer === 6 && jobInput.value === '6' && engine.idleDisciples(state) === 0)
  jobInput.value = '2.9'
  jobInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  jobInput.blur()
  await new Promise(r => setTimeout(r, 50))
  ok('结束编辑时人数按整数显示', state.disciples.jobs.farmer === 2 && jobInput.value === '2')
  actions.setJob('farmer', 0)
}
actions.shiftJob('farmer', 2)
ok('分配职位生效', state.disciples.jobs.farmer === 2, `${state.disciples.jobs.farmer}`)
{
  const savedDisciples = JSON.parse(JSON.stringify(state.disciples))
  const savedRealm = state.realm
  const savedResources = { ...state.resources }
  const savedBuildings = JSON.parse(JSON.stringify(state.buildings))
  const originalRandom = Math.random
  try {
    state.realm = 1
    state.buildings.hut = { count: 20, on: true }
    state.disciples.total = 35
    for (const job of JOBS) state.disciples.jobs[job.id] = 0
    engine.recompute(state, derived)
    for (const member of state.disciples.members) {
      member.realm = 0
      member.cultivation = 3600
      member.cooldown = 0
      member.spiritualRoot = 'triple'
    }
    state.resources.qi = 1000
    state.resources.insight = 100
    engine.recompute(state, derived)
    await new Promise(r => setTimeout(r, 40))
    const managementToggle = doc.querySelector('[aria-controls="disciple-management"]')
    managementToggle.click()
    await new Promise(r => setTimeout(r, 30))
    ok('点击入口展开管理并隐藏底层职位操作', !!doc.querySelector('#disciple-management') && managementToggle.getAttribute('aria-expanded') === 'true' && doc.querySelector('.assignment-surface').style.display === 'none' && doc.activeElement === doc.querySelector('#disciple-management'))
    ok('展开管理保留30人分页', doc.querySelectorAll('.disciple-list tbody tr').length === 30 && text().includes('每页30人'))
    for (const control of doc.querySelectorAll('#disciple-management select')) {
      const label = control.getAttribute('aria-label')
      const originalValue = control.value
      const mutations = []
      const observer = new window.MutationObserver(records => mutations.push(...records))
      observer.observe(control, { attributes: true, childList: true, characterData: true, subtree: true })
      control.dispatchEvent(new window.Event('pointerdown', { bubbles: true }))
      control.focus()
      control.value = control.options[control.options.length - 1].value
      const editingValue = control.value
      // 实时刷新修为、库存和派生岗位集合，尚未发 change 的选择应保留。
      state.disciples.members[0].cooldown = 1
      state.resources.qi -= 1
      engine.recompute(state, derived)
      await new Promise(r => setTimeout(r, 50))
      ok(`${label}操作期间刷新保留节点、焦点和选择`, control === doc.querySelector(`[aria-label="${label}"]`) && doc.activeElement === control && control.value === editingValue)
      ok(`${label}选项不随实时数据反复更新`, mutations.length === 0)
      observer.disconnect()
      control.value = originalValue
      control.blur()
      state.disciples.members[0].cooldown = 0
    }
    engine.recompute(state, derived)
    await new Promise(r => setTimeout(r, 30))
    const clickNamed = name => [...doc.querySelectorAll('.main button')].find(button => button.textContent.trim() === name)?.click()
    clickNamed('选择本分类')
    await new Promise(r => setTimeout(r, 30))
    ok('选择本分类包括下一页弟子', text().includes('已选 35 人'))
    doc.querySelector('#disciple-management').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    ok('Esc收起管理并恢复职位分配和入口焦点', !doc.querySelector('#disciple-management') && doc.querySelector('.assignment-surface').style.display !== 'none' && doc.activeElement === managementToggle)
    managementToggle.click()
    await new Promise(r => setTimeout(r, 30))
    ok('同页重新展开保留跨页选择', text().includes('已选 35 人'))
    const roleSelect = doc.querySelector('[aria-label="所选弟子的岗位"]')
    roleSelect.value = 'woodcutter'
    roleSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
    clickNamed('分配所选弟子')
    await new Promise(r => setTimeout(r, 30))
    ok('管理栏批量分工同步原职位表', state.disciples.jobs.woodcutter === 35 && state.disciples.members.every(member => member.roleId === 'woodcutter'))
    Math.random = () => 0
    clickNamed('所选弟子突破')
    await new Promise(r => setTimeout(r, 30))
    ok('管理栏批量突破覆盖跨页人选', state.disciples.members.every(member => member.realm === 1 && member.cultivation < 1))
    const filter = doc.querySelector('[aria-label="弟子境界筛选"]')
    filter.value = '0'
    filter.dispatchEvent(new window.Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    ok('境界分类显示空状态并清除选择', text().includes('此分类暂无弟子') && text().includes('已选 0 人'))
    filter.value = '1'
    filter.dispatchEvent(new window.Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    ok('境界筛选只显示对应弟子', doc.querySelectorAll('.disciple-list tbody tr').length === 30 && [...doc.querySelectorAll('.disciple-list tbody tr')].every(row => row.textContent.includes('引气入体')))
    const fast = state.disciples.members[0], slow = state.disciples.members[1]
    fast.spiritualRoot = 'heaven'
    fast.cultivation = 100
    slow.spiritualRoot = 'five'
    slow.cultivation = 5400
    const rootSelect = doc.querySelector('[aria-label="弟子灵根筛选"]')
    rootSelect.value = 'heaven'
    rootSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    const discipleRow = doc.querySelector('.disciple-list tbody tr')
    ok('灵根筛选与境界筛选组合，列表收起修炼明细', doc.querySelectorAll('.disciple-list tbody tr').length === 1 && discipleRow.textContent.includes('天灵根') && !discipleRow.textContent.includes('修为/秒') && !discipleRow.textContent.includes('口粮'))
    discipleRow.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise(r => setTimeout(r, 180))
    const memberDetails = () => [...doc.querySelectorAll('[role="tooltip"]')].find(el => el.querySelector('.tip-title')?.textContent.includes(`#${fast.id}`))
    ok('悬停弟子行可查看修炼、岗位与突破明细', memberDetails()?.textContent.includes('2修为/秒') && memberDetails()?.textContent.includes('本境修为') && memberDetails()?.textContent.includes('个人岗位系数') && memberDetails()?.textContent.includes('口粮') && memberDetails()?.textContent.includes('目标 / 成功率') && memberDetails()?.textContent.includes('花费：'))
    fast.cultivation = 200
    await new Promise(r => setTimeout(r, 30))
    ok('弟子明细跟随实际修为更新', memberDetails()?.textContent.includes('200 /'))
    doc.querySelector('.disciple-list tbody tr')?.dispatchEvent(new window.MouseEvent('mouseleave'))
    await new Promise(r => setTimeout(r, 30))
    const detailName = doc.querySelector('.disciple-name')
    detailName.focus()
    await new Promise(r => setTimeout(r, 180))
    ok('弟子姓名支持键盘聚焦查看明细', !!memberDetails())
    detailName.blur()
    clickNamed('选择本分类')
    await new Promise(r => setTimeout(r, 30))
    ok('选择本分类只包含当前灵根筛选人选', text().includes('已选 1 人'))
    fast.talents = [{ id: 'cultivation_xuan', level: 1 }, { id: 'job_woodcutter_huang', level: 1 }]
    engine.recompute(state, derived)
    await new Promise(r => setTimeout(r, 30))
    const talentSelect = doc.querySelector('[aria-label="弟子天赋筛选"]')
    talentSelect.value = 'cultivation'
    talentSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    ok('天赋筛选与境界灵根组合并清除选择', doc.querySelectorAll('.disciple-list tbody tr').length === 1 && text().includes('已选 0 人') && doc.querySelector('.disciple-list tbody tr').textContent.includes('2条天赋'))
    doc.querySelector('.disciple-list tbody tr').dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise(r => setTimeout(r, 180))
    ok('弟子天赋详情显示固定词条、品级等级和真实修炼速度', memberDetails()?.textContent.includes('修炼奇才') && memberDetails()?.textContent.includes('识木') && memberDetails()?.textContent.includes('玄级 · Lv.1') && memberDetails()?.textContent.includes('2.4修为/秒'))
    doc.querySelector('.disciple-list tbody tr').dispatchEvent(new window.MouseEvent('mouseleave'))
    talentSelect.value = 'job:miner'
    talentSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    ok('岗位专长筛选不将樵夫天赋误归为矿工', !doc.querySelectorAll('.disciple-list tbody tr').length)
    talentSelect.value = 'all'
    talentSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
    fast.talents = []
    engine.recompute(state, derived)
    rootSelect.value = 'all'
    rootSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    ok('切换灵根清除隐藏人选', text().includes('已选 0 人'))
    const sortSelect = doc.querySelector('[aria-label="弟子排序"]')
    sortSelect.value = 'progress'
    sortSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    ok('管理栏按本境进度排序', doc.querySelector('.disciple-list tbody input[type="checkbox"]').value === String(slow.id))
    sortSelect.value = 'rate'
    sortSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    ok('管理栏按灵根修炼速度排序', doc.querySelector('.disciple-list tbody input[type="checkbox"]').value === String(fast.id))
    sortSelect.value = 'arrival'
    sortSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
    filter.value = 'all'
    filter.dispatchEvent(new window.Event('change', { bubbles: true }))
  } finally {
    Math.random = originalRandom
    state.disciples = savedDisciples
    state.realm = savedRealm
    state.resources = savedResources
    state.buildings = savedBuildings
    engine.recompute(state, derived)
    const managementToggle = doc.querySelector('[aria-controls="disciple-management"]')
    if (managementToggle?.getAttribute('aria-expanded') === 'true') managementToggle.click()
  }
  await new Promise(r => setTimeout(r, 30))
}
console.log('\n== 弟子逐出师门 ==')
{
  const previous = actions.exportText()
  const originalConfirm = window.confirm
  const year = CALENDAR.DAY_SECONDS * DAYS_PER_YEAR
  actions.importText(JSON.stringify({
    disciples: { total: 3, jobs: { farmer: 1, woodcutter: 1 }, members: [
      { id: 11, name: '甲弟子', roleId: 'farmer', spiritualRoot: 'triple', residenceSeconds: 0, totalQiConsumed: 10.1 },
      { id: 12, name: '乙弟子', roleId: 'woodcutter', spiritualRoot: 'heaven', residenceSeconds: year, totalQiConsumed: 20 },
      { id: 13, name: '丙弟子', roleId: null, spiritualRoot: 'five', residenceSeconds: year * 2, totalQiConsumed: 30 },
    ] },
    resources: { qi: 200 },
    ui: { tab: 'disciples' },
  }))
  try {
    await new Promise(r => setTimeout(r, 50))
    doc.querySelector('[aria-controls="disciple-management"]')?.click()
    await new Promise(r => setTimeout(r, 30))
    const single = () => doc.querySelector('[aria-label="逐出弟子11"]')
    const batchButton = () => [...doc.querySelectorAll('.management-batch button')].find(el => el.textContent.startsWith('逐出所选'))
    ok('弟子管理提供单人逐出与默认禁用的批量逐出', !!single() && batchButton()?.disabled && single()?.closest('td') === doc.querySelector('.disciple-list tbody tr')?.cells[5])
    let prompt = ''
    window.confirm = message => { prompt = message; return false }
    single()?.click()
    await new Promise(r => setTimeout(r, 30))
    ok('单人逐出先确认姓名和精确费用，取消无损', prompt.includes('甲弟子') && prompt.includes('灵气 11') && prompt.includes('无法撤回') && state.disciples.total === 3 && state.resources.qi === 200)
    window.confirm = () => true
    single()?.click()
    await new Promise(r => setTimeout(r, 30))
    const saved = JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1'))
    ok('单人逐出扣费并立即保存，人口岗位和列表同步', state.disciples.total === 2 && state.resources.qi === 189 && state.disciples.jobs.farmer === 0 && !single() && saved.disciples.members.every(member => member.id !== 11))
    const root = doc.querySelector('[aria-label="弟子灵根筛选"]')
    root.value = 'heaven'
    root.dispatchEvent(new window.Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    const detail = doc.querySelector('.disciple-name')
    detail?.focus()
    await new Promise(r => setTimeout(r, 180))
    ok('弟子明细显示已满年数、累计消耗与逐出费用', doc.querySelector('.tip')?.textContent.includes('已满 1 年') && doc.querySelector('.tip')?.textContent.includes('累计灵气消耗') && doc.querySelector('.tip')?.textContent.includes('逐出费用'))
    detail?.blur()
    ;[...doc.querySelectorAll('.management-selection button')].find(el => el.textContent === '选择本分类')?.click()
    await new Promise(r => setTimeout(r, 30))
    ok('批量逐出费用只包含筛选内所选弟子', batchButton()?.textContent.includes('灵气 40') && text().includes('已选 1 人'))
    state.resources.qi = 39
    await new Promise(r => setTimeout(r, 30))
    let asked = false
    window.confirm = () => { asked = true; return true }
    actions.dismissDisciples([12])
    ok('灵气不足禁用逐出按钮并拒绝执行，不打开确认', batchButton()?.disabled && doc.querySelector('[aria-label="逐出弟子12"]')?.disabled && !asked && state.disciples.total === 2 && state.resources.qi === 39)
    state.resources.qi = 200
    await new Promise(r => setTimeout(r, 30))
    batchButton()?.click()
    await new Promise(r => setTimeout(r, 30))
    ok('确认批量逐出只移除所选并清除选择，其他灵根保留', state.disciples.total === 1 && state.disciples.members[0].id === 13 && state.resources.qi === 160 && state.disciples.jobs.woodcutter === 0 && text().includes('已选 0 人') && text().includes('此分类暂无弟子'))
  } finally {
    window.confirm = originalConfirm
    actions.importText(previous)
    await new Promise(r => setTimeout(r, 30))
    const toggle = doc.querySelector('[aria-controls="disciple-management"]')
    if (toggle?.getAttribute('aria-expanded') === 'true') toggle.click()
    await new Promise(r => setTimeout(r, 30))
  }
}
{
  const previousPopulation = state.disciples.total
  const previousPenalty = state.habitabilityPenalty
  state.habitabilityPenalty = -derived.habitabilityBonus
  state.disciples.total = 41
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  const farmerSource = derived.sources.qi.find(row => row.kind === 'job' && row.id === 'farmer')
  const cells = doc.querySelector('.main table.grid tbody tr')?.querySelectorAll('td')
  ok('岗位表显示减半后的实际单人产出', derived.discipleMult === 0.5 && Math.abs(parseFloat(cells?.[2].textContent.trim()) - farmerSource.value / 2) < 0.005)
  ok('弟子页保留当前岗位倍率并收起阈值说明', text().includes('弟子岗位倍率 ×0.50') && !text().includes('每60秒'))
  doc.querySelector('[aria-controls="disciple-management"]').click()
  await new Promise(r => setTimeout(r, 30))
  ok('弟子成长规则默认隐藏且可悬停查看', !text().includes('损失20%本境修为') && (await ruleText('弟子管理')).includes('损失20%本境修为并调息60秒'))
  doc.querySelector('[aria-controls="disciple-management"]').click()
  await new Promise(r => setTimeout(r, 30))
  const habitabilityTrigger = doc.querySelector('[data-habitability]')?.closest('.tip-trigger')
  habitabilityTrigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 180))
  const habitabilityTip = () => [...doc.querySelectorAll('.tip')].find(el => el.textContent.includes('宜居度 · 当前效果'))
  ok('宜居度悬停展示当前减产与来源', habitabilityTip()?.textContent.includes('拥挤减产') &&
    habitabilityTip()?.textContent.includes('弟子岗位综合倍率') && habitabilityTip()?.textContent.includes('×0.50') && habitabilityTip()?.textContent.includes('宜居度来源'))
  ok('宜居度阈值移入提示', habitabilityTip()?.textContent.includes('每60秒') && habitabilityTip()?.textContent.includes('岗位产出减半'))
  state.disciples.total = 71
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  ok('离开风险显示概率并说明暂停来人', text().includes('当前每次检查离开概率 2%') && text().includes('改善居住环境后恢复弟子前来') && !doc.querySelector('.stat-line')?.textContent.includes('下一位'))
  ok('宜居度提示实时更新离开风险及来人状态', habitabilityTip()?.textContent.includes('2.0% / 1分0秒') && habitabilityTip()?.textContent.includes('宜居度不足 · 暂停来人'))
  habitabilityTrigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
  state.disciples.total = previousPopulation
  state.habitabilityPenalty = previousPenalty
  engine.recompute(state, derived)
}
{
  const previousPopulation = state.disciples.total
  const previousHut = state.buildings.hut ? { ...state.buildings.hut } : null
  const previousPlanning = state.upgrades.homePlanning
  state.disciples.total = 4
  state.buildings.hut = { count: 2, on: true }
  state.upgrades.homePlanning = true
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  const housingTrigger = doc.querySelector('[data-habitability]')?.closest('.tip-trigger')
  housingTrigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 180))
  const housingTip = [...doc.querySelectorAll('.tip')].find(el => el.textContent.includes('宜居度 · 当前效果'))
  ok('宜居度提示显示已入住配套的实际贡献', derived.housingHabitability === 4 && housingTip?.textContent.includes('其中入住配套+4') && !text().includes('其中入住配套'))
  housingTrigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
  state.disciples.total = previousPopulation
  if (previousHut) state.buildings.hut = previousHut
  else delete state.buildings.hut
  if (previousPlanning) state.upgrades.homePlanning = previousPlanning
  else delete state.upgrades.homePlanning
  engine.recompute(state, derived)
}

// 弟子不用手动招募：有空房就会自动来人
state.buildings.hut = { count: 5, on: true }
state.buildings.quarry = { count: 1, on: true }
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
state.upgrades.qiOrigin = true
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
    '未研究观气法与引气诀前不提前展示阵法精要',
    !lockedNames.includes('阵法精要') && !availNames.includes('阵法精要'),
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

// 保留事件等级标签，筛选只使用纪事类型和关键词。
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
  ok('纪事移除事件等级筛选', !doc.querySelector('[aria-label="事件等级筛选"]') && !button('一级·金丹前') && !button('二级·金丹至化神') && !button('三级·炼虚起'))
  button('进展').click()
  await new Promise(r => setTimeout(r, 50))
  ok('类型筛选包含不同等级的纪事', lines().length === 2 && lines()[0].includes('灵雨') && lines()[1].includes('天门'))
  button('重置').click()
  await new Promise(r => setTimeout(r, 50))
  ok('重置类型筛选恢复全部纪事', lines().length === 4)
  state.log = snapshot
  await new Promise(r => setTimeout(r, 50))
}

state.ui.tab = 'cultivation'
await new Promise((r) => setTimeout(r, 50))
ok('修真页渲染且标题说明可悬停查看', text().includes('修真') && !text().includes('扩充灵机上限') && (await ruleText('修真')).includes('扩充灵机上限'))
ok('修真页不列技艺·法宝层的条目', ![...doc.querySelectorAll('.main table.grid tbody tr')].some(tr => ['引气诀', '聚灵幡'].includes(tr.cells[0]?.textContent.trim())))

// 修真 / 技艺页的花费列只写「需要多少」，现有与还差多久都进悬停提示
{
  // 先把藏经阁铺起来，让修真页真的列出可参悟的条目
  state.buildings.library = { count: 3, on: true }
  engine.setJob(state, derived, 'scholar', 1)
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
  ok('需求值仍然按资源逐项写出', /^灵机\s*\d+/.test(cells[0]?.cost || ''), cells[0]?.cost || '')
  const target = dataRows.find((tr) => tr.cells[0]?.textContent.trim() === '观气法')
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
      /灵机\s*120 \/ 150（还差 .+）/.test(tip),
      costRows.join(' ｜ '),
    )
    ok('够的花费只写需求值', /灵木\s*300(?!\s*\/)/.test(tip), costRows.join(' ｜ '))
    trigger.dispatchEvent(new window.MouseEvent('mouseleave'))
    await new Promise((r) => setTimeout(r, 60))
  }
}

// 条件独立分节，多个前置逐条显示，避免长文字挤在数值列中。
{
  const previous = actions.exportText()
  actions.importText(JSON.stringify({
    upgrades: { prospectStudy: true },
    buildings: { lumberYard: { count: 2, on: true }, ironFurnace: { count: 1, on: true }, quarry: { count: 1, on: true } },
    resources: { insight: 1000, wood: 1000, rock: 1000 },
    peak: { wood: 1000, rock: 1000 },
    ui: { tab: 'cultivation', sectFilter: 'all' },
  }))
  await new Promise(r => setTimeout(r, 50))
  const row = [...doc.querySelectorAll('.main .upgrade-table tbody tr')].find(el => el.cells[0]?.textContent.trim() === '木作器械')
  row?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 180))
  const tip = doc.querySelector('.tip')
  const conditions = [...(tip?.querySelectorAll('.tip-condition') || [])]
  ok('修真条件独立分节且每个建筑和研究前置各占一行', [...(tip?.querySelectorAll('.tip-section') || [])].some(el => el.textContent === '条件') && conditions.length === 3 && conditions.some(el => el.textContent === '需建成 伐木场 ×2') && conditions.some(el => el.textContent === '需建成 炼铁炉 ×1') && conditions.some(el => el.textContent === '需参悟《探矿术》'))
  ok('条件正文不再使用右对齐的数值行', conditions.every(el => !el.closest('.tip-row') && !el.classList.contains('v')) && ![...(tip?.querySelectorAll('.tip-row .k') || [])].some(el => el.textContent === '条件'))
  row?.dispatchEvent(new window.MouseEvent('mouseleave'))
  state.ui.tab = 'sect'
  await new Promise(r => setTimeout(r, 50))
  const building = [...doc.querySelectorAll('.main .build-item')].find(el => el.querySelector('.build-btn')?.textContent.includes('百工坊'))
  building?.querySelector('.tip-trigger')?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 180))
  const buildingConditions = [...(doc.querySelector('.tip')?.querySelectorAll('.tip-condition') || [])]
  ok('建筑条件沿用相同分节与逐条样式', buildingConditions.length === 2 && buildingConditions.some(el => el.textContent === '需建成 伐木场 ×1') && buildingConditions.some(el => el.textContent === '需建成 采矿场 ×1'))
  building?.querySelector('.tip-trigger')?.dispatchEvent(new window.MouseEvent('mouseleave'))
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 50))
}

// 技艺页的筛选：全部 / 技艺 / 法宝（灵源考已完成，聚灵幡已经开放）
state.ui.tab = 'skills'
state.ui.skillFilter = 'treasure'
await new Promise((r) => setTimeout(r, 60))
ok(
  '筛选「法宝」后只剩法宝（技艺条目不再出现）',
  html().includes('聚灵幡') && !html().includes('引气诀'),
)
ok('研究灵源考后聚灵幡不再显示缺失前置', !doc.querySelector('.main details.fold')?.textContent.includes('聚灵幡'))
state.ui.skillFilter = 'skill'
await new Promise((r) => setTimeout(r, 60))
ok('筛选「技艺」后不出现法宝', !html().includes('聚灵幡') && html().includes('引气诀'))
state.ui.skillFilter = 'all'
await new Promise((r) => setTimeout(r, 40))
ok('筛选「全部」时两类都在', html().includes('聚灵幡') && html().includes('引气诀'))

// 法宝祭炼：炼成之后出现「已炼成的法宝」表，点祭炼会升级、效果与花费都往上走
{
  state.ui.tab = 'skills'
  state.ui.skillFilter = 'treasure'
  state.resources.insight = 20000
  state.resources.stone = 100
  // 直接给上修真前置，专心测祭炼（不然聚灵幡还锁在《灵源考》后面）
  state.upgrades.qiOrigin = true
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  // 炼成与祭炼都要「材料 + 灵机」，按当前花费把两种都给足（花费形状以后变了也不会假失败）
  const affordRefine = (id, times = 4) => {
    const c = engine.refineCost(state, id) || {}
    const research = engine.UPGRADE_MAP[id]?.cost || {}
    for (const res of new Set([...Object.keys(c), ...Object.keys(research)])) {
      const need = Math.max(c[res] || 0, research[res] || 0)
      state.resources[res] = Math.max(state.resources[res] || 0, need * times)
    }
    engine.recompute(state, derived)
  }
  affordRefine('spiritBanner')
  actions.research('spiritBanner')
  await new Promise((r) => setTimeout(r, 60))
  ok('炼成后出现「已炼成的法宝」表', html().includes('已炼成的法宝') && html().includes('Lv.0'))
  const forgedTable = [...doc.querySelectorAll('.main .box-body > table.grid')].find(table => table.querySelector('th')?.textContent.includes('已炼成的法宝'))
  ok('已炼成法宝与可参悟技艺使用相同三列表格', [...(forgedTable?.querySelectorAll('thead th') || [])].map(el => el.textContent.trim()).join('|') === '已炼成的法宝|花费|操作' && forgedTable?.querySelector('tbody tr')?.cells.length === 3 && !forgedTable.querySelector('.eff'))
  ok('已炼成法宝不在已参悟折叠中重复展示', ![...doc.querySelectorAll('.main details.fold')].filter(el => el.querySelector('summary')?.textContent.startsWith('已参悟')).some(el => el.textContent.includes('聚灵幡')))

  const refineBtn = () =>
    [...doc.querySelectorAll('.box-body > table.grid .btn')].find((b) => b.textContent.trim() === '祭炼')
  const costBefore = engine.refineCost(state, 'spiritBanner').insight
  const qiRateBefore = derived.rates.qi
  affordRefine('spiritBanner')
  await new Promise((r) => setTimeout(r, 60))
  refineBtn()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 60))
  ok('点祭炼升到 Lv.1', engine.treasureLevel(state, 'spiritBanner') === 1)
  ok('行里显示等级与倍率', /Lv\.1/.test(html()) && /×1\.30/.test(html()))
  ok('祭炼后产出变高', derived.rates.qi > qiRateBefore, `${qiRateBefore.toFixed(2)} → ${derived.rates.qi.toFixed(2)}`)
  ok(
    '下次祭炼更贵（×1.7）',
    Math.abs(engine.refineCost(state, 'spiritBanner').insight - costBefore * 1.7) < 1e-6,
    `${costBefore} → ${engine.refineCost(state, 'spiritBanner').insight}`,
  )
  state.ui.skillFilter = 'all'
}

const learned = actions.research('qiArt')
ok('参悟技艺生效', learned === true && state.upgrades.qiArt === true)

state.resources.qi = 5000
state.resources.rock = derived.max.rock
engine.recompute(state, derived)
const stoneBefore = state.resources.stone || 0
actions.craft('infuseStone')
ok('制作生效', (state.resources.stone || 0) > stoneBefore)

// 完整炼制页的手动批量与自动功能：
//   制作 = 瞬发固定 1 份
//   ¼料 / ½料 / 全部 = 把「材料能做出来的份数」取 1/4、1/2、全部，一次做掉
//   自动 = 一份一份定时做（需《心有灵犀》），关掉总开关就停
{
  state.buildings.quarry = { count: 1, on: true }
  engine.recompute(state, derived)
  state.ui.tab = 'craft'
  state.resources.qi = 50000
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))

  ok('炼制块里没有全局倍数行了（改成每行自己的按钮）', !doc.querySelector('.left .filters'))

  const rowBtns = () => [...doc.querySelectorAll('.main .craft-row .btn')]
  const btn = (label) => rowBtns().find((b) => b.textContent.trim() === label)
  // 配方顺序会变（催生灵木已排在最前），所以这几个点击一律限定在「点石成灵」那一行
  const infuseRow = () => [...doc.querySelectorAll('.main .craft-row')].find((r) => /点石成灵/.test(r.textContent))
  const ibtn = (label) => [...(infuseRow()?.querySelectorAll('.btn') || [])].find((b) => b.textContent.trim() === label)
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
  ibtn('制作')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  ok(
    '点「制作」正好做 1 份',
    (state.resources.stone || 0) - before1 === 1 && Math.abs(qi1 - (state.resources.qi || 0) - 15) < 1e-6,
    `灵石 +${(state.resources.stone || 0) - before1}，灵气 -${qi1 - (state.resources.qi || 0)}`,
  )

  // ½料：按「材料能做出来的份数」取一半
  state.buildings.warehouse = { count: 30, on: true }
  state.resources.qi = 15 * 20 // 能做 20 份
  state.resources.rock = 60
  state.resources.stone = 0
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  const canMake = engine.maxCraftable(state, derived, 'infuseStone')
  const beforeHalf = state.resources.stone || 0
  ibtn('½料')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  ok(
    `点「½料」做掉一半（${canMake} → ${Math.floor(canMake / 2)} 份）`,
    (state.resources.stone || 0) - beforeHalf === Math.floor(canMake / 2),
    `实际 +${(state.resources.stone || 0) - beforeHalf}`,
  )

  // ¼料：取四分之一
  state.resources.qi = 15 * 20
  state.resources.rock = 60
  state.resources.stone = 0
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  const beforeQ = state.resources.stone || 0
  ibtn('¼料')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  ok(
    '点「¼料」做掉四分之一（20 → 5 份）',
    (state.resources.stone || 0) - beforeQ === 5,
    `实际 +${(state.resources.stone || 0) - beforeQ}`,
  )

  // 材料只够 3 份时，¼料 取整为 0 → 按钮置灰
  state.resources.qi = 15 * 3
  state.resources.rock = 9
  state.resources.stone = 0
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  ok('材料只够 3 份时「¼料」置灰（取整为 0）', ibtn('¼料')?.disabled === true)
  ok('此时「½料」还能用（3 → 1 份）', ibtn('½料')?.disabled === false)

  // 自动：没参悟《心有灵犀》时是禁用的
  const autoBox = () => doc.querySelector('.main [data-craft="infuseStone"] .sw input[type=checkbox]')
  ok('未参悟《心有灵犀》时「自动」复选框禁用', !!autoBox()?.disabled)

  // 参悟后：勾上自动 = 一份一份定时做（不是瞬间刷满）
  state.upgrades.intuition = true
  state.settings.autoCraftOn = true
  state.resources.qi = 9000
  state.resources.rock = 60
  state.resources.stone = 0
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  ok('参悟后「自动」可勾选', autoBox()?.disabled === false)
  const stoneAtStart = state.resources.stone || 0
  autoBox()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  ok('勾上自动这一瞬间还没产出（它是一份一份做的）', (state.resources.stone || 0) === stoneAtStart)
  await new Promise((r) => setTimeout(r, 60))
  ok('行里显示自动进度', /自动中/.test(doc.querySelector('.main [data-craft="infuseStone"]')?.textContent || ''))

  // 真跑一会儿：0.5 秒一份，1.2 秒只该多出几份（主循环前面已 stopLoop，这里临时再开一段）
  startLoop()
  await new Promise((r) => setTimeout(r, 3400))
  stopLoop()
  const gained = (state.resources.stone || 0) - stoneAtStart
  ok('3.4 秒按三秒一份推进自动制作', gained === 1, `实际 +${gained}`)

  // 再点一下取消勾选就停
  autoBox()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 60))
  ok('取消勾选后不再自动做', engine.isAutoCrafting(state, derived, 'infuseStone') === false)
  ok(
    '取消后行里的「自动中」消失',
    !/自动中/.test(doc.querySelector('.main [data-craft="infuseStone"]')?.textContent || ''),
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
  ok('境界页保留转世与飞升的门槛', text().includes('需修到 化神期') && text().includes('需修到 渡劫期'))
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
  state.treasureLevels.spiritBanner = 2
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
  // 道果：飞升才给；转世不是飞升门槛。
  state.realm = 10
  state.dao = 0
  state.stats.reincarnations = 0
  state.stats.lifeInsight = 2e6
  state.ui.tab = 'realm'
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
  ok('境界页显示道果行', html().includes('道果'))
  ok('转世与飞升说明可查看清空范围和飞升条件', !text().includes('重置：资源') && (await ruleText('转世与飞升')).includes('转世并非飞升门槛'))
  const ascBtn = () => [...doc.querySelectorAll('.panel .btn')].find((b) => b.textContent.includes('飞升'))
  ok('渡劫期即可飞升（一次都没转世也行）', ascBtn() && ascBtn().disabled === false)
  const savedConfirm2 = window.confirm
  window.confirm = () => true
  ascBtn().click()
  await new Promise((r) => setTimeout(r, 80))
  ok('点击飞升后道果 +1', state.dao === 1, String(state.dao))
  ok('飞升后自动炼制立即解锁', derived.daoAutomation && derived.autoCraftUnlocked)
  state.buildings.quarry = { count: 1, on: true }
  engine.recompute(state, derived)
  state.ui.tab = 'craft'
  await new Promise((r) => setTimeout(r, 50))
  ok('炼制页显示统筹控制', text().includes('道果统筹') && doc.querySelectorAll('.main .craft-settings select').length === 2)
  const controls = doc.querySelectorAll('.main .craft-settings select')
  controls[0].value = '30'
  controls[0].dispatchEvent(new window.Event('change', { bubbles: true }))
  ok('材料保留设置通过界面保存', state.settings.craftReservePercent === 30)
  ok('重修后配方自动开关可用', !doc.querySelector('.left .craft-row input[type="checkbox"]').disabled)
  const targetInput = doc.querySelector('.main [aria-label="点石成灵库存目标"]')
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
  ok('编辑草稿不会提前改变自动炼制目标', !state.craftTargets.infuseStone)
  targetInput.dispatchEvent(new window.Event('change', { bubbles: true }))
  targetInput.blur()
  ok('多位数目标提交后保存', state.craftTargets.infuseStone === 12 && JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).craftTargets.infuseStone === 12)
  targetInput.value = '3'
  targetInput.dispatchEvent(new window.Event('change', { bubbles: true }))
  ok('输入库存目标更新并保存', state.craftTargets.infuseStone === 3 && JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).craftTargets.infuseStone === 3)
  targetInput.value = '-1'
  targetInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  targetInput.dispatchEvent(new window.Event('change', { bubbles: true }))
  state.resources.qi += 1
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 40))
  ok('非法目标输入恢复原值', targetInput.value === '3' && state.craftTargets.infuseStone === 3)
  window.confirm = savedConfirm2
  // 后面的存档用例要用到一间茅屋，这里补回来
  state.buildings.hut = { count: 1, on: true }
  state.resources.qi = 100
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 40))
}

// 阶段主材料丹药没有直接产出，破境提示仍需递归估算供料时间。
{
  state.ui.tab = 'realm'
  state.realm = 2 // 炼气期 → 筑基期（丹药档）
  state.resources.pill = 0
  state.resources.herb = 0
  state.resources.qi = 100
  state.buildings.spiritField = { count: 20, on: true }
  state.buildings.herbGarden = { count: 2, on: true }
  state.buildings.alchemyRoom = { count: 1, on: true }
  state.disciples.total = Math.max(state.disciples.total, 1)
  state.disciples.jobs = { herbalist: 1 }
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 80))
  const pillNeeded = engine.realmCost(state, derived, state.realm + 1).pill
  const etas = engine.timeToAfford(state, derived, 'pill', pillNeeded)
  const realmText = html()
  ok('丹药缺口能算出等待时间（加工路径）', Number.isFinite(etas) && etas > 0, `${etas}`)
  // 破境表的花费列同样只写需求值，倒计时在它自己的悬停提示里
  const realmCostText = doc.querySelector('.main .cost')?.textContent.replace(/\s+/g, ' ').trim() || ''
  ok(
    '破境表的花费列只有需求值',
    realmCostText.includes('灵机') && !realmCostText.includes('/') && !realmCostText.includes('（'),
    realmCostText.slice(0, 70),
  )
  const realmCostCell = doc.querySelector('.main .cost .tip-trigger')
  ok('破境花费单元格是 tooltip 触发器', !!realmCostCell)
  if (realmCostCell) {
    realmCostCell.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise((r) => setTimeout(r, 340))
    const tip = doc.querySelector('.tip')?.textContent.replace(/\s+/g, ' ').trim() || ''
    ok('破境提示沿用宗门排版（价格 / 效果分节）', tip.includes('价格') && tip.includes('效果'), tip.slice(0, 70))
    ok('破境提示里丹药带倒计时', new RegExp(`丹药\\s*0 / ${pillNeeded}（还差 .+）`).test(tip), tip.slice(0, 120))
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

// 护道选项改变实际报价、概率与可支付状态。
{
  state.realm = 4
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  const earlyRiskTip = await ruleText('破境')
  ok('金丹冲元婴展示60%渡劫概率，详细惩罚可悬停查看', text().includes('渡劫成功率 60%') && !text().includes('库存材料的2%') && earlyRiskTip.includes('降低5%') && earlyRiskTip.includes('失败不退回'))
  ok('金丹起保留本次总风险并在提示展示条件概率', earlyRiskTip.includes('1%概率身死道消') && earlyRiskTip.includes('99%概率存活且境界不变') && text().includes('本次总身死概率 0.40%') && text().includes('本次总退境概率 0.0%'))
  const faithLabel = [...doc.querySelectorAll('.main label')].find(label => label.textContent.includes('香火祈愿'))
  const faithCheckbox = faithLabel?.querySelector('input[type="checkbox"]')
  ok('香火加成有可选供奉入口', !!faithCheckbox)
  if (faithCheckbox) {
    faithCheckbox.click()
    await new Promise(r => setTimeout(r, 50))
    ok('勾选香火实时增加成功率与报价', text().includes('渡劫成功率 67%') && doc.querySelector('.main .cost')?.textContent.includes('香火 250'))
    faithCheckbox.click()
    await new Promise(r => setTimeout(r, 50))
    ok('取消供奉恢复基础概率与报价', text().includes('渡劫成功率 60%') && !doc.querySelector('.main .cost')?.textContent.includes('香火 250'))
    faithCheckbox.click()
    state.realm = 5
    engine.recompute(state, derived)
    await new Promise(r => setTimeout(r, 50))
    ok('换境后更新护道材料、供奉量并清空选择', text().includes('九转养神') && text().includes('晶符凝神') && text().includes('香火 600') && text().includes('渡劫成功率 55%') && !doc.querySelector('.main input[type="checkbox"]:checked'))
  }
  state.realm = 4
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  for (const checkbox of doc.querySelectorAll('.main input[type="checkbox"]')) if (!checkbox.checked) checkbox.click()
  await new Promise(r => setTimeout(r, 50))
  ok('金丹满配的小概率身死精确显示到百分比两位小数', text().includes('渡劫成功率 85%') && text().includes('本次总身死概率 0.15%') && text().includes('本次总退境概率 0.0%'))
  state.realm = 7
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  ok('炼虚冲关明确展示总身死风险和减半收益', text().includes('本次总身死概率 8.0%') && text().includes('身死立即重开') && text().includes('仙缘减半'))
  const lateRiskTip = await ruleText('破境')
  ok('炼虚失败保留总退境风险，详细规则可悬停查看', lateRiskTip.includes('90%概率退一境') && lateRiskTip.includes('退回上一境') && text().includes('本次总退境概率 72.0%') && lateRiskTip.includes('降低5%') && lateRiskTip.includes('库存材料的2%'))
  state.realm = 2
  engine.recompute(state, derived)
}

state.ui.tab = 'settings'
await new Promise(r => setTimeout(r, 50))
ok('设置面板渲染', html().includes('存档'))
ok('设置保留读档覆盖提醒，移除技术栈与文档路径', text().includes('读取存档将覆盖当前进度') && !text().includes('技术栈') && !text().includes('docs/DESIGN.md'))
ok('挂机设置说明收起且包含道果自动化入口', !text().includes('参悟《心有灵犀》') && (await ruleText('挂机设置')).includes('取得首颗道果'))
ok('默认隐藏调试入口和手动奇遇', !doc.querySelector('.debug-panel') && !text().includes('来一次奇遇') && ![...doc.querySelectorAll('.tab')].some(b => b.textContent.trim() === '调试'))
ok('旧控制台 API 已移除', typeof window.CHEAT === 'undefined')
{
  const previous = actions.exportText()
  state.hunting.statistics.completedMissions = 7
  state.hunting.yieldRemainders.beastHide = 0.75
  const moduleToggle = () => [...doc.querySelectorAll('.main label')].find(label => label.textContent.includes('妖兽猎杀'))?.querySelector('input')
  ok('设置中猎杀模块默认开启', moduleToggle()?.checked === true)
  moduleToggle().checked = false
  moduleToggle().dispatchEvent(new window.Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 50))
  ok('界面关闭猎杀隐藏导航并保存开关', !state.settings.modules.hunting &&
    ![...doc.querySelectorAll('.tab')].some(b => b.textContent.includes('猎杀')) &&
    JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).settings.modules.hunting === false)
  const closed = actions.exportText()
  actions.importText(closed)
  await new Promise(r => setTimeout(r, 50))
  ok('关闭后通过实际导入读档保留历史与兽材余量', state.hunting.statistics.completedMissions === 7 && state.hunting.yieldRemainders.beastHide === 0.75)
  moduleToggle().checked = true
  moduleToggle().dispatchEvent(new window.Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 50))
  ok('重新开启恢复猎杀导航并保留进度', state.settings.modules.hunting && state.hunting.statistics.completedMissions === 7 &&
    [...doc.querySelectorAll('.tab')].some(b => b.textContent.includes('猎杀')))
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 50))
}
const eventsBeforeDebug = state.stats.eventsSeen
ok('未开启调试时禁止手动修改与奇遇', actions.setDebugResource('stone', 123) === false && actions.triggerEvent() === false && state.stats.eventsSeen === eventsBeforeDebug)

console.log('\n== 调试页面 ==')
{
  const previous = actions.exportText()
  ok('控制台 DEBUG 开启本次调试页面', window.DEBUG === '调试模式已开启')
  await new Promise(r => setTimeout(r, 50))
  const row = id => doc.querySelector(`.debug-panel tr[data-resource="${id}"]`)
  const edit = async (id, value, enter = false) => {
    const input = row(id).querySelector('input')
    input.value = value
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
    if (enter) input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    else row(id).querySelector('button').click()
    await new Promise(r => setTimeout(r, 50))
  }
  ok('调试页列出未解锁和永久资源', !!row('stone') && !!row('dao') && !!row('karma') && doc.querySelector('.tab.active').textContent.trim() === '调试')
  ok('灵机和香火紧接灵气展示', [...doc.querySelectorAll('.debug-panel tbody tr')].slice(0, 3).map(r => r.dataset.resource).join(',') === 'qi,insight,faith')
  await edit('insight', '12345.75')
  await edit('faith', '6789.5')
  const knowledgeSave = JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1'))
  ok('灵机和香火可修改保存，当前数量取整且输入独立', state.resources.insight === 12345.75 && state.resources.faith === 6789.5 && knowledgeSave.resources.insight === 12345.75 && knowledgeSave.resources.faith === 6789.5 && row('insight').querySelectorAll('td')[1].textContent === '12345' && row('faith').querySelectorAll('td')[1].textContent === '6789' && row('faith').querySelector('input').value === '6789.5')
  const draft = row('qi').querySelector('input')
  ok('设置数量初始留空且不跟随库存刷新', draft.value === '')
  draft.value = '123.75'
  draft.dispatchEvent(new window.Event('input', { bubbles: true }))
  state.resources.qi += 1
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  ok('运行时库存刷新保留输入中的草稿', row('qi').querySelector('input').value === '123.75')
  await edit('stone', '100000.9')
  ok('应用整件资源向下取整并保存超仓库存，保留独立输入', state.resources.stone === 100000 && state.peak.stone >= 100000 && state.seen.stone && JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).resources.stone === 100000 && row('stone').querySelector('input').value === '100000.9')
  const debugSave = actions.exportText()
  actions.importText(debugSave)
  engine.tick(state, derived, 1, { offline: true, events: false })
  ok('读档与后续结算保留超仓库存', state.resources.stone === 100000)
  await edit('qi', '123.75', true)
  ok('回车应用连续资源保留小数，当前数量显示整数', state.resources.qi === 123.75 && row('qi').querySelectorAll('td')[1].textContent === '123')
  const stockBefore = JSON.stringify(state.resources)
  ok('非法数量和未知资源不污染库存', [-1, NaN, Infinity, '100', Number.MAX_SAFE_INTEGER + 1].every(n => !actions.setDebugResource('stone', n)) && !actions.setDebugResource('unknown', 1) && JSON.stringify(state.resources) === stockBefore)
  await edit('stone', '-1')
  ok('无效输入在页面提示并保留库存', !!doc.querySelector('.debug-panel [role="alert"]') && state.resources.stone === 100000)
  await edit('stone', '')
  ok('空输入不会清空资源', state.resources.stone === 100000 && text().includes('请输入资源数量'))
  await edit('karma', '123')
  await edit('dao', '4')
  const permanentSave = JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1'))
  ok('永久资源修改实际加成与保存值', state.karma === 123 && state.dao === 4 && derived.daoAutomation && permanentSave.karma === 123 && permanentSave.dao === 4)
  const search = doc.querySelector('.debug-panel input[type="search"]')
  search.value = 'stone'
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
  await new Promise(r => setTimeout(r, 50))
  ok('支持按资源 ID 搜索', !!row('stone') && !row('qi'))
  search.value = ''
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
  await new Promise(r => setTimeout(r, 50))
  const eventButton = [...doc.querySelectorAll('.debug-panel button')].find(b => b.textContent.includes('来一次奇遇'))
  eventButton.click()
  ok('调试页触发随机奇遇', state.stats.eventsSeen === eventsBeforeDebug + 1)
  actions.setTab('settings')
  await new Promise(r => setTimeout(r, 50))
  ok('切换普通页后保留调试导航', !doc.querySelector('.debug-panel') && [...doc.querySelectorAll('.tab')].some(b => b.textContent.trim() === '调试'))
  actions.setTab('debug')
  await new Promise(r => setTimeout(r, 50))
  ok('调试页面导航不写入存档', JSON.parse(decodeURIComponent(Buffer.from(actions.exportText(), 'base64').toString('utf8'))).ui.tab === 'settings')
  const close = [...doc.querySelectorAll('.debug-panel button')].find(b => b.textContent.includes('关闭调试'))
  close.click()
  await new Promise(r => setTimeout(r, 50))
  ok('关闭调试隐藏页面并禁用修改', !ui.debug && !ui.debugPage && !doc.querySelector('.debug-panel') && !actions.setDebugResource('stone', 1))
  actions.importText(previous)
  actions.setTab('settings')
  await new Promise(r => setTimeout(r, 50))
}

// ---------- 5. 存档 ----------
console.log('\n== 存档 ==')
{
  const previousRaw = window.localStorage.getItem('slack-off-sect.save.v1')
  const debugDescriptor = Object.getOwnPropertyDescriptor(window, 'DEBUG')
  const brokenRaw = '{invalid save'
  window.localStorage.setItem('slack-off-sect.save.v1', brokenRaw)
  const warningHandler = console.warn
  let recoveryModule
  try {
    console.warn = () => {}
    recoveryModule = await import(pathToFileURL(bundlePath).href + '?broken-save-recovery')
  } finally {
    console.warn = warningHandler
  }
  const recoveryRoot = document.createElement('div')
  ok('仅导入模块不读档或推进游戏，挂载时才初始化', !recoveryModule.ui.saveLoadError && recoveryModule.state.stats.playTime === 0 && window.localStorage.getItem('slack-off-sect.save.v1') === brokenRaw)
  document.body.appendChild(recoveryRoot)
  const recoveryApp = recoveryModule.mount(recoveryRoot)
  recoveryModule.startLoop()
  await new Promise(r => setTimeout(r, 150))
  ok('读档失败显示提示并阻止空白进度覆盖原存档', !!recoveryModule.ui.saveLoadError && recoveryRoot.textContent.includes('原存档未被覆盖') && !recoveryModule.saveNow() && window.localStorage.getItem('slack-off-sect.save.v1') === brokenRaw && recoveryModule.state.totalDays === 0)
  ok('Debug starts hidden after reload', !recoveryModule.ui.debug && !recoveryModule.ui.debugPage)
  window.DEBUG
  const stockBeforeFailure = recoveryModule.state.resources.stone
  ok('Debug cannot overwrite unreadable save', !recoveryModule.actions.setDebugResource('stone', 123) && recoveryModule.state.resources.stone === stockBeforeFailure && window.localStorage.getItem('slack-off-sect.save.v1') === brokenRaw)
  recoveryModule.actions.importText(previousRaw)
  ok('导入有效存档解除保护并恢复进度', !recoveryModule.ui.saveLoadError && recoveryModule.state.realm === state.realm && JSON.stringify(recoveryModule.state.buildings) === JSON.stringify(state.buildings) && recoveryModule.saveNow())
  recoveryModule.stopLoop()
  recoveryApp.unmount()
  recoveryRoot.remove()
  Object.defineProperty(window, 'DEBUG', debugDescriptor)
  window.localStorage.setItem('slack-off-sect.save.v1', previousRaw)
}
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
ok('调试开关不写入存档', !('debug' in raw) && !('debug' in raw.ui))

{
  const settingsButton = name => [...doc.querySelectorAll('.main button')].find(b => b.textContent.trim() === name)
  ok('存档使用文件入口并移除文本框和复制按钮', !!doc.querySelector('.main input[type="file"]') && !doc.querySelector('.main textarea') && !settingsButton('复制到剪贴板'))
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  const originalClick = window.HTMLAnchorElement.prototype.click
  let downloadedBlob, downloadedName, revoked = false
  try {
    URL.createObjectURL = blob => { downloadedBlob = blob; return 'blob:save-download' }
    URL.revokeObjectURL = url => { revoked = url === 'blob:save-download' }
    window.HTMLAnchorElement.prototype.click = function () { downloadedName = this.download }
    settingsButton('导出存档').click()
    const content = await downloadedBlob.text()
    const backup = JSON.parse(decodeURIComponent(Buffer.from(content, 'base64').toString('utf8')))
    ok('导出按钮下载可读取的存档文件', downloadedName.endsWith('.txt') && backup.buildings.hut.count === hutCount)
    await new Promise(r => setTimeout(r, 1100))
    ok('下载后释放文件地址', revoked && !doc.querySelector('a[download]'))
    const input = doc.querySelector('.main input[type="file"]')
    const upload = async (content, name) => {
      Object.defineProperty(input, 'files', { value: [new window.File([content], name, { type: 'text/plain' })], configurable: true })
      input.dispatchEvent(new window.Event('change', { bubbles: true }))
      await new Promise(r => setTimeout(r, 80))
    }
    state.buildings.hut.count = 1
    await upload(content, 'backup.txt')
    ok('上传旧格式文本存档恢复进度并保存', state.buildings.hut.count === hutCount && JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).buildings.hut.count === hutCount && text().includes('读档成功') && input.value === '')
    state.buildings.hut.count = 1
    await upload(JSON.stringify(backup), 'backup.json')
    ok('上传 JSON 存档恢复进度', state.buildings.hut.count === hutCount && text().includes('读档成功'))
    await upload('invalid save', 'broken.txt')
    ok('无效文件提示错误且保留当前进度', state.buildings.hut.count === hutCount && text().includes('导入失败') && !!settingsButton('读取存档') && !settingsButton('读取存档').disabled)
  } finally {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    window.HTMLAnchorElement.prototype.click = originalClick
  }
}

// ---------- 6. 报错检查 ----------
console.log('\n== 统一资源净额 ==')
derived.rates.qi = 10
derived.expenseSources.qi = [{ label: '弟子口粮', value: -2 }]
derived.autoCraftDrain.qi = [{ label: '自动·点石成灵', value: -12 }]
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
  actions.setSetting('quickCrafts', ['infuseStone', 'refinePill', 'sawPlank'])
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 50))
  const buildingNames = [...doc.querySelectorAll('.main .build-btn')].map(el => el.textContent.trim().replace(/\s*·\s*缺料$/, '').replace(/\s*\(\d+\)$/, ''))
  ok('全解锁时基础居所在矿业前、药藏在精舍前、因果池最后', buildingNames.indexOf('茅屋') < buildingNames.indexOf('炼铁炉') && buildingNames.indexOf('药藏') < buildingNames.indexOf('精舍') && buildingNames.at(-1) === '因果池')
  doc.querySelector('.left .craft-open')?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('快捷入口能打开完整炼制页', state.ui.tab === 'craft' && !!doc.querySelector('.main .craft-full'))
  const speedControl = doc.querySelector('select[aria-label="点石成灵自动炼制速度"]')
  const originalStep = engine.autoCraftStatus(state, derived, 'infuseStone').step
  ok('疾炼法解锁四档自动速度', !!speedControl && [...speedControl.options].map(option => option.value).join(',') === '1,2,5,10')
  speedControl.value = '10'
  speedControl.dispatchEvent(new window.Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 50))
  ok('页面调速立即生效并保存', derived.autoCraftSpeeds.infuseStone === 10 && Math.abs(engine.autoCraftStatus(state, derived, 'infuseStone').step - originalStep / 10) < 1e-8 && JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).settings.autoCraftSpeeds.infuseStone === 10)
  const speedRow = speedControl.closest('.craft-row')
  speedRow.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 180))
  ok('配方行仍可悬停查看明细', !!document.querySelector('.tip'))
  speedControl.dispatchEvent(new window.Event('pointerdown', { bubbles: true }))
  speedControl.focus()
  await new Promise(r => setTimeout(r, 180))
  ok('操作速度下拉框时隐藏配方提示', !document.querySelector('.tip'))
  const stockBeforeSpeedRefresh = speedRow.querySelector('.have').textContent
  // 模拟原生菜单中尚未提交的档位；后台刷新不能强制改回已保存的值。
  speedControl.value = '5'
  for (let i = 0; i < 3; i++) {
    state.resources.stone += 1
    engine.recompute(state, derived)
    await new Promise(r => setTimeout(r, 50))
  }
  ok('库存刷新不重写正在选择的档位或移除焦点', speedControl.value === '5' && derived.autoCraftSpeeds.infuseStone === 10 && document.activeElement === speedControl && doc.querySelector('select[aria-label="点石成灵自动炼制速度"]') === speedControl && speedRow.querySelector('.have').textContent !== stockBeforeSpeedRefresh)
  speedRow.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 180))
  ok('选择档位期间刷新及悬停不会重开提示', !document.querySelector('.tip'))
  speedControl.value = '10'
  speedControl.blur()
  speedRow.dispatchEvent(new window.MouseEvent('mouseleave'))
  const pillSpeed = doc.querySelector('select[aria-label="采药制丹自动炼制速度"]')
  pillSpeed.value = '2'
  pillSpeed.dispatchEvent(new window.Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 50))
  ok('灵石与丹药可分别选择速度', derived.autoCraftSpeeds.infuseStone === 10 && derived.autoCraftSpeeds.refinePill === 2 && speedControl.value === '10')
  const speedSave = actions.exportText()
  actions.setAutoCraftSpeed('infuseStone', 1)
  actions.importText(speedSave)
  await new Promise(r => setTimeout(r, 50))
  ok('读档恢复各配方速度与选择项', derived.autoCraftSpeeds.infuseStone === 10 && derived.autoCraftSpeeds.refinePill === 2 && doc.querySelector('select[aria-label="点石成灵自动炼制速度"]').value === '10' && doc.querySelector('select[aria-label="采药制丹自动炼制速度"]').value === '2')
  actions.setAutoCraftSpeed('infuseStone', 1)
  actions.setAutoCraftSpeed('refinePill', 1)
  await new Promise(r => setTimeout(r, 50))
  ok('所有配方解锁时完整页仍能全部列出', doc.querySelectorAll('.main .craft-row').length === CRAFTS.length)
  ok('左栏只有三个默认快捷且无目标统筹及未解锁列表', doc.querySelectorAll('.left .craft-row').length === 3 && !doc.querySelector('.left .craft-quick input[type=number], .left .craft-quick select, .left .craft-quick details'))
  ok('快捷按钮简化为制作半料全部', [...doc.querySelectorAll('.left [data-craft="infuseStone"] .btn')].map(el => el.textContent.trim()).join(',') === '制作,½料,全部')
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
  doc.querySelector('.left [data-craft="infuseStone"] .sw input').click()
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
  const auto = doc.querySelector('.main [data-craft="infuseStone"] .sw input')
  auto?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('完整页与快捷自动开关同步', doc.querySelector('.left [data-craft="infuseStone"] .sw input').checked === auto.checked)
  state.resources.qi = 500
  state.resources.stone = derived.max.stone
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 50))
  ok('成品满仓时两处手动制作均禁用', doc.querySelector('.main [data-craft="infuseStone"] .primary').disabled && doc.querySelector('.left [data-craft="infuseStone"] .primary').disabled)
  state.resources.stone = 0
  state.resources.rock = 10
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 50))
  doc.querySelector('.left [data-craft="infuseStone"] .primary')?.click()
  await new Promise((r) => setTimeout(r, 50))
  ok('快捷制作结果立即反映到完整页', state.resources.stone > 0 && doc.querySelector('.main [data-craft="infuseStone"] .have').textContent.includes(String(state.resources.stone)))
  for (const craft of CRAFTS) if (!state.settings.quickCrafts.includes(craft.id)) actions.toggleQuickCraft(craft.id)
  const pinnedSave = actions.exportText()
  actions.importText(pinnedSave)
  await new Promise(r => setTimeout(r, 50))
  ok('所有配方可同时固定且读档不截断', doc.querySelectorAll('.left .craft-row').length === CRAFTS.length && state.settings.quickCrafts.length === CRAFTS.length)
  actions.importText(previous)
  await new Promise((r) => setTimeout(r, 50))
}
console.log('\n== 大批灵石合成响应 ==')
{
  const previous = actions.exportText()
  state.ui.tab = 'craft'
  state.ui.craftFilter = 'all'
  state.buildings.quarry = { count: 1, on: true }
  actions.setSetting('quickCrafts', ['infuseStone'])
  for (const [location, label, expected] of [['.left', '全部', 1000000000], ['.main', '½料', 500000000]]) {
    engine.recompute(state, derived)
    derived.craftBonus = 0
    derived.craftBonusByResource.stone = 0
    state.resources.qi = 15000000000
    state.resources.rock = 3000000000
    state.resources.stone = 0
    state.craftProgress.infuseStone = 0
    derived.max.stone = 1000000000
    await new Promise(r => setTimeout(r, 50))
    const button = [...doc.querySelectorAll(`${location} [data-craft="infuseStone"] .btn`)].find(el => el.textContent.trim() === label)
    const before = state.stats.craftCount
    const start = performance.now()
    button?.click()
    const elapsed = performance.now() - start
    await new Promise(r => setTimeout(r, 50))
    ok(`${location} ${label}大批合成不阻塞且正确扣料`, button && elapsed < 1000 &&
      state.resources.stone === expected && state.stats.craftCount - before === expected &&
      state.resources.qi === 15000000000 - expected * 15 && state.resources.rock === 3000000000 - expected * 3,
      `${Math.round(elapsed)}ms`)
    const stockText = selector => doc.querySelector(`${selector} [data-craft="infuseStone"] .have`)?.textContent.split('/')[0].trim()
    ok(`${location} 合成后完整页与快捷栏同步`, !!stockText('.left') && stockText('.left') === stockText('.main'))
  }
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 50))
}

console.log('\n== 采矿场职位效果 ==')
{
  const previous = actions.exportText()
  state.ui.tab = 'sect'
  state.ui.buildingFilter = 'all'
  state.buildings.quarry = { count: 3, on: true }
  state.buildings.lumberYard = { count: 1, on: true }
  state.buildings.granary = { count: 1, on: true }
  for (const id of ['rock', 'ore', 'stone']) state.seen[id] = true
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  const quarry = [...doc.querySelectorAll('.build-item')].find(el => el.querySelector('.build-btn')?.textContent.includes('采矿场'))
  const trigger = quarry?.querySelector('.tip-trigger')
  trigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 180))
  const tip = [...doc.querySelectorAll('.tip')].find(el => el.querySelector('.tip-title')?.textContent.includes('采矿场'))
  const row = [...(tip?.querySelectorAll('.tip-row') || [])].find(el => el.textContent.includes('矿工 基础产出'))
  ok('采矿场提示展示矿工职位与每人矿石基础产出', tip?.textContent.includes('开放职位') && row?.textContent.includes('矿石 +0.150/秒·人'))
  ok('矿工基础产出不随采矿场座数重复叠加', !!row && !row.textContent.includes('合计'))
  ok('采矿场提示列出三种矿物的每座10%产出加成', ['矿石', '玄铁', '灵石'].every(name => new RegExp(`${name}\\s*产出\\s*\\+10%`).test(tip?.textContent || '')))
  trigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 50))
}

console.log('\n== 建筑资源效果按解锁显示 ==')
{
  const previous = actions.exportText()
  state.ui.tab = 'sect'
  state.ui.buildingFilter = 'all'
  state.upgrades.herbStudy = true
  state.buildings.herbGarden = { count: 2, on: true }
  state.buildings.warehouse = { count: 1, on: true }
  state.seen.herb = false
  state.resources.herb = 0
  state.peak.herb = 0
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  const garden = [...doc.querySelectorAll('.build-item')].find(el => el.querySelector('.build-btn')?.textContent.includes('药圃'))
  const trigger = garden?.querySelector('.tip-trigger')
  trigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 180))
  const rows = () => [...(doc.querySelector('.tip')?.querySelectorAll('.tip-row') || [])].map(el => el.textContent.replace(/\s+/g, ' ').trim())
  ok('未解锁灵草时隐藏药圃资源加成与职位产出，保留开放职位', !rows().some(t => /灵草 产出|采药人 基础产出/.test(t)) && rows().some(t => t.includes('开放职位') && t.includes('采药人')))
  state.resources.herb = 1
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  ok('获得灵草后自动显示每座10%与两座合计20%的效果', rows().some(t => /灵草\s*产出\s*\+10%/.test(t) && /合计\s*\+20%/.test(t)) && rows().some(t => t.includes('采药人 基础产出')), rows().join(' ｜ '))
  state.resources.herb = 0
  state.peak.herb = 1
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  ok('库存归零但有历史峰值时仍保留资源效果', rows().some(t => t.includes('灵草 产出')))
  trigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
  state.peak.herb = 0
  const warehouse = [...doc.querySelectorAll('.build-item')].find(el => el.querySelector('.build-btn')?.textContent.includes('库房'))
  const warehouseTrigger = warehouse?.querySelector('.tip-trigger')
  warehouseTrigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 180))
  ok('仓储效果也隐藏未解锁资源', !rows().some(t => t.includes('灵草 上限')))
  state.seen.herb = true
  await new Promise(r => setTimeout(r, 50))
  ok('已解锁资源即使库存与峰值为零也显示仓储效果', rows().some(t => t.includes('灵草 上限')))
  warehouseTrigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 50))
}

console.log('\n== 参悟提示避让操作行 ==')
{
  const previous = actions.exportText()
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect
  const originalWidth = window.innerWidth
  const originalHeight = window.innerHeight
  let rowRect = { left: 320, right: 860, top: 240, bottom: 278 }
  let tipHeight = 180
  try {
    actions.importText(JSON.stringify({
      upgrades: { qiOrigin: true },
      resources: { insight: 1000, wood: 1000 },
      buildings: { library: { count: 2, on: true } },
      ui: { tab: 'skills', skillFilter: 'skill' },
    }))
    await new Promise(r => setTimeout(r, 50))
    const row = [...doc.querySelectorAll('.main .upgrade-table tbody tr')].find(el => el.cells[0]?.textContent.trim() === '引气诀')
    const button = row?.querySelector('button')
    window.innerWidth = 1400
    window.innerHeight = 800
    window.HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains('tip')) return { width: Math.min(380, parseFloat(this.style.maxWidth)), height: Math.min(tipHeight, parseFloat(this.style.maxHeight)) }
      if (this === row) return rowRect
      return { left: rowRect.left + 100, right: rowRect.right - 100, top: rowRect.top, bottom: rowRect.bottom }
    }
    row?.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise(r => setTimeout(r, 180))
    const tip = doc.querySelector('.tip')
    const outsideRow = () => {
      if (!tip) return false
      const { width, height } = tip.getBoundingClientRect()
      const left = parseFloat(tip.style.left), top = parseFloat(tip.style.top)
      return left >= rowRect.right + 8 || left + width <= rowRect.left - 8 || top >= rowRect.bottom + 8 || top + height <= rowRect.top - 8
    }
    ok('参悟详情按整行右侧定位，避开按钮所在列', tip?.style.left === '868px' && outsideRow())
    rowRect = { left: 500, right: 1000, top: 240, bottom: 278 }
    window.innerWidth = 1100
    window.dispatchEvent(new window.Event('resize'))
    ok('右侧空间不足时放到整行左侧', tip?.style.left === '112px' && outsideRow())
    window.innerWidth = 500
    rowRect = { left: 30, right: 470, top: 220, bottom: 258 }
    tipHeight = 480
    window.dispatchEvent(new window.Event('resize'))
    ok('窄屏两侧放不下时在行下方限高展示', tip?.style.top === '266px' && tip.style.maxHeight === '480px' && outsideRow())
    rowRect = { left: 30, right: 470, top: 620, bottom: 658 }
    window.dispatchEvent(new window.Event('resize'))
    ok('底部操作行的详情改放上方，不遮住参悟', tip?.style.top === '132px' && outsideRow())
    visualViewport.widthOverride = 500
    visualViewport.heightOverride = 340
    visualViewport.offsetLeft = 10
    visualViewport.offsetTop = 20
    rowRect = { left: 30, right: 470, top: 160, bottom: 198 }
    visualViewport.dispatchEvent(new window.Event('resize'))
    ok('可见视口变小时限高滚动并保持避让', tip?.style.top === '206px' && tip.style.maxHeight === '146px' && outsideRow())
    button?.click()
    await new Promise(r => setTimeout(r, 30))
    ok('提示显示期间点击参悟仍正常完成研究', state.upgrades.qiArt === true && !doc.querySelector('.tip'))
  } finally {
    window.HTMLElement.prototype.getBoundingClientRect = originalRect
    window.innerWidth = originalWidth
    window.innerHeight = originalHeight
    visualViewport.widthOverride = undefined
    visualViewport.heightOverride = undefined
    visualViewport.offsetLeft = 0
    visualViewport.offsetTop = 0
    actions.importText(previous)
    await new Promise(r => setTimeout(r, 50))
  }
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
state.upgrades.qiLiquid = false
state.settings.autoCraftOn = true
engine.recompute(state, derived)
await new Promise(r => setTimeout(r, 50))
ok('凝液配方解锁前显示等待条件', text().includes('凝灵诀 · 需凝气化液'))
state.upgrades.qiLiquid = true
state.settings.autoCraftOn = false
state.resources.spiritLiquid = 0
engine.recompute(state, derived)
await new Promise((r) => setTimeout(r, 50))
ok('凝灵诀在常驻自动解锁前提供库存目标', !derived.autoCraftUnlocked && !!window.document.querySelector('input[aria-label="凝气成液库存目标"]'))
ok('自动炼制未解锁时全部自动复选框禁用', doc.querySelector('.main input[aria-label="全部自动"]')?.disabled)
ok('凝灵诀展示总开关暂停状态', text().includes('凝灵诀 · 总开关已暂停'))
state.settings.autoCraftOn = true
actions.setCraftTarget('condenseLiquid', 2)
state.resources.spiritLiquid = 2
engine.recompute(state, derived)
await new Promise((r) => setTimeout(r, 50))
ok('凝灵诀展示库存目标已达状态', text().includes('凝灵诀 · 目标已达'))
state.resources.spiritLiquid = 0
state.resources.qi = 0
engine.recompute(state, derived)
await new Promise(r => setTimeout(r, 50))
ok('凝灵诀向玩家显示缺灵气暂停', text().includes('凝灵诀 · 缺灵气暂停'))
actions.importText(beforeCondense)
await new Promise((r) => setTimeout(r, 50))

console.log('\n== 事件选择 ==')
// 前面的随机调试事件可能留下待决选择，独立事件用例先清理它。
state.pendingChoice = null
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
    realm: 5,
    resources: { insight: 20000, qi: 3000, spiritLiquid: 10, talisman: 100, ore: 500, wood: 500, plank: 20 },
    upgrades: { qiOrigin: true, qiGazing: true, condenseArt: true, qiMeasure: true, qiLiquid: true, liquidArt: true, qiPurify: true, talismanArt: true, shapeRune: true },
    buildings: { talismanHall: { count: 1, on: true }, workshop: { count: 1, on: true } },
  }))
  actions.research('crystalTheory')
  state.buildings.quarry = { count: 1, on: true }
  engine.recompute(state, derived)
  state.ui.tab = 'craft'
  state.ui.craftFilter = 'all'
  await new Promise(r => setTimeout(r, 50))
  ok('尚未掌握凝晶工艺前不提前展示凝晶配方', !doc.querySelector('.main [data-craft="condenseCrystal"]') && !doc.querySelector('.main details')?.textContent.includes('凝晶工艺'))
  actions.research('crystalCraft')
  await new Promise(r => setTimeout(r, 50))
  const row = doc.querySelector('.main [data-craft="condenseCrystal"]')
  ok('掌握工艺后出现灵晶配方及专业加成', !!row && /灵液\s*3/.test(row.textContent) && /灵气\s*300/.test(row.textContent) && /专业加成\s*\+5%/.test(row.textContent))
  ok('配方展示通用加成与专业加成合计产出', /灵晶\s*1\.11/.test(row?.querySelector('.craft-cost')?.textContent || ''))
  row?.querySelector('.btn.primary')?.click()
  await new Promise(r => setTimeout(r, 50))
  ok('灵晶点击立即合成扣料，不生成订单', !state.craftOrders.condenseCrystal && state.resources.crystal === 1 && state.resources.spiritLiquid === 7 && Math.abs(state.resources.qi - 2700) < 1e-6 && row.querySelector('.btn.primary').textContent.trim() === '制作')
  engine.runAutoCraft(state, derived, 5)
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 30))
  ok('手动完成后不会继续加工重复扣料', state.resources.crystal === 1 && state.resources.talisman === 94 && state.resources.spiritLiquid === 7 && Math.abs(state.resources.qi - 2700) < 1e-6 && !state.craftOrders.condenseCrystal)
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
  coreRow()?.querySelector('[aria-label="灵能枢祭炼详情"]')?.focus()
  await new Promise(r => setTimeout(r, 180))
  const zeroRows = tipSectionRows(doc.querySelector('.tip'), '效果')
  ok('无供能的灵能枢显示停效与实际零加成', coreRow()?.textContent.includes('缺灵能停效') && zeroRows.length === 3 && zeroRows.every(el => /^\+0(?:%)?$/.test(el.querySelector('.v')?.textContent || '')))
  doc.activeElement?.blur()
  await new Promise(r => setTimeout(r, 30))
  ok('技艺页不再出现储物袋与纳物诀', !doc.querySelector('.main')?.textContent.includes('储物袋') && !doc.querySelector('.main')?.textContent.includes('纳物诀'))
  state.resources.qiEnergy = 10
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  coreRow()?.dispatchEvent(new window.MouseEvent('mouseenter'))
  await new Promise(r => setTimeout(r, 340))
  const currentEffects = tipSectionRows(doc.querySelector('.tip'), '效果')
  ok('补充灵能后界面恢复满供效果', coreRow()?.textContent.includes('供能 100%') && currentEffects.some(el => el.querySelector('.k')?.textContent === '灵气 产出' && el.querySelector('.v')?.textContent === '+50%'))
  ok('法宝当前效果每项独立一行', currentEffects.length === 3 && currentEffects.map(el => el.querySelector('.k')?.textContent).join('|') === '灵气 产出|灵机 产出|加工供能容量' && currentEffects.every(el => !/[，、；]/.test(el.querySelector('.v')?.textContent || '')))
  const nextEffects = tipSectionRows(doc.querySelector('.tip'), '祭炼后满供 · Lv.1 ×1.30')
  ok('祭炼后预览每项独立一行并使用下一等级倍率', nextEffects.length === 3 && nextEffects.some(el => el.querySelector('.k')?.textContent === '灵气 产出' && el.querySelector('.v')?.textContent === '+65%'))
  ok('法宝提示显示持续耗能和缺供规则', doc.querySelector('.tip')?.textContent.includes('满供消耗') && doc.querySelector('.tip')?.textContent.includes('供能不足按比例运行'))
  coreRow()?.dispatchEvent(new window.MouseEvent('mouseleave'))
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 50))
}

{
  const previous = actions.exportText()
  actions.importText(JSON.stringify({
    realm: 5,
    resources: { stone: 60, spiritLiquid: 6 },
    upgrades: { spiritMortarArt: true },
    buildings: { workshop: { count: 1, on: true } },
    ui: { tab: 'craft', craftFilter: 'advanced' },
  }))
  await new Promise(r => setTimeout(r, 50))
  const row = doc.querySelector('.main [data-craft="mixSpiritMortar"]')
  ok('进阶炼制展示混灵土配方及灵石灵液用料', !!row && /灵石\s*20/.test(row.textContent) && /灵液\s*2/.test(row.textContent))
  ok('混灵土开放时不提前展示高阶建材配方', !doc.querySelector('.main [data-craft="smeltArcaneGold"]') && !doc.querySelector('.main [data-craft="fuseCrystalSilver"]'))
  row?.querySelector('.btn.primary')?.click()
  await new Promise(r => setTimeout(r, 50))
  ok('界面混灵土立即制作并统一按钮文字', !state.craftOrders.mixSpiritMortar && state.resources.spiritMortar === 1 && state.resources.stone === 40 && state.resources.spiritLiquid === 4 && !row.textContent.includes('投单'))
  state.craftOrders.mixSpiritMortar = { remaining: 1, paused: false }
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 30))
  const pause = doc.querySelector('[aria-label="拌制混灵土暂停订单"]')
  pause?.click()
  await new Promise(r => setTimeout(r, 30))
  ok('订单暂停按钮释放工位且保存暂停状态', state.craftOrders.mixSpiritMortar?.paused && engine.processingPlan(state, derived).mixSpiritMortar.work === 0)
  doc.querySelector('[aria-label="拌制混灵土恢复订单"]')?.click()
  await new Promise(r => setTimeout(r, 30))
  engine.runAutoCraft(state, derived, 10)
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 30))
  ok('恢复旧订单通过工位扣料并取得整数建材', state.resources.spiritMortar === 2 && state.resources.stone === 20 && state.resources.spiritLiquid === 2 && !state.craftOrders.mixSpiritMortar)
  state.craftOrders.mixSpiritMortar = { remaining: 1, paused: false }
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 30))
  doc.querySelector('[aria-label="拌制混灵土取消订单"]')?.click()
  await new Promise(r => setTimeout(r, 30))
  ok('取消旧订单按钮不额外扣费', !state.craftOrders.mixSpiritMortar && state.resources.stone === 20)
  row.querySelectorAll('.craft-line > button')[3]?.click()
  await new Promise(r => setTimeout(r, 30))
  ok('工业配方全部按钮即时合成剩余材料', state.resources.spiritMortar === 3 && state.resources.stone === 0 && state.resources.spiritLiquid === 0 && !state.craftOrders.mixSpiritMortar)
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 50))
}

console.log('\n== 修真灵机仓容分组 ==')
{
  const previous = actions.exportText()
  actions.importText(JSON.stringify({
    realm: 0,
    buildings: { library: { count: 2, on: true } },
    resources: { insight: 600, qi: 1000 },
    upgrades: { talismanArt: true },
    ui: { tab: 'cultivation' },
  }))
  await new Promise(r => setTimeout(r, 50))
  const capacityFold = () => [...doc.querySelectorAll('.main details')].find(d => d.querySelector('summary')?.textContent.includes('需扩充灵机上限'))
  const activeRow = () => [...doc.querySelectorAll('.box-body > table.grid tr')].find(r => r.textContent.includes('聚气纹') && r.querySelector('button'))
  ok('仓容不足的符文研究归入扩仓折叠区', capacityFold()?.textContent.includes('聚气纹') && !activeRow())
  ok('折叠区说明当前上限及研究需求', /600/.test(capacityFold()?.textContent) && /800/.test(capacityFold()?.textContent))
  state.buildings.library.count = 3
  state.resources.insight = 800
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  ok('凡体扩仓后研究进入可参悟列表', !!activeRow() && !activeRow()?.querySelector('button')?.disabled)
  activeRow()?.querySelector('button')?.click()
  await new Promise(r => setTimeout(r, 50))
  ok('凡体界面可参悟并实际扣除灵机', state.upgrades.qiRune && state.resources.insight === 0)
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 50))
}

console.log('\n== 首飞前加工统筹 ==')
{
  const previous = actions.exportText()
  state.dao = 0
  state.upgrades.intuition = true
  state.upgrades.woodworking = true
  state.ui.tab = 'craft'
  state.seen.wood = true
  state.settings.craftReserves = {}
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  const input = document.querySelector('input[aria-label="灵木保留数量"]')
  ok('首飞前展示逐项保留与优先配方', !!input && !!document.querySelector('select[aria-label="优先配方"]') && document.body.textContent.includes('百工统筹'))
  if (input) {
    input.value = '1250'
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
    engine.recompute(state, derived)
    await new Promise(r => setTimeout(r, 50))
    ok('保留数量草稿不会被游戏刷新覆盖', input.value === '1250' && !state.settings.craftReserves.wood)
    input.dispatchEvent(new window.Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 50))
    ok('首飞前保留数量提交并保存', state.settings.craftReserves.wood === 1250)
    input.value = '-1'
    input.dispatchEvent(new window.Event('change', { bubbles: true }))
    ok('无效保留数量恢复上次设置', state.settings.craftReserves.wood === 1250 && input.value === '1250')
  }
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 50))
}

console.log('\n== 耗能法宝启停 ==')
{
  const previous = actions.exportText()
  state.upgrades.energyCore = true
  state.resources.qiEnergy = 100
  state.upgradeEnabled = {}
  state.ui.tab = 'skills'
  state.ui.skillFilter = 'all'
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 50))
  const button = document.querySelector('button[aria-label="灵能枢启停"]')
  ok('已炼成的耗能法宝提供启停按钮', !!button)
  button?.click()
  await new Promise(r => setTimeout(r, 50))
  ok('暂停灵能枢停止耗能且显示启用操作', state.upgradeEnabled.energyCore === false && !derived.maintenance.qiEnergy && button?.textContent.includes('启用'))
  button?.click()
  await new Promise(r => setTimeout(r, 50))
  ok('启用灵能枢恢复耗能', state.upgradeEnabled.energyCore === true && derived.maintenance.qiEnergy > 0)
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 50))
}

console.log('\n== 工业产线容量与分配交互 ==')
{
  const previous = actions.exportText()
  actions.importText(JSON.stringify({
    realm: 5,
    resources: { wood: 10000, qi: 10000, ore: 10000, stone: 1000, plank: 50, spiritLiquid: 10 },
    buildings: { forge: { count: 1, on: true }, workshop: { count: 1, on: true }, talismanHall: { count: 2, on: true } },
    upgrades: { intuition: true, craftTempo: true, steelWorking: true, arrayAssembly: true, liquidArt: true },
    autoCraft: { forgeArtifact: true, refineSteel: true },
    settings: { autoCraftOn: true, autoCraftSpeeds: { forgeArtifact: 10, refineSteel: 10 } },
    ui: { tab: 'craft', craftFilter: 'all' },
  }))
  await new Promise(r => setTimeout(r, 50))
  const row = doc.querySelector('.main [data-craft="forgeArtifact"]')
  ok('金丹后完整炼制页展示共享工位与每分钟投入产出', !!doc.querySelector('[aria-label="加工工位容量"]') && row?.querySelector('.processing-line')?.textContent.includes('炼器工位') && row?.textContent.includes('/分'))
  const input = row?.querySelector('[aria-label="淬炼法器加工分配权重"]')
  input.value = '3'
  input.dispatchEvent(new window.Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 30))
  ok('修改权重会改变同工位实际份额', state.settings.craftWeights.forgeArtifact === 3 && row.querySelector('.processing-line').textContent.includes('75%'))
  input.focus()
  input.value = '7'
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  state.resources.qi += 1
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 30))
  ok('产线实时刷新保留正在编辑的分配草稿', input.value === '7' && state.settings.craftWeights.forgeArtifact === 3 && document.activeElement === input)
  input.dispatchEvent(new window.Event('change', { bubbles: true }))
  const saved = actions.exportText()
  actions.setCraftWeight('forgeArtifact', 1)
  actions.importText(saved)
  await new Promise(r => setTimeout(r, 30))
  ok('分配权重可保存恢复并同步输入框', state.settings.craftWeights.forgeArtifact === 7 && doc.querySelector('[aria-label="淬炼法器加工分配权重"]').value === '7')
  const invalid = doc.querySelector('[aria-label="淬炼法器加工分配权重"]')
  invalid.value = '0'
  invalid.dispatchEvent(new window.Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 30))
  ok('非法权重被拒绝且输入恢复保存值', state.settings.craftWeights.forgeArtifact === 7 && invalid.value === '7')
  const drive = doc.querySelector('[aria-label="炼器工位驱动方式"]')
  drive.value = 'overload'
  drive.dispatchEvent(new window.Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 30))
  ok('驱动选择实际启用灵气超载并展示动力费', state.settings.processingModes.forge === 'overload' && engine.processingPlan(state, derived).refineSteel.boost > 0 && doc.querySelector('.processing-overview').textContent.includes('动力消耗'))
  const driven = actions.exportText()
  actions.setProcessingMode('forge', 'normal')
  actions.importText(driven)
  await new Promise(r => setTimeout(r, 30))
  ok('驱动方式随存档恢复', doc.querySelector('[aria-label="炼器工位驱动方式"]').value === 'overload')
  state.upgrades.energyApplication = state.upgrades.energyCore = true
  state.resources.qiEnergy = 100
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 30))
  const energyDrive = doc.querySelector('[aria-label="炼器工位驱动方式"]')
  energyDrive.value = 'energy'
  energyDrive.dispatchEvent(new window.Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 30))
  ok('研究后可选择灵能驱动并显示供能冷却容量', state.settings.processingModes.forge === 'energy' && engine.processingPlan(state, derived).refineSteel.powerDrain.qiEnergy > 0 && doc.querySelector('.processing-overview').textContent.includes('灵能供能容量'))
  state.resources.qiEnergy = 0
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 30))
  ok('动力不足在界面说明降回普通加工', doc.querySelector('.processing-overview').textContent.includes('动力不足或已到保留量') && engine.processingPlan(state, derived).refineSteel.boost === 0)
  actions.setProcessingMode('forge', 'normal')
  state.resources.ore = 0
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 30))
  ok('缺料显示具体原料并释放工位', doc.querySelector('[data-processing="refineSteel"]').textContent.includes('缺玄铁') && engine.processingPlan(state, derived).refineSteel.work === 0)
  state.resources.ore = 1000
  state.buildings.forge.on = false
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 30))
  ok('停用设备显示停工原因', doc.querySelector('[data-processing="refineSteel"]').textContent.includes('工位停用或维护断供'))
  state.realm = 3
  engine.recompute(state, derived)
  await new Promise(r => setTimeout(r, 30))
  ok('金丹前隐藏工业分配界面', !doc.querySelector('.processing-line') && !doc.querySelector('[aria-label="加工工位容量"]'))
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 30))
}

console.log('\n== 存档冲突与提示期限 ==')
{
  const previous = actions.exportText()
  actions.importText(JSON.stringify({ version: 999, karma: 123, dao: 4, realm: 6, resources: { qi: 9999 } }))
  await new Promise(r => setTimeout(r, 30))
  ok('冲突存档仅继承仙缘道果并明确告知玩家', state.karma === 123 && state.dao === 4 && state.realm === 0 && state.resources.qi === 0 && text().includes('其余进度重新开始'))
  ok('恢复提示不进入持久存档', !('__recoveryNotice' in JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1'))))
  actions.importText(previous)
  await new Promise(r => setTimeout(r, 30))
  ok('完整存档恢复后清除冲突提示', !ui.saveRecoveryNotice)

  const originalTimeout = globalThis.setTimeout
  let expire
  try {
    globalThis.setTimeout = (callback, milliseconds, ...args) => {
      if (milliseconds === 4000) { expire = callback; return { unref() {} } }
      return originalTimeout(callback, milliseconds, ...args)
    }
    actions.save()
    await new Promise(r => originalTimeout(r, 30))
    ok('操作提示显示并注册四秒清除', doc.querySelector('.status-line').textContent === '已存档' && typeof expire === 'function')
    expire()
    await new Promise(r => originalTimeout(r, 30))
    ok('游戏循环停止时操作提示仍自动清除', !ui.toast && doc.querySelector('.status-line').textContent === '')
  } finally { globalThis.setTimeout = originalTimeout }
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
