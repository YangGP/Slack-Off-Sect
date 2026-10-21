/** 日常核心检查；--full 包含长模拟，--group=<名称> 只跑对应功能。 */
import { createCheckHarness } from './lib/checks.mjs'
import { smokeChecks, quickSmokeChecks } from './smoke/checks.mjs'
import { runArchitectureChecks } from './architecture-check.mjs'

async function main() {
  const args = process.argv.slice(2)
  const checks = new Map(smokeChecks.map(check => [check.name, check]))
  checks.set('architecture', runArchitectureChecks)
  if (args.includes('--list')) {
    if (args.length !== 1) throw Error('--list 不能与其他参数组合')
    console.log([...checks.keys()].join('\n'))
    return
  }
  if (args.length > 1 || args.some(arg => arg !== '--full' && !arg.startsWith('--group='))) {
    throw Error('用法：npm run smoke -- [--full | --group=<名称> | --list]')
  }
  const group = args.find(arg => arg.startsWith('--group='))?.slice(8)
  if (group !== undefined && !checks.has(group)) throw Error(`未知检查组：${group}；使用 --list 查看名称`)
  const selected = group !== undefined ? [checks.get(group)]
    : args.includes('--full') ? [...smokeChecks, runArchitectureChecks] : quickSmokeChecks
  const harness = createCheckHarness()
  const started = performance.now()
  for (const check of selected) {
    const at = performance.now()
    const result = check(harness)
    if (result?.then) await result
    console.log(`  ${check === runArchitectureChecks ? 'architecture' : check.name}：${Math.round(performance.now() - at)}ms`)
  }
  harness.finish()
  console.log(`执行 ${selected.length} 个检查组，总耗时 ${(performance.now() - started).toFixed(0)}ms`)
}
await main()
