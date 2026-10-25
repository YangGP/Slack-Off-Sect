import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { createKittensRuntime } from './lib/runtime.mjs'
import { createKittensBot, KITTENS_STRATEGY } from './lib/bot.mjs'

const args = process.argv.slice(2), options = { source: 'cat-zh-master', kittens: 71, seed: 12345,
  hours: 720, 'wall-seconds': 1800, 'decision-seconds': 5, out: '.resource-records/kittens' }
let resumePath = null
for (const arg of args) {
  if (arg === '--help') {
    console.log('node tools/kittens/first-reset.mjs [--kittens=71] [--seed=12345] [--hours=720] [--wall-seconds=1800] [--decision-seconds=5] [--source=cat-zh-master] [--out=.resource-records/kittens]\n恢复：--resume=<checkpoint.json> [--wall-seconds=1800]；STOP文件可安全暂停。预算为本次计算秒数。')
    process.exit(0)
  }
  const match = /^--([a-z-]+)=(.+)$/.exec(arg)
  if (!match) throw Error(`无效参数：${arg}`)
  if (match[1] === 'resume') resumePath = resolve(match[2])
  else if (Object.hasOwn(options, match[1])) options[match[1]] = typeof options[match[1]] === 'number' ? Number(match[2]) : match[2]
  else throw Error(`未知参数：${arg}`)
}
const requestedWall = options['wall-seconds']
const previous = resumePath ? JSON.parse(readFileSync(resumePath, 'utf8')) : null
if (previous) {
  if (args.some(arg => !arg.startsWith('--resume=') && !arg.startsWith('--wall-seconds='))) throw Error('恢复仅允许指定检查点及本次计算预算')
  Object.assign(options, previous.options, { 'wall-seconds': requestedWall })
}
if (!Number.isInteger(options.kittens) || options.kittens < 36 || options.kittens > 200 ||
    !Number.isInteger(options.seed) || options.seed < 1 || options.seed > 0xffffffff ||
    !Number.isFinite(options.hours) || options.hours <= 0 || options.hours > 8760 ||
    !Number.isFinite(options['wall-seconds']) || options['wall-seconds'] <= 0 || options['wall-seconds'] > 7200 ||
    !Number.isInteger(options['decision-seconds']) || options['decision-seconds'] < 1 || options['decision-seconds'] > 60) throw Error('参数超出允许范围')
const source = resolve(options.source)
const runtime = createKittensRuntime(source, options.seed)
const metadataFiles = ['package.json', 'build.version.json'].filter(file => existsSync(join(source, file)))
const sourceVersion = Object.fromEntries(metadataFiles.map(file => [file, JSON.parse(readFileSync(join(source, file), 'utf8'))]))
const toolDir = dirname(fileURLToPath(import.meta.url))
const sourceHashes = Object.fromEntries([...runtime.files.map(file => join(source, file)),
  ...metadataFiles.map(file => join(source, file)),
  ...['lib/runtime.mjs', 'lib/bot.mjs', 'lib/budget.mjs', 'first-reset.mjs'].map(file => join(toolDir, file))]
  .map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]))
