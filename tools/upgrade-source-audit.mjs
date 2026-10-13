/**
 * 修真 / 技艺·法宝 的「造价来源可达性」审计。
 *
 * 关注的问题：某条修真 / 技艺节点的 `needs` 已经满足、在界面上已经露面，
 * 但它的造价（或祭炼材料）里某种产物此刻还没有任何**已解锁的来源** ——
 * 玩家看得到需求，却在别处找不到出处。反过来，若某个需要的产物是从节点
 * 自己（或它的下游）才解锁的，就是更硬的死锁。
 *
 * 做法：从新档开始做**分层闭包**（一层 = 一轮新获得的东西）：
 *   resRound[资源] = 该资源第一次变得可生产的层号；
 *   gateRound[节点] = 该节点 needs 第一次满足的层号（此时界面即可见）。
 * 若 cost / refine 里某种资源 resRound > gateRound，即报出；无 resRound 则是「没有任何来源」。
 *
 * 这是一次性诊断脚本，不是冒烟断言。
 */
import { createInitialState } from '../src/game/state.js'
import * as E from './engine-fixture.mjs'
import { CULTIVATION, ALL_UPGRADES, UPGRADE_MAP } from '../src/data/upgrades.js'
import { TECHNIQUES } from '../src/data/techniques.js'
import { CRAFTS } from '../src/data/crafts.js'
import { BUILDINGS } from '../src/data/buildings.js'
import { JOBS } from '../src/data/jobs.js'
import { REALMS, ASCEND_REALM_INDEX } from '../src/data/realms.js'
import { RESOURCE_MAP } from '../src/data/resources.js'

const state = createInitialState()
const derived = E.createDerived()

const sources = new Set(['qi']) // 开局只能点「吸取天地灵气」
const resRound = { qi: 0 }
const producerOf = {} // 资源 -> 来源描述

const fits = (cost) =>
  Object.entries(cost || {}).every(([id, n]) => sources.has(id) && n <= derived.max[id] + 1e-9)

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

E.recompute(state, derived)

for (let round = 1; round <= MAX_ROUND; round++) {
  E.recompute(state, derived)

  // 本轮开始前先登记「已经满足前置、界面上可见」的节点层号
  for (const u of ALL_UPGRADES) {
    if (gateRound[u.id] == null && E.checkNeeds(state, u.needs)) gateRound[u.id] = round
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
  for (const c of CRAFTS) {
    if (snap.has(c.out)) continue
    if (!E.isCraftUnlocked(state, c)) continue
    if (!Object.keys(c.cost || {}).every((r) => snap.has(r))) continue
    if (record(c.out, round, `配方·${c.name}`)) changed = true
  }
  // 4) 参悟（快照判定造价）
  for (const u of ALL_UPGRADES) {
    if (state.upgrades[u.id]) continue
    if (!E.checkNeeds(state, u.needs)) continue
    const cost = E.roundCost(u.cost)
    if (!Object.keys(cost).every((r) => snap.has(r))) continue
    if (!Object.entries(cost).every(([r, n]) => n <= derived.max[r] + 1e-9)) continue
    state.upgrades[u.id] = true
    upRound[u.id] = round
    changed = true
  }
  // 5) 营造（含数量前置所需的重复建造）
  for (const b of BUILDINGS) {
    if (!E.checkNeeds(state, b.needs)) continue
    const count = E.countOf(state, b.id)
    const target = Math.max(
      1,
      ...[...BUILDINGS, ...ALL_UPGRADES, ...CRAFTS, ...JOBS].flatMap((entry) =>
        [entry.needs?.building, ...(entry.needs?.buildings || [])]
          .filter((x) => x?.id === b.id)
          .map((x) => x.count),
      ),
    )
    if (count >= target && !b.effects?.storage && !b.effects?.storageAll) continue
    const cost = E.buildingCost(state, b.id, 1)
    if (!Object.keys(cost).every((r) => snap.has(r))) continue
    if (!Object.entries(cost).every(([r, n]) => n <= derived.max[r] + 1e-9)) continue
    if (b.id === 'hut') state.starterHutBuilt = true
    state.buildings[b.id] = { count: count + 1, on: true }
    if (count === 0 && bRound[b.id] == null) bRound[b.id] = round
    for (const k of Object.keys(b.effects?.prod || {})) {
      if (record(k, round, `建筑·${b.name}`)) changed = true
    }
    changed = true
  }
  // 6) 破境
  if (state.realm < ASCEND_REALM_INDEX) {
    const rc = E.realmCost(state, derived, state.realm + 1)
    if (rc && fits(rc)) {
      state.realm++
      changed = true
    }
  }

  if (!changed) break
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
    else if (gr != null && rr > gr) target.push({ res: r, kind: `来源晚于可见`, resRound: rr, gateRound: gr, from: producerOf[r] })
  }
  for (const r of Object.keys(u.cost || {})) check(costGaps, r)
  for (const r of Object.keys(u.refine?.materials || {})) check(refineGaps, r)
  rows.push({ page, id: u.id, name: u.name, gateRound: gateRound[u.id] ?? null, upRound: upRound[u.id] ?? null, costGaps, refineGaps })
}

