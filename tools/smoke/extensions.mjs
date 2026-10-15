import * as E from '../engine-fixture.mjs'
import { runIndustryChecks } from '../industry-check.mjs'
import { runDiscipleChecks } from '../disciple-check.mjs'
import { runTalentChecks } from '../talent-check.mjs'
import { runAutoTalentChecks } from '../auto-talent-check.mjs'
import { runPowerChecks } from '../power-check.mjs'
import { runOfflineChecks } from '../offline-check.mjs'
import { runOfflineAsyncChecks } from '../offline-async-check.mjs'
import { newGame } from './fixtures.mjs'

export function industryScenarios({ ok, close, section }) {
  section('工业加工容量、供料与兼容性')
  runIndustryChecks(E, ok, close, newGame)
}

export function discipleScenarios({ ok, close, section }) {
  section('弟子成长、分工与突破')
  runDiscipleChecks(E, ok, close)
  runTalentChecks(E, ok, close)
  runAutoTalentChecks(E, ok, close)
  runPowerChecks(E, ok, close)
}

export async function offlineScenarios({ ok, section }) {
  section('离线结算优化与边界一致性')
  runOfflineChecks(ok)
  await runOfflineAsyncChecks(ok)
}
