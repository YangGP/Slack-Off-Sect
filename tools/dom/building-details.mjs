export async function checkBuildingDetails(context) {
  let { ok, window, state, derived, ui, actions, engine, doc, trigger } = context
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
      const stockText = selector => doc.querySelector(`${selector} [data-craft="infuseStone"] .have`)?.textContent.split('/')[0].trim().replace(/^灵石\s*/, '')
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
  Object.assign(context, { ok, window, state, derived, ui, actions, engine, doc, trigger })
}
