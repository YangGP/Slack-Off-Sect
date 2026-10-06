/**
 * 把 src/data/*.js 的内容导出成 Markdown 表格，写成 docs/TABLES.md。
 * 用法：npm run docs:tables   （也可以 `node tools/dump-tables.mjs 别处.md` 指定输出）
 */
import { writeFileSync } from 'node:fs'
import { BUILDINGS, BUILDING_GROUPS } from '../src/data/buildings.js'
import { JOBS } from '../src/data/jobs.js'
import { CULTIVATION, ALL_UPGRADES } from '../src/data/upgrades.js'
import { TECHNIQUES } from '../src/data/techniques.js'
import { CRAFTS } from '../src/data/crafts.js'
import { REALMS } from '../src/data/realms.js'
import { RESOURCES } from '../src/data/resources.js'
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD } from '../src/data/achievements.js'
import { EVENTS } from '../src/data/events.js'

const res = (id) => RESOURCES.find((r) => r.id === id)?.name || id

// 收集所有输出：既打到终端，也写成 docs/TABLES.md
const chunks = []
function emit(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  chunks.push(line)
}
function flush(file) {
  const head = [
    '# 全量数据表（TABLES）',
    '',
    '这份文件由 `npm run docs:tables` 从 `src/data/*.js` **直接生成**，请勿手改；',
    '设计与规则在 [DESIGN.md](./DESIGN.md)，历次平衡改动在 [BALANCE.md](./BALANCE.md)。',
    '',
    '---',
    '',
    '',
  ].join('\n')
  writeFileSync(file, head + chunks.join('\n') + '\n')
  console.log(`已写入 ${file}（${chunks.length} 行）`)
}
const bname = (id) => BUILDINGS.find((b) => b.id === id)?.name || id
const uname = (id) => ALL_UPGRADES.find((u) => u.id === id)?.name || id
const jname = (id) => JOBS.find((j) => j.id === id)?.name || id

const cost = (c) => Object.entries(c).map(([k, v]) => `${res(k)} ${v}`).join(' + ')
const needs = (n) => {
  if (!n) return '—'
  const out = []
  if (n.building) out.push(`${bname(n.building.id)} ≥ ${n.building.count}`)
  if (n.buildings) for (const b of n.buildings) out.push(`${bname(b.id)} ≥ ${b.count}`)
  if (n.upgrade) out.push(`《${uname(n.upgrade)}》`)
  if (n.upgrades) for (const u of n.upgrades) out.push(`《${uname(u)}》`)
  if (n.realm != null) out.push(`境界 ≥ ${REALMS[n.realm].name}`)
  return out.join('、')
}
const effects = (e) => {
  if (!e) return '—'
  const out = []
  const pct = (v) => `${Math.round(v * 10000) / 100}%`
  if (e.prod) out.push('产 ' + Object.entries(e.prod).map(([k, v]) => `${res(k)} +${v}/s`).join(' '))
  if (e.ratio) out.push('率 ' + Object.entries(e.ratio).map(([k, v]) => `${res(k)} +${pct(v)}`).join(' '))
  if (e.ratioAll) out.push(`全局 +${pct(e.ratioAll)}`)
  if (e.jobRatio) out.push('职 ' + Object.entries(e.jobRatio).map(([k, v]) => `${jname(k)} +${pct(v)}`).join(' '))
  if (e.storage) out.push('储 ' + Object.entries(e.storage).map(([k, v]) => `${res(k)} +${v}`).join(' '))
  if (e.storageAll) out.push(`全储 +${e.storageAll}`)
  if (e.maxDisciples) out.push(`弟子 +${e.maxDisciples}`)
  if (e.morale) out.push(`士气 +${e.morale}`)
  if (e.consumeRatio) out.push(`消耗 −${pct(e.consumeRatio)}`)
  if (e.craftBonus) out.push(`制作 +${pct(e.craftBonus)}`)
  if (e.disasterGuard) out.push(`灾损 −${pct(e.disasterGuard)}`)
  if (e.ascendBonus) out.push(`仙缘 +${pct(e.ascendBonus)}`)
  if (e.arrivalBonus) out.push(`弟子前来 +${pct(e.arrivalBonus)}`)
  if (e.breakthroughDiscount) out.push(`破境 −${pct(e.breakthroughDiscount)}`)
  if (e.offlineHours) out.push(`离线 +${e.offlineHours}h`)
  if (e.karmaRatio) out.push(`仙缘系数 +${e.karmaRatio}`)
  if (e.autoCraft) out.push('自动制作')
  if (e.unlockBuildings) out.push('解锁 ' + e.unlockBuildings.map(bname).join('/'))
  return out.join('；')
}

emit('## A.1 资源\n')
emit('| 资源 | id | 基础上限 | 隐藏 | 整枚计数 | 说明 |')
emit('| --- | --- | --- | --- | --- | --- |')
for (const r of RESOURCES) {
  emit(
    `| ${r.name} | \`${r.id}\` | ${r.baseMax === Infinity ? '∞' : r.baseMax} | ${r.hidden ? '是' : '否'} | ${r.integer ? '是' : '否'} | ${r.desc} |`,
  )
}

