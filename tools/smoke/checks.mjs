/** 保持拆分前的执行顺序；新增用例在对应功能文件编写，再在这里登记。 */
import * as startup from './startup.mjs'
import * as catalog from './catalog.mjs'
import * as buildings from './buildings.mjs'
import * as economy from './economy.mjs'
import * as disciples from './disciples.mjs'
import * as simulation from './simulation.mjs'
import * as storage from './storage.mjs'
import * as automation from './automation.mjs'
import * as progression from './progression.mjs'
import * as research from './research.mjs'
import * as crafting from './crafting.mjs'
import * as events from './events.mjs'
import * as saves from './saves.mjs'
import * as hunting from './hunting.mjs'
import * as diplomacy from './diplomacy.mjs'
import * as power from './power.mjs'
import * as materials from './materials.mjs'
import * as money from './money.mjs'
import * as extensions from './extensions.mjs'
import * as karmashop from './karmashop.mjs'
import * as samsara from './samsara.mjs'

export const smokeChecks = [
  catalog.dataIntegrity,
  samsara.samsaraLifecycle,
  startup.initialState,
  storage.uncappedCrafting,
  buildings.buildingActions,
  buildings.buildingMaintenanceCompatibility,
  buildings.spiritQuarryInfusion,
  economy.incomeBreakdown,
  disciples.discipleArrivals,
  storage.purchaseReachability,
  automation.automaticCrafting,
  automation.processingFuelReserveRegression,
  research.researchVisibility,
  crafting.manualCrafting,
  progression.researchAndAscension,
  events.randomEvents,
  saves.saveSerialization,
  simulation.playerBot,
  simulation.longRunningStability,
  progression.reincarnation,
  progression.karmaSoftCap,
  research.researchUnlocks,
  catalog.resourceSourcesAndSinks,
  hunting.huntingLoop,
  hunting.legacyMissionRegression,
  hunting.pinnedTeamRegression,
  extensions.discipleBudgetRegression,
  extensions.discipleFocusRegression,
  diplomacy.diplomacyTrade,
  power.particleChain,
  events.eventCategories,
  storage.storageAndRefinement,
  materials.goldenCoreProduction,
  money.moneyDomain,
  progression.breakthroughRisk,
  progression.faithProgression,
  extensions.industryScenarios,
  extensions.discipleScenarios,
  extensions.offlineScenarios,
]

// 日常只检查核心动作；长模拟、全表遍历和专项边界由 --full 或 --group 显式选择。
export const quickSmokeChecks = [
  startup.initialState,
  buildings.buildingActions,
  economy.incomeBreakdown,
  automation.automaticCrafting,
  crafting.manualCrafting,
  progression.researchAndAscension,
  saves.saveSerialization,
  money.moneyDomain,
]
