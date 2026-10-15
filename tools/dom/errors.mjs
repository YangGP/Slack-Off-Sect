export async function checkErrors(context) {
  let { ok, runtimeErrors, consoleErrors, warnings, origError, origWarn } = context
  console.warn = origWarn
  console.error = origError
  console.log('\n== 运行时报错 ==')
  const templateWarnings = warnings.filter(
    (w) => w.includes('was accessed during render') || w.includes('is not defined'),
  )
  for (const w of warnings.slice(0, 10)) console.log('  ! ' + w.slice(0, 200))
  for (const e of consoleErrors.slice(0, 10)) console.log('  ! ' + e.slice(0, 200))
  for (const e of runtimeErrors.slice(0, 10)) console.log('  ! ' + e.slice(0, 200))
  ok('没有模板 / 响应式警告', templateWarnings.length === 0, templateWarnings[0]?.slice(0, 160) || '')
  ok('控制台没有 error', consoleErrors.length === 0, consoleErrors[0]?.slice(0, 160) || '')
  ok('没有未捕获异常', runtimeErrors.length === 0, runtimeErrors[0]?.slice(0, 160) || '')
}
