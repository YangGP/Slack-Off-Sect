import { pathToFileURL } from 'node:url'

export async function checkSaves(context) {
  let { ok, bundlePath, window, state, derived, ui, actions, startLoop, stopLoop, saveNow, text, doc, engine } = context
  console.log('\n== 存档 ==')
  {
    const backup = actions.exportText()
    try {
      ok('DEBUG产出仅调试模式可操作', !actions.setDebugProductionBoost(true))
      window.DEBUG
      state.buffs.push({ id: 'debugRegressionBuff', mult: 0.5, until: Date.now() + 3600000 })
      engine.recompute(state, derived)
      const before = derived.rates.qi
      await new Promise(resolve => setTimeout(resolve, 0))
      const toggle = doc.querySelector('.debug-panel input[type="checkbox"]')
      ok('DEBUG面板显示独立产出开关', !!toggle && !toggle.checked)
      toggle?.click()
      ok('DEBUG乘区在既有增益之外乘10', state.__debugProductionBoost === true &&
        before.gt(0) && derived.rates.qi.minus(before.times(10)).abs().lt('1e-20'))
      ok('DEBUG乘区来源单独记账', derived.bonus.debugProductionMult === 10)
      ok('导出不保存DEBUG产出开关', !JSON.parse(decodeURIComponent(window.atob(actions.exportText()))).__debugProductionBoost)
      actions.closeDebug()
      ok('关闭DEBUG立即移除独立倍率', state.__debugProductionBoost === undefined &&
        derived.rates.qi.minus(before).abs().lt('1e-20') && derived.bonus.debugProductionMult === 1)

      state.realm = 6
      state.upgrades.vowPower = true
      state.buildings.gate = { count: 1, on: true }
      state.resources.faith = engine.money('1.6')
      state.resources.vow = engine.money('10.8')
      state.settings.craftReserves.faith = engine.money('0.8')
      state.ui.tab = 'faith'
      engine.recompute(state, derived)
      await new Promise(resolve => setTimeout(resolve, 0))
      const faithInput = doc.querySelector('[aria-label="凝愿投入香火"]')
      const vowInput = doc.querySelector('[aria-label="证心投入愿力"]')
      const fill = (input, label) => [...(input?.parentElement.querySelectorAll('button') || [])]
        .find(button => button.textContent === label)?.click()
      fill(faithInput, '全部')
      fill(vowInput, '25%')
      await new Promise(resolve => setTimeout(resolve, 0))
      ok('香火全部投入保留小数且遵守保留量', faithInput?.value === '0.8')
      ok('愿力25%保留精确小数', vowInput?.value === '2.7')
      state.resources.vow = engine.money('0.8')
      fill(vowInput, '全部')
      await new Promise(resolve => setTimeout(resolve, 0))
      ok('不足1愿力仍可全部证心', vowInput?.value === '0.8')
    } finally {
      actions.closeDebug()
      actions.importText(backup)
    }
  }
  saveNow()
  {
    const previousRaw = window.localStorage.getItem('slack-off-sect.save.d7.v1')
    const debugDescriptor = Object.getOwnPropertyDescriptor(window, 'DEBUG')
    const brokenRaw = '{invalid save'
    window.localStorage.setItem('slack-off-sect.save.d7.v1', brokenRaw)
    const warningHandler = console.warn
    let recoveryModule
    try {
      console.warn = () => {}
      recoveryModule = await import(pathToFileURL(bundlePath).href + '?broken-save-recovery')
    } finally {
      console.warn = warningHandler
    }
    const recoveryRoot = document.createElement('div')
    ok('仅导入模块不读档或推进游戏，挂载时才初始化', !recoveryModule.ui.saveLoadError && recoveryModule.state.stats.playTime === 0 && window.localStorage.getItem('slack-off-sect.save.d7.v1') === brokenRaw)
    document.body.appendChild(recoveryRoot)
    const recoveryApp = recoveryModule.mount(recoveryRoot)
    recoveryModule.startLoop()
    await new Promise(r => setTimeout(r, 150))
    ok('读档失败显示提示并阻止空白进度覆盖原存档', !!recoveryModule.ui.saveLoadError && recoveryRoot.textContent.includes('原存档未被覆盖') && !recoveryModule.saveNow() && window.localStorage.getItem('slack-off-sect.save.d7.v1') === brokenRaw && recoveryModule.state.totalDays === 0)
    ok('Debug starts hidden after reload', !recoveryModule.ui.debug && !recoveryModule.ui.debugPage)
    window.DEBUG
    const stockBeforeFailure = recoveryModule.state.resources.stone
    ok('Debug cannot overwrite unreadable save', !recoveryModule.actions.setDebugResource('stone', 123) && engine.moneyEq(recoveryModule.state.resources.stone, stockBeforeFailure) && window.localStorage.getItem('slack-off-sect.save.d7.v1') === brokenRaw)
    recoveryModule.actions.importText(previousRaw)
    ok('导入有效存档解除保护并恢复进度', !recoveryModule.ui.saveLoadError && recoveryModule.state.realm === state.realm && JSON.stringify(recoveryModule.state.buildings) === JSON.stringify(state.buildings) && recoveryModule.saveNow())
    recoveryModule.stopLoop()
    recoveryApp.unmount()
    recoveryRoot.remove()
    Object.defineProperty(window, 'DEBUG', debugDescriptor)
    window.localStorage.setItem('slack-off-sect.save.d7.v1', previousRaw)
  }
  const saved = saveNow()
  ok('写入 localStorage 成功', saved === true && !!window.localStorage.getItem('slack-off-sect.save.d7.v1'))
  const exported = actions.exportText()
  ok('导出存档文本', typeof exported === 'string' && exported.length > 100)
  const hutCount = state.buildings.hut.count
  state.buildings.hut.count = 1
  actions.importText(exported)
  ok('导入后数据被还原', state.buildings.hut.count === hutCount)
  const raw = JSON.parse(window.localStorage.getItem('slack-off-sect.save.d7.v1'))
  ok('存档结构完整', !!(raw.resources && raw.disciples && raw.stats && raw.buildings))
  ok('调试开关不写入存档', !('debug' in raw) && !('debug' in raw.ui))
  {
    actions.setTab('settings')
    await new Promise(r => setTimeout(r, 60))
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
      ok('上传旧格式文本存档恢复进度并保存', state.buildings.hut.count === hutCount && JSON.parse(window.localStorage.getItem('slack-off-sect.save.d7.v1')).buildings.hut.count === hutCount && text().includes('读档成功') && input.value === '')
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
  Object.assign(context, { ok, window, state, ui, actions, text, doc, saved })
}
