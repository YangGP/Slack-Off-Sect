import { CRAFTS, ADVANCED_CRAFT_OUTPUTS } from '../../src/data/crafts.js'

export async function checkResources(context) {
  let { ok, window, state, derived, ui, actions, engine, doc } = context
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
    ok('全解锁建筑按用途排列，典籍库紧接藏经阁，因果池最后',
      buildingNames.indexOf('炼铁炉') < buildingNames.indexOf('茅屋') &&
      buildingNames.indexOf('精舍') < buildingNames.indexOf('药藏') &&
      buildingNames.indexOf('典籍库') === buildingNames.indexOf('藏经阁') + 1 &&
      buildingNames.indexOf('祖师殿') < buildingNames.indexOf('猎杀营地') &&
      buildingNames.indexOf('猎杀营地') < buildingNames.indexOf('护山大阵') &&
      buildingNames.at(-1) === '因果池')
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
  Object.assign(context, { ok, window, state, derived, ui, actions, engine, doc })
}
