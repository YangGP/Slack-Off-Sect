export async function checkLoop(context) {
  let { ok, window, state, derived, actions, startLoop, stopLoop, engine, text, doc, trigger } = context
  console.log('\n== 主循环 ==')
  startLoop()
  const playTimeBefore = state.stats.playTime
  state.resources.qi = engine.money(100)
  await new Promise((r) => setTimeout(r, 2200))
  stopLoop()
  ok(
    '主循环推进了游戏时间',
    state.stats.playTime > playTimeBefore + 1.5,
    `playTime=${state.stats.playTime.toFixed(2)}`,
  )
  ok('资源在自动增长', engine.moneyGt(state.resources.qi, 100), `灵气 ${engine.moneyToNumber(state.resources.qi).toFixed(2)}`)
  ok('派生数据已刷新', engine.moneyIsPositive(derived.rates.qi))
  ok('顶栏数字已渲染', /灵气/.test(text()))
  {
    console.log('\n== 建筑持续供能提示 ==')
    // 这份快照之后要原样写回 state 并继续推进主循环：必须保留 Decimal，不能用 JSON 往返。
    const backup = engine.cloneRuntime({
      buildings: state.buildings, resources: state.resources, upgrades: state.upgrades,
      disciples: state.disciples, realm: state.realm,
    })
    state.realm = 8
    state.disciples = { ...state.disciples, total: 0, members: [], jobs: {} }
    state.buildings = { splitArray: { count: 2, on: true } }
    state.resources.qi = engine.money(100000)
    state.resources.qiEnergy = engine.money(100000)
    state.upgrades.energyApplication = true
    const refresh = async () => {
      engine.recompute(state, derived)
      await new Promise(r => setTimeout(r, 60))
    }
    const row = label => [...(doc.querySelector('.tip')?.querySelectorAll('.tip-row') || [])]
      .find(el => el.querySelector('.k')?.textContent.trim() === label)?.querySelector('.v')?.textContent.replace(/\s+/g, '') || ''
    const hover = async name => {
      const trigger = [...doc.querySelectorAll('.panel .build-item')]
        .find(el => el.querySelector('.build-btn')?.textContent.includes(name))?.querySelector('.tip-trigger')
      trigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
      await new Promise(r => setTimeout(r, 320))
      return trigger
    }
    await refresh()
    let trigger = await hover('分灵阵')
    const qiTotal = Number(row('灵气 动力').match(/合计(-?[\d.]+)\/秒/)?.[1])
    // 界面把动力写成每秒负值；derived.maintenance.qi 是金额，先降到 Number 再与解析出的显示值相加。
    ok('分灵阵灵气动力合计包含实际吞吐倍率', Math.abs(qiTotal + engine.moneyToNumber(derived.maintenance.qi)) < 0.01, row('灵气 动力'))
    actions.setBuildingPower('splitArray', 'energy')
    await refresh()
    const energyTotal = Number(row('灵能 动力').match(/合计(-?[\d.]+)\/秒/)?.[1])
    ok('分灵阵灵能动力合计包含实际吞吐倍率', Math.abs(energyTotal + engine.moneyToNumber(derived.maintenance.qiEnergy)) < 0.01, row('灵能 动力'))
    trigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
    await new Promise(r => setTimeout(r, 60))
    state.buildings = { mansion: { count: 1, on: true, power: 'energy' } }
    await refresh()
    trigger = await hover('精舍')
    ok('灵能档精舍展示实际宜居贡献6.4', row('宜居度').includes('合计+6.4'), row('宜居度'))
    ok('灵能档不放大精舍住房名额', row('弟子上限') === '+10' && derived.maxDisciples === 10, row('弟子上限'))
    state.resources.qiEnergy = engine.money(engine.moneyToNumber(engine.BUILDING_MAP.mansion.upkeepEnergy) * 0.5)
    await refresh()
    ok('部分供能精舍展示实际宜居贡献3.2', Math.abs(derived.buildingSupply.mansion - 0.5) < 1e-8 && row('宜居度').includes('合计+3.2'), row('宜居度'))
    state.resources.qiEnergy = engine.money(0)
    await refresh()
    ok('精舍断供后主动效果合计归零', row('宜居度').includes('合计0'), row('宜居度'))
    state.resources.qiEnergy = engine.money(100000)
    engine.toggleBuilding(state, derived, 'mansion')
    await refresh()
    ok('精舍停用后主动效果归零且住房保留', row('宜居度').includes('合计0') && derived.maxDisciples === 10, row('宜居度'))
    trigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
    Object.assign(state, backup)
    await refresh()
  }
  Object.assign(context, { ok, window, state, derived, actions, startLoop, stopLoop, engine, text, doc, trigger })
}
