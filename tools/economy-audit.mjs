import { RESOURCES } from '../src/data/resources.js'
import { BUILDINGS } from '../src/data/buildings.js'
import { ALL_UPGRADES } from '../src/data/upgrades.js'
import { CRAFTS } from '../src/data/crafts.js'
import { REALMS } from '../src/data/realms.js'

// 单笔需求是基础造价，不包括重复购买/祭炼的指数递增；用于比较数量级。
for (const r of RESOURCES.filter(r => r.integer)) {
  const sinks = {
    buildings: BUILDINGS.filter(b => b.cost?.[r.id]).map(b => b.name),
    crafts: CRAFTS.filter(c => c.cost?.[r.id]).map(c => c.name),
    upgrades: ALL_UPGRADES.filter(u => u.cost?.[r.id]).map(u => u.name),
    realms: REALMS.filter(realm => realm.cost?.[r.id]).map(realm => realm.name),
    refines: ALL_UPGRADES.filter(u => u.refine?.materials?.[r.id]).map(u => `${u.name}（第${(u.refine.materialFromLevel || 0) + 1}次祭炼起）`),
  }
  const maxBaseDemand = Math.max(0, ...[...BUILDINGS, ...ALL_UPGRADES, ...REALMS].map(item => item.cost?.[r.id] || 0), ...CRAFTS.map(c => c.cost[r.id] || 0))
  console.log(JSON.stringify({ name: r.name, id: r.id, baseMax: r.baseMax, storageWeight: r.storageWeight ?? 1, common6400Cap: Math.floor(r.baseMax + 6400 * (r.storageWeight ?? 1) + 1e-9), maxBaseDemand, sinks }))
}
