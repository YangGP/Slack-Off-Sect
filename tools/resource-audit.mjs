/**
 * 资源流量审计：把某个资源在一段挂机时间里的「进项 / 出项 / 存量 / 到达关键门槛的时间」量出来，
 * 用来回答「XX 感觉太慢了」这类问题。
 *
 * 用法：
 *   node --import <shim> node_modules/vite/bin/vite.js build --ssr tools/resource-audit.mjs --outDir .smoke-audit
 *   node .smoke-audit/resource-audit.js [资源id] [小时数] [假设性改动…]
 *
 * 假设性改动（只影响本次运行，不改项目文件）：
 *   --craft=50                      凝气成石的灵气成本改成 50
 *   --cap=250                       该资源的基础上限改成 250
 *   --prod=玄铁矿id:stone:0.015      给某建筑加一条每秒产出（可重复）
 *   --realm=0.5                     所有破境对该资源的花费 ×0.5
 *   --autocraft                     视作已解锁自动制作
 *
 * 玩家策略与 tools/balance.mjs 共用（tools/player-bot.mjs），保证两边结论一致。
 */
import { auditResource, fmtDur } from './audit-lib.mjs'
import { CRAFTS } from '../src/data/crafts.js'
import { REALMS } from '../src/data/realms.js'
import { BUILDINGS } from '../src/data/buildings.js'
import { CULTIVATION, ALL_UPGRADES } from '../src/data/upgrades.js'
import { RESOURCES } from '../src/data/resources.js'

const RES_ID = process.argv[2] || 'stone'
const HOURS = Number(process.argv[3] || 8)
const args = process.argv.slice(2)

const patches = {}
const patchNotes = []
for (const a of args) {
  if (a.startsWith('--craft=')) {
    patches.craftQi = Number(a.split('=')[1])
    patchNotes.push(`凝气成石的灵气成本 → ${patches.craftQi}`)
  } else if (a.startsWith('--cap=')) {
    patches.baseMax = Number(a.split('=')[1])
    patchNotes.push(`基础上限 → ${patches.baseMax}`)
  } else if (a.startsWith('--prod=')) {
    const [, id, res, val] = a.split('=')[1].split(':')
    patches.prods = patches.prods || []
    patches.prods.push({ buildingId: id, res, value: Number(val) })
    const b = BUILDINGS.find((x) => x.id === id)
    patchNotes.push(`${b?.name || id} 产出 ${RESOURCES.find((r) => r.id === res)?.name || res} +${val}/秒`)
  } else if (a.startsWith('--realm=')) {
    patches.realmFactor = Number(a.split('=')[1])
    patchNotes.push(`破境花费 ×${patches.realmFactor}`)
  } else if (a.startsWith('--upcost=')) {
    patches.upgradeFactor = Number(a.split('=')[1])
    patchNotes.push(`参悟（修真/技艺/法宝）花费 ×${patches.upgradeFactor}`)
  } else if (a.startsWith('--job=')) {
    patches.jobFactor = Number(a.split('=')[1])
    patchNotes.push(`相关职位基础产出 ×${patches.jobFactor}`)
  } else if (a === '--autocraft') {
    patches.autoCraft = true
    patchNotes.push('视作已解锁自动制作')
  }
}

const r = auditResource({ resId: RES_ID, hours: HOURS, patches })
const RES = r.res
const pad = (v, n) => String(v).padStart(n)

console.log(`=== ${RES.name} 流量审计（${HOURS} 小时，基础上限 ${RES.baseMax}）===`)
if (patchNotes.length) {
  console.log('【本次套用的假设性改动】')
  for (const n of patchNotes) console.log('  · ' + n)
}
console.log('')

