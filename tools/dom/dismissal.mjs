import { CALENDAR, DAYS_PER_YEAR } from '../../src/data/calendar.js'

export async function checkDismissal(context) {
  let { ok, window, state, derived, ui, actions, engine, text, ruleText, doc } = context
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
      resources: { qi: 1000 },
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
      ok('单人逐出先确认姓名和精确费用，取消无损', prompt.includes('甲弟子') && prompt.includes('灵气 270') && prompt.includes('当前每年基础口粮') && prompt.includes('无法撤回') && state.disciples.total === 3 && state.resources.qi === 1000)
      window.confirm = () => true
      single()?.click()
      await new Promise(r => setTimeout(r, 30))
      const saved = JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1'))
      ok('单人逐出扣费并立即保存，人口岗位和列表同步', state.disciples.total === 2 && state.resources.qi === 730 && state.disciples.jobs.farmer === 0 && !single() && saved.disciples.members.every(member => member.id !== 11))
      const root = doc.querySelector('[aria-label="弟子灵根筛选"]')
      root.value = 'heaven'
      root.dispatchEvent(new window.Event('change', { bubbles: true }))
      await new Promise(r => setTimeout(r, 30))
      const detail = doc.querySelector('.disciple-name')
      detail?.focus()
      await new Promise(r => setTimeout(r, 180))
      ok('弟子明细显示已满年数、当前年基础口粮与逐出费用', doc.querySelector('.tip')?.textContent.includes('已满 1 年') && doc.querySelector('.tip')?.textContent.includes('每年基础口粮') && doc.querySelector('.tip')?.textContent.includes('逐出费用'))
      detail?.blur()
      ;[...doc.querySelectorAll('.management-selection button')].find(el => el.textContent === '选择本分类')?.click()
      await new Promise(r => setTimeout(r, 30))
      ok('批量逐出费用只包含筛选内所选弟子', batchButton()?.textContent.includes('灵气 540') && text().includes('已选 1 人'))
      state.resources.qi = 539
      await new Promise(r => setTimeout(r, 30))
      let asked = false
      window.confirm = () => { asked = true; return true }
      actions.dismissDisciples([12])
      ok('灵气不足禁用逐出按钮并拒绝执行，不打开确认', batchButton()?.disabled && doc.querySelector('[aria-label="逐出弟子12"]')?.disabled && !asked && state.disciples.total === 2 && state.resources.qi === 539)
      state.resources.qi = 1000
      await new Promise(r => setTimeout(r, 30))
      batchButton()?.click()
      await new Promise(r => setTimeout(r, 30))
      ok('确认批量逐出只移除所选并清除选择，其他灵根保留', state.disciples.total === 1 && state.disciples.members[0].id === 13 && state.resources.qi === 460 && state.disciples.jobs.woodcutter === 0 && text().includes('已选 0 人') && text().includes('此分类暂无弟子'))
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
  Object.assign(context, { ok, window, state, derived, ui, actions, engine, text, ruleText, doc })
}
