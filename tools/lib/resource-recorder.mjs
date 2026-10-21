import { mkdirSync, writeFileSync, readFileSync, renameSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { RESOURCES } from '../../src/data/resources.js'
import { money, ZERO } from '../../src/game/decimal.js'
import { checkpointText, parseCheckpoint } from './measurement-state.mjs'
import { recordingChoices } from './recording-queries.mjs'

const VERSION = 7
const sha = value => createHash('sha256').update(value).digest('hex')
const amount = value => money(value ?? ZERO)
const strings = values => Object.fromEntries(Object.entries(values).map(([id, v]) => [id, amount(v).toString()]))
const capacity = value => value == null ? { unknown: true } : value.isFinite()
  ? { unlimited: false, value: value.toString() } : { unlimited: true }
const modelFields = ['modelGross', 'modelExpense', 'netClipped', 'roundingLoss', 'decayLoss', 'decayAndClippingLoss']
function atomic(path, content) { writeFileSync(path + '.tmp', content); renameSync(path + '.tmp', path) }

const pacingMaps = ['shortageMs', 'capacityMs', 'fullMs', 'processingMs', 'buildingBlockedMs']
const pacingSums = ['sampledMs', 'insightOnlyMs', 'materialsReadyMs', 'projectBlockedMs']
function pacingStats() {
  return { ...Object.fromEntries(pacingSums.map(key => [key, 0])),
    ...Object.fromEntries(pacingMaps.map(key => [key, {}])), hadMissing: false }
}
function accumulatePacing(stats, row, origin) {
  const addMs = (map, key) => { map[key] = (map[key] || 0) + row.duration }
  stats.sampledMs += row.duration
  if (row.missing.length) {
    stats.hadMissing = true
    stats.lastMissing = row.missing
    stats.lastMissingSeconds = (row.end - origin) / 1000
    stats.readySinceSeconds = null
  } else if (!row.canAscend) {
    stats.firstMaterialsReadySeconds ??= (row.start - origin) / 1000
    stats.readySinceSeconds ??= (row.start - origin) / 1000
  }
  stats.lastReadiness = Object.fromEntries(Object.entries(row.ready || {}).map(([id, at]) => [id, (at - origin) / 1000]))
  if (row.insightOnly) stats.insightOnlyMs += row.duration
  if (!row.missing.length && !row.canAscend) stats.materialsReadyMs += row.duration
  if (row.projectsReady === false) stats.projectBlockedMs += row.duration
  for (const id of row.missing) addMs(stats.shortageMs, id)
  for (const id of row.capacityBlocked) addMs(stats.capacityMs, id)
  for (const id of row.full || []) addMs(stats.fullMs, id)
  for (const id of row.buildingBlocked || []) addMs(stats.buildingBlockedMs, id)
  for (const line of row.processing || []) addMs(stats.processingMs,
    `${line.resource}:${line.recipe}:${line.unlocked ? line.reason || 'unknown' : '配方未解锁'}`)
}
function mergePacing(stage, bucket, stats) {
  for (const key of pacingSums) stage[key] += stats[key]
  for (const key of pacingMaps) for (const [id, ms] of Object.entries(stats[key])) stage[key][id] = (stage[key][id] || 0) + ms
  if (stats.firstMaterialsReadySeconds != null) stage.firstMaterialsReadySeconds ??= stats.firstMaterialsReadySeconds
  if (stats.hadMissing) stage.readySinceSeconds = stats.readySinceSeconds ?? null
  else if (stats.readySinceSeconds != null) stage.readySinceSeconds ??= stats.readySinceSeconds
  if (stats.lastMissing) {
    stage.lastMissing = stats.lastMissing
    stage.lastMissingSeconds = stats.lastMissingSeconds
  }
  stage.lastReadiness = stats.lastReadiness
  bucket.durationMs += stats.sampledMs
  bucket.insightOnlyMs += stats.insightOnlyMs
  for (const key of ['shortageMs', 'capacityMs']) for (const [id, ms] of Object.entries(stats[key])) bucket[key][id] = (bucket[key][id] || 0) + ms
}

export function resourceWriteCoverage() {
  const sites = [], missing = []
  const paths = ['src/game/state.js']
  const walk = dir => {
    for (const file of readdirSync(dir, { withFileTypes: true })) {
      if (file.isDirectory()) walk(`${dir}/${file.name}`)
      else if (file.name.endsWith('.js')) paths.push(`${dir}/${file.name}`)
    }
  }
  walk('src/game/systems'); walk('src/modules')
  for (const path of paths) {
    const text = readFileSync(path, 'utf8')
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    if (/\b\w+\.resources(?:\s*\[[^\]]+\]|\.\w+)?\s*(?:=(?!=)|\+=|-=)|Object\.assign\(\s*\w+\.resources/.test(code)) missing.push(path)
    const sources = [...new Set([...text.matchAll(/source:\s*['"]([^'"]+)['"]/g)].map(match => match[1]))]
    if (sources.length) sites.push({ path, sources })
  }
  return { sites, uninstrumentedRuntimeWrites: missing,
    excluded: ['new-state initialization', 'save/migrations (not used for runtime resume)', 'store debug setter (not used by simulator)'] }
}

export function measurementSources() {
  const files = []
  const walk = dir => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${item.name}`
      if (item.isDirectory()) walk(path)
      else if (/\.(js|mjs|json)$/.test(item.name)) files.push(path)
    }
  }
  walk('src'); walk('tools'); files.push('package.json', 'package-lock.json')
  if (process.argv[1] && existsSync(process.argv[1])) files.push(resolve(process.argv[1]))
  return Object.fromEntries([...new Set(files)].sort().map(path => [path, sha(readFileSync(path))]))
}

export function loadMeasurementCheckpoint(path, sources = measurementSources()) {
  const envelope = JSON.parse(readFileSync(path, 'utf8'))
  if (sha(JSON.stringify(envelope.payload)) !== envelope.sha256) throw Error('Checkpoint checksum mismatch')
  const cp = parseCheckpoint(JSON.stringify(envelope.payload))
  if (cp.version !== VERSION || cp.node !== process.version || sha(JSON.stringify(cp.sources)) !== sha(JSON.stringify(sources))) throw Error('Checkpoint schema/source/bundle mismatch')
  if (resolve(dirname(path)) !== resolve(cp.directory)) throw Error('Checkpoint directory mismatch')
  if (cp.simulator.terminal) throw Error('Measurement already complete; do not resume a completed run')
  for (const file of cp.recorder.files) {
    if (!/^records-\d{6}\.jsonl$/.test(file.name)) throw Error('Invalid chunk filename')
    if (sha(readFileSync(join(cp.directory, file.name))) !== file.sha256) throw Error(`Corrupt record chunk: ${file.name}`)
  }
  return cp
}

/** Actual mutation facts are authoritative; inventory snapshots provide independent reconciliation. */
export function createResourceRecorder({ root = '.resource-records', options = {}, runId = randomUUID(),
  sources = measurementSources(), resume = null, maxBytes = resume?.recorder.maxBytes ?? 1024 ** 3,
  chunkBytes = resume?.recorder.chunkBytes ?? 4 * 1024 ** 2 } = {}) {
  const dir = resume?.directory || resolve(root, runId)
  if (!resume && existsSync(dir)) throw Error(`Measurement directory already exists: ${dir}`)
  mkdirSync(dir, { recursive: true })
  let seq = resume?.recorder.seq || 0, actionSeq = resume?.recorder.actionSeq || 0
  const files = [...(resume?.recorder.files || [])]
  let bytes = files.reduce((sum, f) => sum + f.bytes, 0), buffer = [], bufferedBytes = 0, firstSeq = seq + 1
  let failure = null, recordBudget = false, opening = resume?.recorder.opening || null
  const totals = { ...(resume?.recorder.totals || {}) }, residuals = []
  let pacing = null, pacingStart = null
  let continuous = {}, continuousStart = null, lastSnapshot = resume?.recorder.lastSnapshot ?? -Infinity
  let interval = resume?.recorder.interval || null, env = {}, environment = () => ({})
  let environmentKey = resume?.recorder.environmentKey || null, visit = resume?.recorder.visit || 0
  let quoteRevision = resume?.recorder.quoteRevision || 0, ready = resume?.recorder.ready || {}, quoteKey = resume?.recorder.quoteKey || null
  let choicesKey = resume?.recorder.choicesKey || null
  let clockOrigin = resume?.recorder.clockOrigin ?? null, observedState = null, observedDerived = null
  const coverage = { resources: RESOURCES.map(r => r.id), writePaths: resourceWriteCoverage(), accounting: 'windowed resource totals + independent inventory/disk reconciliation',
    continuous: 'engine combined net settlements; gross/expense are models',
    precision: 'pacing durations accumulated at engine boundaries and persisted per window; offline approximation stays approximate', resume: 'runtime state + all harness variables and RNG streams',
    actions: 'no ordinary action logs or request counters; milestones and errors only; resource flows grouped by window, resource, source and purpose' }
  if (coverage.writePaths.uninstrumentedRuntimeWrites.length) throw Error(`Resource write paths lack observation: ${coverage.writePaths.uninstrumentedRuntimeWrites}`)
  const manifest = { schemaVersion: VERSION, runId: resume?.runId || runId, options, node: process.version,
    command: process.argv, sources, coverage, startedAt: new Date().toISOString() }
  atomic(join(dir, 'coverage.json'), JSON.stringify(coverage, null, 2))
  atomic(join(dir, 'manifest.json'), JSON.stringify({ ...manifest, status: 'running', files, seq, bytes }, null, 2))
  const check = () => { if (failure) throw failure }
  function flush() {
    check()
    if (!buffer.length) return
    const content = buffer.join(''), name = `records-${String(files.length).padStart(6, '0')}.jsonl`
    atomic(join(dir, name), content)
    files.push({ name, bytes: Buffer.byteLength(content), firstSeq, lastSeq: seq, sha256: sha(content), count: buffer.length })
    bytes += Buffer.byteLength(content); buffer = []; bufferedBytes = 0; firstSeq = seq + 1
  }
  function write(kind, row) {
    check()
    const text = JSON.stringify({ seq: ++seq, runId: manifest.runId, kind, ...env, ...row }) + '\n'
    buffer.push(text); bufferedBytes += Buffer.byteLength(text)
    if (bytes + bufferedBytes >= maxBytes) recordBudget = true
    if (bufferedBytes >= chunkBytes) flush()
  }
  const guard = run => { try { run() } catch (error) { failure ||= error } }
  function closeInterval(at) {
    if (interval && at > interval.start) {
      pacing ??= pacingStats(); pacingStart ??= interval.start
      accumulatePacing(pacing, { ...interval.row, start: interval.start, end: at, duration: at - interval.start }, clockOrigin)
    }
    interval = null
  }
  function endWindow(at) {
    const activeInterval = interval
    closeInterval(at)
    if (continuousStart != null || pacing) write('window', { at,
      simulatedMs: clockOrigin == null ? null : at - clockOrigin,
      start: Math.min(continuousStart ?? at, pacingStart ?? at), end: at,
      flows: Object.values(continuous), pacing })
    continuous = {}; continuousStart = null; pacing = null; pacingStart = null
    if (activeInterval) interval = { ...activeInterval, start: at }
  }
  function syncEnvironment(at, value = environment()) {
    const key = `${value.lifeId}:${value.currentRealm}:${value.online}`
    if (key !== environmentKey) {
      endWindow(at); interval = null
      if (key.split(':').slice(0, 2).join(':') !== environmentKey?.split(':').slice(0, 2).join(':')) {
        visit++; ready = {}; quoteKey = null
      }
      environmentKey = key
    }
    env = { ...value, at, simulatedMs: clockOrigin == null ? null : at - clockOrigin, realmVisitId: visit }
  }
  function reconcile(state, where) {
    const residual = {}
    for (const r of RESOURCES) {
      const error = amount(state.resources[r.id]).minus(amount(opening[r.id]).plus(totals[r.id] || 0))
      const tolerance = amount(state.resources[r.id]).abs().times('1e-30').plus('1e-18')
      if (error.abs().gt(tolerance)) residual[r.id] = error.toString()
    }
    if (Object.keys(residual).length) residuals.push({ where, seq, residual })
    return residual
  }
  function snapshot(state, derived, at, reason = 'periodic') {
    syncEnvironment(at)
    endWindow(at)
    write('snapshot', { reason, resources: strings(state.resources), capacities: Object.fromEntries(RESOURCES.map(r => [r.id, capacity(derived.max[r.id])])),
      rates: strings(derived.rates), net: strings(derived.net), expense: strings(derived.expense || {}),
      population: state.disciples.total, jobs: state.disciples.jobs })
    lastSnapshot = at
  }
  const observer = {
    begin(detail) {
      const action = { actionId: ++actionSeq, parentActionId: detail.parent?.actionId || null, type: detail.type, id: detail.id,
        resetEnvironment: detail.type === 'resetForRebirth' ? environment() : detail.parent?.resetEnvironment,
        craftMode: detail.type === 'craft' ? 'manual' : detail.parent?.craftMode ||
          (['settleCraftCopies', 'addCraftGain', 'runAutoCondense', 'runAutoCondenseBatch'].includes(detail.type) ? 'automatic' : null) }
      guard(() => {
        syncEnvironment(detail.at)
        const transition = !action.parentActionId && ['breakthrough', 'resetForRebirth'].includes(detail.type)
        const milestone = !action.parentActionId && (detail.type === 'research'
          || detail.type === 'buyBuilding' && !(observedState?.buildings[detail.id]?.count > 0))
        if (transition || milestone) action.milestone = `${detail.type}:${detail.id || ''}`
        if (transition && observedDerived) snapshot(observedState, observedDerived, detail.at, `before:${action.milestone}`)
      })
      return action
    },
    end(action, result) { guard(() => {
      if (!result.ok) write('action-error', { type: action.type, id: action.id, error: result.error })
      else if (action.milestone && result.result !== false) {
        write('milestone', { type: action.type, id: action.id, result: result.result })
      }
      if (action.milestone && ['breakthrough', 'resetForRebirth'].includes(action.type)) {
        // Failures can consume resources or reset the realm too.
        write('transition', { type: action.type, id: action.id, ...result })
        if (observedDerived) snapshot(observedState, observedDerived, env.at, `after:${action.milestone}`)
      }
    }) },
    mutation({ id, before, after, at, action, detail }) {
      guard(() => {
        syncEnvironment(at, action?.resetEnvironment || environment())
        const delta = amount(after).minus(amount(before)), source = detail.source || 'unknown'
        if (delta.isZero() && modelFields.every(f => amount(detail[f]).isZero())) return
        totals[id] = amount(totals[id]).plus(delta).toString()
        // Keep purpose and manual/automatic attribution, never per-call IDs or payloads.
        const attribution = action ? { type: action.type, id: action.id, craftMode: action.craftMode,
          reset: !!action.resetEnvironment || action.type === 'resetForRebirth' } : null
        const key = JSON.stringify([id, source, attribution]), existing = continuous[key]
        if (existing) {
          existing.delta = amount(existing.delta).plus(delta).toString()
          const direction = delta.gt(0) ? 'positive' : 'negative'
          existing[direction] = amount(existing[direction]).plus(delta.abs()).toString()
          for (const f of modelFields) if (detail[f] != null) existing.detail[f] = amount(existing.detail[f]).plus(detail[f]).toString()
        } else {
          continuousStart ??= at
          continuous[key] = { resource: id, source, action: attribution, delta: delta.toString(),
            positive: delta.gt(0) ? delta.toString() : '0', negative: delta.lt(0) ? delta.neg().toString() : '0',
            detail: Object.fromEntries(modelFields.filter(f => detail[f] != null).map(f => [f, amount(detail[f]).toString()])) }
        }
      })
    },
  }
  if (resume) {
    const known = new Set(files.map(f => f.name))
    for (const name of readdirSync(dir)) if (/^records-\d+\.jsonl$/.test(name) && !known.has(name)) {
      renameSync(join(dir, name), join(dir, `${name}.orphan-${Date.now()}`))
    }
  }
  function open(state, at = 0, derived = null) {
    observedState = state; observedDerived = derived; clockOrigin ??= at
    if (opening) return
    opening = strings(state.resources); syncEnvironment(at); write('opening', { resources: opening })
  }
  function observe(state, derived, at, diagnostics, extra = {}) {
    observedState = state; observedDerived = derived
    check(); syncEnvironment(at)
    const residual = reconcile(state, 'observation')
    if (Object.keys(residual).length) throw Error(`Unrecorded resource mutation: ${JSON.stringify(residual)}`)
    if (at - lastSnapshot >= (options.sampleSeconds ?? 1800) * 1000) snapshot(state, derived, at)
    const key = JSON.stringify(diagnostics.selectedCost)
    if (key !== quoteKey) { quoteKey = key; quoteRevision++; ready = {} }
    const missing = diagnostics.missing.map(m => m.resource)
    for (const id of Object.keys(diagnostics.selectedCost)) {
      if (missing.includes(id)) delete ready[id]; else ready[id] ??= at
    }
    const full = RESOURCES.filter(r => derived.max[r.id]?.isFinite() && derived.max[r.id].gt(0) && amount(state.resources[r.id]).gte(derived.max[r.id])).map(r => r.id)
    const processing = diagnostics.missing.filter(m => m.recipe).map(m => ({ resource: m.resource, recipe: m.recipe,
      unlocked: m.recipeUnlocked, reason: m.processing?.reason || null }))
    const buildingBlocked = Object.entries(derived.buildingSupply || {}).filter(([id, ratio]) =>
      state.buildings[id]?.count > 0 && state.buildings[id].on !== false && ratio < 1 - 1e-9).map(([id]) => id)
    const row = { ...env, ...extra, quoteRevision, selectedCost: diagnostics.selectedCost, missing,
      capacityBlocked: diagnostics.missing.filter(m => m.capacityBlocked).map(m => m.resource), full,
      processing, buildingBlocked, ready: { ...ready }, canAscend: diagnostics.targetRealmName === '可飞升',
      insightOnly: missing.length === 1 && missing[0] === 'insight' }
    delete row.at
    const { simulatedMs, ...signatureState } = row
    const signature = JSON.stringify(signatureState)
    if (signature !== interval?.signature) { closeInterval(at); interval = { start: at, signature, row } }
  }
  function choices(state, derived, at) {
    syncEnvironment(at)
    const value = Object.fromEntries(Object.entries(recordingChoices(state, derived)).map(([group, rows]) =>
      [group, rows.map(({ id, visible, available, learned }) => ({ id, visible, available, learned }))]))
    const key = JSON.stringify(value)
    if (key !== choicesKey) {
      const previous = choicesKey ? JSON.parse(choicesKey) : {}, changes = {}
      for (const [group, rows] of Object.entries(value)) {
        const prior = Object.fromEntries((previous[group] || []).map(row => [row.id, JSON.stringify(row)]))
        changes[group] = rows.filter(row => prior[row.id] !== JSON.stringify(row))
      }
      write('choices', { initial: !choicesKey, changes }); choicesKey = key
    }
  }
  function checkpoint(simulator, state, derived, at) {
    check(); snapshot(state, derived, at, 'checkpoint'); flush()
    const recorder = { seq, actionSeq, files: [...files], opening, totals, lastSnapshot, environmentKey, visit, quoteRevision, ready, quoteKey,
      interval, choicesKey, maxBytes, chunkBytes, clockOrigin }
    const cp = { version: VERSION, node: process.version, directory: dir, runId: manifest.runId, sources, options, simulator, recorder }
    const path = join(dir, 'checkpoint.json')
    if (existsSync(path)) atomic(join(dir, 'checkpoint.previous.json'), readFileSync(path))
    const payload = checkpointText(cp)
    atomic(path, JSON.stringify({ sha256: sha(payload), payload: JSON.parse(payload) }))
    atomic(join(dir, 'manifest.json'), JSON.stringify({ ...manifest, status: 'checkpoint', seq, files, bytes }, null, 2))
    return path
  }
  function finish(state, { completed = false, stopReason = '', elapsed = 0, derived } = {}) {
    check()
    if (derived) snapshot(state, derived, elapsed, 'final')
    else { syncEnvironment(elapsed); endWindow(elapsed) }
    interval = null
    reconcile(state, 'final'); write('closing', { resources: strings(state.resources), completed, stopReason }); flush()
    atomic(join(dir, 'manifest.json'), JSON.stringify({ ...manifest, files, bytes, seq, completed, stopReason }, null, 2))
    const report = rebuildResourceReport(dir)
    report.observationResiduals = residuals
    report.accountingComplete &&= !residuals.length
    atomic(join(dir, 'report.json'), JSON.stringify(report, null, 2))
    return { dir, report }
  }
  function abort(error) {
    // Best effort only: never replace a known-good checkpoint with a partial economic action.
    try { atomic(join(dir, 'failure.json'), JSON.stringify({ seq, error: String(error?.stack || error), files, at: env.at }, null, 2)) } catch { /* disk may be unavailable */ }
  }
  return { dir, observer, open, observe, choices, snapshot, checkpoint, finish, check, abort,
    setEnvironment: fn => { environment = fn }, get recordBudget() { return recordBudget },
    get readiness() { return { quoteRevision, ready: { ...ready } } } }
}

/** Stream checked chunks; summary/export share exactly the same persisted facts. */
export function* readResourceRecords(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  let expectedSeq = 1
  for (const file of manifest.files) {
    if (!/^records-\d{6}\.jsonl$/.test(file.name)) throw Error('Invalid record chunk filename')
    const content = readFileSync(join(dir, file.name))
    if (sha(content) !== file.sha256) throw Error(`Record checksum mismatch: ${file.name}`)
    for (const line of content.toString('utf8').trim().split('\n')) {
      if (!line) continue
      const row = JSON.parse(line)
      if (row.seq !== expectedSeq++) throw Error('Record sequence gap or duplicate')
      yield row
    }
  }
  if (manifest.seq != null && expectedSeq - 1 !== manifest.seq) throw Error('Record manifest sequence mismatch')
}

/** Re-read persisted facts independently. Corrupt or missing chunks are errors, not zero income. */
export function rebuildResourceReport(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  let opening = null, closing = null, origin = null, records = 0
  const totals = {}, flows = {}, recipeOutputs = {}, recipeModes = {}, exposure = {}, stages = {}, milestones = []
  const actionSummary = {}, recordsByKind = {}
  const add = (map, id, value) => { map[id] = amount(map[id]).plus(value).toString() }
  for (const row of readResourceRecords(dir)) {
      records++
      recordsByKind[row.kind] = (recordsByKind[row.kind] || 0) + 1
      if (origin == null) origin = row.at
      const stage = stages[row.realmVisitId] ||= { visit: row.realmVisitId, life: row.lifeId, realm: row.currentRealm,
        fromMs: row.at - origin, toMs: row.at - origin, sampledMs: 0, materialsReadyMs: 0, projectBlockedMs: 0,
        insightOnlyMs: 0, shortageMs: {}, capacityMs: {}, fullMs: {}, processingMs: {}, buildingBlockedMs: {},
        resources: {}, losses: {}, model: {}, spending: {} }
      stage.fromMs = Math.min(stage.fromMs, (row.start ?? row.at) - origin)
      stage.toMs = Math.max(stage.toMs, (row.end ?? row.at) - origin)
      if (row.kind === 'milestone') milestones.push({ seq: row.seq, visit: row.realmVisitId,
        life: row.lifeId, realm: row.currentRealm, seconds: (row.at - origin) / 1000, reason: `${row.type}:${row.id || ''}` })
      if (row.kind === 'snapshot' && row.reason !== 'periodic') milestones.push({ seq: row.seq, visit: row.realmVisitId,
        life: row.lifeId, realm: row.currentRealm, seconds: (row.at - origin) / 1000, reason: row.reason })
      if (row.kind === 'opening') opening = row.resources
      if (row.kind === 'closing') closing = row.resources
      if (row.kind === 'action-summary') for (const action of row.actions) {
        const key = JSON.stringify([row.realmVisitId, action.type, action.id, action.outcome])
        const entry = actionSummary[key] ||= { visit: row.realmVisitId, life: row.lifeId, realm: row.currentRealm,
          type: action.type, id: action.id, outcome: action.outcome, count: 0 }
        entry.count += action.count
      }
      if (row.kind === 'mutation' || row.kind === 'settlement' || row.kind === 'window') for (const entry of row.flows || [row]) {
        // Schema 6/7 store one window envelope; older records store one resource per row.
        const flowRow = { ...row, ...entry }
        totals[flowRow.resource] = amount(totals[flowRow.resource]).plus(flowRow.delta).toString()
        const resource = stage.resources[flowRow.resource] ||= { positive: '0', negative: '0' }
        resource.positive = amount(resource.positive).plus(flowRow.positive).toString()
        resource.negative = amount(resource.negative).plus(flowRow.negative).toString()
        const losses = stage.losses[flowRow.resource] ||= {}
        const model = stage.model[flowRow.resource] ||= {}
        for (const field of modelFields) if (flowRow.detail[field] != null) {
          add(field.startsWith('model') ? model : losses, field, flowRow.detail[field])
        }
        const reset = flowRow.action?.reset === true || flowRow.action?.resetEnvironment != null || flowRow.action?.type === 'resetForRebirth' || flowRow.source === 'resetForRebirth'
        if (reset && amount(flowRow.negative).gt(0)) add(losses, 'resetLoss', flowRow.negative)
        if (!reset && flowRow.action && amount(flowRow.negative).gt(0)) {
          const destination = `${flowRow.action.type}:${flowRow.action.id || ''}:${flowRow.action.craftMode || ''}`
          add(stage.spending[destination] ||= {}, flowRow.resource, flowRow.negative)
        }
        const key = `${flowRow.realmVisitId}:${flowRow.resource}:${flowRow.source}:${flowRow.action?.type || 'continuous'}:${flowRow.action?.id || ''}:${flowRow.action?.craftMode || ''}`
        const flow = flows[key] ||= { resource: flowRow.resource, source: flowRow.source, visit: flowRow.realmVisitId, life: flowRow.lifeId, realm: flowRow.currentRealm,
          action: flowRow.action || null, positive: '0', negative: '0', detail: {} }
        flow.positive = amount(flow.positive).plus(flowRow.positive).toString()
        flow.negative = amount(flow.negative).plus(flowRow.negative).toString()
        for (const f of modelFields) if (flowRow.detail[f] != null) flow.detail[f] = amount(flow.detail[f]).plus(flowRow.detail[f]).toString()
        if (flowRow.action?.type === 'addCraftGain' && amount(flowRow.positive).gt(0)) {
          recipeOutputs[flowRow.action.id] = amount(recipeOutputs[flowRow.action.id]).plus(flowRow.positive).toString()
          const modes = recipeModes[flowRow.action.id] ||= { manual: '0', automatic: '0' }
          const mode = flowRow.action.craftMode || 'automatic'
          modes[mode] = amount(modes[mode]).plus(flowRow.positive).toString()
        }
      }
      if (row.kind === 'interval' || row.kind === 'window' && row.pacing) {
        const key = `${row.lifeId}:${row.realmVisitId}:${row.online ? 'online' : 'offline'}`
        const bucket = exposure[key] ||= { durationMs: 0, insightOnlyMs: 0, shortageMs: {}, capacityMs: {} }
        const stats = row.kind === 'interval' ? pacingStats() : row.pacing
        if (row.kind === 'interval') accumulatePacing(stats, row, origin)
        mergePacing(stage, bucket, stats)
      }
  }
  if (!opening || !closing) throw Error('Opening/closing state missing; measurement is incomplete')
  const residual = {}
  for (const id of new Set([...Object.keys(opening), ...Object.keys(closing)])) {
    const error = amount(closing[id]).minus(amount(opening[id])).minus(totals[id] || 0)
    if (error.abs().gt(amount(closing[id]).abs().times('1e-30').plus('1e-18'))) residual[id] = error.toString()
  }
  const stageList = Object.values(stages).sort((a, b) => a.visit - b.visit)
  const balances = { ...opening }
  for (const stage of stageList) {
    for (const id of new Set([...Object.keys(balances), ...Object.keys(stage.resources)])) {
      const res = stage.resources[id] ||= { positive: '0', negative: '0' }
      res.opening = balances[id] || '0'
      res.closing = amount(res.opening).plus(res.positive).minus(res.negative).toString()
      balances[id] = res.closing
    }
    stage.durationSeconds = (stage.toMs - stage.fromMs) / 1000
    stage.secondsAfterLastReadiness = stage.readySinceSeconds == null ? null : stage.toMs / 1000 - stage.readySinceSeconds
  }
  return { schemaVersion: VERSION, sourceSchemaVersion: manifest.schemaVersion, runId: manifest.runId, options: manifest.options,
    completed: manifest.completed ?? false, stopReason: manifest.stopReason ?? 'incomplete',
    accountingComplete: !Object.keys(residual).length, opening, closing,
    residual, totals, flows: Object.values(flows), recipeOutputs, recipeModes, exposure, stages: stageList, milestones,
    ...(Object.keys(actionSummary).length ? { actionSummary: Object.values(actionSummary) } : {}), recordsByKind, records }
}
