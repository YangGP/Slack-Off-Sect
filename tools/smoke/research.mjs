import { createInitialState, normalizeState } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { RESOURCES } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { CULTIVATION, ALL_UPGRADES, UPGRADE_MAP } from '../../src/data/upgrades.js'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { ASCEND_REALM_INDEX } from '../../src/data/realms.js'
import { exportSave, parseImport } from '../../src/game/save.js'
import { unlockText, unlockGroups, unlockMismatches, effectLine, effectRows } from '../../src/game/unlockText.js'
import { describeEffects } from '../../src/game/effectsText.js'
import { newGame } from './fixtures.mjs'

export function researchCostProgression({ ok, section }) {
  section('修真灵机费用沿直接研究前置递进')
  const ids = new Set(CULTIVATION.map(u => u.id))
  const inversions = CULTIVATION.flatMap(u =>
    [...(u.needs?.upgrades || []), ...(u.needs?.upgrade ? [u.needs.upgrade] : [])]
      .filter(id => ids.has(id) && u.cost.insight < UPGRADE_MAP[id].cost.insight)
      .map(id => `${UPGRADE_MAP[id].name} → ${u.name}`))
  ok('修真直接前置不存在灵机费用倒挂', inversions.length === 0, inversions.join('；'))
  ok('开局营造与凿石仍在基础灵机仓容内',
    UPGRADE_MAP.homePlanning.cost.insight <= 200 && UPGRADE_MAP.quarryArt.cost.insight <= 200)
  const { state: s, derived: d } = newGame()
  s.upgrades.qiPurify = true
  s.resources.insight = E.money(UPGRADE_MAP.condenseArt.cost.insight)
  E.recompute(s, d)
  ok('凝灵诀按新报价支付且保留原资格', E.research(s, d, 'condenseArt') && s.resources.insight.eq(0))
}

export function researchVisibility({ ok, section }) {
  section('同类修真递进与显示门槛')
  {
    const edges = [
      ['qiPurify', 'condenseArt'], ['qiPurify', 'liquidVault'],
      ['qiGazing', 'homePlanning'],
      // 灵气测定→凝气化液与 v2 迁移的旧链回填一致：旧档学过凝气化液会被补发灵气测定（migrations.js）。
      ['qiMeasure', 'qiLiquid', 'backfill'],
      ['steelWorking', 'artifactLore'], ['conductionRune', 'guardRune'],
      ['conductionRune', 'capacityRune'], ['crystalCraft', 'precipitateTheory'],
      ['spiritCanal', 'liquidIrrigation'], ['spiritCanal', 'veinInfuse'],
      ['incenseStudy', 'recruitDrive'], ['particleTheory', 'particleRecover'],
      ['qiLiquid', 'breakthroughArt'], ['earthEssence', 'steelWorking'],
      ['arrayAssembly', 'waterworkshop'], ['steelWorking', 'beastMaterialArt'],
      ['paperArt', 'preachArt'], ['preachArt', 'incenseStudy'],
    ]
    for (const [previous, next, backfill] of edges) {
      const { state: s } = newGame()
      s.realm = ASCEND_REALM_INDEX
      for (const u of ALL_UPGRADES) s.upgrades[u.id] = true
      for (const b of BUILDINGS) s.buildings[b.id] = { count: 200, on: true }
      for (const res of RESOURCES) s.resources[res.id] = E.money(1e9)
      delete s.upgrades[previous]
      delete s.upgrades[next]
      const meta = UPGRADE_MAP[next]
      ok(`库存与建筑充足也不能提前显示或研究${meta.name}`,
        !E.isProgressionVisible(s, meta.needs) && !E.isUpgradeUnlocked(s, meta))
      s.upgrades[previous] = true
      ok(`完成${UPGRADE_MAP[previous].name}后显示并开放${meta.name}`,
        E.isProgressionVisible(s, meta.needs) && E.isUpgradeUnlocked(s, meta))
      const legacy = normalizeState({ upgrades: { [next]: true } })
      ok(`旧档已学${meta.name}无需补学新前置即可保留资格`,
        legacy.upgrades[next] && E.isUpgradeUnlocked(legacy, meta) &&
          (backfill ? legacy.upgrades[previous] : !legacy.upgrades[previous]))
    }
    const visited = new Set(), active = new Set()
    const visit = id => {
      if (active.has(id) || !UPGRADE_MAP[id]) return false
      if (visited.has(id)) return true
      active.add(id)
      const needs = UPGRADE_MAP[id].needs
      if (![...(needs?.upgrades || []), ...(needs?.upgrade ? [needs.upgrade] : [])].every(visit)) return false
      active.delete(id)
      visited.add(id)
      return true
    }
    ok('包含跨页前置的完整研究图没有循环或缺失节点', ALL_UPGRADES.every(u => visit(u.id)))
  }
}

