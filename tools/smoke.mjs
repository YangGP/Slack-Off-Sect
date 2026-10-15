/** 引擎冒烟测试入口：npm run smoke。功能用例见 tools/smoke/。 */
import { createCheckHarness } from './lib/checks.mjs'
import { smokeChecks } from './smoke/checks.mjs'
import { runArchitectureChecks } from './architecture-check.mjs'

const harness = createCheckHarness()
for (const check of smokeChecks) {
  const result = check(harness)
  if (result?.then) await result
}
runArchitectureChecks()
harness.finish()
