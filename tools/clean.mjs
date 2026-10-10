import { readdirSync, lstatSync, realpathSync, rmSync } from 'node:fs'
import { dirname, join, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

// 只检查根目录的已知构建产物；不扫描依赖、源码或用户文件。
const root = realpathSync(dirname(dirname(fileURLToPath(import.meta.url))))
const fixed = new Set(['dist', 'dist-ssr', '.early', '.vite'])
const targets = readdirSync(root).filter(name => fixed.has(name) || name.startsWith('.smoke'))
// 全部核对后才开始删除，防止目录链接指向项目外部。
for (const name of targets) {
  const target = join(root, name)
  const stat = lstatSync(target)
  const inside = relative(root, realpathSync(target))
  if (!stat.isDirectory() || stat.isSymbolicLink() || !inside || inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`拒绝清理非项目产物目录或目录链接：${name}`)
  }
}
for (const name of targets) {
  rmSync(join(root, name), { recursive: true })
  console.log(`已删除 ${name}/`)
}
console.log(`清理完成，共 ${targets.length} 个目录`)
