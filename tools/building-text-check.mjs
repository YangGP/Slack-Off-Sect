/** 单项快速回归：建筑提示与实际经济结算保持一致。 */
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const { describeBuildingEffects, describeEffects } = await server.ssrLoadModule('/src/game/effectsText.js')
  const { createInitialState } = await server.ssrLoadModule('/src/game/state.js')
  const { createDerived } = await server.ssrLoadModule('/src/game/systems/core.js')
  const { recomputeRaw } = await server.ssrLoadModule('/src/game/systems/economy.js')
  const { BUILDINGS, BUILDING_MAP } = await server.ssrLoadModule('/src/data/buildings.js')
  const { money } = await server.ssrLoadModule('/src/game/decimal.js')
  const { fmtRate, fmtEffectPercent } = await server.ssrLoadModule('/src/game/format.js')
  const state = createInitialState()
  const derived = createDerived()
  state.upgrades.energyApplication = true
  state.buildings = Object.fromEntries(['splitArray', 'polarizeArray', 'annihilationFurnace', 'immortalArray', 'ironFurnace', 'spiritField']
    .map(id => [id, { count: 2, on: true, power: 'energy' }]))
  const supply = { splitArray: 0.5, polarizeArray: 0.5, annihilationFurnace: 0.5, immortalArray: 0.5 }
  recomputeRaw(state, derived, supply)
  derived.buildingSupply = supply
  for (const id of Object.keys(state.buildings)) {
    for (const res of Object.keys(BUILDING_MAP[id].effects.prod)) {
      const row = describeBuildingEffects(BUILDING_MAP[id], state, derived).find(row => row.resource === res && row.value.endsWith('/秒'))
      const source = derived.sources[res].find(source => source.kind === 'building' && source.id === id)
      assert.equal(row.total, fmtRate(source.value), `${id} ${res} 当前合计`)
    }
  }
  const rows = id => describeBuildingEffects(BUILDING_MAP[id], state, derived)
  assert.equal(rows('annihilationFurnace')[0].value, fmtRate(money('0.045')))
  state.buildings.warehouse = { count: 2, on: true }
  state.legacyStorage = { warehouse: { count: 1, storage: { wood: money(14000) } } }
  assert.equal(rows('warehouse').find(row => row.label === '灵木 上限').total, '+15k')
  assert.equal(fmtEffectPercent(0.0015), '0.15%')
  assert.notEqual(fmtEffectPercent(1e-10), '0%')
  derived.buildingSupply.spiritLockArray = 0.01
  state.buildings.spiritLockArray = { count: 1, on: true }
  assert.equal(rows('spiritLockArray').find(row => row.label === '灵气 产出').total, '+0.15%')
  state.buildings.quietGarden = { count: 1, on: true, power: 'energy' }
  assert.equal(rows('quietGarden').find(row => row.label === '宜居度').total, '+22.40')
  state.buildings.quarry = { count: 2, on: true }
  const oreRow = () => rows('quarry').find(row => row.label === '矿工 额外产出')
  assert.match(oreRow().value, /玄铁 \+0\.02\/秒·人（需《探矿术》）/)
  assert.match(oreRow().total, /玄铁 \+0\/秒·人/)
  state.upgrades.prospectStudy = true
  assert.equal(oreRow().total, oreRow().value)
  state.upgrades.earthEssence = true
  assert.equal(rows('warehouse').find(row => row.label === '灵木 上限').value, '+5k')
  assert.equal(rows('warehouse').find(row => row.label === '灵木 上限').total, '+19k')
  delete state.upgrades.earthEssence
  state.buildings.mountainArray = { count: 6, on: true }
  state.buildings.spiritLockArray = { count: 30, on: true }
  derived.buildingSupply.spiritLockArray = 1
  assert.match(rows('mountainArray').find(row => row.label === '灾害损失').total, /^-80%/)
  assert.match(rows('spiritLockArray').find(row => row.label === '弟子灵气消耗').total, /^-85%/)
  state.buildings.splitArray.on = false
  assert.equal(rows('splitArray')[0].total, '0/秒')
  state.buildings.warehouse.on = false
  assert.equal(rows('warehouse').find(row => row.label === '灵木 上限').total, '+15k')
  for (const meta of BUILDINGS) {
    // 天工坊通过配方前置开放合成，没有独立数值效果行。
    if (meta.id === 'heavenWorkshop') assert.deepEqual(describeBuildingEffects(meta, state, derived), [])
    else assert.ok(describeBuildingEffects(meta, state, derived).length, meta.id)
  }
  assert.doesNotMatch(describeEffects({ storageAll: 1 })[0].text, /成品按层级/)
  const { descriptor, errors } = parse(readFileSync('src/components/BuildingButton.vue', 'utf8'))
  assert.deepEqual(errors, [])
  compileScript(descriptor, { id: 'building-text-check' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'BuildingButton.vue', id: 'building-text-check' }).errors, [])
  console.log(`建筑文本快速回归通过：${BUILDINGS.length}种建筑、产出/供能/供应、自用能、旧档仓容、工艺强化、上限、停用、小额百分比、宜居度、矿工研究副产及Vue编译。`)
} finally {
  await server.close()
}
