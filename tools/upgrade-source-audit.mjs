/**
 * 修真 / 技艺·法宝 的「造价来源可达性」审计。
 *
 * 关注的问题：某条修真 / 技艺节点的 `needs` 已经满足，
 * 但它的造价（或祭炼材料）里某种产物此刻还没有任何**已解锁的来源** ——
 * 此时实际 UI 可能仍因费用峰值不足而隐藏。若某个需要的产物是从节点
 * 自己（或它的下游）才解锁的，就是更硬的死锁。
 *
 * 做法：从新档开始做**分层闭包**（一层 = 一轮新获得的东西）：
 *   resRound[资源] = 该资源第一次变得可生产的层号；
 *   gateRound[节点] = 该节点 needs 第一次满足的层号，不等于实际 UI 露出。
 * 若 cost / refine 里某种资源 resRound > gateRound，即报出；无 resRound 则是「没有任何来源」。
 *
 * 这是一次性诊断脚本，不是冒烟断言。
 */
import { createInitialState } from '../src/game/state.js'
import * as E from './engine-fixture.mjs'
import { CULTIVATION, ALL_UPGRADES } from '../src/data/upgrades.js'

import { CRAFTS } from '../src/data/crafts.js'
import { BUILDINGS } from '../src/data/buildings.js'
import { JOBS } from '../src/data/jobs.js'
import { ASCEND_REALM_INDEX, REALMS } from '../src/data/realms.js'
import { RESOURCE_MAP } from '../src/data/resources.js'
import { HUNT, HUNT_FIELDS } from '../src/modules/hunting/data.js'
import { DIPLOMACY, DIPLOMACY_SECTS } from '../src/modules/diplomacy/data.js'
import { RITUALS } from '../src/data/faith.js'
import { ritualCap } from '../src/game/systems/faith.js'

const state = createInitialState()
const derived = E.createDerived()

const sources = new Set(['qi']) // 开局只能点「吸取天地灵气」
const resRound = { qi: 0 }
const producerOf = {} // 资源 -> 来源描述

const fits = (cost, available = sources) =>
  Object.entries(cost || {}).every(([id, n]) => available.has(id) && E.moneyGte(E.money(derived.max[id]).plus(1e-9), n))
const needsMet = u => u.page === 'faith' ? E.faithNeedsMet(state, u.needs) : E.checkNeeds(state, u.needs)

// 仅扩仓至实际需要的额度；加工品无上限后，反复建仓不再是闭包的收敛条件。
const entries = [...BUILDINGS, ...ALL_UPGRADES, ...CRAFTS, ...JOBS]
const targets = Object.fromEntries(BUILDINGS.map(b => [b.id, Math.max(1, ...entries.flatMap(e =>
  [e.needs?.building, ...(e.needs?.buildings || []), ...(e.needs?.anyBuildings || [])]
    .filter(n => n?.id === b.id).map(n => n.count)))]))
const required = {}
const requireCost = cost => {
  for (const [id, amount] of Object.entries(cost || {})) required[id] = E.moneyMax(required[id] || 0, amount)
}
for (const e of [...ALL_UPGRADES, ...CRAFTS, ...REALMS]) requireCost(e.cost)
for (const sect of DIPLOMACY_SECTS) requireCost({ ...sect.pays, warrant: DIPLOMACY.WARRANT_COST })
for (const b of BUILDINGS) requireCost(Object.fromEntries(Object.entries(b.cost).map(([id, amount]) =>
  [id, E.money(amount).times(E.money(b.priceRatio || 1).pow(targets[b.id] - 1))])))
const ritualTargets = Object.fromEntries(RITUALS.map(r => [r.id, Math.max(0, ...ALL_UPGRADES.map(u => u.needs?.ritual?.[r.id] || 0))]))

const blockedBy = entry => {
  const needs = entry.needs || {}
  const parent = [...(needs.upgrades || []), ...(needs.upgrade ? [needs.upgrade] : [])].find(id => !state.upgrades[id])
  if (parent) return `缺少研究 ${parent}`
  if (needs.realm != null && state.realm < needs.realm) return `需 ${REALMS[needs.realm].name}`
  const building = [needs.building, ...(needs.buildings || [])].find(b => b && E.countOf(state, b.id) < b.count)
  if (building) return `缺少建筑 ${building.id} × ${building.count}`
  for (const [id, level] of Object.entries(needs.ritual || {})) {
    if (E.ritualLevel(state, id) < level) return `缺少仪轨 ${id} 等级 ${level}`
  }
  for (const [id, amount] of Object.entries(entry.cost || {})) {
    if (!sources.has(id)) return `${RESOURCE_MAP[id]?.name || id} 无稳定来源`
    if (E.moneyLt(derived.max[id], amount)) return `${RESOURCE_MAP[id]?.name || id} 仓容不足 ${amount}`
  }
  return '需检查数量、维护供料或闭包轮数上限'
}

