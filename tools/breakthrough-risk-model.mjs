import { modelBreakthroughRisk } from './lib/breakthrough-risk.mjs'

console.log(JSON.stringify(['naked', 'aided'].map(modelBreakthroughRisk), null, 2))
