import { createInitialState, normalizeState, resetForReincarnation } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { RESOURCE_GROUPS, VISIBLE_RESOURCES } from '../../src/data/resources.js'
import { exportSave, parseImport, serialize, createSaveRepository, SAVE_KEY, LEGACY_SAVE_KEY } from '../../src/game/save.js'
import { newGame } from './fixtures.mjs'

export function saveSerialization({ ok, close, section }) {
  section('存档序列化')
  {
    const { state, derived } = newGame()
    state.resources.qi = E.money(1234.5)
    state.resources.stone = E.money(42)
    state.buildings = { hut: { count: 7, on: true } }
    state.disciples.total = 9
    state.upgrades.qiArt = true
    state.achievements.firstHut = true
    state.realm = 3
    state.karma = E.money(12)
    state.ui.collapsedResourceGroups = { basic: true, materials: true }
    state.log = Array.from({ length: 100 }, (_, i) => ({ id: i, at: Date.now(), text: 'x', kind: 'info' }))

    const text = exportSave(state)
    ok('导出得到可复制文本', typeof text === 'string' && text.length > 20)
    const parsed = parseImport(text)
    ok('导入后资源一致', close(parsed.resources.qi, 1234.5))
    ok('导入后建筑一致', parsed.buildings.hut.count === 7)
    ok('导入后境界一致', parsed.realm === 3)
    ok('导入后仙缘一致', E.moneyEq(parsed.karma, 12))
    ok('资源折叠偏好随导出导入保留', parsed.ui.collapsedResourceGroups.basic && parsed.ui.collapsedResourceGroups.materials)
    ok('导入后日志被截断到 60 条', parsed.log.length === 60, `实际 ${parsed.log.length}`)
    ok('导入后不含内存字段 __max', parsed.__max === undefined)

    const json = JSON.stringify(parsed)
    const again = normalizeState(JSON.parse(json))
    ok('二次序列化稳定', again.realm === 3 && E.moneyEq(again.resources.stone, 42))

    let threw = false
    try {
      parseImport('这不是存档')
    } catch (err) {
      threw = true
    }
    ok('非法存档会抛错', threw)
  }
  {
    const state = createInitialState()
    state.resources.daoHeart = E.money('0.8')
    state.faithProgression.cultivation.realmDevotion = 3
    state.faithProgression.totalDaoHeart = E.money('7.8')
    state.__debugProductionBoost = true
    const payload = serialize(state)
    const restored = parseImport(JSON.stringify(payload))
    ok('道心余额、累计与永久等级保存恢复', restored.resources.daoHeart.eq('0.8') &&
      restored.faithProgression.totalDaoHeart.eq('7.8') && restored.faithProgression.cultivation.realmDevotion === 3)
    ok('DEBUG产出开关不进入存档', !('__debugProductionBoost' in payload) && restored.__debugProductionBoost === undefined)
    const missing = { ...payload }
    delete missing.faithProgression
    ok('同代缺失香火切片补默认值', parseImport(JSON.stringify(missing)).faithProgression.cultivation.realmDevotion === 0)
    for (const conflict of [
      { faithProgression: [] },
      { faithProgression: { ...payload.faithProgression, cultivation: [] } },
      { faithProgression: { ...payload.faithProgression, rituals: 'broken' } },
      { resources: [] }, { version: 999 }, { ruleset: 'legacy' },
    ]) {
      const raw = JSON.stringify({ ...payload, ...conflict })
      const records = new Map([[SAVE_KEY, raw], [LEGACY_SAVE_KEY, 'original legacy payload']])
      const repo = createSaveRepository({ storage: {
        getItem: key => records.get(key) ?? null,
        setItem: (key, value) => records.set(key, value),
      }, warn: () => {} })
      const label = JSON.stringify(conflict)
      ok('损坏或异代档阻止加载与写回：' + label, repo.load() === null && !!repo.loadError &&
        repo.save(state) === false && records.get(SAVE_KEY) === raw && records.get(LEGACY_SAVE_KEY) === 'original legacy payload')
      let rejected = false
      try { parseImport(raw) } catch { rejected = true }
      ok('损坏或异代导入拒绝且不改当前局：' + label, rejected && state.resources.daoHeart.eq('0.8') &&
        state.faithProgression.cultivation.realmDevotion === 3)
    }
  }
}