if (previous && (previous.node !== process.version || JSON.stringify(previous.sourceHashes) !== JSON.stringify(sourceHashes) || previous.strategy !== KITTENS_STRATEGY || previous.completed)) {
  runtime.dispose(); throw Error('检查点已完成，或源码/Node/策略不一致，不能恢复')
}
if (previous && existsSync(join(dirname(resumePath), 'completed.json'))) { runtime.dispose(); throw Error('该样本已经完成重置，不能恢复旧检查点') }
const dir = previous ? dirname(resumePath) : resolve(options.out, randomUUID())
mkdirSync(dir, { recursive: true })
const key = 'com.nuclearunicorn.kittengame.savedata', g = runtime.game
let milestones = previous?.milestones || {}, counters = previous?.counters || {}, lastSample = previous?.lastSample || 0
let stopReason = 'horizon', settlement = null, lastProgress = performance.now(), interrupted = false
const rows = previous?.rows || [], actionRows = previous?.actionRows || []
const nowHours = () => runtime.ticks / g.ticksPerSecond / 3600
const snapshot = () => ({ seconds: runtime.ticks / g.ticksPerSecond, calendar: { year: g.calendar.year, season: g.calendar.season, day: g.calendar.day },
  kittens: g.village.getKittens(), maxKittens: g.getEffect('maxKittens'), deaths: g.deadKittens, happiness: g.village.happiness,
  jobs: Object.fromEntries(g.village.jobs.map(j => [j.name, j.value])),
  buildings: Object.fromEntries(g.bld.buildingsData.filter(b => b.val).map(b => [b.name, b.val])),
  technologies: g.science.techs.filter(t => t.researched).map(t => t.name), upgrades: g.workshop.upgrades.filter(t => t.researched).map(t => t.name),
  resources: Object.fromEntries(g.resPool.resources.filter(r => r.value || r.maxValue).map(r => [r.name, { value: r.value, max: r.maxValue || null, perTick: g.getResourcePerTick(r.name, true) }])),
  expectedReset: JSON.parse(JSON.stringify(g.getResetPrestige())) })
