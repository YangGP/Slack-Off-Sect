import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 专供 tools/dom-check.mjs 使用的客户端构建：
// 把 App + store + vue 打成一份普通 ES bundle，交给 jsdom 执行。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  build: {
    outDir: '.smoke-dom-client',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: fileURLToPath(new URL('./dom-entry.js', import.meta.url)),
      formats: ['es'],
      fileName: () => 'dom-check-app.js',
    },
  },
})
