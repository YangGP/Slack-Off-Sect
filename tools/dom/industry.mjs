export async function checkIndustry(context) {
  let { ok, window, state, derived, ui, actions, engine, doc, saved } = context
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
  Object.assign(context, { ok, window, state, ui, actions, doc })
}
