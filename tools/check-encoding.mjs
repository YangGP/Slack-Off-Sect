/**
 * 编码守卫：检查仓库里的文本文件有没有 UTF-8 BOM、有没有 CRLF。
 *
 * 为什么要有这个：#BOM 会让 package.json / tsconfig 之类的 JSON 直接解析失败
 * （Vite 报 `Unexpected token ''`，很难一眼看出是编码问题），
 * 而 Windows 上的编辑器很容易悄悄加上。BOM 视为错误（退出码 1），CRLF 只警告。
 *
 * 用法：npm run check:encoding   （已挂进 npm run check）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-ssr',
  '.vite',
])
const TEXT = /\.(js|mjs|cjs|vue|css|html|json|md|txt|yml|yaml)$/i
const ROOT_DOTFILES = new Set(['.gitignore', '.gitattributes', '.editorconfig'])

const bom = []
const crlf = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.smoke')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      walk(p)
      continue
    }
    if (!TEXT.test(name) && !ROOT_DOTFILES.has(name)) continue
    const raw = readFileSync(p)
    if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) bom.push(p)
    else if (raw.includes(0x0d)) crlf.push(p)
  }
}
walk('.')

if (crlf.length) {
  console.log(`⚠ 有 ${crlf.length} 个文件用了 CRLF（.gitattributes 要求 LF，建议改掉）：`)
  for (const f of crlf.slice(0, 10)) console.log('   ' + f)
}

if (bom.length) {
  console.log(`✗ 有 ${bom.length} 个文件带 UTF-8 BOM（JSON 会解析失败）：`)
  for (const f of bom) console.log('   ' + f)
  console.log('  修法：用「UTF-8（无 BOM）」重存，或 node -e "…" 去掉前三字节')
  process.exit(1)
}

console.log(`✓ 编码检查通过（无 BOM${crlf.length ? `，${crlf.length} 个 CRLF 警告` : '，全部 LF'}）`)