console.log('【进项来源】')
console.log(
  '  持续产出：' +
    (r.prodSources.length
      ? r.prodSources.map((s) => `${s.label}${s.count ? '×' + s.count : ''} +${s.value.toFixed(3)}/秒`).join('，')
      : '（没有任何职位 / 建筑 / 修真 / 技艺持续产出它）'),
)
const crafts = CRAFTS.filter((c) => c.out === RES_ID)
console.log(
  '  制作获得：' +
    (crafts.length
      ? crafts
          .map(
            (c) =>
              `${c.name}（${Object.entries(c.cost)
                .map(([k, v]) => `${RESOURCES.find((x) => x.id === k)?.name || k} ${v}`)
                .join(' + ')} → ${c.amount} ${RES.name}）`,
          )
          .join('；')
      : '（没有配方产出它）'),
)

console.log('\n【时间线】')
console.log(`  ${pad('时间', 10)}${pad('存量', 9)}${pad('上限', 9)}${pad('累计获得', 11)}${pad('区间速率/时', 12)}${pad('贴顶', 6)}${pad('灵气净额', 10)}${pad('境界', 9)}`)
let prev = { t: 0, income: 0 }
for (const s of r.samples) {
  const dt = s.t - prev.t
  const rate = dt > 0 ? ((s.income - (prev.income || 0)) / dt) * 3600 : 0
  console.log(
    `  ${pad(fmtDur(s.t), 10)}${pad(Math.round(s.amount), 9)}${pad(Number.isFinite(s.cap) ? Math.round(s.cap) : '∞', 9)}${pad(Math.round(s.income || 0), 11)}${pad(Math.round(rate), 12)}${pad(s.amount >= s.cap - 1e-6 ? '贴顶' : '', 6)}${pad(s.netQi.toFixed(2), 10)}${pad(s.realm, 9)}`,
  )
  prev = s
}

console.log('\n【门槛到达时间】')
for (const th of r.thresholds) {
  console.log(`  ${pad(th, 8)} → ${r.reached.has(th) ? fmtDur(r.reached.get(th)) : '模拟结束时仍未达到'}`)
}

console.log('\n【瓶颈指标】')
console.log(`  顶到仓储上限的时间占比：${(r.blockedRatio * 100).toFixed(0)}%`)
console.log(`  参悟进度：${Object.keys(r.state.upgrades).length} / ${ALL_UPGRADES.length} 条`)
console.log(
  `  制作消耗的灵气：${Math.round(r.qiSpentOnCrafting)}（占累计灵气收入 ${((r.qiSpentOnCrafting / Math.max(1, r.totalQi)) * 100).toFixed(1)}%）`,
)
console.log(`  累计制作 ${r.craftCount} 次，产出 ${Math.round(r.craftedTotal)} ${RES.name}，平均每次 ${(r.craftedTotal / Math.max(1, r.craftCount)).toFixed(2)}`)

console.log('\n【出项清单】')
const demand = []
for (const b of BUILDINGS) if (b.cost[RES_ID]) demand.push({ 用途: b.name, 类别: '建筑', 单价: b.cost[RES_ID] })
for (const u of CULTIVATION) if (u.cost[RES_ID]) demand.push({ 用途: u.name, 类别: '修真', 单价: u.cost[RES_ID] })
for (const c of CRAFTS) if (c.cost[RES_ID]) demand.push({ 用途: c.name, 类别: '配方', 单价: c.cost[RES_ID] })
for (const x of REALMS) if (x.cost && x.cost[RES_ID]) demand.push({ 用途: x.name, 类别: '破境', 单价: x.cost[RES_ID] })
const byCat = {}
for (const d of demand) (byCat[d.类别] = byCat[d.类别] || []).push(d)
for (const [cat, rows] of Object.entries(byCat)) {
  rows.sort((a, b) => a.单价 - b.单价)
  console.log(
    `  ${cat}（${rows.length} 项）：${rows.slice(0, 8).map((x) => `${x.用途} ${x.单价}`).join('，')}${rows.length > 8 ? ' …' : ''}`,
  )
}
console.log(`  单项需求合计 ${Math.round(demand.reduce((s, d) => s + d.单价, 0))}（不含涨价与多次建造）`)
