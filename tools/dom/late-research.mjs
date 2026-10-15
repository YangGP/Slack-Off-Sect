export async function checkLateResearch(context) {
  let { ok, state, derived, ui, actions, engine, doc } = context
  console.log('\n== 修真灵机仓容分组 ==')
  {
    const previous = actions.exportText()
    actions.importText(JSON.stringify({
      realm: 0,
      buildings: { library: { count: 2, on: true } },
      resources: { insight: 360, qi: 1000 },
      upgrades: { talismanArt: true },
      ui: { tab: 'cultivation' },
    }))
    await new Promise(r => setTimeout(r, 50))
    const capacityFold = () => [...doc.querySelectorAll('.main details')].find(d => d.querySelector('summary')?.textContent.includes('需扩充灵机上限'))
    const activeRow = () => [...doc.querySelectorAll('.box-body > table.grid tr')].find(r => r.textContent.includes('聚气纹') && r.querySelector('button'))
    ok('仓容不足的符文研究归入扩仓折叠区', capacityFold()?.textContent.includes('聚气纹') && !activeRow())
    ok('折叠区说明当前上限及研究需求', /360/.test(capacityFold()?.textContent) && /800/.test(capacityFold()?.textContent))
    state.buildings.library.count = 8
    state.resources.insight = 800
    engine.recompute(state, derived)
    await new Promise(r => setTimeout(r, 50))
    ok('凡体扩仓后研究进入可参悟列表', !!activeRow() && !activeRow()?.querySelector('button')?.disabled)
    activeRow()?.querySelector('button')?.click()
    await new Promise(r => setTimeout(r, 50))
    ok('凡体界面可参悟并实际扣除灵机', state.upgrades.qiRune && state.resources.insight === 0)
    actions.importText(previous)
    await new Promise(r => setTimeout(r, 50))
  }
  console.log('\n== 修真同类递进显示 ==')
  {
    const previous = actions.exportText()
    actions.importText(JSON.stringify({
      realm: 0,
      buildings: { library: { count: 200, on: true } },
      resources: { insight: 16000, stone: 1000, plank: 100 },
      upgrades: { liquidArt: true },
      ui: { tab: 'cultivation' },
    }))
    await new Promise(r => setTimeout(r, 50))
    const researchRow = name => [...doc.querySelectorAll('.main table.grid tr')]
      .find(row => row.cells[0]?.textContent.trim() === name)
    ok('凝液法后只显示纯化，不提前在各列表显示凝灵诀与液藏',
      !!researchRow('灵气纯化') && !researchRow('凝灵诀') && !researchRow('液藏之术'))
    researchRow('灵气纯化')?.querySelector('button')?.click()
    await new Promise(r => setTimeout(r, 50))
    ok('实际参悟纯化后出现凝灵诀，修真不列液藏增益',
      state.upgrades.qiPurify && !!researchRow('凝灵诀') && !researchRow('液藏之术'))
    state.ui.tab = 'skills'
    await new Promise(r => setTimeout(r, 50))
    ok('纯化后的液藏之术在技艺页展示', !!researchRow('液藏之术'))
    actions.importText(previous)
    await new Promise(r => setTimeout(r, 50))
  }
  console.log('\n== 金丹修真研究入口 ==')
  {
    const previous = actions.exportText()
    actions.importText(JSON.stringify({
      realm: 4,
      buildings: { library: { count: 200, on: true }, forge: { count: 1, on: true }, talismanHall: { count: 1, on: true } },
      resources: { insight: 16000, stone: 2000, plank: 100, talisman: 80, ore: 2000, artifact: 10, wood: 2000, qi: 8000 },
      upgrades: Object.fromEntries(['qiGazing', 'alchemyArt', 'alchemyFire', 'earthArt', 'woodworking', 'intuition',
        'forgeArt', 'talismanArt', 'qiRune', 'shapeRune', 'incenseVow', 'wildHunting', 'qiMeasure'].map(id => [id, true])),
      ui: { tab: 'cultivation' },
    }))
    await new Promise(r => setTimeout(r, 50))
    const names = ['破境心法', '凝气化液', '流水作坊', '淬玄工艺', '导灵纹', '香火志', '土木精要', '兽材加工', '讲经法']
    const rowOf = name => [...doc.querySelectorAll('.main table.grid tr')].find(row =>
      (row.cells[0]?.querySelector('.good')?.textContent.trim() || row.cells[0]?.textContent.trim()) === name)
    const visible = names.filter(rowOf)
    ok('金丹报告的九项只显示化液、导灵、土木三个入口，折叠区也不提前展示后续',
      visible.length === 3 && ['凝气化液', '导灵纹', '土木精要'].every(name => visible.includes(name)))
    rowOf('土木精要')?.querySelector('button')?.click()
    await new Promise(r => setTimeout(r, 50))
    ok('点击土木精要后出现淬玄工艺，流水作坊仍隐藏', state.upgrades.earthEssence && !!rowOf('淬玄工艺') && !rowOf('流水作坊'))
    rowOf('淬玄工艺')?.querySelector('button')?.click()
    await new Promise(r => setTimeout(r, 50))
    ok('点击淬玄工艺后出现兽材加工，修真页不列应用增益', state.upgrades.steelWorking && !rowOf('流水作坊') && !rowOf('破境心法') && !!rowOf('兽材加工'))
    rowOf('导灵纹')?.querySelector('button')?.click()
    await new Promise(r => setTimeout(r, 50))
    rowOf('阵基装配')?.querySelector('button')?.click()
    await new Promise(r => setTimeout(r, 50))
    state.ui.tab = 'skills'
    await new Promise(r => setTimeout(r, 50))
    ok('工程分支的流水作坊在技艺页开放', state.upgrades.arrayAssembly && !!rowOf('流水作坊'))
    actions.importText(JSON.stringify({ upgrades: { breakthroughArt: true, waterworkshop: true, flowField: true }, ui: { tab: 'skills' } }))
    await new Promise(r => setTimeout(r, 50))
    ok('旧档已学的迁移项在技艺已学列表保留，破境折扣仍生效',
      !!rowOf('破境心法') && !!rowOf('流水作坊') && !!rowOf('灵流要诀') && derived.breakthroughDiscount >= 0.15)
    actions.importText(previous)
    await new Promise(r => setTimeout(r, 50))
  }
  Object.assign(context, { ok, state, derived, ui, actions, engine, doc })
}
