import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { createContext, runInContext } from 'node:vm'

/** 本地猫国原版引擎；只替换浏览器展示与联网，不重写经济、时间或奖励。 */
export function createKittensRuntime(root, seed = 12345) {
  const dom = new JSDOM('<!doctype html><html><head><script src="lib/dojo.js"></script></head><body><div id="game"><div id="calendarDiv"></div><div id="gameLog"></div></div></body></html>', {
    url: 'http://localhost/',
  })
  // 游戏逻辑放普通VM，DOM只供原始Dojo初始化及日历/日志使用，避免每次Math访问穿过浏览器全局代理。
  const browser = dom.window, files = []
  const w = { document: browser.document, navigator: browser.navigator, name: '',
    location: { href: 'http://localhost/', protocol: 'http:', hostname: 'localhost', host: 'localhost', reload() {} },
    innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 800,
    localStorage: browser.localStorage, screen: browser.screen, Math: Object.create(Math), Date,
    setTimeout: browser.setTimeout.bind(browser), clearTimeout: browser.clearTimeout.bind(browser),
    setInterval: browser.setInterval.bind(browser), clearInterval: browser.clearInterval.bind(browser),
    addEventListener: browser.addEventListener.bind(browser), removeEventListener: browser.removeEventListener.bind(browser),
    getComputedStyle: browser.getComputedStyle.bind(browser), console }
  w.window = w; w.self = w
  const context = createContext(w)
  let ticks = 0, randomState = seed >>> 0
  w.Math.random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296 }
  const epoch = Date.UTC(2026, 9, 24), NativeDate = w.Date
  w.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [epoch + ticks * 200])) }
    static now() { return epoch + ticks * 200 }
  }
  w.console = { ...console, log() {}, warn() {} }
  w.$I = (key, args) => key + (args ? ` ${args.join(',')}` : '')
  w.React = { createElement() {}, createClass: spec => spec }
  w.XMLHttpRequest = class { constructor() { throw Error('猫国测量禁止联网') } }
  w.fetch = () => { throw Error('猫国测量禁止联网') }
  w.confirm = () => true
  const load = file => {
    runInContext(readFileSync(resolve(root, file), 'utf8'), context, { filename: `kittens/${file}` })
    files.push(file)
  }
  try {
    for (const file of ['lib/jQuery.js', 'lib/dojo.js', 'lib/lz-string.js', 'lib/md5.js', 'config.js', 'core.js', 'js/ui.js',
      'js/resources.js', 'js/calendar.js', 'js/buildings.js', 'js/village.js', 'js/science.js', 'js/workshop.js',
      'js/diplomacy.js', 'js/religion.js', 'js/achievements.js', 'js/space.js', 'js/prestige.js', 'js/time.js',
      'js/stats.js', 'js/challenges.js', 'js/void.js', 'js/math.js', 'game.js']) load(file)
    const game = w.game = new w.com.nuclearunicorn.game.ui.GamePage('game')
    const ui = new w.classes.ui.UISystem()
    ui.defaultSchemes = ['default']
    ui.confirm = (title, message, yes) => yes()
    game.setUI(ui)
    game.resetState()
    game.opts.disableTelemetry = true
    game.telemetry.logEvent = () => {}
    game.server.refresh = () => {}
    game.updateCaches()
    game.calculateAllEffects()
    return { game, window: w, files,
      step() { ticks++; game.tick() },
      get ticks() { return ticks },
      get randomState() { return randomState },
      restoreClock(count, random) { ticks = count; randomState = random },
      dispose() { dom.window.close() },
    }
  } catch (error) { dom.window.close(); throw error }
}
