export async function checkTooltips(context) {
  let { ok, window, visualViewport, state, derived, ui, actions, engine, text, doc, trigger } = context
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
  Object.assign(context, { ok, window, state, derived, ui, actions, engine, text, doc })
}
