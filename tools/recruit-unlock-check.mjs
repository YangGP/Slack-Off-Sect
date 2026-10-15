import { createInitialState } from '../src/game/state.js'
import { UPGRADE_MAP } from '../src/data/upgrades.js'
import * as engine from '../src/game/engine.js'

export function runRecruitUnlockChecks(E, ok) {
  E ||= engine
  const state = createInitialState(123)
  state.realm = 3
  state.upgrades.incenseVow = true
  state.upgrades.talentAssignment = true
  state.buildings.gate = { count: 1, on: true }
  const research = UPGRADE_MAP.seekTalents
  ok('筑基仍不开放招贤纳士', !E.isUpgradeUnlocked(state, research) && !E.isProgressionVisible(state, research.needs))
  state.realm = 4
  ok('金丹一座山门与辨才研究即可开放招贤纳士，无需广开山门研究链',
    E.isUpgradeUnlocked(state, research) && E.isProgressionVisible(state, research.needs) &&
    ['arrayAssembly', 'preachArt', 'incenseStudy', 'recruitDrive'].every(id => !state.upgrades[id]))
  delete state.buildings.gate
  ok('金丹无山门时预告招贤纳士但不能研究',
    !E.isUpgradeUnlocked(state, research) && E.isProgressionVisible(state, research.needs))
  state.buildings.gate = { count: 1, on: true }
  delete state.upgrades.talentAssignment
  ok('招贤纳士仍要求知人善任', !E.isUpgradeUnlocked(state, research))
  state.upgrades.talentAssignment = true
  const d = E.createDerived()
  E.recompute(state, d)
  ok('首座山门的香火仓容足以支付招贤纳士', d.max.faith >= research.cost.faith)
  state.resources.insight = 1337
  state.resources.faith = 150
  state.resources.stone = 400
  ok('金丹可实际支付研究费用并解锁主动招募', E.research(state, d, research.id) &&
    d.recruitModeUnlocked && state.resources.insight === 337 && state.resources.faith === 0 && state.resources.stone === 0)
  state.settings.recruitMode = 'manual'
  state.resources.qi = E.recruitPreview(state, d, 'small').cost.qi
  state.buildings.hut = { count: 1, on: true }
  E.recompute(state, d)
  ok('金丹研究后可立即使用薄礼主动招募', E.recruitDisciple(state, d, 'small').recruited === 1)
}