emit('\n## A.2 职位\n')
emit('| 职位 | id | 产出 | 每人每秒 | 解锁 |')
emit('| --- | --- | --- | --- | --- |')
for (const j of JOBS) {
  emit(`| ${j.name} | \`${j.id}\` | ${res(j.resource)} | ${j.base} | ${j.unlocked ? '初始' : needs(j.needs)} |`)
}

emit('\n## A.3 建筑\n')
for (const g of BUILDING_GROUPS) {
  emit(`### ${g.name}（${g.hint}）\n`)
  emit('| 建筑 | id | 基础造价 | 涨价 | 效果 | 解锁 |')
  emit('| --- | --- | --- | --- | --- | --- |')
  for (const b of BUILDINGS.filter((x) => x.group === g.id)) {
    const up = b.upkeep
      ? '维护 ' + Object.entries(b.upkeep).map(([k, v]) => `${res(k)} −${v}/s`).join(' ')
      : ''
    const eff = [effects(b.effects), up].filter((x) => x && x !== '—').join('；') || '—'
    emit(`| ${b.name} | \`${b.id}\` | ${cost(b.cost)} | ${b.priceRatio} | ${eff} | ${needs(b.needs)} |`)
  }
  emit('')
}

emit('## A.4 修真（研究 / 解锁层）\n')
emit('| 修真 | id | 花费 | 效果 | 解锁 |')
emit('| --- | --- | --- | --- | --- |')
for (const u of CULTIVATION) {
  emit(
    `| ${u.name} | \`${u.id}\` | ${cost(u.cost)} | ${[effects(u.effects), u.note].filter(Boolean).join('；')} | ${needs(u.needs)} |`,
  )
}

emit('\n## A.5 技艺（自己练的手艺）\n')
emit('| 技艺 | id | 花费 | 效果 | 解锁 |')
emit('| --- | --- | --- | --- | --- |')
for (const t of TECHNIQUES.filter((x) => x.kind !== 'treasure')) {
  emit(`| ${t.name} | \`${t.id}\` | ${cost(t.cost)} | ${effects(t.effects)} | ${needs(t.needs)} |`)
}

emit('\n## A.6 法宝（由修真解锁的器物）\n')
emit('| 法宝 | id | 花费 | 效果 | 解锁 |')
emit('| --- | --- | --- | --- | --- |')
for (const t of TECHNIQUES.filter((x) => x.kind === 'treasure')) {
  emit(`| ${t.name} | \`${t.id}\` | ${cost(t.cost)} | ${effects(t.effects)} | ${needs(t.needs)} |`)
}

emit('\n## A.7 制作配方\n')
emit('| 配方 | id | 产出 | 花费 | 解锁 |')
emit('| --- | --- | --- | --- | --- |')
for (const c of CRAFTS) {
  emit(`| ${c.name} | \`${c.id}\` | ${res(c.out)} ×${c.amount} | ${cost(c.cost)} | ${c.unlocked ? '初始' : needs(c.needs)} |`)
}

emit('\n## A.8 境界\n')
emit('| 境界 | 全局倍率 | 破境花费 |')
emit('| --- | --- | --- |')
for (const r of REALMS) emit(`| ${r.name} | ×${r.mult} | ${r.cost ? cost(r.cost) : '—'} |`)

emit('\n## A.9 成就\n')
emit(`每条成就：+${ACHIEVEMENT_REWARD * 100}% 全局\n`)
emit('| 成就 | id | 条件 |')
emit('| --- | --- | --- |')
for (const a of ACHIEVEMENTS) emit(`| ${a.name} | \`${a.id}\` | ${a.desc} |`)

emit('\n## A.10 随机事件\n')
emit('| 事件 | id | 类型 | 权重 | 境界要求 | 效果 |')
emit('| --- | --- | --- | --- | --- | --- |')
for (const e of EVENTS) {
  const eff = []
  const pct = (v) => `${Math.round(v * 10000) / 100}%`
  if (e.buff) {
    eff.push(
      `buff ${e.buff.name || e.name} ${e.buff.mult > 0 ? '+' : ''}${pct(e.buff.mult)} ${e.buff.duration}s${
        e.buff.target ? '（仅' + res(e.buff.target) + '）' : ''
      }`,
    )
  }
  if (e.lootRate) eff.push('按产出发放 ' + Object.entries(e.lootRate).map(([k, v]) => `${res(k)} ×${v}s`).join(' '))
  if (e.floor) eff.push('保底 ' + Object.entries(e.floor).map(([k, v]) => `${res(k)} ${v}`).join(' '))
  if (e.disaster) {
    eff.push(
      `掠夺 ${e.disaster.resources.map(res).join('/')} ${pct(e.disaster.lossPercent[0])}~${pct(
        e.disaster.lossPercent[1],
      )}`,
    )
  }
  if (e.recruit) eff.push(`弟子 +${e.recruit}`)
  emit(`| ${e.name} | \`${e.id}\` | ${e.kind} | ${e.weight} | ${e.minRealm ? REALMS[e.minRealm].name : '—'} | ${eff.join('；')} |`)
}

flush(process.argv[2] || 'docs/TABLES.md')
