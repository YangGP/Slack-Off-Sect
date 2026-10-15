export async function checkRecovery(context) {
  let { ok, window, state, ui, actions, text, doc } = context
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
  Object.assign(context, { ok })
}
