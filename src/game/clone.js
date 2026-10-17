import { isMoney } from './decimal'

/**
 * 运行时深拷贝：递归复制可变对象与数组。
 *
 * 只服务于「运行时快照」（离线副本、`snapshotState`、测试夹具），**不是存档恢复**：
 * 不改变版本、不截断日志、不触发迁移，也不补齐缺失字段。
 *
 * - Decimal 按不可变值使用，允许共享引用（这样也不会把它退化成字符串或普通对象）；
 * - 不能用 `structuredClone`（不保留 Decimal 原型）或 `JSON.parse(JSON.stringify(...))`
 *   （金额会变成字符串，副本无法继续参与运算）。
 */
export function cloneRuntime(value) {
  if (value === null || typeof value !== 'object') return value
  if (isMoney(value)) return value
  if (Array.isArray(value)) return value.map(cloneRuntime)
  const out = {}
  for (const key of Object.keys(value)) out[key] = cloneRuntime(value[key])
  return out
}
