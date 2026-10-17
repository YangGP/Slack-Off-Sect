import { CHANGELOG, CURRENT_VERSION } from '../../src/data/changelog.js'

export async function checkMount(context) {
  let { ok, window, mod, state, derived, ui, engine } = context
  console.log('== 挂载 ==')
  let mountError = null
  try {
    mod.mount(window.document.getElementById('app'))
  } catch (err) {
    mountError = err
  }
  ok('应用成功挂载', !mountError, mountError?.message || '')
  await new Promise(resolve => setTimeout(resolve, 0))
  const consentDialog = window.document.querySelector('[aria-labelledby="analytics-dialog-title"]')
  ok('首次进入展示数据采集选择，尚未开启统计', !!consentDialog && ui.analyticsConsent === 'unknown' && state.settings.analyticsEnabled === false)
  const declineButton = [...(consentDialog?.querySelectorAll('button') || [])].find(button => button.textContent === '暂不开启')
  ok('首次提示默认聚焦暂不开启', !!declineButton && window.document.activeElement === declineButton)
  declineButton?.click()
  await new Promise(resolve => setTimeout(resolve, 0))
  ok('拒绝后弹窗关闭并记住浏览器选择', !window.document.querySelector('[aria-labelledby="analytics-dialog-title"]')
    && window.localStorage.getItem('slack-off-sect.analytics.consent.v1') === 'denied' && !state.settings.analyticsEnabled)
  // 自动化环境不加载真实 GA，用设置入口回归失败回退，避免测试污染正式统计。
  context.actions.setSetting('analyticsEnabled', true)
  await new Promise(resolve => setTimeout(resolve, 0))
  ok('采集不可用时弹窗提示且开关回退为关闭', ui.analyticsFailureOpen && ui.analyticsStatus === 'failed'
    && !state.settings.analyticsEnabled && ui.analyticsConsent === 'denied'
    && window.localStorage.getItem('slack-off-sect.analytics.consent.v1') === 'denied')
  const failureDialog = window.document.querySelector('[aria-labelledby="analytics-dialog-title"]')
  ok('开启失败弹窗提供继续游戏入口', failureDialog?.textContent.includes('数据采集未能开启')
    && failureDialog?.textContent.includes('继续游戏'))
  failureDialog?.querySelector('button')?.click()
  await new Promise(resolve => setTimeout(resolve, 0))
  ok('关闭失败弹窗后不阻挡游戏且不加载统计标签', !ui.analyticsFailureOpen
    && !window.document.querySelector('[aria-labelledby="analytics-dialog-title"]')
    && !window.document.querySelector('script[src*="googletagmanager.com"]'))
  {
    const previousPending = state.pendingChoice
    const at = Date.now()
    state.pendingChoice = { id: 'beastThreat', at, deadline: at + 300000 }
    await new Promise(resolve => setTimeout(resolve, 0))
    context.actions.openEventModal({ kind: 'choice', eventId: 'beastThreat', at, instanceId: 'focus-regression' })
    await new Promise(resolve => setTimeout(resolve, 0))
    const eventDialog = window.document.querySelector('[aria-labelledby="event-dialog-title"]')
    const closeButton = eventDialog?.querySelector('.dialog-foot button')
    ok('事件首选项材料不足时仍将焦点放在可用关闭按钮', eventDialog?.querySelector('button')?.disabled
      && !!closeButton && window.document.activeElement === closeButton)
    closeButton?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
    ok('键盘关闭事件弹窗保留待决选择', !ui.eventModal && state.pendingChoice?.at === at)
    context.actions.openEventModal({ kind: 'choice', eventId: 'beastThreat', at, instanceId: 'blocked-regression' })
    ui.offlineLoading = true
    await new Promise(resolve => setTimeout(resolve, 0))
    ok('高优先级离线状态立即收起事件框且不抢回焦点', !ui.eventModal
      && !window.document.querySelector('[aria-labelledby="event-dialog-title"]'))
    ui.offlineLoading = false
    state.pendingChoice = previousPending
  }
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
    ok('说明标题支持键盘聚焦，完整建议只出现在提示内', window.document.querySelector('[role="tooltip"]')?.textContent.includes('旧代存档需先导出备份并确认开始新宗门') && !text().includes('旧代存档需先导出备份并确认开始新宗门'))
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
  state.resources.qi = engine.money(500)
  state.resources.wood = engine.money(500)
  state.buildings.hut = { count: 5, on: true }
  state.buildings.quarry = { count: 1, on: true }
  state.buildings.spiritField = { count: 10, on: true }
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 50))
  Object.assign(context, { ok, window, state, derived, ui, engine, text, html, ruleText, tipSectionRows })
}
