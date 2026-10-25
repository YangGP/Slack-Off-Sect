/** 统一 SSR 工具构建与参数转发；每次使用独立进程，隔离临时数据修改。 */
import { build } from 'vite'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const commands = {
  smoke: '.smoke', 'render-check': '.smoke-render', 'audit-check': '.smoke-tools',
  'industry-scenarios': '.smoke-industry-scenarios',
  'disciple-audit': '.smoke-disciple-audit', balance: '.smoke-balance',
  'economy-audit': '.smoke-economy', 'tier-audit': '.smoke-tier',
  'building-reachability': '.smoke-reachability',
  'upgrade-source-audit': '.smoke-source-audit',
  'breakthrough-time-audit': '.smoke-breakthrough-time',
  'event-balance': '.smoke-event-balance', playstyles: '.smoke-visits',
  'craft-performance': '.smoke-craft-performance',
  'offline-benchmark': '.smoke-offline-benchmark',
  'diagnostics-check': '.smoke-diagnostics', 'recording-check': '.smoke-recording',
  'resource-report': '.smoke-resource-report',
  'balance-telemetry': '.smoke-balance-track',
}

const [name, ...args] = process.argv.slice(2)
if (name === '--list') console.log(Object.keys(commands).join('\n'))
else {
  if (!Object.hasOwn(commands, name)) throw new Error(`未知工具：${name || '(未指定)'}；使用 --list 查看列表`)
  const root = fileURLToPath(new URL('../', import.meta.url))
  // 报告和基准结果与构建产物同目录，重跑时保留既有测量，统一由 clean 清理。
  await build({ root, build: { ssr: resolve(root, 'tools', `${name}.mjs`), outDir: commands[name], emptyOutDir: false } })
  const result = spawnSync(process.execPath, [resolve(root, commands[name], `${name}.js`), ...args], {
    cwd: root, stdio: 'inherit', timeout: ['recording-check', 'diagnostics-check'].includes(name) || name === 'smoke' && args.length === 0 ? 5000 : undefined })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}
