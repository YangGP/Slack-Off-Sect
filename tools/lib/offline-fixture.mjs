import { createInitialState } from '../../src/game/state.js'
import { syncDisciples } from '../../src/data/disciples.js'
import { money } from '../../src/game/decimal.js'

/**
 * 长离线专项夹具：典型后期宗门（72 名弟子、多配方工业、凝灵诀与自动猎杀）。
 *
 * 只用于离线耗时与批量回归，**不代表自然通关进度**（与 `tools/industry-scenarios.mjs` 同一约定）。
 * 供 `tools/offline-check.mjs`、`tools/offline-async-check.mjs` 与 `tools/offline-benchmark.mjs` 复用。
 *
 * 两条刻意的设计：
 * - 仓储用大量材料库撑开、原料给足，让**工业在绝大多数分段都还有活干**（否则第一段就把成品做满，
 *   基准只会跑到一轮，验收不到持续加工；见 `tools/README.md` 对 bench:offline 的说明）；
 * - 中间产物互为原料（灵木→木板→阵基、玄铁→玄钢、灵草→丹药、灵气→灵液→灵晶/仙草），
 *   下游持续消耗上游，产线不会在开跑瞬间一起顶到仓容。
 */
export const OFFLINE_FIXTURE_START = Date.UTC(2026, 9, 15)

const INDUSTRIAL_RECIPES = [
  'sawPlank', 'assembleArrayBase', 'refineSteel', 'refinePill',
  'condenseLiquid', 'condenseCrystal', 'growImmortalHerb', 'drawTalisman',
]

export function longOfflineFixture(startAt = OFFLINE_FIXTURE_START) {
  const state = createInitialState(startAt)
  state.realm = 5
  // 道果是金额货币：必须构造 Decimal，写 Number 会让后续引擎运算拿到 Number。
  state.dao = money(1)
  state.settings.craftReservePercent = 0
  state.settings.autoCraftSpeeds = { refineSteel: 5, drawTalisman: 5 }
  state.buildings = {
    hut: { count: 40, on: true },
    spiritField: { count: 100, on: true },
    library: { count: 3, on: true },
    granary: { count: 200, on: true },
    warehouse: { count: 1000, on: true },
    workshop: { count: 2, on: true },
    forge: { count: 2, on: true },
    talismanHall: { count: 1, on: true },
    alchemyRoom: { count: 1, on: true },
    herbGarden: { count: 3, on: true },
    huntingCamp: { count: 1, on: true },
    warmFurChamber: { count: 1, on: true },
  }
  state.upgrades = {
    intuition: true, woodworking: true, steelWorking: true, arrayAssembly: true,
    qiLiquid: true, liquidArt: true, condenseArt: true, crystalCraft: true, talismanArt: true,
    craftTempo: true, capacityRune: true, wildHunting: true,
  }
  Object.assign(state.resources, {
    // 原料刻意远超单段消耗：让工业在整段窗口里持续有活干，而不是第一段就缺料停线。
    qi: money(60000000), wood: money(12000000), ore: money(12000000), herb: money(8000000),
    rock: money(200000), insight: money(100000), faith: money(100000), stone: money(20000),
    beastHide: money(200000), warrant: money(200000),
  })
  for (const id of INDUSTRIAL_RECIPES) state.autoCraft[id] = true
  state.disciples.total = 72
  state.disciples.jobs = { farmer: 30, scholar: 10, huntPlanner: 5 }
  syncDisciples(state.disciples, { defaultRoot: 'triple' })
  for (const member of state.disciples.members) member.realm = 4
  state.hunting.settings.selectedFieldId = 'foothills'
  state.hunting.settings.teamIds = state.disciples.members.slice(0, 3).map(member => member.id)
  state.hunting.settings.autoRepeat = true
  return state
}
