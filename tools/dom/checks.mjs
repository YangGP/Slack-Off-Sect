/** DOM交互共享同一场景，必须按此顺序运行。 */
import { checkMount } from './mount.mjs'
import { checkLayout } from './layout.mjs'
import { checkLoop } from './loop.mjs'
import { checkSaves } from './saves.mjs'
import { checkErrors } from './errors.mjs'

export const domChecks = [
  checkMount,
  checkLayout,
  checkLoop,
  checkSaves,
  checkErrors,
]
