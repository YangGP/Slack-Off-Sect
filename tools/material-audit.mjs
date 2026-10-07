/**
 * 材料审计：每种资源的**来源**与**去向**，以及常见异常。
 *
 * 跑法：node --import <vite-shim> ... 或 npm run audit:materials
 *      （工具脚本走 vite 打包，见 docs/ENGINEERING.md 的「工具」一节）
 *
 * 它回答四个问题：
 *   ① 这东西从哪来？（职位 / 建筑产出 / 配方 / 其它）
 *   ② 它花在哪？（建筑造价 / 配方投入 / 学术花费 / 破境 / 维护费）
 *   ③ 有没有"无来源"或"无去向"的资源？
 *   ④ 有没有"来源晚于需求"（自举闭包）——那种资源在需要它的时候还造不出来。
 */
import { RESOURCES } from '../src/data/resources.js'
import { BUILDINGS, BUILDING_MAP } from '../src/data/buildings.js'
import { JOBS } from '../src/data/jobs.js'
import { CRAFTS } from '../src/data/crafts.js'
import { ALL_UPGRADES } from '../src/data/upgrades.js'
import { REALMS } from '../src/data/realms.js'
import { realmCost } from '../src/game/engine.js'
import { createInitialState } from '../src/game/state.js'

/**
 * 职位产出：数据里的形状是 { resource, base }（base = 每名弟子每秒）。
 * 早先这里只认 output / effects.prod，结果**所有职位都没被识别**，
 * 审计表里"香火只有山门一处来源"这种假象就是这么来的 —— 工具的错比数据的错更危险。
 */
function jobOutput(job) {
  const out = { ...(job.output || {}), ...(job.effects?.prod || {}), ...(job.prod || {}) }
  if (job.resource && job.base) out[job.resource] = (out[job.resource] || 0) + job.base
  return out
}

/** 建筑的"真产出"（prod）与"加成"（ratio）分开看 */
function buildingProd(b) {
  return b.effects?.prod || {}
}
function buildingRatio(b) {
  return { ...(b.effects?.ratio || {}), ...(b.effects?.jobRatio || {}) }
}

const ids = RESOURCES.map((r) => r.id)

/**
 * 尊贵资源：来源是转世 / 飞升，去向是"作为乘区"而不是花掉，
 * 所以不该被当作"无来源 / 无去向"报出来。
 */
const PRESTIGE = {
  dao: { source: '飞升时结下（每次 +1 颗）', sink: '作为全局乘区（每颗 +5% 产出、+10% 转世/飞升仙缘）' },
  karma: { source: '转世与飞升结算', sink: '作为全局乘区（每点 +2% 产出，软上限 +200%）' },
}
const nameOf = (id) => RESOURCES.find((r) => r.id === id)?.name || id

// ---- 采集 ----
const sources = {}
const sinks = {}
const add = (map, id, kind, text) => {
  if (!map[id]) map[id] = {}
  if (!map[id][kind]) map[id][kind] = []
  map[id][kind].push(text)
}

for (const job of JOBS) {
  for (const [res, rate] of Object.entries(jobOutput(job))) {
    if (!ids.includes(res)) continue
    add(sources, res, '职位', `${job.name} +${rate}/秒/人`)
  }
}
for (const b of BUILDINGS) {
  for (const [res, rate] of Object.entries(buildingProd(b))) {
    if (!ids.includes(res)) continue
    add(sources, res, '建筑', `${b.name} +${rate}/秒`)
  }
  for (const [res, pct] of Object.entries(buildingRatio(b))) {
    if (!ids.includes(res)) continue
    add(sources, res, '加成', `${b.name} ×(1+${pct})`)
  }
  for (const [res, amount] of Object.entries(b.cost || {})) {
    if (!ids.includes(res)) continue
    add(sinks, res, '建筑造价', b.name)
  }
  for (const [res, rate] of Object.entries(b.upkeep || {})) {
    if (!ids.includes(res)) continue
    add(sinks, res, '维护费', `${b.name} −${rate}/秒`)
  }
}
for (const c of CRAFTS) {
  if (ids.includes(c.out)) add(sources, c.out, '配方', `${c.name}（${Object.entries(c.cost).map(([k, v]) => nameOf(k) + ' ' + v).join(' + ')} → ${nameOf(c.out)} ${c.amount}）`)
  for (const [res, amount] of Object.entries(c.cost || {})) {
    if (!ids.includes(res)) continue
    add(sinks, res, '配方投入', `${c.name} ${amount}`)
  }
}
for (const u of ALL_UPGRADES) {
  for (const [res, amount] of Object.entries(u.cost || {})) {
    if (!ids.includes(res)) continue
    add(sinks, res, '学术花费', `${u.name} ${amount}`)
  }
}
{
  const state = createInitialState()
  const derived = {}
  for (let i = 1; i < REALMS.length; i++) {
    let cost = {}
    try {
      cost = realmCost(state, derived, i) || {}
    } catch {
      cost = {}
    }
    for (const [res, amount] of Object.entries(cost)) {
      if (!ids.includes(res)) continue
      add(sinks, res, '破境', `${REALMS[i].name} ${Math.round(amount)}`)
    }
  }
}