const record = (res, round, label) => {
  if (resRound[res] != null) return false
  resRound[res] = round
  sources.add(res)
  producerOf[res] = label
  return true
}

const gateRound = {} // 节点 needs 首次满足的层号
const upRound = {} // 节点实际被参悟的层号
const bGateRound = {} // 建筑 needs 首次满足的层号
const bRound = {} // 建筑实际被营造的层号
const MAX_ROUND = 300
let settled = false

E.recompute(state, derived)

for (let round = 1; round <= MAX_ROUND; round++) {
  E.recompute(state, derived)

  // 只登记前置满足层；本工具不模拟实际库存峰值和 UI 的 30% 露出阈值。
  for (const u of ALL_UPGRADES) {
    if (gateRound[u.id] == null && needsMet(u)) gateRound[u.id] = round
  }
  for (const b of BUILDINGS) {
    if (bGateRound[b.id] == null && E.checkNeeds(state, b.needs)) bGateRound[b.id] = round
  }

  // 本轮用「快照」判定，避免同轮内互相解锁造成层号错乱
  const snap = new Set(sources)
  let changed = false

  // 1) 职位
  if (derived.maxDisciples > 0) {
    for (const job of JOBS) {
      if (!E.isJobUnlocked(state, job)) continue
      for (const out of E.jobOutputs(state, job)) {
        if (record(out.resource, round, `职位·${job.name}`)) changed = true
      }
    }
  }
  // 2) 已建成建筑的固定产出
  for (const b of BUILDINGS) {
    if (!E.countOf(state, b.id)) continue
    for (const k of Object.keys(b.effects?.prod || {})) {
      if (record(k, round, `建筑·${b.name}`)) changed = true
    }
  }
  // 3) 配方（快照判定供料）
  // 猎杀是任务来源，不在 jobs/crafts 中；需要实际可达的营地、弟子容量与信符。
  if (derived.maxDisciples > 0 && snap.has('warrant') && E.moneyGte(derived.max.warrant, HUNT.WARRANT_COST)) {
    for (const field of HUNT_FIELDS) {
      if (!E.isHuntUnlocked(state, field.id)) continue
      for (const res of Object.keys(field.baseYield)) {
        if (record(res, round, `猎场·${field.name}`)) changed = true
      }
    }
  }
  for (const c of CRAFTS) {
    if (snap.has(c.out)) continue
    if (!E.isCraftUnlocked(state, c)) continue
    if (!fits(c.cost, snap)) continue
    if (record(c.out, round, `配方·${c.name}`)) changed = true
  }
  // 固定外交是稳定供给，机缘掉落不用于证明可达。
  if (E.isDiplomacyUnlocked(state) && fits({ warrant: DIPLOMACY.WARRANT_COST }, snap)) {
    for (const sect of DIPLOMACY_SECTS) {
      if (!fits(sect.pays, snap)) continue
      for (const [id, amount] of Object.entries(sect.gains)) {
        if (amount > 0 && E.moneyGt(derived.max[id], 0) && record(id, round, `固定外交·${sect.name}`)) changed = true
      }
    }
  }
  // 香火专属研究使用凝愿与仪轨门禁，不能按普通研究忽略 ritual 条件。
  if (E.canCondense(state) && snap.has('faith') && E.moneyGt(derived.max.faith, 0)) {
    if (record('vow', round, '香火·凝愿')) changed = true
  }
  for (const ritual of RITUALS) {
    const level = E.ritualLevel(state, ritual.id)
    if (level >= Math.min(ritualTargets[ritual.id], ritualCap(state, ritual)) || !E.faithNeedsMet(state, ritual.needs)) continue
    if (!fits({ vow: E.ritualCost(state, ritual.id) }, snap)) continue
    state.faithProgression.rituals[ritual.id] = level + 1
    E.recompute(state, derived)
    changed = true
  }
  // 4) 参悟（快照判定造价）
  for (const u of ALL_UPGRADES) {
    if (state.upgrades[u.id]) continue
    if (!needsMet(u)) continue
    const cost = E.roundCost(u.cost)
    if (!Object.keys(cost).every((r) => snap.has(r))) continue
    if (!Object.entries(cost).every(([r, n]) => E.moneyGte(E.money(derived.max[r]).plus(1e-9), n))) continue
    state.upgrades[u.id] = true
    upRound[u.id] = round
    E.recompute(state, derived)
    changed = true
  }
  // 5) 营造（含数量前置所需的重复建造）
  for (const b of BUILDINGS) {
    if (!E.checkNeeds(state, b.needs)) continue
    const count = E.countOf(state, b.id)
    const expandsNeededCapacity = Object.entries(required).some(([id, amount]) =>
      E.moneyLt(derived.max[id], amount) && ((b.effects?.storage?.[id] || 0) > 0 ||
        ((b.effects?.storageAll || 0) > 0 && E.money(derived.max[id]).isFinite())))
    if (count >= targets[b.id] && !expandsNeededCapacity) continue
    const cost = E.buildingCost(state, b.id, 1)
    if (!Object.keys(cost).every((r) => snap.has(r))) continue
    if (!Object.entries(cost).every(([r, n]) => E.moneyGte(E.money(derived.max[r]).plus(1e-9), n))) continue
    if (Object.keys(b.upkeep || {}).some(r => !snap.has(r))) continue
    if (b.id === 'hut') state.starterHutBuilt = true
    state.buildings[b.id] = { count: count + 1, on: true }
    if (count === 0 && bRound[b.id] == null) bRound[b.id] = round
    E.recompute(state, derived)
    for (const k of Object.keys(b.effects?.prod || {})) {
      if (record(k, round, `建筑·${b.name}`)) changed = true
    }
    changed = true
  }
  // 6) 破境
  if (!changed && state.realm < ASCEND_REALM_INDEX) {
    const rc = E.realmCost(state, derived, state.realm + 1)
    if (rc && fits(rc)) {
      state.realm++
      E.recompute(state, derived)
      changed = true
    }
  }

  if (!changed) { settled = true; break }
}

