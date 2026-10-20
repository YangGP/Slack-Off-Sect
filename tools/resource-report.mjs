import { resolve, join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { rebuildResourceReport } from './lib/resource-recorder.mjs'
import { writeBalanceArtifacts } from './lib/balance-report.mjs'

const directory = process.argv[2]
if (!directory || process.argv.length !== 3) throw Error('用法：resource-report <记录目录>')
const dir = resolve(directory)
const report = rebuildResourceReport(dir)
const output = join(dir, 'report.rebuilt.json')
writeFileSync(output, JSON.stringify(report, null, 2))
const resultPath = join(dir, 'result.json')
const pacing = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, 'utf8')) : null
if (pacing?.recording?.report?.runId && pacing.recording.report.runId !== report.runId) throw Error('Result belongs to another recording')
const files = writeBalanceArtifacts(dir, report, pacing)
console.log(JSON.stringify({ output, accountingComplete: report.accountingComplete, records: report.records, ...files }))
if (!report.accountingComplete) process.exitCode = 1
