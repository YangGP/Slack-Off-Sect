import { RESOURCES } from '../src/data/resources.js'
import { BUILDINGS } from '../src/data/buildings.js'
import { ALL_UPGRADES } from '../src/data/upgrades.js'
import { CRAFTS } from '../src/data/crafts.js'
import { REALMS } from '../src/data/realms.js'

import { readFileSync } from 'node:fs'
import { inspectSave } from './lib/save-report.mjs'

const args = process.argv.slice(2)
if (args[0] === '--save') {
  if (args.length !== 2) throw new Error('Usage: audit:save -- <save-file>')
  console.log(JSON.stringify(inspectSave(readFileSync(args[1], 'utf8')), null, 2))
} else {
    if (args.length > 1) throw new Error('Usage: audit:economy -- [common-storage]')
  // 单笔需求是基础造价，不包括重复购买/祭炼的指数递增；用于比较数量级。
  const commonStorage = Number(process.argv[2] || 0)
  if (!Number.isFinite(commonStorage) || commonStorage < 0) throw new Error('假设通用仓储需为非负数')
  for (const r of RESOURCES.filter(r => r.integer)) {
    const sinks = {
      buildings: BUILDINGS.filter(b => b.cost?.[r.id]).map(b => b.name),
      crafts: CRAFTS.filter(c => c.cost?.[r.id]).map(c => c.name),
      upgrades: ALL_UPGRADES.filter(u => u.cost?.[r.id]).map(u => u.name),
      realms: REALMS.filter(realm => realm.cost?.[r.id]).map(realm => realm.name),
      refines: ALL_UPGRADES.filter(u => u.refine?.materials?.[r.id]).map(u => `${u.name}（第${(u.refine.materialFromLevel || 0) + 1}次祭炼起）`),
    }
    const maxBaseDemand = Math.max(0, ...[...BUILDINGS, ...ALL_UPGRADES, ...REALMS].map(item => item.cost?.[r.id] || 0), ...CRAFTS.map(c => c.cost[r.id] || 0))
    console.log(JSON.stringify({ name: r.name, id: r.id, baseMax: r.baseMax, storageWeight: r.storageWeight ?? 1, commonStorage, hypotheticalCap: Math.floor(r.baseMax + commonStorage * (r.storageWeight ?? 1) + 1e-9), maxBaseDemand, sinks }))
  }
}
