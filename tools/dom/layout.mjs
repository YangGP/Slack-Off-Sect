export async function checkLayout(context) {
  let { ok, window, state, derived, ui, actions, engine } = context
  const doc = window.document
  ok(
    '三列布局就位（左资源 / 中主区 / 右纪事）',
    !!(doc.querySelector('.left') && doc.querySelector('.main') && doc.querySelector('.right')),
  )
  ok(
    '标签行之上没有别的板块（通栏已移除）',
    [...doc.querySelector('.wrap').children].map((c) => c.className).join('|') ===
      'title-line|update-notice|stat-line|status-line|tabs|cols',
    [...doc.querySelector('.wrap').children].map((c) => c.className).join('|'),
  )
  ok(
    '中列以唯一边框容器开始（与左栏资源同一水平线）',
    doc.querySelector('.main')?.firstElementChild?.classList.contains('panel') &&
      !!doc.querySelector('.panel .build-grid'),
    doc.querySelector('.main')?.firstElementChild?.className || '',
  )
  ok('资源栏在左列', !!doc.querySelector('.left .res-table'))
  ok(
    '资源是一行行文字',
    doc.querySelectorAll('.left .res-table tr').length >= 2 &&
      doc.querySelector('.left .res-table .res-name')?.textContent.includes('灵气'),
    `${doc.querySelectorAll('.left .res-table tr').length} 行`,
  )
  ok(
    '资源行仅显示名称、存量、上限与净额四列',
    (() => {
      const tds = doc.querySelector('.left .res-table .res-group-rows tr')?.querySelectorAll('td') || []
      return (
        tds.length === 4 &&
        !!tds[1].classList.contains('res-amount') &&
        !!tds[2].classList.contains('res-max') &&
        !!tds[3].classList.contains('res-rate') &&
        !doc.querySelector('.res-bonus')
      )
    })(),
  )
  ok('左列保留快捷炼制入口', !!doc.querySelector('.left .craft-row') && !!doc.querySelector('.left .craft-open'))
  {
    const oldCollapsed = { ...state.ui.collapsedResourceGroups }
    const oldHighlight = ui.highlight
    const button = () => doc.querySelector('[aria-label="基础资源分组"]')
    const names = () => [...doc.querySelectorAll('#res-group-basic .res-name')].map(el => el.textContent)
    ok('基础资源默认展开且木石归在同组', button()?.getAttribute('aria-expanded') === 'true' && names().includes('灵木'))
    ok('空的后期资源分组不显示', !doc.querySelector('[aria-label="灵子与灵能分组"]'))
    button()?.click()
    await new Promise(r => setTimeout(r, 50))
    ok('点击分组收起资源行并保存偏好', button()?.getAttribute('aria-expanded') === 'false' && names().length === 0 && JSON.parse(window.localStorage.getItem('slack-off-sect.save.d7.v1')).ui.collapsedResourceGroups.basic)
    ui.highlight = { need: ['wood'], lack: ['wood'] }
    await new Promise(r => setTimeout(r, 50))
    ok('造价预览临时展开折叠组并标出缺料', button()?.getAttribute('aria-expanded') === 'true' && !!doc.querySelector('#res-group-basic .res-lack') && button().textContent.includes('查看用料'))
    ok('临时展开不修改持久化折叠偏好', state.ui.collapsedResourceGroups.basic === true)
    ui.highlight = { need: [], lack: [] }
    await new Promise(r => setTimeout(r, 50))
    ok('离开造价预览后恢复收起', button()?.getAttribute('aria-expanded') === 'false' && names().length === 0)
    button()?.click()
    await new Promise(r => setTimeout(r, 50))
    ok('再次点击恢复展开且不丢失资源详情', names().includes('灵木') && !!doc.querySelector('#res-group-basic .tip-trigger'))
    state.ui.collapsedResourceGroups = oldCollapsed
    ui.highlight = oldHighlight
  }
  ok(
    '建筑以按钮网格呈现',
    doc.querySelectorAll('.panel .build-grid .build-btn').length >= 3,
    `${doc.querySelectorAll('.build-btn').length} 个按钮`,
  )
  ok('有筛选行（全部 / 可建造 / 已建成 …）', doc.querySelectorAll('.panel .filters .filter').length >= 4)
  {
    const snapshot = { ...state.resources }
    state.resources.stone = engine.money(4.5) // 普通资源同样保留小数库存
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
    const stoneText =
      [...doc.querySelectorAll('.left .res-table tbody tr')]
        .find((tr) => tr.textContent.includes('灵石'))
        ?.textContent.replace(/\s+/g, ' ')
        .trim() || ''
    ok('左栏灵石显示小数库存', /灵石\s*4\.50/.test(stoneText), stoneText.slice(0, 40))

    state.resources.qi = engine.money(12.34)
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
    const qiText =
      [...doc.querySelectorAll('.left .res-table tbody tr')]
        .find((tr) => tr.textContent.includes('灵气'))
        ?.textContent.replace(/\s+/g, ' ')
        .trim() || ''
    ok('连续资源仍然显示两位小数', /12\.34/.test(qiText), qiText.slice(0, 40))

    // 悬停明细保留金额精度，大额库存使用缩写。
    {
      state.resources.qi = engine.money(1234.56)
      state.resources.stone = engine.money(7)
      state.buildings.hut = { count: 3, on: true } // 第 4 座茅屋的递增成本保留小数
      engine.recompute(state, derived)
      await new Promise((r) => setTimeout(r, 60))
      const tipTrigger = [...doc.querySelectorAll('.left .tip-trigger')].find((el) =>
        el.textContent.includes('灵气'),
      )
      tipTrigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
      await new Promise((r) => setTimeout(r, 320))
      const tipText = doc.querySelector('.tip')?.textContent.replace(/\s+/g, ' ').trim() || ''
      ok('悬停明细里的大额存量采用k缩写', /灵气\s*1\.23k/.test(tipText), tipText.slice(0, 60))

      // 加成倍率要拆成逐项（谁加了多少）
      {
        state.upgrades.qiArt = true
        state.buildings.gatheringArray = { count: 2, on: true }
        engine.recompute(state, derived)
        await new Promise((r) => setTimeout(r, 80))
        tipTrigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
        await new Promise((r) => setTimeout(r, 320))
        const tip = doc.querySelector('.tip')
        const rows = [...(tip?.querySelectorAll('.bonus-row') || [])].map((el) =>
          el.textContent.replace(/\s+/g, ' ').trim(),
        )
        ok('悬停提示里有加成倍率拆分', /加成倍率/.test(tip?.textContent || ''), (tip?.textContent || '').slice(0, 40))
        ok('拆分行里能看到具体条目', rows.some((r) => r.includes('引气诀')) && rows.some((r) => r.includes('聚灵大阵')), rows.join(' ｜ '))
        ok('拆分行带合计', rows.some((r) => /[+-]\d+%/.test(r)), rows.join(' ｜ '))
        tipTrigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
        await new Promise((r) => setTimeout(r, 60))
        state.upgrades.qiArt = false
        state.buildings.gatheringArray = { count: 0, on: true }
        engine.recompute(state, derived)
        await new Promise((r) => setTimeout(r, 60))
      }
      tipTrigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
      await new Promise((r) => setTimeout(r, 60))

      // 建筑价格直接显示实际小数成本（第 4 座茅屋：灵气 558.58、灵木 223.43，统一两位小数）。
      const hutItem = [...doc.querySelectorAll('.panel .build-item')].find((el) =>
        el.querySelector('.build-btn')?.textContent.includes('茅屋'),
      )
      hutItem?.querySelector('.tip-trigger')?.dispatchEvent(new window.MouseEvent('mouseenter'))
      await new Promise((r) => setTimeout(r, 320))
      const priceTip = doc.querySelector('.tip')?.textContent.replace(/\s+/g, ' ').trim() || ''
      const priceSection = priceTip.slice(priceTip.indexOf('价格'), priceTip.indexOf('效果'))
      ok(
        '建筑提示保留实际小数价格',
        priceSection.length > 0 && /灵气\s*558\.58/.test(priceSection) && /灵木\s*223\.43/.test(priceSection),
        priceSection.slice(0, 60),
      )
      hutItem?.querySelector('.tip-trigger')?.dispatchEvent(new window.MouseEvent('mouseleave'))
      await new Promise((r) => setTimeout(r, 60))
    }

    // 复原，后面还有一串依赖「买得起 / 高亮」的断言
    Object.assign(state.resources, snapshot)
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
  }
  ok(
    '网格首个按钮保留吸气',
    [...doc.querySelectorAll('.panel .build-grid .build-btn')]
      .slice(0, 1)
      .map((b) => b.textContent.trim())
      .join('/') === '吸取天地灵气',
    [...doc.querySelectorAll('.panel .build-grid .build-btn')]
      .slice(0, 3)
      .map((b) => b.textContent.trim())
      .join(' / '),
  )
  ok(
    '建筑按钮上带已建数量',
    [...doc.querySelectorAll('.panel .build-btn')].some((b) => /\(\d+\)/.test(b.textContent)),
    [...doc.querySelectorAll('.panel .build-btn')].slice(0, 4).map((b) => b.textContent.trim()).join(' '),
  )
  {
    ok('宗门页移除拾石和凝石按钮', ![...doc.querySelectorAll('.panel .build-btn')].some(b => /拾取石材|凝气成石|点石成灵/.test(b.textContent)))
  }
  const affordabilityQi = state.resources.qi
  state.resources.qi = engine.money(0)
  await new Promise(r => setTimeout(r, 60))
  ok(
    '买不起的建筑按钮置灰',
    doc.querySelectorAll('.panel .build-btn.poor').length > 0,
  )
  ok(
    '买得起的建筑按钮正常显示',
    doc.querySelectorAll('.panel .build-btn:not(.poor)').length > 0,
  )
  state.resources.qi = affordabilityQi
  {
    state.buildings.spiritField = { count: 3, on: true } // 无维护费
    state.buildings.gatheringArray = { count: 2, on: true } // 有维护费
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
    const item = (name) =>
      [...doc.querySelectorAll('.panel .build-item')].find((el) =>
        el.querySelector('.build-btn')?.textContent.includes(name),
      )
    const btn = (name, label) =>
      [...(item(name)?.querySelectorAll('.side-btn') || [])].find((b) => b.textContent.trim() === label)
    ok('没有维护费的建筑不显示「停」按钮', !btn('聚灵阵', '停'), item('聚灵阵')?.textContent.trim() || '')
    ok('带维护费的建筑显示「停」按钮', !!btn('聚灵大阵', '停'))
    ok('两者都能拆除（售）', !!btn('聚灵阵', '售') && !!btn('聚灵大阵', '售'))

    const sellButton = btn('聚灵阵', '售')
    sellButton.focus()
    await new Promise(r => setTimeout(r, 180))
    const sellTip = doc.querySelector('[role="tooltip"]')
    ok('出售按钮聚焦时显示统一操作提示', sellTip?.querySelector('.tip-title')?.textContent === '出售建筑' && sellTip.querySelector('.tip-desc')?.textContent.includes('返还一半材料') && !sellButton.hasAttribute('title'))
    sellButton.blur()
    await new Promise(r => setTimeout(r, 30))

    const qiExpenseBefore = engine.money(derived.expense?.qi)
    ok('聚灵大阵在吃灵气', engine.moneyLt(qiExpenseBefore, 0), `${qiExpenseBefore}`)
    btn('聚灵大阵', '停').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 60))
    ok('点「停」后不再吃灵气', engine.moneyIsZero(derived.maintenance.qi), `${derived.maintenance.qi}`)
    ok('点「停」后按钮变成「启」', !!btn('聚灵大阵', '启'))
    ok('停用也不会挤掉别的东西（售还在）', !!btn('聚灵大阵', '售'))

    // 悬停提示里有维护费分节
    const tipTrigger = item('聚灵大阵')?.querySelector('.tip-trigger')
    tipTrigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise((r) => setTimeout(r, 320))
    const tipText = doc.querySelector('.tip')?.textContent.replace(/\s+/g, '') || ''
    ok('悬停提示里有「维护」分节', tipText.includes('维护') && tipText.includes('灵气'), tipText.slice(0, 60))
    ok('详细建筑提示与规则提示共用单一外壳', doc.querySelector('.tip')?.querySelectorAll('.tip-body').length === 1 && doc.querySelector('.tip')?.querySelectorAll('.tip-title').length === 1)
    tipTrigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
    await new Promise((r) => setTimeout(r, 60))

    // 提示里「一种资源一行」：库房这种多资源建筑不许挤成一长串
    {
      state.buildings.lumberYard = { count: 3, on: true }
      state.buildings.warehouse = { count: 2, on: true } // 已建 2 座 → 提示里应出现「合计」
      state.resources.wood = engine.money(9999)
      state.resources.stone = engine.money(9999)
      state.resources.ore = engine.money(9999)
      state.resources.herb = engine.money(9999)
      engine.recompute(state, derived)
      await new Promise((r) => setTimeout(r, 80))
      const storeItem = item('库房')
      storeItem?.querySelector('.tip-trigger')?.dispatchEvent(new window.MouseEvent('mouseenter'))
      await new Promise((r) => setTimeout(r, 330))
      const tip = doc.querySelector('.tip')
      const rows = [...(tip?.querySelectorAll('.tip-row') || [])].map((el) =>
        el.textContent.replace(/\s+/g, ' ').trim(),
      )
      const effectRows = rows.filter((r) => /上限/.test(r))
      ok(
        '库房的效果一种资源一行（灵木 / 灵石 / 玄铁 / 灵草）',
        ['灵木 上限', '灵石 上限', '玄铁 上限', '灵草 上限'].every((t) => rows.some((r) => r.startsWith(t))),
        rows.join(' ｜ '),
      )
      ok('一行里不带逗号顿号堆叠（每行只有一项）', effectRows.every((r) => !r.includes('，') && !r.includes('、')), effectRows.join(' ｜ '))
      ok('库房不再给灵气 / 灵机 / 丹药 / 符箓 / 香火 / 法器 加上限', !/灵气 上限|灵机 上限|丹药 上限|符箓 上限|香火 上限|法器 上限/.test(tip.textContent), tip.textContent.replace(/\s+/g, ' ').slice(-120))
      ok('合计写在同一条里', effectRows.some((r) => r.includes('（合计')), effectRows.join(' ｜ '))
      ok('悬停时高亮的正是这座建筑的造价（灵木 / 玄铁）', (() => {
        const lit = [...doc.querySelectorAll('.left .res-table tr.res-hl .res-name')].map((el) => el.textContent.trim())
        return lit.includes('灵木') && lit.includes('玄铁') && !lit.includes('灵气') && !lit.includes('灵石')
      })(), [...doc.querySelectorAll('.left .res-table tr.res-hl .res-name')].map((el) => el.textContent.trim()).join(','))
      storeItem?.querySelector('.tip-trigger')?.dispatchEvent(new window.MouseEvent('mouseleave'))
      await new Promise((r) => setTimeout(r, 60))
      state.buildings.lumberYard = { count: 1, on: true }
      engine.recompute(state, derived)
      await new Promise((r) => setTimeout(r, 60))
    }
    btn('聚灵大阵', '启')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 60))
    ok('重新启用后维护费回来', engine.moneyIsPositive(derived.maintenance.qi))
    state.buildings.gatheringArray = { count: 0, on: true }
    state.buildings.spiritField = { count: 1, on: true }
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
  }
  {
     const coreNames = ['吸取天地灵气', '催生灵木']
    const names = () =>
      [...doc.querySelectorAll('.panel .build-btn')]
        .map((b) => b.textContent.trim().replace(/\s*\(\d+\)$/, ''))
        .filter((n) => !coreNames.includes(n))
    const before = names()
    const qtBefore = state.resources.qi
    state.resources.qi = engine.money(9999999)
    state.resources.wood = engine.money(9999999)
    state.resources.stone = engine.money(9999999)
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
    const after = names()
    ok(
      '建筑顺序不随买得起与否变化（可见集合只增不重排）',
      after.filter((n) => before.includes(n)).join('|') === before.join('|'),
      `${before.slice(0, 4).join('/')} → ${after.slice(0, 4).join('/')}`,
    )
    ok('可见基础建筑按开局顺序排列（聚灵阵、茅屋、伐木场）', after.indexOf('聚灵阵') === 0 && after.indexOf('茅屋') > 0 && after.indexOf('茅屋') < after.indexOf('伐木场'), after.slice(0, 4).join('/'))
    // 恢复成一个「部分买得起」的状态，后面的断言依赖这个
    state.resources.qi = qtBefore
    state.resources.wood = engine.money(0)
    state.resources.stone = engine.money(0)
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
  }
  {
    // 让左栏把所有资源都显示出来（否则没见过的资源根本没有行可高亮）
    Object.assign(state.seen, { stone: true, ore: true, herb: true, insight: true, faith: true })
    await new Promise((r) => setTimeout(r, 60))
    // 挑一个买不起的建筑（它的价格里一定有不足的资源）
    const poorItem = [...doc.querySelectorAll('.panel .build-item')].find((i) =>
      i.querySelector('.build-btn.poor') && !['吸取天地灵气', '拾取石材', '点石成灵'].includes(i.querySelector('.build-btn').textContent.trim()),
    )
    const btnTipTrigger = poorItem?.querySelector('.tip-trigger')
    btnTipTrigger?.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise((r) => setTimeout(r, 300))
    const btip = doc.querySelector('.tip')
    const btxt = btip?.textContent || ''
    ok('建筑悬停弹出提示', !!btip)
    ok('提示里有「价格」与「效果」分节', btxt.includes('价格') && btxt.includes('效果'))
    ok('建筑提示移除最多可建', !btxt.includes('最多可建'))
    ok('提示里有风味小字', !!btip?.querySelector('.tip-flavor'), btip?.querySelector('.tip-flavor')?.textContent || '')
    ok(
      '不足的资源显示「现有 / 需要」并标红',
      /^[\d.]+\s*\/\s*[\d.]+/.test(btip?.querySelector('.tip-row .v.bad')?.textContent.trim() || ''),
      btip?.querySelector('.tip-row .v.bad')?.textContent.trim() || '(没有不足的资源)',
    )

    // 悬停购买项时，左栏对应资源行应被高亮（不够的额外标红）
    const litRows = () => [...doc.querySelectorAll('.left .res-table tr.res-hl')]
    const lackRows = () => [...doc.querySelectorAll('.left .res-table tr.res-lack')]
    ok('悬停时左栏高亮出该项花费的资源', litRows().length > 0, `${litRows().length} 行`)
    ok(
      '买不起的花费里有资源被标红',
      lackRows().length > 0,
      `${lackRows().length} 行：${lackRows().map((r) => r.querySelector('.res-name').textContent).join('、')}`,
    )
    ok(
      '高亮的行与提示里的价格对得上',
      litRows().length > 0 &&
        litRows().every((r) =>
          btip.textContent.includes(r.querySelector('.res-name').textContent.trim()),
        ),
    )

    btnTipTrigger?.dispatchEvent(new window.MouseEvent('mouseleave'))
    await new Promise((r) => setTimeout(r, 50))
    ok('移开后建筑提示消失', !doc.querySelector('.tip'))
    ok('移开后左栏高亮也收掉', litRows().length === 0 && lackRows().length === 0)
  }
  ok(
    '资源行默认显示净额（带正负号）',
    /^[+-]/.test(doc.querySelector('.left .res-table .res-rate')?.textContent.trim() || ''),
    doc.querySelector('.left .res-table .res-rate')?.textContent.trim() || '',
  )
  const trigger = doc.querySelector('.left .tip-trigger')
  ok('资源行是 tooltip 触发器', !!trigger)
  if (trigger) {
    // 收支明细要有进项、出项与来源：先补一个「有聚灵阵 + 有阵徒」的状态
    state.disciples.total = Math.max(state.disciples.total, 2)
    actions.setJob('farmer', 1)
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
    trigger.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise((r) => setTimeout(r, 300))
    const tip = doc.querySelector('.tip')
    const tipText = tip?.textContent || ''
    ok('悬停后弹出 tooltip', !!tip)
    ok(
      'tooltip 里有进项 / 出项 / 净额',
      tipText.includes('进项') && tipText.includes('出项') && tipText.includes('净额'),
      tipText.replace(/\s+/g, ' ').slice(0, 60),
    )
    ok('tooltip 列出进项来源（阵徒）', tipText.includes('阵徒'), tipText.replace(/\s+/g, ' ').slice(0, 80))
    ok('资源栏去掉加成列后详情仍展示加成倍率', !doc.querySelector('.res-bonus') && tipText.includes('加成倍率'))
    trigger.dispatchEvent(new window.MouseEvent('mouseleave'))
    await new Promise((r) => setTimeout(r, 50))
    ok('移开后 tooltip 消失', !doc.querySelector('.tip'))
  }
  ok('标签页包含独立炼制页且保持纯文字形式', doc.querySelectorAll('.tabs .tab').length === 10 && [...doc.querySelectorAll('.tabs .tab')].some(el => el.textContent.trim() === '炼制'))
  ok('外交模块贡献独立标签', [...doc.querySelectorAll('.tabs .tab')].some(el => el.textContent.trim() === '外交'))
  ok(
    '没有旧的卡片 / 斑马纹 / 进度条 / 气泡元素',
    doc.querySelectorAll('.card, .bcard, .progress, .toast, .box-head .hint.badge').length === 0,
  )
  Object.assign(context, { ok, window, state, derived, ui, actions, engine, doc, trigger })
}
