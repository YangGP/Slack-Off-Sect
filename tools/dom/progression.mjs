export async function checkProgression(context) {
  let { ok, window, state, derived, ui, actions, engine, text, html, ruleText, doc, trigger } = context
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
      ok('换境后更新护道材料、供奉量并清空选择', text().includes('凝元养神') && text().includes('晶符凝神') && text().includes('香火 600') && text().includes('渡劫成功率 55%') && !doc.querySelector('.main input[type="checkbox"]:checked'))
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
  Object.assign(context, { ok, window, state, derived, ui, actions, engine, text, doc, trigger })
}
