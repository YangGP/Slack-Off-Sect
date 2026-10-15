/** 安装 jsdom 全局量并返回恢复函数；每个入口仍可注入自己的时钟和定时器。 */
export function installBrowserGlobals(window, keys) {
  const originals = new Map()
  for (const key of keys) {
    if (key !== 'window' && !(key in window)) continue
    const original = Object.getOwnPropertyDescriptor(globalThis, key)
    try {
      Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true, writable: true })
      originals.set(key, original)
    } catch { /* Node 可能提供不可覆盖的全局量，保持原值。 */ }
  }
  return () => {
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original)
      else delete globalThis[key]
    }
  }
}
