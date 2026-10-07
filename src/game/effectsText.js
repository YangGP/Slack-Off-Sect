/**
 * 效果文案：把数据层的 effects 对象翻译成人话，供建筑卡 / 参悟表复用。
 */
import { RESOURCE_MAP } from '@/data/resources'
import { BUILDING_MAP } from '@/data/buildings'
import { UPGRADE_MAP } from '@/data/upgrades'
import { JOB_MAP } from '@/data/jobs'
import { REALMS } from '@/data/realms'
import { fmt, fmtPercent } from './format'

function resName(id) {
  return RESOURCE_MAP[id]?.name || id
}

/**
 * 按“已建成数量 count / 启用数量 active”把建筑效果折算成当前总贡献。
 * 与 engine.recompute 的口径保持一致：仓储类看 count，产出类看 active。
 */
export function scaleEffectsForTotal(ef, count, active, upkeep = false) {
  if (!ef) return null
  const out = {}
  const byCount = upkeep ? ['storage', 'storageAll', 'maxDisciples'] : ['storage', 'storageAll', 'maxDisciples', 'morale', 'disasterGuard', 'ascendBonus']
  const byActive = [
    'prod',
    'ratio',
    'ratioAll',
    'jobRatio',
    'consumeRatio',
    'craftBonus',
    'arrivalBonus',
    'breakthroughDiscount',
    'offlineHours',
    'karmaRatio',
    ...(upkeep ? ['morale', 'disasterGuard', 'ascendBonus'] : []),
  ]
  for (const key in ef) {
    const value = ef[key]
    if (byCount.includes(key)) {
      if (typeof value === 'number') out[key] = value * count
      else {
        out[key] = {}
        for (const k in value) out[key][k] = value[k] * count
      }
    } else if (byActive.includes(key)) {
      if (typeof value === 'number') out[key] = value * active
      else {
        out[key] = {}
        for (const k in value) out[key][k] = value[k] * active
      }
    } else {
      out[key] = value
    }
  }
  return out
}

/**
 * 把一整套效果整体乘一个倍率（法宝祭炼就是「每级 ×1.3」这种整体放大）。
 * 与 `scaleEffectsForTotal` 的区别：那个按数量/启用数缩放，这个按一个任意倍率缩放。
 */
export function scaleEffectsBy(ef, mult) {
  if (!ef) return null
  const out = {}
  for (const key in ef) {
    const value = ef[key]
    if (typeof value === 'number') out[key] = value * mult
    else {
      out[key] = {}
      for (const k in value) out[key][k] = value[k] * mult
    }
  }
  return out
}

export function describeEffects(ef) {
  const out = []
  if (!ef) return out
  /** 一条效果：`text` 是给人看的整句，`label` / `value` 拆开是为了让界面「一个资源一行」 */
  const push = (label, value, tone) => out.push({ label, value, text: `${label} ${value}`.trim(), tone })
  if (ef.prod) {
    for (const k in ef.prod) push(`${resName(k)} 产出`, `+${fmt(ef.prod[k])}/秒`, 'good')
  }
  if (ef.ratio) {
    for (const k in ef.ratio) push(`${resName(k)} 产出`, `+${fmtPercent(ef.ratio[k])}`, 'good')
  }
  if (ef.ratioAll) push('全局产出', `+${fmtPercent(ef.ratioAll)}`, 'good')
  if (ef.jobRatio) {
    for (const k in ef.jobRatio) push(`${JOB_MAP[k]?.name || k} 产出`, `+${fmtPercent(ef.jobRatio[k])}`, 'good')
  }
  if (ef.storage) {
    for (const k in ef.storage) push(`${resName(k)} 上限`, `+${fmt(ef.storage[k])}`, 'muted')
  }
  if (ef.storageAll) push('全部资源上限', `+${fmt(ef.storageAll)}`, 'muted')
  if (ef.maxDisciples) push('弟子上限', `+${ef.maxDisciples}`, 'good')
  if (ef.morale) push('士气', `+${ef.morale}`, 'good')
  if (ef.consumeRatio) push('弟子灵气消耗', `-${fmtPercent(ef.consumeRatio)}`, 'good')
  if (ef.craftBonus) push('制作产出', `+${fmtPercent(ef.craftBonus)}`, 'good')
  if (ef.disasterGuard) push('妖兽侵袭损失', `-${fmtPercent(ef.disasterGuard)}`, 'good')
  if (ef.ascendBonus) push('飞升仙缘', `+${fmtPercent(ef.ascendBonus)}`, 'good')
  if (ef.arrivalBonus) push('弟子前来速度', `+${fmtPercent(ef.arrivalBonus)}`, 'good')
  if (ef.breakthroughDiscount) push('破境花费', `-${fmtPercent(ef.breakthroughDiscount)}`, 'good')
  if (ef.offlineHours) push('离线收益上限', `+${ef.offlineHours} 小时`, 'good')
  if (ef.karmaRatio) push('每点仙缘额外', `+${fmtPercent(ef.karmaRatio)} 全局`, 'good')
  if (ef.autoCraft) push('解锁自动制作', '', 'good')
  if (ef.unlockBuildings) {
    for (const id of ef.unlockBuildings) {
      push('解锁建筑', BUILDING_MAP[id]?.name || id, 'unlock')
    }
  }
  return out
}

/** 把解锁条件翻译成人话 */
export function describeNeeds(needs) {
  if (!needs) return []
  const out = []
  if (needs.building) {
    out.push(`需建成 ${BUILDING_MAP[needs.building.id]?.name || needs.building.id} ×${needs.building.count}`)
  }
  if (needs.buildings) {
    for (const b of needs.buildings) {
      out.push(`需建成 ${BUILDING_MAP[b.id]?.name || b.id} ×${b.count}`)
    }
  }
  if (needs.upgrade) out.push(`需参悟《${UPGRADE_MAP[needs.upgrade]?.name || needs.upgrade}》`)
  if (needs.upgrades) {
    for (const u of needs.upgrades) out.push(`需参悟《${UPGRADE_MAP[u]?.name || u}》`)
  }
  if (needs.realm != null) out.push(`需境界达到 ${REALMS[needs.realm]?.name || needs.realm}`)
  return out
}
