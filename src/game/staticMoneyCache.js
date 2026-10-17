/**
 * 静态数据金额缓存的失效入口。
 *
 * 游戏里数据表是只读常量，按对象身份把 Number 字面值预构造成 Decimal 可以长期复用
 * （这是离线分段的主要优化之一）。但工具链会**原地修改**同一批对象：
 * 例如 `tools/audit-lib.mjs` 临时改 `CRAFT_MAP.infuseStone.cost.qi` 与建筑
 * `effects.prod`，跑完再还原。对象身份没变、内容已经变了，弱引用缓存不会自己失效。
 *
 * 所以凡是按身份缓存静态金额的地方都登记一个重置函数；补丁应用后与回滚后各发一次
 * `invalidateStaticMoneyCaches()`，同进程连续对照才不会读到旧报价或旧产出。
 */
const resets = new Set()

/** 登记某个静态金额缓存的重置函数（模块加载时调用一次） */
export function registerStaticMoneyCache(reset) {
  resets.add(reset)
}

/** 让所有登记的静态金额缓存重新构造；工具在改表前后各调一次。 */
export function invalidateStaticMoneyCaches() {
  for (const reset of [...resets]) reset()
}
