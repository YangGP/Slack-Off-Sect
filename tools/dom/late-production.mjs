export async function checkLateProduction(context) {
  let { ok, window, state, derived, ui, actions, engine, tipSectionRows, doc } = context
  console.log('\n== 凝晶工艺与专业收益界面 ==')
  {
    const previous = actions.exportText()
    actions.importText(JSON.stringify({
      realm: 5,
      resources: { insight: 20000, qi: 3000, spiritLiquid: 10, talisman: 100, ore: 500, wood: 500, plank: 20 },
      upgrades: { qiOrigin: true, qiGazing: true, condenseArt: true, qiMeasure: true, qiLiquid: true, liquidArt: true, qiPurify: true, talismanArt: true, shapeRune: true },
      buildings: { talismanHall: { count: 1, on: true }, workshop: { count: 1, on: true } },
    }))
    actions.research('crystalTheory')
    state.buildings.quarry = { count: 1, on: true }
    engine.recompute(state, derived)
    state.ui.tab = 'craft'
    state.ui.craftFilter = 'all'
    await new Promise(r => setTimeout(r, 50))
    ok('尚未掌握凝晶工艺前不提前展示凝晶配方', !doc.querySelector('.main [data-craft="condenseCrystal"]') && !doc.querySelector('.main details')?.textContent.includes('凝晶工艺'))
    actions.research('crystalCraft')
    await new Promise(r => setTimeout(r, 50))
    const row = doc.querySelector('.main [data-craft="condenseCrystal"]')
    ok('掌握工艺后出现灵晶配方及专业加成', !!row && /灵液\s*3/.test(row.textContent) && /灵气\s*300/.test(row.textContent) && /专业加成\s*\+5%/.test(row.textContent))
    ok('配方展示通用加成与专业加成合计产出', /灵晶\s*1\.11/.test(row?.querySelector('.craft-cost')?.textContent || ''))
    row?.querySelector('.btn.primary')?.click()
    await new Promise(r => setTimeout(r, 50))
    ok('灵晶点击立即合成扣料，不生成订单', !state.craftOrders.condenseCrystal && state.resources.crystal === 1 && state.resources.spiritLiquid === 7 && Math.abs(state.resources.qi - 2700) < 1e-6 && row.querySelector('.btn.primary').textContent.trim() === '制作')
    engine.runAutoCraft(state, derived, 5)
    engine.recompute(state, derived)
    await new Promise(r => setTimeout(r, 30))
    ok('手动完成后不会继续加工重复扣料', state.resources.crystal === 1 && state.resources.talisman === 94 && state.resources.spiritLiquid === 7 && Math.abs(state.resources.qi - 2700) < 1e-6 && !state.craftOrders.condenseCrystal)
    row?.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise(r => setTimeout(r, 340))
    ok('配方悬停明确专业收益及小数结转', doc.querySelector('.tip')?.textContent.includes('专业制作加成') && doc.querySelector('.tip')?.textContent.includes('小数累积'))
    row?.dispatchEvent(new window.MouseEvent('mouseleave'))
    actions.importText(previous)
    await new Promise(r => setTimeout(r, 50))
  }
  console.log('\n== 灵能枢实时供能与早期空间技艺移除 ==')
  {
    const previous = actions.exportText()
    actions.importText(JSON.stringify({
      resources: { qiParticle: 0, qiEnergy: 0 },
      upgrades: { energyCore: true },
      ui: { tab: 'skills', skillFilter: 'all' },
    }))
    await new Promise(r => setTimeout(r, 50))
    const coreRow = () => [...doc.querySelectorAll('.box-body > table.grid tr')].find(row => row.textContent.includes('灵能枢') && row.textContent.includes('Lv.0'))
    coreRow()?.querySelector('[aria-label="灵能枢祭炼详情"]')?.focus()
    await new Promise(r => setTimeout(r, 180))
    const zeroRows = tipSectionRows(doc.querySelector('.tip'), '效果')
    ok('无供能的灵能枢显示停效与实际零加成', coreRow()?.textContent.includes('缺灵能停效') && zeroRows.length === 3 && zeroRows.every(el => /^\+0(?:%)?$/.test(el.querySelector('.v')?.textContent || '')))
    doc.activeElement?.blur()
    await new Promise(r => setTimeout(r, 30))
    ok('技艺页不再出现储物袋与纳物诀', !doc.querySelector('.main')?.textContent.includes('储物袋') && !doc.querySelector('.main')?.textContent.includes('纳物诀'))
    state.resources.qiEnergy = 10
    engine.recompute(state, derived)
    await new Promise(r => setTimeout(r, 50))
    coreRow()?.dispatchEvent(new window.MouseEvent('mouseenter'))
    await new Promise(r => setTimeout(r, 340))
    const currentEffects = tipSectionRows(doc.querySelector('.tip'), '效果')
    ok('补充灵能后界面恢复满供效果', coreRow()?.textContent.includes('供能 100%') && currentEffects.some(el => el.querySelector('.k')?.textContent === '灵气 产出' && el.querySelector('.v')?.textContent === '+50%'))
    ok('法宝当前效果每项独立一行', currentEffects.length === 3 && currentEffects.map(el => el.querySelector('.k')?.textContent).join('|') === '灵气 产出|灵机 产出|加工供能容量' && currentEffects.every(el => !/[，、；]/.test(el.querySelector('.v')?.textContent || '')))
    const nextEffects = tipSectionRows(doc.querySelector('.tip'), '祭炼后满供 · Lv.1 ×1.30')
    ok('祭炼后预览每项独立一行并使用下一等级倍率', nextEffects.length === 3 && nextEffects.some(el => el.querySelector('.k')?.textContent === '灵气 产出' && el.querySelector('.v')?.textContent === '+65%'))
    ok('法宝提示显示持续耗能和缺供规则', doc.querySelector('.tip')?.textContent.includes('满供消耗') && doc.querySelector('.tip')?.textContent.includes('供能不足按比例运行'))
    coreRow()?.dispatchEvent(new window.MouseEvent('mouseleave'))
    actions.importText(previous)
    await new Promise(r => setTimeout(r, 50))
  }
  {
    const previous = actions.exportText()
    actions.importText(JSON.stringify({
      realm: 5,
      resources: { stone: 60, spiritLiquid: 6 },
      upgrades: { spiritMortarArt: true },
      buildings: { workshop: { count: 1, on: true } },
      ui: { tab: 'craft', craftFilter: 'advanced' },
    }))
    await new Promise(r => setTimeout(r, 50))
    const row = doc.querySelector('.main [data-craft="mixSpiritMortar"]')
    ok('进阶炼制展示混灵土配方及灵石灵液用料', !!row && /灵石\s*20/.test(row.textContent) && /灵液\s*2/.test(row.textContent))
    ok('混灵土开放时不提前展示高阶建材配方', !doc.querySelector('.main [data-craft="smeltArcaneGold"]') && !doc.querySelector('.main [data-craft="fuseCrystalSilver"]'))
    row?.querySelector('.btn.primary')?.click()
    await new Promise(r => setTimeout(r, 50))
    ok('界面混灵土立即制作并统一按钮文字', !state.craftOrders.mixSpiritMortar && state.resources.spiritMortar === 1 && state.resources.stone === 40 && state.resources.spiritLiquid === 4 && !row.textContent.includes('投单'))
    state.craftOrders.mixSpiritMortar = { remaining: 1, paused: false }
    engine.recompute(state, derived)
    await new Promise(r => setTimeout(r, 30))
    const pause = doc.querySelector('[aria-label="拌制混灵土暂停订单"]')
    pause?.click()
    await new Promise(r => setTimeout(r, 30))
    ok('订单暂停按钮释放工位且保存暂停状态', state.craftOrders.mixSpiritMortar?.paused && engine.processingPlan(state, derived).mixSpiritMortar.work === 0)
    doc.querySelector('[aria-label="拌制混灵土恢复订单"]')?.click()
    await new Promise(r => setTimeout(r, 30))
    engine.runAutoCraft(state, derived, 10)
    engine.recompute(state, derived)
    await new Promise(r => setTimeout(r, 30))
    ok('恢复旧订单通过工位扣料并取得整数建材', state.resources.spiritMortar === 2 && state.resources.stone === 20 && state.resources.spiritLiquid === 2 && !state.craftOrders.mixSpiritMortar)
    state.craftOrders.mixSpiritMortar = { remaining: 1, paused: false }
    engine.recompute(state, derived)
    await new Promise(r => setTimeout(r, 30))
    doc.querySelector('[aria-label="拌制混灵土取消订单"]')?.click()
    await new Promise(r => setTimeout(r, 30))
    ok('取消旧订单按钮不额外扣费', !state.craftOrders.mixSpiritMortar && state.resources.stone === 20)
    row.querySelectorAll('.craft-line > button')[3]?.click()
    await new Promise(r => setTimeout(r, 30))
    ok('工业配方全部按钮即时合成剩余材料', state.resources.spiritMortar === 3 && state.resources.stone === 0 && state.resources.spiritLiquid === 0 && !state.craftOrders.mixSpiritMortar)
    actions.importText(previous)
    await new Promise(r => setTimeout(r, 50))
  }
  Object.assign(context, { ok, window, state, derived, ui, actions, engine, doc })
}