const relevant = rows.filter((r) => r.costGaps.length > 0)
const refineOnly = rows.filter((r) => r.costGaps.length === 0 && r.refineGaps.length > 0)
const unreachable = rows.filter((r) => r.upRound == null)

console.log('=== 修真 / 技艺·法宝 造价来源审计 ===\n')
console.log(`参悟闭包：${Object.keys(upRound).length} / ${ALL_UPGRADES.length} 条可在闭包内参悟`)
console.log(`资源来源层号（部分）：${['qi', 'wood', 'rock', 'stone', 'ore', 'herb', 'insight', 'faith', 'plank', 'talisman', 'pill', 'artifact', 'spiritLiquid', 'crystal', 'steel', 'arrayBase', 'qiParticle', 'yangParticle', 'qiEnergy'].map((r) => `${RESOURCE_MAP[r]?.name || r}@${resRound[r] ?? '∞'}`).join('  ')}\n`)

if (relevant.length === 0) {
  console.log('未发现「节点已可见、但造价产物找不到来源」的情况。')
} else {
  console.log(`发现 ${relevant.length} 条节点，其造价里有产物在节点可见时还没有来源：\n`)
  for (const r of relevant) {
    console.log(`· [${r.page}] ${r.name} (${r.id})  可见层 ${r.gateRound} / 参悟层 ${r.upRound}`)
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
  for (const r of unreachable) console.log(`· [${r.page}] ${r.name} (${r.id})`)
} else {
  console.log('\n闭包内所有修真 / 技艺·法宝节点均可参悟（不存在硬死锁）。')
}

// ---- 建筑 ----
// 建筑有「渐进露出」：默认还要**见过**造价资源的历史峰值 ≥ 造价×unlockRatio(0.3)。
// 所以只有 unlockRatio ≤ 0（满足前置即露面）的建筑，才可能出现「露面时产物还没来源」。
const bRows = []
for (const b of BUILDINGS) {
  const ratio = b.unlockRatio == null ? 0.3 : b.unlockRatio
  const noSource = Object.keys(b.cost || {}).filter((r) => resRound[r] == null)
  const late = ratio <= 0
    ? Object.entries(b.cost || {}).filter(([r]) => bGateRound[b.id] != null && resRound[r] != null && resRound[r] > bGateRound[b.id])
        .map(([r]) => ({ res: r, resRound: resRound[r] }))
    : []
  bRows.push({ id: b.id, name: b.name, ratio, gate: bGateRound[b.id] ?? null, built: bRound[b.id] ?? null, noSource, late })
}

const bNoSource = bRows.filter((r) => r.noSource.length > 0)
const bUnreach = bRows.filter((r) => r.built == null)
const bLate = bRows.filter((r) => r.late.length > 0)

console.log('\n=== 建筑造价来源审计 ===\n')
if (bNoSource.length) {
  console.log(`造价里有「没有任何来源」的产物的建筑（严重）：`)
  for (const r of bNoSource) console.log(`· ${r.name} (${r.id})：${r.noSource.map((x) => RESOURCE_MAP[x]?.name || x).join('、')}`)
} else {
  console.log('所有建筑的造价产物都有来源。')
}
if (bLate.length) {
  console.log(`\nunlockRatio≤0（满足前置即露面）且露面前产物尚无来源的建筑：`)
  for (const r of bLate) console.log(`· ${r.name} (${r.id})  露面层 ${r.gate}：${r.late.map((g) => `${RESOURCE_MAP[g.res]?.name || g.res}(来源层 ${g.resRound})`).join('，')}`)
} else {
  console.log('unlockRatio≤0 的建筑均在其造价产物有来源之后才露面。')
}
if (bUnreach.length) {
  console.log(`\n闭包内无法营造（可能是死锁）：`)
  for (const r of bUnreach) console.log(`· ${r.name} (${r.id})  露面层 ${r.gate}`)
} else {
  console.log('闭包内所有建筑都可营造（不存在硬死锁）。')
}
