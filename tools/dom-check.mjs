/** DOM检查入口：npm run check:dom。场景和环境均在 tools/dom/。 */
import { createCheckHarness } from './lib/checks.mjs'
import { createDomContext } from './dom/environment.mjs'
import { domChecks } from './dom/checks.mjs'

const harness = createCheckHarness({ successMessage: 'DOM 端到端检查全部通过 ✅' })
const context = await createDomContext(harness)
try {
  for (const check of domChecks) await check(context)
  harness.finish()
} finally { context.dispose() }
