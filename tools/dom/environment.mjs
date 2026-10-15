import { JSDOM } from 'jsdom'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { installBrowserGlobals } from '../lib/browser-env.mjs'
import { captureConsole } from '../lib/checks.mjs'

/** 客户端环境必须先于 Vue 导入建立；退出或异常时统一释放定时器、DOM与全局量。 */
export async function createDomContext(harness) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost:5273/', pretendToBeVisual: true,
  })
  const { window } = dom
  const visualViewport = new window.EventTarget()
  Object.defineProperties(visualViewport, {
    width: { get() { return this.widthOverride ?? window.innerWidth } },
    height: { get() { return this.heightOverride ?? window.innerHeight } },
    offsetLeft: { value: 0, writable: true }, offsetTop: { value: 0, writable: true },
  })
  Object.defineProperty(window, 'visualViewport', { value: visualViewport, configurable: true })
  const restoreGlobals = installBrowserGlobals(window, [
    'HTMLElement', 'Element', 'Node', 'SVGElement', 'Text', 'Comment', 'DocumentFragment', 'Document',
    'ShadowRoot', 'MutationObserver', 'CustomEvent', 'Event', 'MouseEvent', 'KeyboardEvent', 'FileReader',
    'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'localStorage', 'sessionStorage',
    'location', 'navigator', 'history', 'window', 'document',
  ])
  const runtimeErrors = []
  window.addEventListener('error', event => runtimeErrors.push(String(event.message)))
  const origError = console.error, origWarn = console.warn
  const captured = captureConsole()
  let mod
  const dispose = () => {
    try {
      mod?.stopLoop()
      window.document.getElementById('app')?.__vue_app__?.unmount()
      dom.window.close()
    } finally { captured.restore(); restoreGlobals() }
  }
  try {
    const bundlePath = fileURLToPath(new URL('../../.smoke-dom-client/dom-check-app.js', import.meta.url))
    mod = await import(pathToFileURL(bundlePath).href)
    const { state, derived, ui, actions, startLoop, stopLoop, saveNow, engine } = mod
    return { ...harness, bundlePath, dom, window, visualViewport, mod, state, derived, ui, actions, startLoop, stopLoop,
      saveNow, engine, runtimeErrors, consoleErrors: captured.errors, warnings: captured.warnings, origError, origWarn, dispose }
  } catch (error) { dispose(); throw error }
}
