/** Exact finite-state model: expected attempts including regressions and death resets.
 * Repeated costs and probabilities are held fixed; production time and growing karma are excluded.
 */
import { REALMS, BREAKTHROUGH, BREAKTHROUGH_AIDS } from '../../src/data/realms.js'
import assert from 'node:assert/strict'
import { createInitialState } from '../../src/game/state.js'
import { createDerived, breakthroughPreview } from '../../src/game/engine.js'

function solve(matrix, rhs) {
  const a = matrix.map((row, i) => [...row, rhs[i]])
  for (let col = 0; col < a.length; col++) {
    let pivot = col
    for (let row = col + 1; row < a.length; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    ;[a[col], a[pivot]] = [a[pivot], a[col]]
    const scale = a[col][col]
    if (Math.abs(scale) < 1e-12) throw Error('Singular transition matrix')
    for (let j = col; j <= a.length; j++) a[col][j] /= scale
    for (let row = 0; row < a.length; row++) {
      if (row === col) continue
      const multiple = a[row][col]
      for (let j = col; j <= a.length; j++) a[row][j] -= multiple * a[col][j]
    }
  }
  return a.map(row => row.at(-1))
}

export function modelBreakthroughRisk(mode) {
  const state = createInitialState(1800000000000), derived = createDerived()
  const p = [], death = [], transitions = Array.from({ length: REALMS.length - 1 }, () => Array(REALMS.length - 1).fill(0))
  for (let i = 0; i < REALMS.length - 1; i++) {
    state.realm = i
    const options = Object.fromEntries((BREAKTHROUGH_AIDS[i + 1] || []).map(aid => [aid.id, mode === 'aided']))
    const preview = breakthroughPreview(state, derived, options)
    p[i] = preview.chance
    const fatal = preview.deathOnFailure
    death[i] = preview.deathRisk
    if (i < REALMS.length - 2) transitions[i][i + 1] += p[i]
    transitions[i][0] += death[i]
    const survivor = (1 - p[i]) * (1 - fatal)
    if (i < BREAKTHROUGH.regressionRealm) transitions[i][i] += survivor
    else transitions[i][i - 1] += survivor
    assert(Math.abs(transitions[i].reduce((sum, probability) => sum + probability, 0) + (i === REALMS.length - 2 ? p[i] : 0) - 1) < 1e-12)
  }
  const matrix = transitions.map((row, i) => row.map((prob, j) => (i === j ? 1 : 0) - prob))
  const total = solve(matrix, Array(REALMS.length - 1).fill(1))[0]
  const expectedDeaths = solve(matrix, death)[0]
  const visits = []
  for (let target = 0; target < REALMS.length - 1; target++) visits.push(solve(matrix, Array.from({ length: REALMS.length - 1 }, (_, i) => i === target ? 1 : 0))[0])
  const survivalMatrix = transitions.map((row, i) => row.map((prob, j) => (i === j ? 1 : 0) - (prob - (j === 0 ? death[i] : 0))))
  const firstLifeSuccess = solve(survivalMatrix, Array.from({ length: REALMS.length - 1 }, (_, i) => i === REALMS.length - 2 ? p.at(-1) : 0))[0]
  assert(Math.abs(visits.reduce((sum, v) => sum + v, 0) - total) < 1e-7)
  assert(firstLifeSuccess > 0 && firstLifeSuccess <= 1)
  assert(Math.abs(expectedDeaths - (1 - firstLifeSuccess) / firstLifeSuccess) < 1e-7)
  return { mode, expectedTotalAttempts: total, expectedDeaths, firstLifeSuccess,
    perTarget: visits.map((tries, i) => ({ target: REALMS[i + 1].name, chance: p[i], simpleAttempts: 1 / p[i], attemptsWithResets: tries })) }
}
