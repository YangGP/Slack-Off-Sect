/** DOM交互共享同一场景，必须按此顺序运行。 */
import { checkMount } from './mount.mjs'
import { checkLayout } from './layout.mjs'
import { checkLoop } from './loop.mjs'
import { checkDisciples } from './disciples.mjs'
import { checkDismissal } from './dismissal.mjs'
import { checkResearch } from './research.mjs'
import { checkCrafting } from './crafting.mjs'
import { checkProgression } from './progression.mjs'
import { checkDebug } from './debug.mjs'
import { checkSaves } from './saves.mjs'
import { checkResources } from './resources.mjs'
import { checkBuildingDetails } from './building-details.mjs'
import { checkTooltips } from './tooltips.mjs'
import { checkEvents } from './events.mjs'
import { checkLateProduction } from './late-production.mjs'
import { checkLateResearch } from './late-research.mjs'
import { checkIndustry } from './industry.mjs'
import { checkRecovery } from './recovery.mjs'
import { checkErrors } from './errors.mjs'

export const domChecks = [
  checkMount,
  checkLayout,
  checkLoop,
  checkDisciples,
  checkDismissal,
  checkResearch,
  checkCrafting,
  checkProgression,
  checkDebug,
  checkSaves,
  checkResources,
  checkBuildingDetails,
  checkTooltips,
  checkEvents,
  checkLateProduction,
  checkLateResearch,
  checkIndustry,
  checkRecovery,
  checkErrors,
]