// ---- 打印 ----
const pad = (s, n) => String(s).padEnd(n, '　')
const problems = []

console.log('材料审计：来源 × 去向\n')
for (const r of RESOURCES) {
  const id = r.id
  const src = sources[id] || {}
  const snk = sinks[id] || {}
  const srcCount = Object.values(src).reduce((s, a) => s + a.length, 0)
  const snkCount = Object.values(snk).reduce((s, a) => s + a.length, 0)
  console.log(`${r.name}（${id}）`)
  if (PRESTIGE[id]) {
    console.log('  （尊贵资源）来源：' + PRESTIGE[id].source)
    console.log('  （尊贵资源）去向：' + PRESTIGE[id].sink)
  }
  console.log(`  来源 ${srcCount} 处：` + (srcCount ? '' : PRESTIGE[id] ? '（见上）' : '** 无 **'))
  for (const [kind, list] of Object.entries(src)) console.log(`    [${kind}] ` + list.join('，'))
  console.log(`  去向 ${snkCount} 处：` + (snkCount ? '' : PRESTIGE[id] ? '（见上）' : '** 无 **'))
  for (const [kind, list] of Object.entries(snk)) console.log(`    [${kind}] ` + list.join('，'))
  const prestige = PRESTIGE[id]
  if (srcCount === 0 && !prestige) problems.push(`${r.name}：没有任何来源`)
  if (snkCount === 0 && !prestige) problems.push(`${r.name}：没有任何去向（死资源）`)
  console.log('')
}

// ---- 自举闭包：某建筑的造价里出现了"只有它自己才能产出的东西" ----
console.log('自举检查（配方的解锁建筑不能要它自己的产出）：')
let bad = 0
for (const c of CRAFTS) {
  const gate = c.needs?.building?.id
  if (!gate) continue
  const gateMeta = BUILDING_MAP[gate]
  if (gateMeta?.cost?.[c.out]) {
    console.log(`  ✗ ${c.name}：解锁建筑 ${gateMeta.name} 的造价里有它自己的产出 ${nameOf(c.out)}`)
    bad++
  }
}
for (const b of BUILDINGS) {
  for (const [res, amount] of Object.entries(b.cost || {})) {
    void amount
    // 建筑用自己的产出当造价是允许的（扩建），这里只报告"唯一来源就是自己"的情况
    const src = sources[res] || {}
    const onlySelf = Object.values(src).flat().every((t) => t.includes(b.name))
    const anySrc = Object.values(src).flat().length > 0
    if (anySrc && onlySelf) {
      console.log(`  ✗ ${b.name} 造价里有 ${nameOf(res)}，而它唯一来源也是 ${b.name}`)
      bad++
    }
  }
}
if (!bad) console.log('  ✓ 没有发现闭环')

// ---- 规则检查：这些是"说好的规矩"，跑一次就该是绿的 ----
console.log('规则检查：')
{
  const qiAllowed = new Set(['spiritField', 'spiritVein', 'hut', 'lumberYard', 'library'])
  const qiOffenders = BUILDINGS.filter((b) => b.cost?.qi && !qiAllowed.has(b.id)).map((b) => b.name)
  console.log(
    '  ' + (qiOffenders.length ? '✗' : '✓') + ' 灵气不当建材（实物建筑用材料计价）' + (qiOffenders.length ? '：' + qiOffenders.join('、') : ''),
  )

  const crafted = ['plank', 'pill', 'talisman', 'artifact']
  const multi = crafted.filter((id) => (sources[id]?.配方 || []).length > 1)
  console.log(
    '  ' + (multi.length ? '✗' : '✓') + ' 精料（木板/丹药/符箓/法器）各只有一条来路（配方）' + (multi.length ? '：' + multi.map(nameOf).join('、') : ''),
  )

  const noSink = RESOURCES.filter((r) => !PRESTIGE[r.id] && !(sinks[r.id] && Object.keys(sinks[r.id]).length))
  console.log('  ' + (noSink.length ? '✗' : '✓') + ' 没有"只进不出"的资源' + (noSink.length ? '：' + noSink.map((r) => r.name).join('、') : ''))

  const noSrc = RESOURCES.filter((r) => !PRESTIGE[r.id] && !(sources[r.id] && Object.keys(sources[r.id]).length))
  console.log('  ' + (noSrc.length ? '✗' : '✓') + ' 没有"无来源"的资源' + (noSrc.length ? '：' + noSrc.map((r) => r.name).join('、') : ''))
}

console.log('\n小结：' + (problems.length ? problems.length + ' 个待看项' : '没有明显异常'))
for (const p of problems) console.log('  ⚠ ' + p)
