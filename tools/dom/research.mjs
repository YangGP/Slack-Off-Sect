export async function checkResearch(context) {
  let { ok, window, state, derived, ui, actions, engine, text, html, ruleText, doc, trigger } = context
  state.resources.qi = 5000
  state.resources.wood = 5000
  state.resources.herb = 500
  state.buildings.spiritField = { count: 3, on: true }
  actions.buy('library', 1)
  state.upgrades.qiOrigin = true
  state.resources.insight = 500
  engine.recompute(state, derived)
  state.ui.tab = 'skills'
  await new Promise((r) => setTimeout(r, 50))
  ok('技艺页渲染出来了', html().includes('技艺与法宝'))
  {
    // 可参悟的表是 box-body 下的第一张表；「条件未达成」的在 details.fold 里
    const rowNames = (sel) =>
      [...doc.querySelectorAll(sel)].map((tr) => tr.cells[0]?.textContent.trim() || '')
    const availNames = rowNames('.box-body > table.grid tbody tr')
    const lockedNames = rowNames('details.fold table.grid tbody tr')
    ok(
      '可参悟的技艺出现且只出现一次',
      availNames.filter((n) => n === '引气诀').length === 1,
      availNames.join(','),
    )
    ok('已可参悟的技艺不在「条件未达成」里', !lockedNames.includes('引气诀'), lockedNames.join(','))
    // 新加的链式前置要能被读出来：阵法精要 需要先参悟 引气诀
    ok(
      '未研究观气法与引气诀前不提前展示阵法精要',
      !lockedNames.includes('阵法精要') && !availNames.includes('阵法精要'),
    )
  }
  {
    const snapshot = { ...state.resources }
    const badge = (name) => [...doc.querySelectorAll('.tabs .tab')]
      .find((el) => el.textContent.trim().startsWith(name))?.querySelector('.badge')?.textContent.trim() || ''
    for (const id of Object.keys(state.resources)) state.resources[id] = 0
    await new Promise((r) => setTimeout(r, 50))
    ok('材料不足的修真与技艺不计入括号', badge('修真') === '' && badge('技艺') === '')
    for (const id of Object.keys(state.resources)) state.resources[id] = 1e9
    for (const [tab, name] of [['cultivation', '修真'], ['skills', '技艺']]) {
      state.ui.tab = tab
      await new Promise((r) => setTimeout(r, 50))
      const enabled = [...doc.querySelectorAll('.box-body > table.grid tbody button')]
        .filter((el) => !el.disabled && ['参悟', '炼成'].includes(el.textContent.trim())).length
      ok(`${name}括号只统计可用项`, enabled > 0 && badge(name) === `(${enabled})`, badge(name))
    }
    state.resources = snapshot
  }
  {
    const snapshot = state.log
    state.log = []
    engine.pushLog(state, '建成 测试聚灵阵', 'good')
    engine.pushLog(state, '测试妖兽侵袭', 'bad')
    engine.pushLog(state, '测试异象', 'event')
    await new Promise((r) => setTimeout(r, 50))
    const lines = () => [...doc.querySelectorAll('.log .log-text')].map((el) => el.textContent)
    const filterButton = (name) => [...doc.querySelectorAll('.log-filters button')]
      .find((el) => el.textContent.trim() === name)
    ok('替换日志数组后纪事显示最新内容', lines().length === 3)
    filterButton('进展').click()
    await new Promise((r) => setTimeout(r, 50))
    ok('纪事类型筛选只显示对应记录', lines().length === 1 && lines()[0].includes('聚灵阵'))
    const search = doc.querySelector('.log-search')
    search.value = '妖兽'
    search.dispatchEvent(new window.Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    ok('类型与关键词组合过滤并提示空结果', !lines().length && text().includes('没有符合筛选条件的纪事'))
    filterButton('全部').click()
    await new Promise((r) => setTimeout(r, 50))
    ok('关键词搜索匹配日志内容', lines().length === 1 && lines()[0].includes('妖兽'))
    engine.pushLog(state, '测试妖兽退散', 'good')
    await new Promise((r) => setTimeout(r, 50))
    ok('新增日志自动应用当前过滤', lines().length === 2)
    filterButton('重置').click()
    await new Promise((r) => setTimeout(r, 50))
    ok('重置过滤恢复全部纪事', lines().length === 4 && search.value === '')
    actions.clearLog()
    await new Promise((r) => setTimeout(r, 50))
    ok('清空纪事立即刷新列表', !lines().length && text().includes('山中清静，暂无大事'))
    state.log = snapshot
  }
  {
    const snapshot = state.log
    state.log = [
      { id: 93001, at: Date.now(), text: '灵雨润泽', kind: 'good', eventLevel: 1, eventId: 'spiritRain' },
      { id: 93002, at: Date.now(), text: '妖兽窥伺药圃', kind: 'event', eventLevel: 2, eventId: 'beastThreat' },
      { id: 93003, at: Date.now(), text: '天门一线', kind: 'good', eventLevel: 3, eventId: 'heavenGate' },
      { id: 93004, at: Date.now(), text: '旧纪事', kind: 'event' },
    ]
    await new Promise(r => setTimeout(r, 50))
    const lines = () => [...doc.querySelectorAll('.log .log-text')].map(el => el.textContent)
    const button = (name) => [...doc.querySelectorAll('.log-filters button')].find(b => b.textContent.trim() === name)
    ok('纪事显示三级标签，旧纪事照常展示', lines().length === 4 && lines()[0].includes('一级·金丹前') && lines()[3] === '旧纪事')
    ok('纪事移除事件等级筛选', !doc.querySelector('[aria-label="事件等级筛选"]') && !button('一级·金丹前') && !button('二级·金丹至化神') && !button('三级·炼虚起'))
    button('进展').click()
    await new Promise(r => setTimeout(r, 50))
    ok('类型筛选包含不同等级的纪事', lines().length === 2 && lines()[0].includes('灵雨') && lines()[1].includes('天门'))
    button('重置').click()
    await new Promise(r => setTimeout(r, 50))
    ok('重置类型筛选恢复全部纪事', lines().length === 4)
    state.log = snapshot
    await new Promise(r => setTimeout(r, 50))
  }
  state.ui.tab = 'cultivation'
  await new Promise((r) => setTimeout(r, 50))
  ok('修真页渲染且标题说明可悬停查看', text().includes('修真') && !text().includes('扩充灵机上限') && (await ruleText('修真')).includes('扩充灵机上限'))
  ok('修真页不列技艺·法宝层的条目', ![...doc.querySelectorAll('.main table.grid tbody tr')].some(tr => ['引气诀', '聚灵幡'].includes(tr.cells[0]?.textContent.trim())))
  {
    // 先把藏经阁铺起来，让修真页真的列出可参悟的条目
    state.buildings.library = { count: 3, on: true }
    engine.setJob(state, derived, 'scholar', 1)
    // 让「观气法」稳稳缺料（差一枚灵机），这样提示才会走「现有 / 需要」那一支；
    // 用费用表推导而不是写死数字，研究费用调整后不必再改这里。
    const gazingCost = engine.UPGRADE_MAP.qiGazing?.cost || {}
    state.resources.insight = Math.max(0, (gazingCost.insight || 0) - 1)
    state.resources.stone = 400
    state.resources.herb = 50
    state.resources.wood = 400
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 80))
    const rows = [...doc.querySelectorAll('.box-body > table.grid tbody tr')]
    // 修真表会插入「段标题行」（五段主线，见 RESEARCH.md），数据行要跳过它们
  const dataRows = rows.filter((tr) => !tr.classList.contains('stage-row'))
  const cells = dataRows.map((tr) => ({
      name: tr.cells[0]?.textContent.trim() || '',
      cost: tr.cells[1]?.textContent.replace(/\s+/g, ' ').trim() || '',
      tr,
    }))
    ok(
      '花费列只写需求值（没有「现有/需要」）',
      cells.length > 0 && cells.every((c) => !c.cost.includes('/') && !c.cost.includes('（')),
      cells.slice(0, 3).map((c) => `${c.name}:${c.cost}`).join(' ｜ '),
    )
    ok('需求值仍然按资源逐项写出', /^灵机\s*\d+/.test(cells[0]?.cost || ''), cells[0]?.cost || '')
    const target = dataRows.find((tr) => tr.cells[0]?.textContent.trim() === '观气法')
    const trigger = target?.querySelector('.cost .tip-trigger')
    ok('花费单元格是 tooltip 触发器', !!trigger)
    // 悬停整行（不只是花费格）都该弹出同一条提示：行的 mouseenter 会把事件转发给触发器
    target?.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise((r) => setTimeout(r, 340))
    ok(
      '悬停整行也弹出提示',
      !!doc.querySelector('.tip'),
      (doc.querySelector('.tip')?.textContent || '（没有提示）').replace(/\s+/g, ' ').slice(0, 40),
    )
    target?.dispatchEvent(new window.MouseEvent('mouseleave'))
    await new Promise((r) => setTimeout(r, 100))
    ok('离开整行后提示收起', !doc.querySelector('.tip'))
    if (trigger) {
      trigger.dispatchEvent(new window.MouseEvent('mouseenter'))
      await new Promise((r) => setTimeout(r, 340))
      const tip = doc.querySelector('.tip')?.textContent.replace(/\s+/g, ' ').trim() || ''
      // 与建筑（宗门）的提示同一套排版：标题 + 描述 → 价格（够的只写需求、不够的写「现有 / 需要（还差多久）」）→ 效果
      ok('提示沿用宗门的排版（价格 / 效果分节）', tip.includes('价格') && tip.includes('效果'), tip.slice(0, 70))
      const costRows = [...(doc.querySelector('.tip')?.querySelectorAll('.tip-section + .tip-row') || [])].map((el) =>
        el.textContent.replace(/\s+/g, ' ').trim(),
      )
      // 期望值从数据表推导，避免研究费用调整后再改一遍魔法数字
      const gazing = engine.UPGRADE_MAP.qiGazing
      const wantInsight = gazing?.cost?.insight ?? 0
      const haveInsight = Math.floor(state.resources.insight)
      const insightEta = engine.timeToAfford(state, derived, 'insight', wantInsight)
      const tipInsight = (tip.match(/灵机[^｜]{0,60}/) || ['(未匹配到灵机段)'])[0]
      ok(
        '不够的花费写成「现有 / 需要（还差多久）」',
        new RegExp(`灵机\\s*${haveInsight} / ${wantInsight}`).test(tip),
        `灵机段="${tipInsight}" have=${haveInsight} want=${wantInsight} eta=${insightEta}`,
      )
      // 「还差多久」由 timeToAfford 给出；算得出时必须写（算不出就不编造时间，见 pricing.js）
      ok(
        '算得出等待时间时补上「还差多久」',
        !(Number.isFinite(insightEta) && insightEta > 0) || /（还差 .+）/.test(tip),
        `eta=${insightEta} 灵机段="${tipInsight}"`,
      )
      // 「够的花费只写需求值」用另一项（此时充足的行）来验证
      const richRow = cells.find((c) => c.name === '阵基装配') || cells[0]
      ok(
        '够的花费只写需求值',
        richRow ? !/ \/ /.test(richRow.cost) && !/（还差/.test(richRow.cost) : false,
        richRow ? `${richRow.name}: ${richRow.cost}` : '未找到可用行',
      )
      trigger.dispatchEvent(new window.MouseEvent('mouseleave'))
      await new Promise((r) => setTimeout(r, 60))
    }
  }
  {
    const previous = actions.exportText()
    actions.importText(JSON.stringify({
      upgrades: { prospectStudy: true },
      buildings: { lumberYard: { count: 2, on: true }, ironFurnace: { count: 1, on: true }, quarry: { count: 1, on: true } },
      resources: { insight: 1000, wood: 1000, rock: 1000 },
      peak: { wood: 1000, rock: 1000 },
      ui: { tab: 'cultivation', sectFilter: 'all' },
    }))
    await new Promise(r => setTimeout(r, 50))
    const row = [...doc.querySelectorAll('.main .upgrade-table tbody tr')].find(el => el.cells[0]?.textContent.trim() === '木作器械')
    row?.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise(r => setTimeout(r, 180))
    const tip = doc.querySelector('.tip')
    const conditions = [...(tip?.querySelectorAll('.tip-condition') || [])]
    ok('修真条件独立分节且每个建筑和研究前置各占一行', [...(tip?.querySelectorAll('.tip-section') || [])].some(el => el.textContent === '条件') && conditions.length === 3 && conditions.some(el => el.textContent === '需建成 伐木场 ×2') && conditions.some(el => el.textContent === '需建成 炼铁炉 ×1') && conditions.some(el => el.textContent === '需参悟《探矿术》'))
    ok('条件正文不再使用右对齐的数值行', conditions.every(el => !el.closest('.tip-row') && !el.classList.contains('v')) && ![...(tip?.querySelectorAll('.tip-row .k') || [])].some(el => el.textContent === '条件'))
    row?.dispatchEvent(new window.MouseEvent('mouseleave'))
    state.ui.tab = 'sect'
    await new Promise(r => setTimeout(r, 50))
    const building = [...doc.querySelectorAll('.main .build-item')].find(el => el.querySelector('.build-btn')?.textContent.includes('百工坊'))
    building?.querySelector('.tip-trigger')?.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise(r => setTimeout(r, 180))
    const buildingConditions = [...(doc.querySelector('.tip')?.querySelectorAll('.tip-condition') || [])]
    ok('建筑条件沿用相同分节与逐条样式', buildingConditions.length === 2 && buildingConditions.some(el => el.textContent === '需建成 伐木场 ×1') && buildingConditions.some(el => el.textContent === '需建成 采矿场 ×1'))
    building?.querySelector('.tip-trigger')?.dispatchEvent(new window.MouseEvent('mouseleave'))
    actions.importText(previous)
    await new Promise(r => setTimeout(r, 50))
  }
  state.ui.tab = 'skills'
  state.ui.skillFilter = 'treasure'
  await new Promise((r) => setTimeout(r, 60))
  ok(
    '筛选「法宝」后只剩法宝（技艺条目不再出现）',
    html().includes('聚灵幡') && !html().includes('引气诀'),
  )
  ok('研究灵源考后聚灵幡不再显示缺失前置', !doc.querySelector('.main details.fold')?.textContent.includes('聚灵幡'))
  state.ui.skillFilter = 'skill'
  await new Promise((r) => setTimeout(r, 60))
  ok('筛选「技艺」后不出现法宝', !html().includes('聚灵幡') && html().includes('引气诀'))
  state.ui.skillFilter = 'all'
  await new Promise((r) => setTimeout(r, 40))
  ok('筛选「全部」时两类都在', html().includes('聚灵幡') && html().includes('引气诀'))
  {
    state.ui.tab = 'skills'
    state.ui.skillFilter = 'treasure'
    state.resources.insight = 20000
    state.resources.stone = 100
    // 直接给上修真前置，专心测祭炼（不然聚灵幡还锁在《灵源考》后面）
    state.upgrades.qiOrigin = true
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
    // 炼成与祭炼都要「材料 + 灵机」，按当前花费把两种都给足（花费形状以后变了也不会假失败）
    const affordRefine = (id, times = 4) => {
      const c = engine.refineCost(state, id) || {}
      const research = engine.UPGRADE_MAP[id]?.cost || {}
      for (const res of new Set([...Object.keys(c), ...Object.keys(research)])) {
        const need = Math.max(c[res] || 0, research[res] || 0)
        state.resources[res] = Math.max(state.resources[res] || 0, need * times)
      }
      engine.recompute(state, derived)
    }
    affordRefine('spiritBanner')
    actions.research('spiritBanner')
    await new Promise((r) => setTimeout(r, 60))
    ok('炼成后出现「已炼成的法宝」表', html().includes('已炼成的法宝') && html().includes('Lv.0'))
    const forgedTable = [...doc.querySelectorAll('.main .box-body > table.grid')].find(table => table.querySelector('th')?.textContent.includes('已炼成的法宝'))
    ok('已炼成法宝与可参悟技艺使用相同三列表格', [...(forgedTable?.querySelectorAll('thead th') || [])].map(el => el.textContent.trim()).join('|') === '已炼成的法宝|花费|操作' && forgedTable?.querySelector('tbody tr')?.cells.length === 3 && !forgedTable.querySelector('.eff'))
    ok('已炼成法宝不在已参悟折叠中重复展示', ![...doc.querySelectorAll('.main details.fold')].filter(el => el.querySelector('summary')?.textContent.startsWith('已参悟')).some(el => el.textContent.includes('聚灵幡')))

    const refineBtn = () =>
      [...doc.querySelectorAll('.box-body > table.grid .btn')].find((b) => b.textContent.trim() === '祭炼')
    const costBefore = engine.refineCost(state, 'spiritBanner').insight
    const qiRateBefore = derived.rates.qi
    affordRefine('spiritBanner')
    await new Promise((r) => setTimeout(r, 60))
    refineBtn()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 60))
    ok('点祭炼升到 Lv.1', engine.treasureLevel(state, 'spiritBanner') === 1)
    ok('行里显示等级与倍率', /Lv\.1/.test(html()) && /×1\.30/.test(html()))
    ok('祭炼后产出变高', derived.rates.qi > qiRateBefore, `${qiRateBefore.toFixed(2)} → ${derived.rates.qi.toFixed(2)}`)
    ok(
      '下次祭炼更贵（×1.7）',
      Math.abs(engine.refineCost(state, 'spiritBanner').insight - costBefore * 1.7) < 1e-6,
      `${costBefore} → ${engine.refineCost(state, 'spiritBanner').insight}`,
    )
    state.ui.skillFilter = 'all'
  }
  Object.assign(context, { ok, window, state, derived, ui, actions, engine, text, html, ruleText, doc, trigger })
}