const bot = createKittensBot(runtime, { kittens: options.kittens, decisionSeconds: options['decision-seconds'] }, (kind, detail) => {
  const id = `${kind}:${detail.id}`
  counters[id] = (counters[id] || 0) + 1
  if (!milestones[id]) { milestones[id] = runtime.ticks / 5; actionRows.push({ seconds: runtime.ticks / 5, kind, ...detail }) }
})
if (previous) {
  runtime.restoreClock(previous.ticks, previous.randomState)
  runtime.window.LCstorage[key] = previous.save
  if (g.load() === false) throw Error('猫国存档读取失败')
  g.opts.enableRedshift = false; g.opts.disableTelemetry = true
  bot.restoreTurn(previous.turn)
  // 原生读档会重新计算经济和分工；不声称恢复后与不停机样本逐tick一致。
}
const initial = previous?.initial || snapshot()
const started = performance.now()
const stop = () => { interrupted = true }
process.on('SIGINT', stop); process.on('SIGTERM', stop)
function checkpoint(completed = false) {
  g.save()
  const data = { version: 1, node: process.version, strategy: KITTENS_STRATEGY, sourceVersion, sourceHashes, options, completed,
    ticks: runtime.ticks, randomState: runtime.randomState, save: runtime.window.LCstorage[key], turn: bot.turn,
    initial, milestones, counters, rows, actionRows, lastSample,
    wallSeconds: (previous?.wallSeconds || 0) + (performance.now() - started) / 1000 }
  writeFileSync(join(dir, 'checkpoint.json'), JSON.stringify(data))
}
try {
  console.error(JSON.stringify({ run: dir, strategy: KITTENS_STRATEGY, source, target: options.kittens, resumed: !!previous }))
  const step = options['decision-seconds'] * g.ticksPerSecond
  while (nowHours() < options.hours) {
    if (runtime.ticks % step === 0) {
      await new Promise(resolve => setImmediate(resolve))
      if (interrupted || existsSync(join(dir, 'STOP'))) { stopReason = 'interrupted'; break }
      if ((performance.now() - started) / 1000 >= options['wall-seconds']) { stopReason = 'wall-budget'; break }
    }
    runtime.step()
    const kittens = g.village.getKittens()
    for (const n of [1, 10, 36, 71, 130]) if (kittens >= n) milestones[`kittens:${n}`] ??= runtime.ticks / 5
    if (runtime.ticks % step !== 0) continue
    if (kittens >= options.kittens) {
      const before = snapshot(), expected = g.getResetPrestige()
      const expectedParagon = g.resPool.get('paragon').value + expected.paragonPoints
      // 走真实重置入口和排程；刷新页面在隔离环境中不执行，重置产生的原生存档可直接核对。
      g.reset(); g.timer.updateScheduledEvents()
      const resetSave = g._parseLSSaveData()
      const paragon = resetSave.resources.find(r => r.name === 'paragon')?.value || 0
      const resets = resetSave.stats.find(s => s.name === 'totalResets')?.val || 0
      if (paragon !== expectedParagon || resetSave.game.karmaKittens !== expected.karmaKittens || resets !== 1 || resetSave.village.kittens.length !== 0 || resetSave.buildings.length !== 0) throw Error('首次重置真实结算不一致')
      settlement = { before, after: { paragon, karmaKittens: resetSave.game.karmaKittens, totalResets: resets, kittens: 0, buildings: 0 }, verified: true }
      writeFileSync(join(dir, 'reset-save.json'), JSON.stringify(resetSave))
      stopReason = 'reset'; break
    }
    bot.act()
    if (runtime.ticks - lastSample >= 18000) { rows.push(snapshot()); lastSample = runtime.ticks; checkpoint() }
    if (performance.now() - lastProgress >= 30000) {
      console.error(JSON.stringify({ hours: nowHours(), kittens, maxKittens: g.getEffect('maxKittens'), deaths: g.deadKittens })); lastProgress = performance.now()
    }
  }
  const result = { completed: stopReason === 'reset', stopReason, strategy: KITTENS_STRATEGY, options, sourceVersion, sourceHashes,
    node: process.version, simulatedHours: nowHours(), simulatedDays: nowHours() / 24,
    wallSeconds: (previous?.wallSeconds || 0) + (performance.now() - started) / 1000,
    milestones, counters, initial, final: snapshot(), settlement, samples: rows, firstActions: actionRows,
    boundaries: ['本地猫国源码，5tick/现实秒，真实逐tick生产/季节/事件/技能/饥饿；持续在线',
      '固定种子与有限决策，不使用Kitten Scientists，不赠资源/猫/科技，不加速游戏时钟',
      '重置按钮开局可用；默认71只猫指首次通过人口重置获得Paragon，不代表所有玩家推荐的首转时机；原版千年奖励保留',
      '隔离DOM、禁用联网和展示，不读取玩家浏览器存档；原生存档恢复会重算缓存及派工，不承诺逐tick一致',
      '机器人固定策略样本，不是真人平均或最优时间；预算结束不表示不可达'] }
  if (!result.completed) checkpoint()
  else writeFileSync(join(dir, 'completed.json'), JSON.stringify({ completed: true, stopReason }))
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2))
  const hours = n => milestones[`kittens:${n}`] == null ? '未达到' : `${(milestones[`kittens:${n}`] / 3600).toFixed(3)}小时`
  writeFileSync(join(dir, 'summary.md'), `# 猫国首次重置测量\n\n策略：${KITTENS_STRATEGY}；目标：${options.kittens}只猫。\n\n完成：${result.completed}；停止原因：${stopReason}。\n\n累计在线等效时间：${result.simulatedHours.toFixed(3)}小时（${result.simulatedDays.toFixed(3)}天）；计算耗时：${result.wallSeconds.toFixed(1)}秒。\n\n36只猫：${hours(36)}；71只猫：${hours(71)}；130只猫：${hours(130)}。\n\n末态人口：${result.final.kittens}，死亡：${g.deadKittens}。\n\n重置结算：${settlement ? JSON.stringify(settlement.after) : '尚未执行'}。\n\n${result.boundaries.map(x => '- ' + x).join('\n')}\n`)
  console.log(JSON.stringify({ directory: dir, completed: result.completed, stopReason, hours: result.simulatedHours, kittens: result.final.kittens, settlement: settlement?.after }, null, 2))
  process.exitCode = result.completed ? 0 : 2
} catch (error) {
  writeFileSync(join(dir, 'error.json'), JSON.stringify({ error: String(error.message || error), ticks: runtime.ticks, snapshot: snapshot() }, null, 2))
  console.error(String(error.stack).split('\n').filter(line => line.length < 500).join('\n'))
  process.exitCode = 1
} finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); runtime.dispose() }
