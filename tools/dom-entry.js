/**
 * DOM 验证用的入口：只负责把「浏览器里真正加载的那份代码」暴露出来。
 * 这个文件由 tools/vite.domcheck.config.js 用**客户端模式**打包（不是 SSR），
 * 所以它产出的 bundle 与用户在浏览器里跑的是同一条代码路径。
 */
import { createApp } from 'vue'
import App from '../src/App.vue'
import {
  state,
  derived,
  ui,
  actions,
  engine,
  startLoop,
  stopLoop,
  saveNow,
} from '../src/game/store.js'

export function mount(target) {
  const app = createApp(App)
  app.mount(target)
  return app
}

export { App, createApp, state, derived, ui, actions, engine, startLoop, stopLoop, saveNow }
