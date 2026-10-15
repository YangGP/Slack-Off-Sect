import { createInitialState, normalizeState } from '../../src/game/state.js'
import * as E from '../engine-fixture.mjs'
import { RESOURCES } from '../../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../../src/data/buildings.js'
import { CULTIVATION, ALL_UPGRADES, UPGRADE_MAP, CULTIVATION_STAGE_OF, CULTIVATION_STAGES } from '../../src/data/upgrades.js'
import { CRAFT_MAP } from '../../src/data/crafts.js'
import { ASCEND_REALM_INDEX } from '../../src/data/realms.js'
import { exportSave, parseImport } from '../../src/game/save.js'
import { unlockText, unlockGroups, unlockMismatches, effectLine, effectRows } from '../../src/game/unlockText.js'
import { describeEffects } from '../../src/game/effectsText.js'
import { newGame } from './fixtures.mjs'

export function earlyResearch({ ok, section }) {
  section('金丹前修真按知识与产业递进')
  {
    const { state: s } = newGame()
    s.upgrades.forgeArt = true
    s.upgrades.qiGazing = true
    ok('炼器术后需建炼器坊才开放符箓入门', !E.isUpgradeUnlocked(s, UPGRADE_MAP.talismanArt))
    s.buildings.forge = { count: 1, on: true }
    ok('符箓分支不要求先学自动制作', E.isUpgradeUnlocked(s, UPGRADE_MAP.talismanArt) && !s.upgrades.intuition)
    s.upgrades.earthArt = true
    s.upgrades.talismanArt = true
    ok('香火愿需先建符箓堂', !E.isUpgradeUnlocked(s, UPGRADE_MAP.incenseVow))
    s.buildings.talismanHall = { count: 1, on: true }
    ok('香火分支不依赖流水作坊', E.isUpgradeUnlocked(s, UPGRADE_MAP.incenseVow) && !s.upgrades.waterworkshop)
    s.realm = 3
    s.upgrades.alchemyArt = true
    ok('破境心法需先掌握丹火', !E.isUpgradeUnlocked(s, UPGRADE_MAP.breakthroughArt))
    s.upgrades.alchemyFire = true
    s.upgrades.qiLiquid = true
    ok('破境心法不强制先发展香火', E.isUpgradeUnlocked(s, UPGRADE_MAP.breakthroughArt) && !s.upgrades.incenseVow)
    s.upgrades.deepShaft = true
    s.buildings.forge = { count: 3, on: true }
    ok('玄钢未开放前御剑术不提前展示', !E.isUpgradeUnlocked(s, UPGRADE_MAP.swordFlight) && !E.isProgressionVisible(s, UPGRADE_MAP.swordFlight.needs))
  }
}

export function woodworkingResearch({ ok, section }) {
  section('木作器械后的修真递进链')
  {
    const { state: s, derived: d } = newGame()
    for (const id of ['prospectStudy', 'woodworking', 'alchemyArt']) s.upgrades[id] = true
    s.buildings.ironFurnace = { count: 1, on: true }
    s.buildings.alchemyRoom = { count: 1, on: true }
    const chain = ['earthArt', 'forgeArt', 'intuition']
    E.recompute(s, d)
    for (const id of chain) {
      const available = chain.filter(next => !s.upgrades[next] && E.isUpgradeUnlocked(s, E.UPGRADE_MAP[next]))
      ok(`递进阶段只开放${E.UPGRADE_MAP[id].name}`, available.length === 1 && available[0] === id, available.join(','))
      for (const next of chain.filter(next => !s.upgrades[next] && next !== id)) {
        ok(`${E.UPGRADE_MAP[id].name}完成前不预告${E.UPGRADE_MAP[next].name}`, !E.isProgressionVisible(s, E.UPGRADE_MAP[next].needs))
      }
      for (const [res, cost] of Object.entries(E.UPGRADE_MAP[id].cost)) s.resources[res] = cost
      ok(`${E.UPGRADE_MAP[id].name}可通过正常参悟推进`, E.research(s, d, id))
    }
    ok('自动制作后流水作坊仍等待阵基装配', !E.isUpgradeUnlocked(s, E.UPGRADE_MAP.waterworkshop))
    const legacy = createInitialState()
    legacy.upgrades.waterworkshop = true
    ok('已掌握流水作坊不因新前置而失效', E.isUpgradeUnlocked(legacy, E.UPGRADE_MAP.waterworkshop))
  }
}

