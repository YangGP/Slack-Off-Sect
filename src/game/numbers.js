// 容差随数值大小变化，只吸收浮点运算的舍入误差。
export function nearlyEqual(a, b) {
  if (a === b) return true
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) <= Number.EPSILON * 4 * Math.max(Math.abs(a), Math.abs(b))
}

export function atLeast(value, required) {
  return value >= required || nearlyEqual(value, required)
}

export function subtractResource(value, cost) {
  return nearlyEqual(value, cost) ? 0 : Math.max(0, value - cost)
}

function snapInteger(value) {
  const rounded = Math.round(value)
  return nearlyEqual(value, rounded) ? rounded : value
}

export function floorNumber(value) {
  return Math.floor(snapInteger(value))
}

export function ceilNumber(value) {
  return Math.ceil(snapInteger(value))
}