// ---- 报告 ----
const rows = []
for (const u of ALL_UPGRADES) {
  const isTreasure = u.kind === 'treasure'
  const page = CULTIVATION.includes(u) ? '修真' : isTreasure ? '法宝' : '技艺'
  // 造价（参悟 / 炼成必须付）= 硬门槛；祭炼材料是法宝可选的进阶消耗。
  const costGaps = []
  const refineGaps = []
  const check = (target, r) => {
    const rr = resRound[r]
    const gr = gateRound[u.id]
    if (rr == null) target.push({ res: r, kind: '无来源' })
    else if (gr != null && rr > gr) target.push({ res: r, kind: `来源晚于前置满足`, resRound: rr, gateRound: gr, from: producerOf[r] })
  }
  for (const r of Object.keys(u.cost || {})) check(costGaps, r)
  for (const r of Object.keys(u.refine?.materials || {})) check(refineGaps, r)
  rows.push({ page, id: u.id, name: u.name, gateRound: gateRound[u.id] ?? null, upRound: upRound[u.id] ?? null, costGaps, refineGaps })
}

const relevant = rows.filter((r) => r.costGaps.length > 0)
const refineOnly = rows.filter((r) => r.costGaps.length === 0 && r.refineGaps.length > 0)
const unreachable = rows.filter((r) => r.upRound == null)
// 历史关注节点保留顺序提示；层差不是 UI 露出，更不能独立证明死锁。
const M2_NEW_IDS = [
  'spiritCanal', 'liquidIrrigation', 'veinInfuse',
  'etchTheory', 'infuseTheory', 'precipitateTheory', 'temperTheory',
  'liquidVault', 'runeVault', 'treasureVault',
  'particleRecover', 'poweredProduction',
  'runeTools', 'crystalCalib', 'forgeBatchStandards',
]
const m2Gaps = rows.filter((r) => M2_NEW_IDS.includes(r.id) && (r.costGaps.length > 0 || r.upRound == null))

