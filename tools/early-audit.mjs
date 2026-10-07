/**
 * 前期节奏审计（对标猫国建设者）。
 *
 * 目的：把「前 2 小时到底给玩家多少东西」量出来。猫国是第 1 分钟 1 座建筑、
 * 每座新建筑挂在一个科技后面，前两小时只有 6~8 种建筑；我们用这个脚本守住同样的节奏。
 *
 * 运行：node --import ./tools/early-audit.mjs 前的构建与其它分析工具一致 ——
 *   npm run docs:tables 之类走 vite --ssr；这里同样：
 *   node --import "file:///<仓库>/.dsh-vite-shim.mjs" node_modules/vite/bin/vite.js \
 *        build --ssr tools/early-audit.mjs --outDir .early && node .early/early-audit.js
 *   （或在能直接跑 ESM 的环境里 node tools/early-audit.mjs）
 *
 * 目标（见 docs/EARLY-GAME.md）：第 1 分钟 1 座、前 10 分钟建成 ≤ 6 座、
 * 前 10 分钟可见 ≤ 6 种、前 2 小时可见 6~9 种。
 */
import { createInitialState } from '../src/game/state.js'
import * as E from '../src/game/engine.js'
import { createBot } from './player-bot.mjs'
import { BUILDINGS } from '../src/data/buildings.js'
import { CRAFTS } from '../src/data/crafts.js'
import { RESOURCES } from '../src/data/resources.js'
import { REALMS } from '../src/data/realms.js'

const HOURS = Number(process.argv[2] || 2)

const state = createInitialState()
const derived = E.createDerived()
E.recompute(state, derived)
const bot = createBot(state, derived)

const firstSeen = {}
const firstBuilt = {}
const rows = []

for (let t = 1; t <= HOURS * 3600; t++) {
  E.tick(state, derived, 1, { events: true })
  if (t % 5 === 0) bot.act()
  if (t % 60 === 0) {
    E.recompute(state, derived)
    for (const b of BUILDINGS) {
      if (E.isBuildingUnlocked(state, b.id) && !firstSeen[b.id]) firstSeen[b.id] = t
      if ((state.buildings[b.id]?.count || 0) > 0 && !firstBuilt[b.id]) firstBuilt[b.id] = t
    }
  }
  if (t % 600 === 0) {
    rows.push({
      min: t / 60,
      realm: REALMS[state.realm].name,
      dis: state.disciples.total,
      built: state.stats.buildingsBuilt,
      shown: Object.keys(firstSeen).length,
      builtTypes: Object.keys(firstBuilt).length,
      res: RESOURCES.filter((r) => !r.hidden && (state.resources[r.id] || 0) > 0).length,
      crafts: CRAFTS.filter((c) => E.isCraftUnlocked(state, c)).length,
      insight: Math.round(state.resources.insight || 0),
      upg: Object.keys(state.upgrades).length,
    })
  }
}

console.log(`=== 前期节奏审计（前 ${HOURS} 小时，目标见 docs/EARLY-GAME.md）===`)
console.log('  分钟  境界     弟子  建筑累计  可见类型  已建类型  有量资源  可做配方  参悟  已参悟')
for (const r of rows) {
  console.log(
    `  ${String(r.min).padStart(4)}  ${r.realm.padEnd(4)} ${String(r.dis).padStart(4)} ${String(r.built).padStart(8)} ${String(r.shown).padStart(8)} ${String(r.builtTypes).padStart(8)} ${String(r.res).padStart(8)} ${String(r.crafts).padStart(8)} ${String(r.insight).padStart(5)} ${String(r.upg).padStart(6)}`,
  )
}

console.log('\n=== 首次可见 / 首次建成 ===')
for (const [id, t] of Object.entries(firstSeen).sort((a, b) => a[1] - b[1])) {
  const b = BUILDINGS.find((x) => x.id === id)
  const cost = Object.entries(b.cost).map(([k, v]) => `${k} ${v}`).join(' + ')
  console.log(
    `  可见 ${String(Math.round(t / 60)).padStart(3)} 分 ｜ ${(b.name || id).padEnd(6, '　')} ｜ ${cost.padEnd(32)} ｜ ${firstBuilt[id] ? Math.round(firstBuilt[id] / 60) + ' 分建成' : '未建'}`,
  )
}
console.log(`\n合计：前 ${HOURS} 小时露面 ${Object.keys(firstSeen).length} 种建筑`)
