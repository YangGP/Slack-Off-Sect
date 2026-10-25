import { openSync, closeSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REALMS } from '../../src/data/realms.js'
import { RESOURCE_MAP } from '../../src/data/resources.js'
import { readResourceRecords } from './resource-recorder.mjs'
import { money } from '../../src/game/decimal.js'

const csv = row => row.map(value => {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}).join(',') + '\n'
const realmName = id => REALMS[id]?.name || String(id)
const resName = id => RESOURCE_MAP[id]?.name || id
const hours = seconds => (seconds / 3600).toFixed(3)

/** All amounts remain decimal strings. Export from persisted facts without simulating. */
export function writeBalanceArtifacts(directory, ledger, pacing = null) {
  const files = {}
  const writeCsv = (name, header, rows) => {
    const path = join(directory, name), fd = openSync(path, 'w')
    try {
      let buffer = csv(header)
      for (const row of rows) {
        buffer += csv(row)
        if (buffer.length >= 64 * 1024) { writeFileSync(fd, buffer); buffer = '' }
      }
      if (buffer) writeFileSync(fd, buffer)
    } finally { closeSync(fd) }
    files[name] = path
  }
  const stages = ledger.stages || []
  const resourceTotals = Object.fromEntries(Object.entries(ledger.opening || {}).map(([id, opening]) =>
    [id, { opening, positive: '0', negative: '0', closing: ledger.closing[id], modelGross: '0', modelExpense: '0' }]))
  for (const flow of ledger.flows) {
    const total = resourceTotals[flow.resource]
    for (const field of ['positive', 'negative']) total[field] = money(total[field]).plus(flow[field]).toString()
    for (const field of ['modelGross', 'modelExpense']) total[field] = money(total[field]).plus(flow.detail[field] || 0).toString()
  }
  writeCsv('totals.csv', ['resource', 'opening', 'actual_increase', 'actual_decrease', 'closing', 'modeled_gross', 'modeled_expense'],
    Object.entries(resourceTotals).map(([id, r]) => [id, r.opening, r.positive, r.negative, r.closing, r.modelGross, r.modelExpense]))
  writeCsv('stages.csv', ['visit', 'life', 'realm', 'from_s', 'to_s', 'duration_s', 'sampled_s', 'only_insight_missing_s', 'materials_ready_s', 'project_missing_s', 'first_materials_ready_s', 'seconds_after_last_readiness', 'last_missing'],
    stages.map(s => [s.visit, s.life, s.realm, s.fromMs / 1000, s.toMs / 1000, s.durationSeconds, s.sampledMs / 1000,
      s.insightOnlyMs / 1000, s.materialsReadyMs / 1000, s.projectBlockedMs / 1000,
      s.firstMaterialsReadySeconds, s.secondsAfterLastReadiness, (s.lastMissing || []).join('|')]))
  writeCsv('resources.csv', ['visit', 'life', 'realm', 'resource', 'opening', 'actual_increase', 'actual_decrease', 'closing', 'modeled_gross', 'modeled_expense'],
    stages.flatMap(s => Object.entries(s.resources).map(([id, r]) => [s.visit, s.life, s.realm, id,
      r.opening, r.positive, r.negative, r.closing, s.model[id]?.modelGross || '0', s.model[id]?.modelExpense || '0'])))
  writeCsv('losses.csv', ['visit', 'life', 'realm', 'resource', 'kind', 'amount'],
    stages.flatMap(s => Object.entries(s.losses).flatMap(([id, losses]) => Object.entries(losses)
      .map(([kind, amount]) => [s.visit, s.life, s.realm, id, kind, amount]))))
  writeCsv('spending.csv', ['visit', 'life', 'realm', 'action', 'resource', 'amount'],
    stages.flatMap(s => Object.entries(s.spending).flatMap(([action, costs]) => Object.entries(costs)
      .map(([id, amount]) => [s.visit, s.life, s.realm, action, id, amount]))))
  writeCsv('flows.csv', ['visit', 'life', 'realm', 'resource', 'source', 'action', 'id', 'craft_mode', 'actual_increase', 'actual_decrease'],
    ledger.flows.map(f => [f.visit, f.life, f.realm, f.resource, f.source, f.action?.type, f.action?.id,
      f.action?.craftMode, f.positive, f.negative]))
  writeCsv('blockers.csv', ['visit', 'life', 'realm', 'kind', 'resource_or_facility', 'sampled_seconds', 'sampled_fraction'],
    stages.flatMap(s => ['shortageMs', 'capacityMs', 'fullMs', 'processingMs', 'buildingBlockedMs'].flatMap(kind =>
      Object.entries(s[kind]).map(([id, ms]) => [s.visit, s.life, s.realm, kind, id, ms / 1000, s.sampledMs ? ms / s.sampledMs : 0]))))
  function* samples() {
    for (const row of readResourceRecords(directory)) if (row.kind === 'snapshot') {
      for (const [id, value] of Object.entries(row.resources)) {
        const cap = row.capacities[id]
        yield [row.seq, row.simulatedMs / 1000, row.realmVisitId, row.lifeId, row.currentRealm, row.online,
          row.reason, id, value, cap?.value, cap?.unlimited ?? false, cap?.unknown ?? false,
          row.rates[id], row.expense[id], row.net[id]]
      }
    }
  }
  writeCsv('samples.csv', ['seq', 'seconds', 'visit', 'life', 'realm', 'online', 'reason', 'resource', 'have', 'capacity', 'unlimited', 'unknown_capacity', 'modeled_rate', 'modeled_expense', 'modeled_net'], samples())
  const summary = {
    schemaVersion: ledger.schemaVersion, runId: ledger.runId, options: ledger.options,
    completed: ledger.completed, stopReason: ledger.stopReason, accountingComplete: ledger.accountingComplete,
    simulatedSeconds: pacing?.simulatedSeconds ?? Math.max(0, ...stages.map(s => s.toMs / 1000)),
    strategy: pacing?.strategy, cumulativeWallSeconds: pacing?.cumulativeWallSeconds,
    attempts: pacing?.attempts, ascensions: pacing?.ascensions, reincarnations: pacing?.reincarnations, deaths: pacing?.deaths,
    firstReach: pacing?.firstReach, firstReadiness: pacing?.firstReadiness,
    wallSeconds: pacing?.wallSeconds,
    wallBudgetChanges: pacing?.wallBudgetChanges,
    immortalInvestments: pacing?.decisionSummary?.immortalInvestments,
    firstFacilities: pacing?.firstFacilities, firstOutput: pacing?.firstOutput, firstAcquired: pacing?.firstAcquired,
    resourceTotals, stages, milestones: ledger.milestones, recipeOutputs: ledger.recipeOutputs, recipeModes: ledger.recipeModes,
    actionSummary: ledger.actionSummary, recordsByKind: ledger.recordsByKind,
    recording: { mode: ledger.sourceSchemaVersion >= 5 ? 'pacing' : 'legacy-detail', sampleSeconds: ledger.options?.sampleSeconds ?? 1800 },
    boundaries: [
      '实际增减为已观察的库存变化；连续生产与维护同时发生时，毛收支仅作模型列示。',
      '重置发放、旧余额镜像恢复也属于实际库存变动，不应当作生产收入；按 flows.csv 的 source/action 区分。阶段期初期末由已对账流水推导。',
      '截断、取整、逸散和重置损失分列；离线近似的逸散与截断无法拆分时保留合并字段。损失不可再次从期末余额扣除。',
      '缺料、满仓、加工状态与降载时长按观察区间左端统计，允许重叠，不能相加当作总卡关时间。',
      '新格式将资源收支和阻塞累计时长合成一条窗口记录，不保留5秒状态切换轨迹；blockers.csv的sampled_fraction以所属阶段观察时长为分母。',
      'materials_ready 表示已观察到材料齐备但尚未飞升的时长，不自动归因为机器人等待；加工状态不全是阻塞。',
      '默认记录整体节奏：资源收支按时间窗口、阶段、来源及用途汇总，正向和负向分别累计；不保存普通动作、配置请求或调用计数。',
      '关键研究、首次设施、突破、重置及异常保留节点；records-*.jsonl 可重建阶段统计，不能还原逐动作轨迹。历史详细格式按原记录读取。',
      ...(pacing?.boundaries || []),
    ], files,
  }
  const lines = [
    '# 飞升测定报告', '',
    `状态：${summary.completed ? '目标已完成' : '未完成'}；停止原因：${summary.stopReason}；账本对账：${summary.accountingComplete ? '一致' : '不一致'}。`, '',
    `累计游戏时间：${hours(summary.simulatedSeconds)} 小时。策略：${summary.strategy || '见 result.json'}。`, '',
    ...(pacing?.cumulativeWallSeconds == null ? [] : [
      `计算耗时：本次${pacing.wallSeconds.toFixed(3)}秒，全程累计${pacing.cumulativeWallSeconds.toFixed(3)}秒；单次预算${pacing.options.wallSeconds}秒，累计预算${pacing.options.totalWallSeconds ?? pacing.options.wallSeconds}秒。`,
      'wall-budget为本次运行预算截止，total-wall-budget为全程累计预算截止；两者均不表示已完成或不可达。', '',
    ]),
    '| 世次 | 阶段访问 | 境界 | 开始(h) | 结束(h) | 停留(h) | 仅缺灵机(h) | 材料齐备(h) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...stages.map(s => `| ${s.life} | ${s.visit} | ${realmName(s.realm)} | ${hours(s.fromMs / 1000)} | ${hours(s.toMs / 1000)} | ${hours(s.durationSeconds)} | ${hours(s.insightOnlyMs / 1000)} | ${hours(s.materialsReadyMs / 1000)} |`), '',
    '按阶段缺料记录（重叠时长分别列示）：', '',
    ...stages.flatMap(s => Object.entries(s.shortageMs).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, ms]) => `- 第${s.life}世／访问${s.visit} ${realmName(s.realm)}：${resName(id)} ${hours(ms / 1000)} 小时。`)), '',
    '仓容不足与满仓时间：', '',
    ...stages.flatMap(s => ['capacityMs', 'fullMs'].flatMap(kind => Object.entries(s[kind]).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([id, ms]) => `- 第${s.life}世／${realmName(s.realm)}：${resName(id)}${kind === 'capacityMs' ? '仓容不足' : '满仓'} ${hours(ms / 1000)} 小时。`))), '',
    '实际损失（满仓时长不等于溢出损失）：', '',
    ...stages.flatMap(s => Object.entries(s.losses).flatMap(([id, losses]) => Object.entries(losses).filter(([, value]) => money(value).gt(0))
      .map(([kind, value]) => `- 第${s.life}世／${realmName(s.realm)}：${resName(id)} ${kind} ${value}。`))), '',
    '数据文件：resources.csv 为阶段收支，spending.csv 为支出用途汇总，losses.csv 为损失，blockers.csv 为状态时长，samples.csv 为周期及关键快照。完整结算见 result.json。', '',
    ...summary.boundaries.map(text => `- ${text}`), '',
  ]
  writeFileSync(join(directory, 'summary.json'), JSON.stringify(summary, null, 2))
  writeFileSync(join(directory, 'summary.md'), lines.join('\n'))
  return { summary: join(directory, 'summary.json'), markdown: join(directory, 'summary.md'), ...files }
}
