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
import { EVENTS, EVENT_LEVELS, getEventLevel } from '../src/data/events.js'

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
  if (n.anyBuildings) out.push(n.anyBuildings.map(b => `${bname(b.id)} ≥ ${b.count}`).join(' 或 '))
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
  if (e.storageAll) out.push(`通用仓储 +${e.storageAll}（成品按层级折算）`)
  if (e.maxDisciples) out.push(`弟子 +${e.maxDisciples}`)
  if (e.morale) out.push(`士气 +${e.morale}`)
  if (e.consumeRatio) out.push(`消耗 −${pct(e.consumeRatio)}`)
  if (e.craftBonus) out.push(`制作 +${pct(e.craftBonus)}`)
  if (e.craftBonusByResource) for (const [id, value] of Object.entries(e.craftBonusByResource)) out.push(`${res(id)}制作 +${pct(value)}`)
  if (e.disasterGuard) out.push(`灾损 −${pct(e.disasterGuard)}`)
  if (e.ascendBonus) out.push(`仙缘 +${pct(e.ascendBonus)}`)
  if (e.arrivalBonus) out.push(`弟子前来间隔 −${pct(e.arrivalBonus)}`)
  if (e.breakthroughDiscount) out.push(`破境 −${pct(e.breakthroughDiscount)}`)
  if (e.offlineHours) out.push(`离线 +${e.offlineHours}h`)
  if (e.karmaRatio) out.push(`仙缘产出乘区固定 +${e.karmaRatio}`)
  if (e.autoCraft) out.push('自动制作')
  if (e.autoCondense) out.push('节气满仓自动凝石')
  if (e.unlockBuildings?.length) out.push('解锁 ' + e.unlockBuildings.map(bname).join('/'))
  return out.join('；')
}

emit('## A.1 资源\n')
emit('| 资源 | id | 基础上限 | 通用扩仓比例 | 隐藏 | 整枚计数 | 说明 |')
emit('| --- | --- | --- | --- | --- | --- | --- |')
for (const r of RESOURCES) {
  emit(
    `| ${r.name} | \`${r.id}\` | ${r.baseMax === Infinity ? '∞' : r.baseMax} | ${(r.storageWeight ?? 1) * 100}% | ${r.hidden ? '是' : '否'} | ${r.integer ? '是' : '否'} | ${r.desc} |`,
  )
}

