/** Usage: audit:power. Stage closures are source/capacity bounds, not measured play time. */
import { auditReachability } from './progression-reachability.mjs'
import { measurePower } from './power-scenarios.mjs'
import { UPGRADE_MAP, checkNeeds } from '../src/game/engine.js'

for (const realm of [5, 6, 8]) {
  const { state: s, derived: d, sources, settled } = auditReachability(realm)
  const buildings = Object.fromEntries(['splitArray', 'polarizeArray', 'annihilationFurnace'].map(id => [id, !!s.buildings[id]?.count]))
  const research = Object.fromEntries(['particleTheory', 'yinyangSplit', 'annihilationArt', 'energyApplication'].map(id => {
    const u = UPGRADE_MAP[id]
    return [id, { learned: !!s.upgrades[id], needs: checkNeeds(s, u.needs), missing: Object.keys(u.cost).filter(r => !sources.has(r) || u.cost[r] > d.max[r]) }]
  }))
  console.log(JSON.stringify({ type: 'stage-capacity', realm, settled, buildings, research }))
}
for (const options of [
  { chains: 1, mode: 'qi' }, { chains: 1, mode: 'energy' },
  { chains: 2, mode: 'qi', core: true },
  { chains: 2, mode: 'qi', gathering: true },
  { chains: 2, mode: 'energy', core: true, homes: true },
]) console.log(JSON.stringify({ type: 'controlled-power', ...measurePower(options) }))
