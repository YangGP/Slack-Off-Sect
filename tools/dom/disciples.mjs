import { JOBS } from '../../src/data/jobs.js'

export async function checkDisciples(context) {
  let { ok, window, state, derived, ui, actions, engine, text, html, doc, trigger } = context
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
    const before = actions.exportText()
    const member = state.disciples.members[0]
    const toggle = () => doc.querySelector('input[aria-label="按天赋自动分工"]')
    ok('未掌握知人善任不显示自动分工入口且不能绕过门槛', !toggle() && actions.setSetting('autoTalentJobs', true) === false)
    state.upgrades.talentAssignment = true
    member.talents = [{ id: 'job_woodcutter_huang', level: 1 }]
    engine.recompute(state, derived)
    await new Promise(r => setTimeout(r, 50))
    ok('掌握知人善任后显示已启用的自动分工开关', toggle()?.checked)
    toggle()?.click()
    actions.assignDisciples([member.id], 'farmer')
    await new Promise(r => setTimeout(r, 50))
    ok('暂停自动分工可手动安排岗位并保存暂停偏好', member.roleId === 'farmer' && !state.settings.autoTalentJobs && JSON.parse(window.localStorage.getItem('slack-off-sect.save.v1')).settings.autoTalentJobs === false)
    toggle()?.click()
    await new Promise((r) => setTimeout(r, 50))
    ok('恢复自动分工立即将专长弟子调到对应岗位', member.roleId === 'woodcutter' && toggle()?.checked && state.disciples.jobs.woodcutter > 0)
    actions.importText(before)
    await new Promise((r) => setTimeout(r, 50))
  }
  {
    // 主动招募（《招贤纳士》）：切换模式并礼聘一名弟子
    const before = actions.exportText()
    const recruitSwitch = () => doc.querySelector('.main .recruit-block [role="switch"]')
    state.upgrades.seekTalents = false
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
    ok('未掌握《招贤纳士》不显示招募入口', !doc.querySelector('.main .recruit-block'))
    state.upgrades.seekTalents = true
    state.realm = 4
    state.resources.qi = 1e6
    state.resources.faith = 1e6
    state.resources.insight = 1e6
    state.disciples.total = 2
    state.buildings.hut = { count: 3, on: true }
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
    ok('掌握《招贤纳士》后显示唯一招募开关，默认自动前来', recruitSwitch()?.getAttribute('aria-label') === '主动招募' && recruitSwitch()?.getAttribute('aria-checked') === 'false' && doc.querySelectorAll('.main .recruit-block [role="switch"]').length === 1)
    recruitSwitch()?.click()
    await new Promise((r) => setTimeout(r, 60))
    ok('切到主动招募后更新开关状态、显示三档礼聘并保存模式', state.settings.recruitMode === 'manual' && recruitSwitch()?.getAttribute('aria-checked') === 'true' && doc.querySelectorAll('.main .recruit-tiers .btn').length === 3)
    const countBefore = state.disciples.total
    doc.querySelector('.main .recruit-tiers .btn:not([disabled])')?.click()
    await new Promise((r) => setTimeout(r, 60))
    ok('点击礼聘立即招募一名弟子', state.disciples.total === countBefore + 1)
    recruitSwitch()?.click()
    await new Promise((r) => setTimeout(r, 60))
    ok('同一开关切回自动前来并隐藏礼聘按钮', state.settings.recruitMode === 'auto' && recruitSwitch()?.getAttribute('aria-checked') === 'false' && !doc.querySelector('.main .recruit-tiers'))
    actions.importText(before)
    await new Promise((r) => setTimeout(r, 60))
  }
  {
    const trigger = doc.querySelector('.main [data-habitability]')?.closest('.tip-trigger')
    trigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise(r => setTimeout(r, 180))
    const tip = doc.querySelector('[role="tooltip"]')?.textContent || ''
    ok('宜居设施建议移入提示，弟子页收起长段说明', !text().includes('清风小院和膳养堂') && tip.includes('弟子数+40～60') && tip.includes('5%～10%') && tip.includes('清风小院和膳养堂'))
    trigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
  }
  const jobRows = doc.querySelectorAll('.main table.job-grid tbody tr').length
  ok('职位表渲染出职位行', jobRows >= 6, `${jobRows} 行`)
  state.buildings.spiritField = { count: 1, on: true }
  state.disciples.total = 6
  engine.recompute(state, derived)
  await new Promise((r) => setTimeout(r, 60))
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
  Object.assign(context, { ok, window, state, derived, ui, actions, engine, text, html, doc, trigger })
}
