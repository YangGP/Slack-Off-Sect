/** Exact finite-state model: expected attempts including regressions and death resets.
 * Repeated costs and probabilities are held fixed; production time and growing karma are excluded.
 */
import { REALMS, BREAKTHROUGH, BREAKTHROUGH_AIDS } from '../src/data/realms.js'
import assert from 'node:assert/strict'

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

const results = []
for (const mode of ['naked', 'aided']) {
  const p = [], death = [], transitions = Array.from({ length: 10 }, () => Array(10).fill(0))
  for (let i = 0; i < 10; i++) {
    const base = BREAKTHROUGH.lateBaseChances[i + 1] ?? (i < 3 ? BREAKTHROUGH.earlyChance : i === 3 ? BREAKTHROUGH.goldenCoreChance : BREAKTHROUGH.tribulationChance - (i - 4) * BREAKTHROUGH.chanceDrop)
    p[i] = Math.min(BREAKTHROUGH.chanceCap, base + (mode === 'aided' && i >= 3 ? BREAKTHROUGH_AIDS[i + 1].reduce((sum, aid) => sum + aid.bonus, 0) : 0))
    const fatal = i >= 7 ? BREAKTHROUGH.deathChance + (i - 7) * BREAKTHROUGH.deathChanceStep : 0
    death[i] = (1 - p[i]) * fatal
    if (i < 9) transitions[i][i + 1] += p[i]
    if (i < 7) transitions[i][i] += 1 - p[i]
    else { transitions[i][0] += death[i]; transitions[i][i - 1] += (1 - p[i]) * (1 - fatal) }
  }
  const matrix = transitions.map((row, i) => row.map((prob, j) => (i === j ? 1 : 0) - prob))
  const total = solve(matrix, Array(10).fill(1))[0]
  const expectedDeaths = solve(matrix, death)[0]
  const visits = []
  for (let target = 0; target < 10; target++) visits.push(solve(matrix, Array.from({ length: 10 }, (_, i) => i === target ? 1 : 0))[0])
  const survivalMatrix = transitions.map((row, i) => row.map((prob, j) => (i === j ? 1 : 0) - (prob - (j === 0 ? death[i] : 0))))
  const firstLifeSuccess = solve(survivalMatrix, Array.from({ length: 10 }, (_, i) => i === 9 ? p[9] : 0))[0]
  assert(Math.abs(visits.reduce((sum, v) => sum + v, 0) - total) < 1e-7)
  assert(firstLifeSuccess > 0 && firstLifeSuccess <= 1)
  assert(Math.abs(expectedDeaths - (1 - firstLifeSuccess) / firstLifeSuccess) < 1e-7)
  results.push({ mode, expectedTotalAttempts: total, expectedDeaths, firstLifeSuccess,
    perTarget: visits.map((tries, i) => ({ target: REALMS[i + 1].name, chance: p[i], simpleAttempts: 1 / p[i], attemptsWithResets: tries })) })
}
console.log(JSON.stringify(results, null, 2))