export function researchUnlocks({ ok, section }) {
  section('修真线第一阶段：先懂原理才能盖')
  {
    const qi = UPGRADE_MAP.qiOrigin
    ok(
      '灵源考保留研究入口，不再解锁重复的产能建筑',
      unlockGroups(qi.id).upgrades.includes('观气法') && !(qi.effects.unlockBuildings || []).length,
      JSON.stringify(qi.effects),
    )
    ok(
      '灵泉灌溉由聚灵大阵承接，建筑表不再包含灵脉井',
      !BUILDING_MAP.spiritVein && UPGRADE_MAP.spiritIrrigation.needs.building.id === 'gatheringArray',
      JSON.stringify(UPGRADE_MAP.spiritIrrigation.needs),
    )
    const gazing = UPGRADE_MAP.qiGazing
    ok('观气法承接阵法精要，大阵由阵法精要开放', !!gazing && !(gazing.effects.unlockBuildings || []).includes('gatheringArray') && unlockGroups('fieldTillage').buildings.includes('聚灵大阵'))
    ok(
      '聚灵大阵的门槛从「有藏经阁」改成研究放行',
      (BUILDING_MAP.gatheringArray.needs.upgrades || []).includes('qiGazing'),
      JSON.stringify(BUILDING_MAP.gatheringArray.needs),
    )

    // 界面按数据文件顺序展示：锚点保证模块节点插回原位而不是掉到列表末尾。
    const ids = CULTIVATION.map((u) => u.id)
    ok(
      '列表以基础建筑研究开头，其后紧接主线「观气」章（灵源考 → 观气法 → 灵气测定 → 凝气化液）',
      ids.slice(0, 6).join(',') === 'openMine,qiOrigin,qiGazing,qiMeasure,qiLiquid,liquidArt',
      ids.slice(0, 6).join(','),
    )
    ok(
      '猎杀研究按锚点插回原位（山野猎法在引泉净水后、兽材加工在石作规制后）',
      ids[ids.indexOf('waterSanitation') + 1] === 'wildHunting' &&
        ids[ids.indexOf('stoneWorks') + 1] === 'beastMaterialArt',
      `${ids[ids.indexOf('waterSanitation') + 1]},${ids[ids.indexOf('stoneWorks') + 1]}`,
    )
    ok('修真节点数量（A 项铺满时间线后应不少于 28）', CULTIVATION.length >= 28, String(CULTIVATION.length))
  }
  section('解锁清单（B 项）：修真节点必须真的开出东西')
  {
    const mismatches = unlockMismatches()
    ok('节点的「解锁声明」与建筑的「门槛」一致', mismatches.length === 0, mismatches.slice(0, 3).join('；'))

    const empty = CULTIVATION.filter((u) => {
      const g = unlockGroups(u.id)
      const hasRule = Object.keys(u.effects || {}).some((k) => k !== 'unlockBuildings')
      return g.buildings.length === 0 && g.upgrades.length === 0 && g.crafts.length === 0 && !hasRule
    }).map((u) => u.name)
    ok('每个修真节点至少开出一样东西（建筑 / 配方 / 参悟 / 规则）', empty.length === 0, empty.join('、'))

    const t1 = unlockText('qiOrigin')
    ok('灵源考的解锁清单保留观气法与引气诀', t1.includes('观气法') && t1.includes('引气诀'), t1)
    const t2 = unlockText('qiGazing')
    ok('观气法的解锁清单里有聚灵大阵', t2.includes('聚灵大阵'), t2)
    const t3 = unlockText('alchemyArt')
    ok('炼丹术的清单里有炼丹房与采药制丹', t3.includes('炼丹房') && t3.includes('采药制丹'), t3)
  }
}