emit('\n## A.2 职位\n')
emit('| 职位 | id | 产出 | 每人每秒 | 解锁 |')
emit('| --- | --- | --- | --- | --- |')
for (const j of JOBS) {
  const outputs = [{ resource: j.resource, base: j.base, building: j.building }, ...(j.additionalOutputs || []), ...(j.secondary ? [j.secondary] : [])]
  const output = outputs.map(o => res(o.resource)).join(' + ')
  const rate = outputs.map(o => `${o.building ? bname(o.building) + '启用时' : ''}${o.base}${res(o.resource)}`).join('；')
  emit(`| ${j.name} | \`${j.id}\` | ${output} | ${rate} | ${j.unlocked ? '初始' : needs(j.needs)} |`)
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
emit('炼成后基础效果生效；祭炼 n 级效果 ×(1 + 0.3n)，费用按当前等级以 1.7 倍递增。非感悟材料沿用炼成费用，感悟使用下表祭炼基价，无等级硬上限。\n')
emit('| 法宝 | id | 炼成花费 | 祭炼基础感悟 | 效果 | 解锁 |')
emit('| --- | --- | --- | --- | --- | --- |')
for (const t of TECHNIQUES.filter((x) => x.kind === 'treasure')) {
  const upkeep = t.upkeep ? '；满供消耗 ' + Object.entries(t.upkeep).map(([r, n]) => `${res(r)} ${n}/s`).join('、') + '（随祭炼增长，缺供按比例停效）' : ''
  emit(`| ${t.name} | \`${t.id}\` | ${cost(t.cost)} | ${t.refine?.insight || 0} | ${effects(t.effects)}${upkeep} | ${needs(t.needs)} |`)
}
emit('\n进阶祭炼附加材料：达到指定层数后开始支付，按1.7倍逐层递增，基础祭炼费用照常支付。\n')
emit('| 法宝 | 第几次祭炼起 | 起始附加材料 |')
emit('| --- | --- | --- |')
for (const t of TECHNIQUES.filter(t => t.refine?.materials)) emit(`| ${t.name} | ${(t.refine.materialFromLevel || 0) + 1} | ${cost(t.refine.materials)} |`)

emit('\n## A.7 制作配方\n')
emit('秒数为自动加工基础间隔；实际间隔除以境界加工速度，手动制作瞬时完成。每份收益另乘通用与专业制作加成，普通生产倍率不直接提高配方收益。\n')
emit('| 配方 | id | 基础产出 | 花费 | 基础秒数 | 解锁 |')
emit('| --- | --- | --- | --- | --- | --- |')
for (const c of CRAFTS) {
  emit(`| ${c.name} | \`${c.id}\` | ${res(c.out)} ×${c.amount} | ${cost(c.cost)} | ${c.time} | ${c.unlocked ? '初始' : needs(c.needs)} |`)
}

emit('\n## A.8 境界\n')
emit('| 境界 | 全局倍率 | 破境花费 |')
emit('| --- | --- | --- |')
for (const r of REALMS) emit(`| ${r.name} | ×${r.mult} | ${r.cost ? cost(r.cost) : '—'} |`)

emit('\n## A.9 成就\n')
emit(ACHIEVEMENT_REWARD === 0 ? '成就仅记录行为与进度，当前不提供产出奖励。\n' : `每条成就：+${ACHIEVEMENT_REWARD * 100}% 全局\n`)
emit('| 成就 | id | 条件 |')
emit('| --- | --- | --- |')
for (const a of ACHIEVEMENTS) emit(`| ${a.name} | \`${a.id}\` | ${a.desc} |`)

emit('\n## A.10 随机事件\n')
emit('等级与处理类型独立：' + EVENT_LEVELS.map(l => `**${l.label}**（${l.hint}）`).join(' / ') + '。')
emit('处理类型：**自然环境**（限时影响产出）/ **突发**（立刻结算）/ **选择**（选择一项，收益与代价并列）。')
emit('机缘收益按产能估价，交易需足额付料；灾损可按库存比例或有界产能估价，防务应对可消耗固定成品并获得安宁期。\n')
emit('| 等级 | 类别 | 事件 | id | 色调 | 权重 | 境界 | 收益 | 代价 |')
emit('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
{
  const TYPE_NAME = { nature: '环境', sudden: '突发', choice: '选择' }
  const pct = (v) => `${Math.round(v * 10000) / 100}%`
  const realmOf = (e) => {
    const level = getEventLevel(e)
    const min = Math.max(level.minRealm, e.minRealm || 0)
    const max = Math.min(level.maxRealm, e.maxRealm ?? Infinity)
    return min === max ? REALMS[min].name : `${REALMS[min].name}～${REALMS[max].name}`
  }
  const gains = (spec) => {
    const out = []
    if (spec.lootRate) out.push(Object.entries(spec.lootRate).map(([k, v]) => `${res(k)} ×${v}s`).join('、'))
    if (spec.floor) out.push('保底 ' + Object.entries(spec.floor).map(([k, v]) => `${res(k)} ${v}`).join('、'))
    if (spec.recruit) out.push(`弟子 +${spec.recruit}`)
    if (spec.buff) out.push(`限时 ${spec.buff.mult > 0 ? '+' : ''}${pct(spec.buff.mult)} ${spec.buff.duration}s${spec.buff.target ? '（仅' + res(spec.buff.target) + '）' : ''}`)
    return out.join('；') || '—'
  }
    const costs = (spec) => {
      const out = []
      if (spec.decline) return '不介入，无收益与代价'
      if (spec.tradeCost) out.push(Object.entries(spec.tradeCost).map(([k, v]) => `${res(k)} ${v.seconds}s产能（最低${v.floor}，至多仓储10%或最低值）`).join('、'))
    if (spec.costShare) out.push(Object.entries(spec.costShare).map(([k, v]) => `${res(k)} −${pct(v)}`).join('、'))
    if (spec.cost) out.push(Object.entries(spec.cost).map(([k, v]) => `${res(k)} −${v}`).join('、'))
    if (spec.disaster) out.push(`掠夺 ${spec.disaster.resources.map(res).join('/')} ${pct(spec.disaster.lossPercent[0])}~${pct(spec.disaster.lossPercent[1])}`)
    return out.join('；') || '—'
  }
  for (const e of EVENTS) {
    const type = TYPE_NAME[e.type] || e.type || '—'
    const level = getEventLevel(e).label
    if (e.type === 'choice') {
      emit(`| ${level} | ${type} | **${e.name}** | \`${e.id}\` | ${e.kind} | ${e.weight} | ${realmOf(e)} | 选择一项（见下 ${e.options.length} 行） | ${e.threat ? '5分钟到期默认防守，同类冷却至少20分钟' : '—'} |`)
      for (const o of e.options) {
        emit(`| ${level} | ${type} ▸ | ${o.label} | \`${e.id}\` | — | — | — | ${e.threat ? o.desc : gains(o.effect || {})} | ${e.threat ? '具体用料与减免见 [金丹药圃防务](MIDGAME-EVENTS.md)' : costs(o.effect || {})} |`)
      }
    } else {
      emit(`| ${level} | ${type} | ${e.name} | \`${e.id}\` | ${e.kind} | ${e.weight} | ${realmOf(e)} | ${gains(e)} | ${costs(e)} |`)
    }
  }
}

flush(process.argv[2] || 'docs/TABLES.md')
