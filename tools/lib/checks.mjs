import { isMoney, money } from '../../src/game/decimal.js'

/**
 * 每次运行独立统计，避免各检查入口重复维护断言与退出码。
 *
 * `close` 是**时间与比例域**的容差助手：两边都是 Number 时按原来的浮点容差比较。
 * 若其中一边是金额（Decimal），则改用 Decimal 精确差值再套同一容差 —— 容差数值不变，
 * 只是不再让 Decimal 走 `valueOf` 的字符串隐式转换。
 */
export function createCheckHarness({ successMessage = '全部通过 ✅' } = {}) {
  let passed = 0, failed = 0
  const failures = []
  return {
    ok(name, condition, extra = '') {
      if (condition) { passed++; console.log(`  ✓ ${name}`) }
      else { failed++; failures.push(name); console.log(`  ✗ ${name} ${extra}`) }
    },
    close: (a, b, tolerance = 1e-6) => (isMoney(a) || isMoney(b)
      ? money(a).minus(money(b)).abs().lte(tolerance)
      : Math.abs(a - b) <= tolerance),
    section: title => console.log(`\n== ${title} ==`),
    finish() {
      console.log(`\n通过 ${passed} 项，失败 ${failed} 项`)
      if (failed) {
        console.log('失败清单：')
        for (const name of failures) console.log('  - ' + name)
        process.exitCode = 1
      } else console.log(successMessage)
      return failed === 0
    },
  }
}

/** 无论检查是否抛错，都由调用方在 finally 中恢复原控制台。 */
export function captureConsole() {
  const warnings = [], errors = []
  const warn = console.warn, error = console.error
  const format = args => args.map(value => typeof value === 'string' ? value : String(value?.message || value)).join(' ')
  console.warn = (...args) => warnings.push(format(args))
  console.error = (...args) => errors.push(format(args))
  return { warnings, errors, restore() { console.warn = warn; console.error = error } }
}
