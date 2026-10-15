export async function checkCrafting(context) {
  let { ok, window, state, derived, ui, actions, startLoop, stopLoop, engine, text, html, doc } = context
  const learned = actions.research('qiArt')
  ok('参悟技艺生效', learned === true && state.upgrades.qiArt === true)
  state.resources.qi = 5000
  state.resources.rock = derived.max.rock
  engine.recompute(state, derived)
  const stoneBefore = state.resources.stone || 0
  actions.craft('infuseStone')
  ok('制作生效', (state.resources.stone || 0) > stoneBefore)
  {
    state.buildings.quarry = { count: 1, on: true }
    engine.recompute(state, derived)
    state.ui.tab = 'craft'
    state.resources.qi = 50000
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))

    ok('炼制块里没有全局倍数行了（改成每行自己的按钮）', !doc.querySelector('.left .filters'))

    const rowBtns = () => [...doc.querySelectorAll('.main .craft-row .btn')]
    const btn = (label) => rowBtns().find((b) => b.textContent.trim() === label)
    // 配方顺序会变（催生灵木已排在最前），所以这几个点击一律限定在「点石成灵」那一行
    const infuseRow = () => [...doc.querySelectorAll('.main .craft-row')].find((r) => /点石成灵/.test(r.textContent))
    const ibtn = (label) => [...(infuseRow()?.querySelectorAll('.btn') || [])].find((b) => b.textContent.trim() === label)
    ok('每个配方一行四个按钮：制作 / ¼料 / ½料 / 全部', ['制作', '¼料', '½料', '全部'].every((l) => !!btn(l)), rowBtns().map((b) => b.textContent.trim()).join(' '))

    // 炼制的悬停提示：不再写「制作怎么点」的说明，只留价格 / 产出（含这批能做多少）/ 自动制作
    {
      const craftItem = doc.querySelector('.main .craft-row .tip-trigger') || doc.querySelector('.main .craft-row')
      craftItem?.dispatchEvent(new window.MouseEvent('mouseenter'))
      await new Promise((r) => setTimeout(r, 330))
      const tip = doc.querySelector('.tip')
      const text = tip?.textContent.replace(/\s+/g, ' ') || ''
      const sections = [...(tip?.querySelectorAll('.tip-section') || [])].map((el) => el.textContent.trim())
      ok('炼制提示里没有「制作（瞬发）」那套说明', !/制作（瞬发）|点一下立刻结算|取 ?\d+ 的 1\/4/.test(text), sections.join(' / '))
      ok('炼制提示只留 价格 / 产出 / 自动制作 三节', sections.join(',') === '价格,产出,自动制作', sections.join(','))
      ok('「这批能做」的份数还在（搬到产出一节）', /这批能做/.test(text) && /¼料 \d+ 份/.test(text), text.slice(0, 120))
      craftItem?.dispatchEvent(new window.MouseEvent('mouseleave'))
      await new Promise((r) => setTimeout(r, 60))
    }

    // 制作：固定 1 份
    const before1 = state.resources.stone || 0
    const qi1 = state.resources.qi || 0
    ibtn('制作')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    ok(
      '点「制作」正好做 1 份',
      (state.resources.stone || 0) - before1 === 1 && Math.abs(qi1 - (state.resources.qi || 0) - 15) < 1e-6,
      `灵石 +${(state.resources.stone || 0) - before1}，灵气 -${qi1 - (state.resources.qi || 0)}`,
    )

    // ½料：按「材料能做出来的份数」取一半
    state.buildings.warehouse = { count: 30, on: true }
    state.resources.qi = 15 * 20 // 能做 20 份
    state.resources.rock = 60
    state.resources.stone = 0
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
    const canMake = engine.maxCraftable(state, derived, 'infuseStone')
    const beforeHalf = state.resources.stone || 0
    ibtn('½料')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    ok(
      `点「½料」做掉一半（${canMake} → ${Math.floor(canMake / 2)} 份）`,
      (state.resources.stone || 0) - beforeHalf === Math.floor(canMake / 2),
      `实际 +${(state.resources.stone || 0) - beforeHalf}`,
    )

    // ¼料：取四分之一
    state.resources.qi = 15 * 20
    state.resources.rock = 60
    state.resources.stone = 0
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
    const beforeQ = state.resources.stone || 0
    ibtn('¼料')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    ok(
      '点「¼料」做掉四分之一（20 → 5 份）',
      (state.resources.stone || 0) - beforeQ === 5,
      `实际 +${(state.resources.stone || 0) - beforeQ}`,
    )

    // 材料只够 3 份时，¼料 取整为 0 → 按钮置灰
    state.resources.qi = 15 * 3
    state.resources.rock = 9
    state.resources.stone = 0
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
    ok('材料只够 3 份时「¼料」置灰（取整为 0）', ibtn('¼料')?.disabled === true)
    ok('此时「½料」还能用（3 → 1 份）', ibtn('½料')?.disabled === false)

    // 自动：没参悟《心有灵犀》时是禁用的
    const autoBox = () => doc.querySelector('.main [data-craft="infuseStone"] .sw input[type=checkbox]')
    ok('未参悟《心有灵犀》时「自动」复选框禁用', !!autoBox()?.disabled)

    // 参悟后：勾上自动 = 一份一份定时做（不是瞬间刷满）
    state.upgrades.intuition = true
    state.settings.autoCraftOn = true
    state.resources.qi = 9000
    state.resources.rock = 60
    state.resources.stone = 0
    engine.recompute(state, derived)
    await new Promise((r) => setTimeout(r, 60))
    ok('参悟后「自动」可勾选', autoBox()?.disabled === false)
    const stoneAtStart = state.resources.stone || 0
    autoBox()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    ok('勾上自动这一瞬间还没产出（它是一份一份做的）', (state.resources.stone || 0) === stoneAtStart)
    await new Promise((r) => setTimeout(r, 60))
    ok('行里显示自动进度', /自动中/.test(doc.querySelector('.main [data-craft="infuseStone"]')?.textContent || ''))

    // 真跑一会儿：0.5 秒一份，1.2 秒只该多出几份（主循环前面已 stopLoop，这里临时再开一段）
    startLoop()
    await new Promise((r) => setTimeout(r, 3400))
    stopLoop()
    const gained = (state.resources.stone || 0) - stoneAtStart
    ok('3.4 秒按三秒一份推进自动制作', gained === 1, `实际 +${gained}`)

    // 再点一下取消勾选就停
    autoBox()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 60))
    ok('取消勾选后不再自动做', engine.isAutoCrafting(state, derived, 'infuseStone') === false)
    ok(
      '取消后行里的「自动中」消失',
      !/自动中/.test(doc.querySelector('.main [data-craft="infuseStone"]')?.textContent || ''),
    )
  }
  state.ui.tab = 'realm'
  await new Promise((r) => setTimeout(r, 50))
  ok('境界面板渲染', html().includes('飞升'))
  Object.assign(context, { ok, window, state, derived, ui, actions, startLoop, stopLoop, engine, text, html, doc })
}
