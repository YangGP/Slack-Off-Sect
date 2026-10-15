import { createInitialState, normalizeState, resetForReincarnation } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { RESOURCE_GROUPS, VISIBLE_RESOURCES } from '../../src/data/resources.js'
import { runAlchemyMigrationChecks } from '../alchemy-migration-check.mjs'
import { exportSave, parseImport } from '../../src/game/save.js'
import { newGame } from './fixtures.mjs'

export function saveSerialization({ ok, close, section }) {
  section('存档序列化')
  {
    const { state, derived } = newGame()
    state.resources.qi = 1234.5
    state.resources.stone = 42
    state.buildings = { hut: { count: 7, on: true } }
    state.disciples.total = 9
    state.upgrades.qiArt = true
    state.achievements.firstHut = true
    state.realm = 3
    state.karma = 12
    state.ui.collapsedResourceGroups = { basic: true, materials: true }
    state.log = Array.from({ length: 100 }, (_, i) => ({ id: i, at: Date.now(), text: 'x', kind: 'info' }))

    const text = exportSave(state)
    ok('导出得到可复制文本', typeof text === 'string' && text.length > 20)
    const parsed = parseImport(text)
    ok('导入后资源一致', close(parsed.resources.qi, 1234.5))
    ok('导入后建筑一致', parsed.buildings.hut.count === 7)
    ok('导入后境界一致', parsed.realm === 3)
    ok('导入后仙缘一致', parsed.karma === 12)
    ok('资源折叠偏好随导出导入保留', parsed.ui.collapsedResourceGroups.basic && parsed.ui.collapsedResourceGroups.materials)
    ok('导入后日志被截断到 60 条', parsed.log.length === 60, `实际 ${parsed.log.length}`)
    ok('导入后不含内存字段 __max', parsed.__max === undefined)

    const json = JSON.stringify(parsed)
    const again = normalizeState(JSON.parse(json))
    ok('二次序列化稳定', again.realm === 3 && again.resources.stone === 42)

    let threw = false
    try {
      parseImport('这不是存档')
    } catch (err) {
      threw = true
    }
    ok('非法存档会抛错', threw)
  }
}

export function resourceGroupMigration({ ok, section }) {
  section('资源分组与旧档兼容')
  {
    const ids = RESOURCE_GROUPS.flatMap(group => group.resources)
    ok('每个可见资源恰好属于一个分组', ids.length === VISIBLE_RESOURCES.length && new Set(ids).size === ids.length && VISIBLE_RESOURCES.every(id => ids.includes(id)))
    const old = createInitialState()
    delete old.ui.collapsedResourceGroups
    ok('旧档默认展开所有资源组', Object.keys(normalizeState(old).ui.collapsedResourceGroups).length === 0)
    old.ui.collapsedResourceGroups = { basic: true, materials: 'true', unknown: true }
    ok('读档过滤未知分组与异常折叠值', JSON.stringify(normalizeState(old).ui.collapsedResourceGroups) === '{"basic":true}')
    old.ui.collapsedResourceGroups = ['basic']
    ok('损坏的分组偏好回落默认值且不影响进度', Object.keys(normalizeState(old).ui.collapsedResourceGroups).length === 0)
  }
}

export function quickCraftPreferences({ ok, section }) {
  section('快捷炼制偏好兼容')
  {
    const initial = createInitialState()
    ok('新档默认保留凝石制丹木板快捷', initial.settings.quickCrafts.join(',') === 'infuseStone,refinePill,sawPlank')
    const old = normalizeState({ settings: { autoCraftOn: false } })
    ok('旧档补齐快捷且不改变自动总开关', old.settings.quickCrafts.length === 3 && old.settings.autoCraftOn === false)
    const malformed = normalizeState({ settings: { quickCrafts: ['unknown', 'constructor', 'toString', 'infuseStone', 'infuseStone', null, 'refinePill', 'sawPlank', 'refineSteel', 'drawTalisman'] } })
    ok('快捷导入去重过滤无效项且保留超过四个配方', malformed.settings.quickCrafts.join(',') === 'infuseStone,refinePill,sawPlank,refineSteel,drawTalisman')
    const empty = normalizeState({ settings: { quickCrafts: [] } })
    ok('允许玩家清空快捷偏好', empty.settings.quickCrafts.length === 0)
    malformed.ui.tab = 'craft'
    const restored = normalizeState(JSON.parse(JSON.stringify(malformed)))
    ok('炼制页与快捷偏好能存读档', restored.ui.tab === 'craft' && restored.settings.quickCrafts.join(',') === malformed.settings.quickCrafts.join(','))
    resetForReincarnation(restored, 0)
    ok('转世保留全部快捷偏好', restored.settings.quickCrafts.includes('refineSteel') && restored.settings.quickCrafts.length === 5)
  }
}

export function alchemyMigration({ ok, section }) {
  section('丹道存档迁移')
  runAlchemyMigrationChecks(E, ok)
}