console.log('=== 修真 / 技艺·法宝 造价来源审计 ===\n')
console.log('口径：层号表示研究/建筑前置满足，不模拟库存峰值与实际 UI 露出；来源包含固定外交与凝愿，不包含随机机缘。')
console.log('假定稳定来源可积攒至仓容；不估算耗时、岗位分配和持续供料效率。')
console.log(`闭包${settled ? '已收敛' : '未收敛（达到轮数上限）'}；最终境界：${REALMS[state.realm].name}`)
console.log(`参悟闭包：${Object.keys(upRound).length} / ${ALL_UPGRADES.length} 条可在闭包内参悟`)
for (const r of ['mithril', 'crystal', 'vow']) console.log(`${RESOURCE_MAP[r]?.name || r}首个稳定来源：${producerOf[r] || '无来源'}`)
console.log(`资源来源层号（部分）：${['qi', 'wood', 'rock', 'stone', 'ore', 'herb', 'insight', 'faith', 'mithril', 'plank', 'talisman', 'pill', 'artifact', 'spiritLiquid', 'crystal', 'steel', 'arrayBase', 'qiParticle', 'yangParticle', 'qiEnergy'].map((r) => `${RESOURCE_MAP[r]?.name || r}@${resRound[r] ?? '∞'}`).join('  ')}\n`)

if (relevant.length === 0) {
  console.log('所有节点的造价产物来源均不晚于前置满足。')
} else {
  console.log(`来源顺序提示 ${relevant.length} 条：材料来源晚于前置满足，不等于界面露出或实际死锁。\n`)
  for (const r of relevant) {
    console.log(`· [${r.page}] ${r.name} (${r.id})  前置层 ${r.gateRound} / 参悟层 ${r.upRound}`)
    for (const g of r.costGaps) {
      console.log(`    - 造价 ${RESOURCE_MAP[g.res]?.name || g.res}：${g.kind}${g.resRound ? `（来源层 ${g.resRound}，来自 ${g.from}）` : ''}`)
    }
  }
}

if (refineOnly.length) {
  console.log(`\n另有 ${refineOnly.length} 条法宝的**祭炼**材料来源较晚（可选、界面已提示，通常不算问题）：`)
  for (const r of refineOnly) {
    console.log(`· [${r.page}] ${r.name} (${r.id})：${r.refineGaps.map((g) => `${RESOURCE_MAP[g.res]?.name || g.res}(来源层 ${g.resRound})`).join('，')}`)
  }
}

if (unreachable.length) {
  console.log(`\n闭包内无法参悟（可能是死锁）：`)
  for (const r of unreachable) console.log(`· [${r.page}] ${r.name} (${r.id})：${blockedBy(ALL_UPGRADES.find(u => u.id === r.id))}`)
} else {
  console.log('\n本模型内所有修真 / 技艺·法宝节点均可参悟。')
}

// 历史关注节点的来源顺序，不作为失败判据。
if (m2Gaps.length) {
  console.log(`\n变更 2 新增节点的来源顺序提示：`)
  for (const r of m2Gaps) {
    const gaps = r.costGaps.map((g) => `${RESOURCE_MAP[g.res]?.name || g.res}(${g.kind})`).join('，')
    console.log(`· ${r.name} (${r.id})  前置层 ${r.gateRound} / 参悟层 ${r.upRound}  ${gaps}`)
  }
} else {
  console.log(`\n变更 2 新增节点（${M2_NEW_IDS.length} 条）造价来源均不晚于前置满足。`)
}

// ---- 建筑 ----
// 实际 UI 还要求费用峰值达到 30%；这里只报告来源及营造可达性。
const bRows = []
for (const b of BUILDINGS) {
  const noSource = Object.keys(b.cost || {}).filter((r) => resRound[r] == null)
  bRows.push({ id: b.id, name: b.name, gate: bGateRound[b.id] ?? null, built: bRound[b.id] ?? null, noSource })
}

const bNoSource = bRows.filter((r) => r.noSource.length > 0)
const bUnreach = bRows.filter((r) => r.built == null)

console.log('\n=== 建筑造价来源审计 ===\n')
if (bNoSource.length) {
  console.log(`造价里有「没有任何来源」的产物的建筑（严重）：`)
  for (const r of bNoSource) console.log(`· ${r.name} (${r.id})：${r.noSource.map((x) => RESOURCE_MAP[x]?.name || x).join('、')}`)
} else {
  console.log('所有建筑的造价产物都有来源。')
}
if (bUnreach.length) {
  console.log(`\n闭包内无法营造（可能是死锁）：`)
  for (const r of bUnreach) console.log(`· ${r.name} (${r.id})  前置层 ${r.gate}：${blockedBy(BUILDINGS.find(b => b.id === r.id))}`)
} else {
  console.log('本模型内所有建筑都可营造。')
}
if (!settled || unreachable.length || bNoSource.length || bUnreach.length) process.exitCode = 1
