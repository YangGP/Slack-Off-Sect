/** Unified balance entry: the pacing simulator and persisted resource ledger are authoritative. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { measurePacing, pacingOptions } from './lib/pacing-scenario.mjs'
import { loadMeasurementCheckpoint } from './lib/resource-recorder.mjs'
import { writeBalanceArtifacts } from './lib/balance-report.mjs'

const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log(`Usage: npm run balance:track -- [hours=3024] [seed=12345] [options]
  --mode=ascend|reincarnate    Actual settlement, not merely readiness
  --hours=3024 --seed=12345   0 hours means the hard cap of 3024h
  --outcomes=natural|guaranteed --aids=full|none --events=0|1
  --visits=active|quarter|hourly|three|waking --faith=off|growth
  --sample=1800 --wall-seconds=7200
  --decision-seconds=5 --batch-actions=1
  --reincarnations=0 --reincarnate-realm=7 --lives=1
  --resume=<checkpoint.json> [--wall-seconds=7200]
All pacing options are supported; recording is mandatory. Outputs: .resource-records/<runId>/
Resume the same compiled bundle without rebuilding or changing sources.`)
} else {
  const resumeArgs = args.filter(arg => arg.startsWith('--resume='))
  let resume = null, options
  if (resumeArgs.length) {
    if (resumeArgs.length !== 1 || args.some(arg => arg !== resumeArgs[0] && !arg.startsWith('--wall-seconds='))) {
      throw Error('Resume accepts only one checkpoint and an optional cumulative wall budget')
    }
    resume = loadMeasurementCheckpoint(resumeArgs[0].slice(9))
    if (!resume.options.record) throw Error('Checkpoint does not contain a resource ledger')
    const wall = args.filter(arg => arg.startsWith('--wall-seconds='))
    if (wall.length > 1) throw Error('Duplicate wall budget')
    if (wall.length) resume.options.wallSeconds = pacingOptions(wall).wallSeconds
    options = resume.options
  } else {
    const positional = [], forwarded = [], seen = new Set()
    let mode = 'ascend'
    for (const arg of args) {
      if (!arg.startsWith('--')) { positional.push(arg); continue }
      const match = /^--([a-z-]+)=(.+)$/.exec(arg)
      if (!match) throw Error(`Invalid argument: ${arg}`)
      const key = match[1] === 'sample' ? 'sample-seconds' : match[1]
      if (seen.has(key)) throw Error(`Duplicate option: ${key}`)
      seen.add(key)
      if (key === 'mode') { mode = match[2]; continue }
      if (key === 'hours' && Number(match[2]) === 0) forwarded.push('--hours=3024')
      else forwarded.push(`--${key}=${match[2]}`)
    }
    if (positional.length > 2 || !['ascend', 'reincarnate'].includes(mode)) throw Error('Invalid hours/seed or mode')
    if (positional[0] != null && seen.has('hours') || positional[1] != null && seen.has('seed')) throw Error('Use positional or named hours/seed, not both')
    if (positional[0] != null) forwarded.push(`--hours=${Number(positional[0]) === 0 ? 3024 : positional[0]}`)
    if (positional[1] != null) forwarded.push(`--seed=${positional[1]}`)
    const defaults = ['--hours=3024', '--seed=12345', '--wall-seconds=7200', '--record=true']
    if (mode === 'reincarnate') defaults.push('--reincarnations=1', '--reincarnate-realm=7', '--stop-after-reincarnation=true')
    options = pacingOptions([...defaults, ...forwarded])
    if (!options.record) throw Error('balance:track requires --record=true')
    if (options.stopRealm) throw Error('Use audit:breakthrough for partial realm measurements; balance:track requires settlement')
    if (mode === 'ascend' && options.stopAfterReincarnation) throw Error('Use --mode=reincarnate to stop at reincarnation')
    if (mode === 'reincarnate' && !options.stopAfterReincarnation) throw Error('Reincarnation mode must stop after settlement')
  }
  const result = measurePacing(options, entry => {
    const { snapshot, ...progress } = entry
    console.error(JSON.stringify({ progress }))
  }, { resume })
  const dir = result.recording.dir
  const resultPath = join(dir, 'result.json')
  writeFileSync(resultPath, JSON.stringify(result, null, 2))
  const files = writeBalanceArtifacts(dir, result.recording.report, result)
  console.log(JSON.stringify({ completed: result.completed, stopReason: result.stopReason,
    hours: result.simulatedSeconds / 3600, ascensions: result.ascensions.length,
    reincarnations: result.reincarnations.length, deaths: result.deaths.length,
    accountingComplete: result.recording.report.accountingComplete,
    checkpoint: result.checkpointPath, result: resultPath, ...files }, null, 2))
  if (!result.recording.report.accountingComplete) process.exitCode = 1
  else if (!result.completed) process.exitCode = 2
}