export function researchVisibility({ ok, section }) {
  section('同类修真递进与显示门槛')
  {
    const edges = [
      ['qiPurify', 'condenseArt'], ['qiPurify', 'liquidVault'],
      ['steelWorking', 'artifactLore'], ['conductionRune', 'guardRune'],
      ['conductionRune', 'capacityRune'], ['crystalCraft', 'precipitateTheory'],
      ['spiritCanal', 'liquidIrrigation'], ['spiritCanal', 'veinInfuse'],
      ['incenseStudy', 'recruitDrive'], ['yinyangSplit', 'particleRecover'],
      ['qiLiquid', 'breakthroughArt'], ['earthEssence', 'steelWorking'],
      ['arrayAssembly', 'waterworkshop'], ['steelWorking', 'beastMaterialArt'],
      ['arrayAssembly', 'preachArt'], ['preachArt', 'incenseStudy'],
    ]
    for (const [previous, next] of edges) {
      const { state: s } = newGame()
      s.realm = ASCEND_REALM_INDEX
      for (const u of ALL_UPGRADES) s.upgrades[u.id] = true
      for (const b of BUILDINGS) s.buildings[b.id] = { count: 200, on: true }
      for (const res of RESOURCES) s.resources[res.id] = 1e9
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
        legacy.upgrades[next] && E.isUpgradeUnlocked(legacy, meta) && !legacy.upgrades[previous])
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

export function goldenCoreResearch({ ok, section }) {
  section('金丹九项研究分成三个入口')
  {
    const { state: s, derived: d } = newGame()
    s.realm = 4
    for (const id of ['qiGazing', 'alchemyArt', 'alchemyFire', 'earthArt', 'woodworking', 'intuition',
      'forgeArt', 'talismanArt', 'qiRune', 'shapeRune', 'incenseVow', 'wildHunting', 'qiMeasure']) s.upgrades[id] = true
    for (const b of BUILDINGS) s.buildings[b.id] = { count: 200, on: true }
    for (const res of RESOURCES) s.resources[res.id] = 1e9
    E.recompute(s, d)
    const candidates = ['breakthroughArt', 'qiLiquid', 'waterworkshop', 'steelWorking', 'conductionRune',
      'incenseStudy', 'earthEssence', 'beastMaterialArt', 'preachArt']
    const visible = candidates.filter(id => E.isProgressionVisible(s, UPGRADE_MAP[id].needs))
    ok('金丹同一前置进度的九项只显示化液、导灵、土木三个入口',
      visible.length === 3 && ['qiLiquid', 'conductionRune', 'earthEssence'].every(id => visible.includes(id)), visible.join(','))
    ok('化液后才开放破境心法', E.research(s, d, 'qiLiquid') && E.isUpgradeUnlocked(s, UPGRADE_MAP.breakthroughArt))
    ok('土木精要后才开放淬玄工艺', E.research(s, d, 'earthEssence') && E.isUpgradeUnlocked(s, UPGRADE_MAP.steelWorking))
    ok('实际淬玄研究后开放兽材加工，作坊走独立工程分支', E.research(s, d, 'steelWorking') &&
      !E.isUpgradeUnlocked(s, UPGRADE_MAP.waterworkshop) && E.isUpgradeUnlocked(s, UPGRADE_MAP.beastMaterialArt))
    ok('导灵及阵基装配后才开放讲经', E.research(s, d, 'conductionRune') && E.research(s, d, 'arrayAssembly') &&
      E.isUpgradeUnlocked(s, UPGRADE_MAP.preachArt) && E.isUpgradeUnlocked(s, UPGRADE_MAP.waterworkshop) && !E.isUpgradeUnlocked(s, UPGRADE_MAP.incenseStudy))
    ok('讲经后才开放香火志', E.research(s, d, 'preachArt') && E.isUpgradeUnlocked(s, UPGRADE_MAP.incenseStudy))
  }
}

export function researchRegressions({ ok, close, section }) {
  section('本轮评估问题回归')
  {
    const { state: s, derived: d } = newGame()
    s.buildings.quarry = { count: 1, on: true }
    s.buildings.spiritQuarry = { count: 1, on: true }
    s.upgrades.prospectStudy = true
    s.disciples.total = 1
    s.disciples.jobs.miner = 1
    E.recompute(s, d)
    const before = { ...d.rates }
    s.upgrades.ironPick = true
    E.recompute(s, d)
    ok('玄铁镐与采矿场矿石加成相加，不提高玄铁和天然灵石', close(d.rates.rock, before.rock * 1.4 / 1.1, 1e-9) && close(d.rates.ore, before.ore, 1e-9) && close(d.rates.stone, before.stone, 1e-9))
    s.treasureLevels.ironPick = 2
    E.recompute(s, d)
    ok('玄铁镐祭炼仍只提高矿石', close(d.rates.rock, before.rock * 1.58 / 1.1, 1e-9) && close(d.rates.ore, before.ore, 1e-9) && close(d.rates.stone, before.stone, 1e-9))
    for (const [id, fixed] of [['grotto', 15000], ['heavenTower', 40000]]) {
      const { state: storageState, derived: storageDerived } = newGame()
      const base = storageDerived.max.insight
      storageState.buildings[id] = { count: 1, on: false }
      E.recompute(storageState, storageDerived)
      ok(`${E.BUILDING_MAP[id].name}保留灵机定额与通用仓储`, storageDerived.max.insight === base + fixed + E.BUILDING_MAP[id].effects.storageAll)
    }
    ok('料场归入仓储分类', E.BUILDING_MAP.materialYard.group === 'store')
    const tools = E.UPGRADE_MAP.temperedTools
    s.upgrades.forgeArt = true
    ok('百炼工具在淬玄工艺前保持锁定', !E.isUpgradeUnlocked(s, tools))
    s.upgrades.steelWorking = true
    ok('掌握淬玄工艺后开放百炼工具', E.isUpgradeUnlocked(s, tools))
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

    // 界面按研究分组排序，同组保持节点数据顺序。
    const ids = CULTIVATION.map((u) => u.id)
    const unstaged = ids.filter((id) => !CULTIVATION_STAGE_OF[id])
    ok('每个修真节点都归入研究分组（灵气五章、心法、材料与经营）', unstaged.length === 0, unstaged.join(','))
    const groupedIds = CULTIVATION_STAGES.flatMap(stage => stage.ids)
    ok('研究分组不重复收录节点或引用失效节点', groupedIds.length === new Set(groupedIds).size &&
      groupedIds.every(id => ids.includes(id)))
    ok(
      '第一章是「观气」（灵源考 + 观气法同章且在最前）',
      ids[0] === 'qiOrigin' &&
        CULTIVATION_STAGE_OF.qiGazing?.index === CULTIVATION_STAGE_OF.qiOrigin?.index &&
        CULTIVATION_STAGE_OF.qiOrigin?.index === 0,
      ids.slice(0, 4).join(','),
    )
    ok('修真节点数量（A 项铺满时间线后应不少于 28）', CULTIVATION.length >= 28, String(CULTIVATION.length))

    // 不变量：修真层不该有「什么都不做」的装饰性节点
    const decorative = CULTIVATION.filter((u) => Object.keys(u.effects || {}).length === 0).map((u) => u.name)
    ok('没有空效果的装饰性节点', decorative.length === 0, decorative.join('、'))
  }
}

export function unlockCatalog({ ok, section }) {
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

export function researchEffectsText({ ok, section }) {
  section('修真页的效果文本：同一件事只说一遍')
  {
    const lines = CULTIVATION.map((u) => ({ name: u.name, text: effectLine(u, describeEffects) }))
    // 2026 实测的那次异常：describeEffects、unlockText、手写 note 三处都渲染，
    // 于是"解锁建筑 聚灵大阵；解锁建筑：聚灵大阵；…；解锁建筑：聚灵大阵"。
    const dup = lines.filter((l) => (l.text.match(/解锁建筑/g) || []).length > 1).map((l) => l.name)
    ok('效果文本里「解锁建筑」至多出现一次', dup.length === 0, dup.join('、') || '全部正常')

    const spaced = lines.filter((l) => /解锁建筑[^：]/.test(l.text)).map((l) => l.name)
    ok('解锁建筑一律写成「解锁建筑：X」（不带旧的空格写法）', spaced.length === 0, spaced.join('、') || '全部正常')

    const multi = lines.find((l) => l.name === '洞天福地')
    ok('多个建筑之间用顿号', !!multi && multi.text.includes('洞府、洞天'), multi ? multi.text : '（找不到洞天福地）')

    const qi = lines.find((l) => l.name === '灵源考')
    ok('灵源考只展示它开启的研究与技艺', !!qi && /^开启参悟：/.test(qi.text) && !qi.text.includes('解锁建筑'), qi ? qi.text : '')
  }
}

export function tooltipEffects({ ok, section }) {
  section('提示里的效果一节：一个效果一行')
  {
    const rowsOf = (id) => effectRows(UPGRADE_MAP[id], describeEffects)
    const alchemy = rowsOf('alchemyArt')
    ok(
      '炼丹术每项解锁建筑、配方与参悟各自成行',
      alchemy.length === Object.values(unlockGroups('alchemyArt')).reduce((sum, items) => sum + items.length, 0) && alchemy.every(row => !row.value.includes('、')),
      alchemy.map((r) => r.label + '=' + r.value).join(' ｜ '),
    )
    ok(
      '每一行都有标签与值，且值里不再用分号串多件事',
      alchemy.every((r) => !!r.label && !!r.value && !r.value.includes('；')),
      JSON.stringify(alchemy),
    )
    const bt = rowsOf('breakthroughArt')
    ok(
      '纯规则型节点也有行（破境花费）',
      bt.length === 1 && bt[0].label === '破境花费',
      JSON.stringify(bt),
    )
    const qi = rowsOf('qiOrigin')
    ok('灵源考每项开启参悟单独一行，不再预告已删除的建筑', qi.length === unlockGroups('qiOrigin').upgrades.length && qi.every(row => row.label === '开启参悟' && !row.value.includes('、')), JSON.stringify(qi))
    const heaven = rowsOf('grottoArt')
    ok('洞天福地每栋解锁建筑单独一行', heaven.filter(row => row.label === '解锁建筑').length === 2 && heaven.every(row => !row.value.includes('、')), JSON.stringify(heaven))
  }
}

export function condensationResearch({ ok, close, section }) {
  section('凝聚章：逐步研究与能力兑现')
  {
    const { state: s, derived: d } = newGame()
    s.realm = 4
    for (const id of ['qiOrigin', 'qiGazing', 'qiMeasure', 'talismanArt']) s.upgrades[id] = true
    s.buildings.spiritField = { count: 1, on: true }
    s.buildings.library = { count: 200, on: true }
    Object.assign(s.resources, { insight: 25000, wood: 10000, stone: 10000, plank: 100, qi: 10000 })
    E.recompute(s, d)
    const chain = ['qiLiquid', 'liquidArt', 'qiPurify', 'crystalTheory']
    ok('观气后灵植术可学，凝灵诀尚不可学', E.isUpgradeUnlocked(s, UPGRADE_MAP.herbStudy) && !E.isUpgradeUnlocked(s, UPGRADE_MAP.condenseArt))
    for (const id of chain) {
      const available = chain.filter(next => !s.upgrades[next] && E.isUpgradeUnlocked(s, UPGRADE_MAP[next]))
      ok(`凝聚章当前只放行下一步 ${UPGRADE_MAP[id].name}`, available.length === 1 && available[0] === id)
      const rate = d.rates.qi
      ok(`依正常支付研究 ${UPGRADE_MAP[id].name}`, E.research(s, d, id))
      if (id === 'qiLiquid') {
        ok('化液先开放手动配方但尚无凝聚工位', E.craft(s, d, 'condenseLiquid') > 0 && d.processingCapacity.condensation === 0)
        ok('只掌握化液仍不能参悟凝灵诀', !E.isUpgradeUnlocked(s, UPGRADE_MAP.condenseArt))
      } else if (id === 'liquidArt') {
        ok('凝液法接续提供基础凝聚工位', d.processingCapacity.condensation === 1)
        ok('凝液法后凝灵诀仍等待纯化，尚未取得自动凝液能力', !E.isUpgradeUnlocked(s, UPGRADE_MAP.condenseArt) && !d.autoCondenseLiquidUnlocked)
      } else if (id === 'qiPurify') {
        ok('纯化后灵气产出增加两成', close(d.rates.qi / rate, 1.2))
        ok('纯化后开放凝灵诀与液藏之术', E.isUpgradeUnlocked(s, UPGRADE_MAP.condenseArt) && E.isUpgradeUnlocked(s, UPGRADE_MAP.liquidVault))
        s.upgrades.talismanArt = false
        ok('主链完成纯化仍不能绕过凝晶所需符文知识', !E.isUpgradeUnlocked(s, UPGRADE_MAP.crystalTheory))
        s.upgrades.talismanArt = true
      }
    }
    ok('串联不额外收费，四项总灵机仍为18500', s.resources.insight === 6500)
    ok('学完凝晶原理仍需凝晶工艺才能制作灵晶', !E.isCraftUnlocked(s, CRAFT_MAP.condenseCrystal))
    ok('支付学习凝灵诀后保留节气自动凝液', E.research(s, d, 'condenseArt') && d.autoCondenseLiquidUnlocked && d.craftTargetsUnlocked)
  }
}

export function researchPrerequisites({ ok, section }) {
  section('修真前置不被境界条件覆盖')
  for (const [id, parent, building, count, realm] of [
    ['ancestorArt', null, 'incenseCauldron', 2, 7],
    ['grottoArt', null, 'depot', 2, 8],
    ['arrayBasics', 'astrologyArt', 'academy', 2, 7],
    ['arrayMastery', 'arrayBasics', 'mountainArray', 3, 8],
  ]) {
    const { state: s } = newGame()
    s.realm = realm
    ok(`${id}仅达到境界仍不能参悟`, !E.isUpgradeUnlocked(s, UPGRADE_MAP[id]))
    for (const dep of UPGRADE_MAP[id].needs.upgrades || []) s.upgrades[dep] = true
    s.buildings[building] = { count, on: true }
    ok(`${id}同时满足研究与建筑条件才开放`, E.isUpgradeUnlocked(s, UPGRADE_MAP[id]))
    s.realm = 0
    ok(`${id}不设境界门槛`, E.isUpgradeUnlocked(s, UPGRADE_MAP[id]))
  }
}

export function researchCapacity({ ok, section }) {
  section('修真由灵机仓容软性推进')
  {
    const realmGated = CULTIVATION.filter(u => u.needs?.realm != null).map(u => u.id).sort()
    ok('修真保留境界门槛：境界决定可观测与可操作的条目（营造 / 宜居配套 / 灵能输配 / 香火愿力 / 金丹招募）', realmGated.join(',') === 'energyApplication,gardenDesign,seekTalents,vowPower,waterSanitation')
    const ids = new Set(CULTIVATION.map(u => u.id))
    const parents = u => [...(u.needs?.upgrades || []), ...(u.needs?.upgrade ? [u.needs.upgrade] : [])].filter(id => ids.has(id))
    const reachesRoot = (id, path = new Set()) => {
      if (id === 'qiOrigin') return true
      if (path.has(id)) return false
      return parents(UPGRADE_MAP[id]).some(dep => reachesRoot(dep, new Set(path).add(id)))
    }
    ok('灵源考是唯一修真入口，其余节点都有研究前置', CULTIVATION.every(u => u.id === 'qiOrigin' || parents(u).length > 0))
    ok('全部修真研究能沿知识链追溯到灵源考', CULTIVATION.every(u => reachesRoot(u.id)))
    const { state: isolated, derived: isolatedDerived } = newGame()
    for (const r of RESOURCES) isolated.resources[r.id] = 1e7
    E.recompute(isolated, isolatedDerived)
    ok('仓容和库存不能绕过研究链提前参悟', ['shapeRune', 'longBreath', 'karmaSense'].every(id => !E.research(isolated, isolatedDerived, id)))
    const { state: s, derived: d } = newGame()
    s.upgrades.talismanArt = true
    s.buildings.library = { count: 2, on: true }
    s.resources.qi = 1000
    s.buildings.scriptureArchive = { count: 2, on: true }
    E.recompute(s, d)
    s.resources.insight = d.max.insight
    ok('凡体满足前置即可开放聚气纹', s.realm === 0 && E.isUpgradeUnlocked(s, UPGRADE_MAP.qiRune))
    ok('两座典籍库仅有360灵机仓容，高档研究仍需扩仓', d.max.insight === 360 && !E.research(s, d, 'qiRune'))
    s.buildings.scriptureArchive.count = 7
    E.recompute(s, d)
    s.resources.insight = d.max.insight
    ok('七座典籍库仍不足以支付800灵机的聚气纹', d.max.insight === 760 && !E.research(s, d, 'qiRune'))
    s.buildings.scriptureArchive.count = 8
    E.recompute(s, d)
    s.resources.insight = 800
    ok('扩仓到费用档位后可在凡体实际研究', d.max.insight === 840 && E.research(s, d, 'qiRune') && s.resources.insight === 0)
  }
}

export function runeResearch({ ok, section }) {
  section('符文研究与载体应用')
  {
    const { state: s, derived: d } = newGame()
    s.realm = 3
    s.upgrades.talismanArt = true
    s.upgrades.liquidArt = true
    s.upgrades.earthArt = true
    s.upgrades.woodworking = true
    s.upgrades.steelWorking = true
    s.buildings.talismanHall = { count: 1, on: true }
    s.buildings.forge = { count: 1, on: true }
    Object.assign(s.resources, { insight: 20000, qi: 20000, wood: 2000, ore: 2000, stone: 2000, spiritLiquid: 30, crystal: 20, steel: 100, artifact: 200, faith: 2000 })
    E.recompute(s, d)
    ok('聚气纹无境界门槛，固形纹仍需先掌握聚气纹', E.isUpgradeUnlocked(s, UPGRADE_MAP.qiRune) && !E.isUpgradeUnlocked(s, UPGRADE_MAP.shapeRune))
    ok('没有聚气与固形原理不能研究导灵纹', !E.research(s, d, 'conductionRune'))
    ok('筑基实际研究三种符文后开放阵基工艺', E.research(s, d, 'qiRune') && E.research(s, d, 'shapeRune') && E.research(s, d, 'conductionRune') && E.isUpgradeUnlocked(s, UPGRADE_MAP.arrayAssembly))
    ok('纳灵纹可提前掌握，但灵符仍需元婴', E.research(s, d, 'capacityRune') && !E.isCraftUnlocked(s, CRAFT_MAP.drawSpiritTalisman))
    s.realm = 5
    E.recompute(s, d)
    ok('元婴掌握纳灵纹开放首份灵符，未学蚀刻原理也不回锁', s.upgrades.capacityRune && !s.upgrades.etchTheory && E.isCraftUnlocked(s, CRAFT_MAP.drawSpiritTalisman))
    s.autoCraft.drawSpiritTalisman = true
    s.craftTargets.drawSpiritTalisman = 12
    const restored = parseImport(exportSave(s))
    ok('旧档灵符自动产线读档后保留资格与设置，不补赠蚀刻研究',
      E.isCraftUnlocked(restored, CRAFT_MAP.drawSpiritTalisman) && !restored.upgrades.etchTheory &&
      restored.autoCraft.drawSpiritTalisman && restored.craftTargets.drawSpiritTalisman === 12)
    const before = { ...s.resources }
    const made = E.craft(s, d, 'drawSpiritTalisman')
    ok('灵符使用玄钢载体与灵液，不消耗灵木或基础符箓', made === 1 && Object.entries(CRAFT_MAP.drawSpiritTalisman.cost).every(([r, cost]) => s.resources[r] === before[r] - cost) && s.resources.talisman === before.talisman && s.resources.wood === before.wood)
    ok('灵机不足不能参悟复合符文，元婴仍不能制造灵器', !E.research(s, d, 'compositeRune') && !E.isCraftUnlocked(s, CRAFT_MAP.forgeSpiritArtifact))
    s.realm = 6
    E.recompute(s, d)
    s.resources.insight = UPGRADE_MAP.compositeRune.cost.insight
    ok('化神实际掌握复合符文后制造灵器', E.research(s, d, 'compositeRune') && E.craft(s, d, 'forgeSpiritArtifact') === 1)
    s.realm = 7
    E.recompute(s, d)
    s.resources.insight = UPGRADE_MAP.guardRune.cost.insight
    ok('镇岳符研究还需镇守纹原理', !E.isUpgradeUnlocked(s, UPGRADE_MAP.talismanLore) && E.research(s, d, 'guardRune') && E.isUpgradeUnlocked(s, UPGRADE_MAP.talismanLore))
  }
}
