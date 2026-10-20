import { mkdirSync, writeFileSync, readFileSync, renameSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { RESOURCES } from '../../src/data/resources.js'
import { money, ZERO } from '../../src/game/decimal.js'
import { checkpointText, parseCheckpoint } from './measurement-state.mjs'
import { recordingChoices, recordingProcessing } from './recording-queries.mjs'

const VERSION = 3
const sha = value => createHash('sha256').update(value).digest('hex')
const amount = value => money(value ?? ZERO)
const strings = values => Object.fromEntries(Object.entries(values).map(([id, v]) => [id, amount(v).toString()]))
const capacity = value => value == null ? { unknown: true } : value.isFinite()
  ? { unlimited: false, value: value.toString() } : { unlimited: true }
const modelFields = ['modelGross', 'modelExpense', 'netClipped', 'roundingLoss', 'decayLoss', 'decayAndClippingLoss']
function atomic(path, content) { writeFileSync(path + '.tmp', content); renameSync(path + '.tmp', path) }

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
  let continuous = {}, continuousStart = null, lastSnapshot = resume?.recorder.lastSnapshot ?? -Infinity
  let interval = resume?.recorder.interval || null, env = {}, environment = () => ({})
  let environmentKey = resume?.recorder.environmentKey || null, visit = resume?.recorder.visit || 0
  let quoteRevision = resume?.recorder.quoteRevision || 0, ready = resume?.recorder.ready || {}, quoteKey = resume?.recorder.quoteKey || null
  let choicesKey = resume?.recorder.choicesKey || null
  let clockOrigin = resume?.recorder.clockOrigin ?? null, observedState = null, observedDerived = null
  const coverage = { resources: RESOURCES.map(r => r.id), writePaths: resourceWriteCoverage(), accounting: 'mutation facts + independent inventory/disk reconciliation',
    continuous: 'engine combined net settlements; gross/expense are models',
    precision: 'online engine boundaries; offline approximation stays approximate', resume: 'runtime state + all harness variables and RNG streams' }
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
  function endContinuous(at) {
    for (const row of Object.values(continuous)) write('settlement', { ...row, start: continuousStart, end: at })
    continuous = {}; continuousStart = null
  }
  function closeInterval(at) {
    if (interval) write('interval', { ...interval.row, start: interval.start, end: at, duration: at - interval.start })
    interval = null
  }
  function syncEnvironment(at, value = environment()) {
    const key = `${value.lifeId}:${value.currentRealm}:${value.online}`
    if (key !== environmentKey) {
      endContinuous(at); closeInterval(at)
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
    endContinuous(at)
    write('snapshot', { reason, resources: strings(state.resources), capacities: Object.fromEntries(RESOURCES.map(r => [r.id, capacity(derived.max[r.id])])),
      peaks: strings(state.peak), rates: strings(derived.rates), net: strings(derived.net), expense: strings(derived.expense || {}),
      autoCraftDrain: derived.autoCraftDrain, jobs: state.disciples.jobs, population: state.disciples.total,
      buildings: state.buildings, upgrades: state.upgrades, orders: state.craftOrders, autoCraft: state.autoCraft,
      targets: strings(state.craftTargets), reserves: state.settings.craftReserves, modes: state.settings.processingModes,
      timers: state.craftTimers, progress: strings(state.craftProgress),
      sourceBreakdown: derived.sources, expenseBreakdown: derived.expenseSources,
      processing: recordingProcessing(state, derived) })
    lastSnapshot = at
  }
  const observer = {
    begin(detail) {
      const action = { actionId: ++actionSeq, parentActionId: detail.parent?.actionId || null, type: detail.type, id: detail.id,
        copies: detail.copies, offered: detail.offered, value: detail.value,
        resetEnvironment: detail.type === 'resetForRebirth' ? environment() : detail.parent?.resetEnvironment,
        craftMode: detail.type === 'craft' ? 'manual' : detail.parent?.craftMode ||
          (['settleCraftCopies', 'addCraftGain', 'runAutoCondense', 'runAutoCondenseBatch'].includes(detail.type) ? 'automatic' : null) }
      guard(() => {
        syncEnvironment(detail.at)
        const research = detail.type === 'research'
        const building = detail.type === 'buyBuilding'
          && !(observedState?.buildings[detail.id]?.count > 0)
        if (!action.parentActionId && observedDerived && (research || building || detail.type === 'breakthrough' || detail.type === 'resetForRebirth')) {
          action.milestone = `${detail.type}:${detail.id}`
          snapshot(observedState, observedDerived, detail.at, `before:${action.milestone}`)
        }
        write('action-start', action)
      })
      return action
    },
    end(action, result) { guard(() => {
      write('action-end', { ...action, ...result })
      if (observedDerived && !action.parentActionId && ['research', 'buyBuilding', 'sellBuilding', 'breakthrough', 'resetForRebirth'].includes(action.type)) {
        choices(observedState, observedDerived, env.at)
        if (action.milestone) snapshot(observedState, observedDerived, env.at, `after:${action.milestone}`)
      }
    }) },
    mutation({ id, before, after, at, action, detail }) {
      guard(() => {
        syncEnvironment(at, action?.resetEnvironment || environment())
        const delta = amount(after).minus(amount(before)), source = detail.source || 'unknown'
        if (delta.isZero() && modelFields.every(f => amount(detail[f]).isZero()) && amount(detail.requested).isZero()) return
        totals[id] = amount(totals[id]).plus(delta).toString()
        const row = { resource: id, source, delta: delta.toString(), detail,
          positive: delta.gt(0) ? delta.toString() : '0', negative: delta.lt(0) ? delta.neg().toString() : '0' }
        if (source.includes('simulation.js') || source.includes('IndustrialCraft')) {
          const key = JSON.stringify([id, source, env.online, visit, action?.type, action?.id, action?.craftMode]), existing = continuous[key]
          if (existing) {
            for (const f of ['delta','positive','negative']) existing[f] = amount(existing[f]).plus(row[f]).toString()
            for (const f of modelFields) if (detail[f] != null) existing.detail[f] = amount(existing.detail[f]).plus(detail[f]).toString()
            existing.count++
          } else { continuousStart ??= at; continuous[key] = { ...env, ...row, action: action || null, detail: { ...detail }, count: 1 } }
          if (at - continuousStart >= 60000) endContinuous(at)
        } else write('mutation', { ...row, before: amount(before).toString(), after: amount(after).toString(), action: action || null })
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
    if (at - lastSnapshot >= (options.sampleSeconds ?? 300) * 1000) snapshot(state, derived, at)
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
    const value = recordingChoices(state, derived), key = JSON.stringify(value)
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
    check(); endContinuous(at)
    const activeInterval = interval
    closeInterval(at); snapshot(state, derived, at, 'checkpoint'); flush()
    if (activeInterval) interval = { ...activeInterval, start: at }
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
    check(); endContinuous(elapsed); closeInterval(elapsed)
    if (derived) snapshot(state, derived, elapsed, 'final')
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
  const add = (map, id, value) => { map[id] = amount(map[id]).plus(value).toString() }
  const addMs = (map, id, value) => { map[id] = (map[id] || 0) + value }
  for (const row of readResourceRecords(dir)) {
      records++
      if (origin == null) origin = row.at
      const stage = stages[row.realmVisitId] ||= { visit: row.realmVisitId, life: row.lifeId, realm: row.currentRealm,
        fromMs: row.at - origin, toMs: row.at - origin, sampledMs: 0, materialsReadyMs: 0, projectBlockedMs: 0,
        insightOnlyMs: 0, shortageMs: {}, capacityMs: {}, fullMs: {}, processingMs: {}, buildingBlockedMs: {},
        resources: {}, losses: {}, model: {}, spending: {} }
      stage.fromMs = Math.min(stage.fromMs, (row.start ?? row.at) - origin)
      stage.toMs = Math.max(stage.toMs, (row.end ?? row.at) - origin)
      if (row.kind === 'snapshot' && row.reason !== 'periodic') milestones.push({ seq: row.seq, visit: row.realmVisitId,
        life: row.lifeId, realm: row.currentRealm, seconds: (row.at - origin) / 1000, reason: row.reason })
      if (row.kind === 'opening') opening = row.resources
      if (row.kind === 'closing') closing = row.resources
      if (row.kind === 'mutation' || row.kind === 'settlement') {
        totals[row.resource] = amount(totals[row.resource]).plus(row.delta).toString()
        const resource = stage.resources[row.resource] ||= { positive: '0', negative: '0' }
        resource.positive = amount(resource.positive).plus(row.positive).toString()
        resource.negative = amount(resource.negative).plus(row.negative).toString()
        const losses = stage.losses[row.resource] ||= {}
        const model = stage.model[row.resource] ||= {}
        for (const field of modelFields) if (row.detail[field] != null) {
          add(field.startsWith('model') ? model : losses, field, row.detail[field])
        }
        const reset = row.action?.resetEnvironment != null || row.action?.type === 'resetForRebirth' || row.source === 'resetForRebirth'
        if (reset && amount(row.negative).gt(0)) add(losses, 'resetLoss', row.negative)
        if (!reset && row.action && amount(row.negative).gt(0)) {
          const destination = `${row.action.type}:${row.action.id || ''}:${row.action.craftMode || ''}`
          add(stage.spending[destination] ||= {}, row.resource, row.negative)
        }
        const key = `${row.realmVisitId}:${row.resource}:${row.source}:${row.action?.type || 'continuous'}:${row.action?.id || ''}:${row.action?.craftMode || ''}`
        const flow = flows[key] ||= { resource: row.resource, source: row.source, visit: row.realmVisitId, life: row.lifeId, realm: row.currentRealm,
          action: row.action || null, positive: '0', negative: '0', detail: {} }
        flow.positive = amount(flow.positive).plus(row.positive).toString()
        flow.negative = amount(flow.negative).plus(row.negative).toString()
        for (const f of modelFields) if (row.detail[f] != null) flow.detail[f] = amount(flow.detail[f]).plus(row.detail[f]).toString()
        if (row.action?.type === 'addCraftGain' && amount(row.delta).gt(0)) {
          recipeOutputs[row.action.id] = amount(recipeOutputs[row.action.id]).plus(row.delta).toString()
          const modes = recipeModes[row.action.id] ||= { manual: '0', automatic: '0' }
          const mode = row.action.craftMode || 'automatic'
          modes[mode] = amount(modes[mode]).plus(row.delta).toString()
        }
      }
      if (row.kind === 'interval') {
        const key = `${row.lifeId}:${row.realmVisitId}:${row.online ? 'online' : 'offline'}`
        const bucket = exposure[key] ||= { durationMs: 0, insightOnlyMs: 0, shortageMs: {}, capacityMs: {} }
        bucket.durationMs += row.duration; if (row.insightOnly) bucket.insightOnlyMs += row.duration
        for (const id of row.missing) bucket.shortageMs[id] = (bucket.shortageMs[id] || 0) + row.duration
        for (const id of row.capacityBlocked) bucket.capacityMs[id] = (bucket.capacityMs[id] || 0) + row.duration
        stage.sampledMs += row.duration
        if (row.missing.length) {
          stage.lastMissing = row.missing
          stage.lastMissingSeconds = (row.end - origin) / 1000
          stage.readySinceSeconds = null
        } else if (!row.canAscend) {
          stage.firstMaterialsReadySeconds ??= (row.start - origin) / 1000
          stage.readySinceSeconds ??= (row.start - origin) / 1000
        }
        stage.lastReadiness = Object.fromEntries(Object.entries(row.ready || {}).map(([id, at]) => [id, (at - origin) / 1000]))
        if (row.insightOnly) stage.insightOnlyMs += row.duration
        if (!row.missing.length && !row.canAscend) stage.materialsReadyMs += row.duration
        if (row.projectsReady === false) stage.projectBlockedMs += row.duration
        for (const id of row.missing) addMs(stage.shortageMs, id, row.duration)
        for (const id of row.capacityBlocked) addMs(stage.capacityMs, id, row.duration)
        for (const id of row.full || []) addMs(stage.fullMs, id, row.duration)
        for (const id of row.buildingBlocked || []) addMs(stage.buildingBlockedMs, id, row.duration)
        for (const line of row.processing || []) addMs(stage.processingMs,
          `${line.resource}:${line.recipe}:${line.unlocked ? line.reason || 'unknown' : '配方未解锁'}`, row.duration)
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
  return { schemaVersion: VERSION, runId: manifest.runId, options: manifest.options,
    completed: manifest.completed ?? false, stopReason: manifest.stopReason ?? 'incomplete',
    accountingComplete: !Object.keys(residual).length, opening, closing,
    residual, totals, flows: Object.values(flows), recipeOutputs, recipeModes, exposure, stages: stageList, milestones, records }
}
