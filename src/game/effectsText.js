/**
 * 效果文案：把数据层的 effects 对象翻译成人话，供建筑卡 / 参悟表复用。
 */
import { resourceName } from '@/data/resources'
import { BUILDING_MAP } from '@/data/buildings'
import { UPGRADE_MAP } from '@/data/upgrades'
import { JOBS, JOB_MAP } from '@/data/jobs'
import { REALMS } from '@/data/realms'
import { PROCESSING_STATIONS, PROCESSING_STATION_MAP } from '@/data/industry'
import { CRAFT_MAP } from '@/data/crafts'
import { CONFIG } from '@/data/config'
import { effectiveBuildingStorage } from './systems/economy'
import { money, moneyMax, ZERO } from './decimal'
import { fmt, fmtAmount, fmtEffectPercent as fmtPercent, fmtRate } from './format'

/**
 * 按“已建成数量 count / 启用数量 active”把建筑效果折算成当前总贡献。
 * 与 engine.recompute 的口径保持一致：仓储类看 count，产出类看 active。
 */
export function scaleEffectsForTotal(ef, count, active, upkeep = false) {
  if (!ef) return null
  const out = {}
  const byCount = upkeep ? ['storage', 'storageRatio', 'buildingStorageRatio', 'storageAll', 'maxDisciples'] : ['storage', 'buildingStorageRatio', 'storageAll', 'maxDisciples', 'habitability', 'disasterGuard', 'ascendBonus']
  const byActive = [
    'prod',
    'ratio',
    'ratioAll',
    'ratioReactor',
    'jobRatio',
    'consumeRatio',
    'craftBonus',
    'habitabilityPerHousing',
    'craftBonusByResource',
    'processingCapacityRatio',
    'processingPowerCapacity',
    'processingCoolingRatio',
    'craftSpeedByRecipe',
    'craftCostReduction',
    'disasterGuardByResource',
    'arrivalBonus',
    'breakthroughDiscount',
    'offlineHours',
    'karmaRatio',
    ...(upkeep ? ['habitability', 'disasterGuard', 'ascendBonus'] : []),
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
 * 把一整套效果整体乘一个倍率（法宝祭炼就是「每级线性叠加 0.3 倍」这种整体放大）。
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
  const push = (label, value, tone, resource) => out.push({ label, value, text: `${label} ${value}`.trim(), tone, ...(resource ? { resource } : {}) })
  if (ef.prod) {
    for (const k in ef.prod) push(`${resourceName(k)} 产出`, `+${fmt(ef.prod[k])}/秒`, 'good', k)
  }
  if (ef.ratio) {
    for (const k in ef.ratio) push(`${resourceName(k)} 产出`, `+${fmtPercent(ef.ratio[k])}`, 'good', k)
  }
  if (ef.ratioAll) push('全局产出', `+${fmtPercent(ef.ratioAll)}`, 'good')
  if (ef.ratioReactor) push('湮灭炉增产（每座，不含香火与粒子链）', `+${fmtPercent(ef.ratioReactor)}`, 'good')
  if (ef.jobRatio) {
    for (const k in ef.jobRatio) push(`${JOB_MAP[k]?.name || k} 产出`, `+${fmtPercent(ef.jobRatio[k])}`, 'good', JOB_MAP[k]?.resource)
  }
  if (ef.storage) {
    for (const k in ef.storage) push(`${resourceName(k)} 上限`, `+${fmt(ef.storage[k])}`, 'muted', k)
  }
  if (ef.storageRatio) {
    for (const k in ef.storageRatio) push(`${resourceName(k)} 上限`, `+${fmtPercent(ef.storageRatio[k])}`, 'muted', k)
  }
  if (ef.buildingStorageRatio) {
    for (const [id, value] of Object.entries(ef.buildingStorageRatio)) {
      const building = BUILDING_MAP[id]
      for (const res of Object.keys(building?.effects?.storage || {})) {
        push(`${building.name} ${resourceName(res)}上限`, `+${fmtPercent(value)}`, 'muted', res)
      }
    }
  }
  if (ef.storageAll) push('通用仓储', `+${fmt(ef.storageAll)}（仅作用于有仓容限制的资源，信符除外）`, 'muted')
  if (ef.maxDisciples) push('弟子上限', `+${ef.maxDisciples}`, 'good')
  if (ef.habitability) push('宜居度', `+${fmtAmount(ef.habitability)}`, 'good')
  if (ef.habitabilityPerHousing) push('宜居度 / 已入住名额', `+${fmtAmount(ef.habitabilityPerHousing)}`, 'good')
  if (ef.consumeRatio) push('弟子灵气消耗', `-${fmtPercent(Math.min(ef.consumeRatio, CONFIG.UPKEEP_REDUCTION_CAP))}（各来源合计最多减免${fmtPercent(CONFIG.UPKEEP_REDUCTION_CAP)}）`, 'good')
  if (ef.craftBonus) push('制作产出', `+${fmtPercent(ef.craftBonus)}`, 'good')
  if (ef.craftBonusByResource) {
    for (const [res, value] of Object.entries(ef.craftBonusByResource)) {
      push(`${resourceName(res)} 制作产出`, `+${fmtPercent(value)}`, 'good', res)
    }
  }
  for (const [id, value] of Object.entries(ef.processingCapacityRatio || {})) {
    push(`${PROCESSING_STATION_MAP[id]?.name || id} 容量（金丹起）`, `+${fmtPercent(value)}`, 'good')
  }
  for (const [id, value] of Object.entries(ef.craftSpeedByRecipe || {})) {
    push(`${CRAFT_MAP[id]?.name || id} 加工效率（金丹起）`, `+${fmtPercent(value)}`, 'good', CRAFT_MAP[id]?.out)
  }
  for (const [id, value] of Object.entries(ef.craftCostReduction || {})) {
    push(`${CRAFT_MAP[id]?.name || id} 每份耗料`, `-${fmtPercent(value)}（整枚向上取整）`, 'good', CRAFT_MAP[id]?.out)
  }
  if (ef.huntSuccessBonus) push('猎杀成功率', `+${Math.round(ef.huntSuccessBonus * 100)} 个百分点`, 'good')
  if (ef.huntYieldBonus) push('猎杀收获', `+${fmtPercent(ef.huntYieldBonus)}`, 'good')
  if (ef.huntCostReduction) push('猎杀信符消耗', `-${fmtPercent(ef.huntCostReduction)}`, 'good')
  if (ef.disasterGuard) push('灾害损失', `-${fmtPercent(Math.min(ef.disasterGuard, CONFIG.DISASTER_GUARD_CAP))}（各来源合计最多减免${fmtPercent(CONFIG.DISASTER_GUARD_CAP)}）`, 'good')
  if (ef.disasterGuardByResource) {
    for (const [res, value] of Object.entries(ef.disasterGuardByResource)) {
      push(`${resourceName(res)} 灾损额外减免`, `${fmtPercent(value)}（合计上限80%）`, 'good', res)
    }
  }
  if (ef.ascendBonus) push('转世／飞升仙缘加成', `+${fmtPercent(ef.ascendBonus)}`, 'good')
  if (ef.arrivalBonus) push('自动来人间隔', `-${fmtPercent(ef.arrivalBonus)}（合计最多缩短80%）`, 'good')
  if (ef.breakthroughDiscount) push('破境花费', `-${fmtPercent(ef.breakthroughDiscount)}`, 'good')
  // 身死减免（香火线《愿力护道》等）：作用于所有身死道消境界，与 progression 的 deathReduce 同源。
  if (ef.tribulationSafety) push('突破失败后身死概率', `-${fmtPercent(ef.tribulationSafety).replace('%', ' 个百分点')}（最低0%）`, 'good')
  if (ef.offlineHours) push('离线收益上限', `+${ef.offlineHours} 小时`, 'good')
  if (ef.karmaRatio) push('仙缘乘区固定加成', `+${fmtPercent(ef.karmaRatio)} 全局（不随仙缘点数缩放）`, 'good')
  if (ef.autoCraft) push('解锁自动制作', '', 'good')
  if (ef.autoTalentJobs) push('自动按岗位专长分工', '弟子页可暂停', 'good')
  if (ef.recruitMode) push('解锁主动招募', '弟子页可切换礼聘招募，档位越高天赋越好', 'unlock')
  if (ef.autoDiscipleBreakthrough) push('解锁自动突破', '弟子页可开启：重点优先、缺料跳过，仅在线结算', 'unlock')
  if (ef.openTrade) push('解锁宗门外交', '外交页与各宗互市，以富余资源换取紧缺物资', 'unlock')
  if (ef.autoCraftSpeedControl) push('各配方自动速限', '1× / 2× / 5× / 10×（金丹起受工位容量约束）', 'unlock')
  if (ef.autoCondenseLiquid) push('节气满仓自凝灵液', '需掌握《凝气化液》', 'good')
  if (ef.energyCraft) push('灵能输配', '解锁工位灵能驱动，按额外负荷耗能', 'unlock')
  if (ef.processingPowerCapacity != null) push('加工供能容量', `+${fmt(ef.processingPowerCapacity)}`, 'good')
  if (ef.processingCoolingRatio) push('晶核阵冷却容量', `+${fmtPercent(ef.processingCoolingRatio)}`, 'good')
  if (ef.unlockBuildings) {
    for (const id of ef.unlockBuildings) {
      push('解锁建筑', BUILDING_MAP[id]?.name || id, 'unlock')
    }
  }
  return out
}

export function describeProcessingEffects(buildingId, count = 1, derived = {}) {
  const out = PROCESSING_STATIONS.filter(station => station.buildings[buildingId]).map(station => ({
    label: `${station.name} 容量（金丹起）`, value: `+${fmt(station.buildings[buildingId] * count * (1 + (derived.processingCapacityRatio?.[station.id] || 0)))}`,
    tone: 'good',
  }))
  if (buildingId === 'crystalArray') out.push({ label: '冷却回路额外容量', value: `+${fmt(2 * count * (1 + (derived.processingCoolingRatio || 0)))}（另计工位容量提供的冷却）`, tone: 'good' })
  return out
}

/** 建筑单座基础效果与当前合计；金额产出复用经济结算的资源倍率。 */
export function describeBuildingEffects(meta, state, derived) {
  const entry = state.buildings[meta.id]
  const count = entry?.count || 0
  const active = entry?.on === false ? 0 : count * (derived.buildingSupply?.[meta.id] ?? 1)
  const hasPower = meta.upkeepQi != null || meta.upkeepEnergy != null
  const energy = meta.upkeepEnergy != null && (meta.upkeepQi == null || entry?.power === 'energy' && state.upgrades.energyApplication)
  const powerMult = hasPower && energy ? meta.powerMult ?? 1 : 1
  const totalEffects = scaleEffectsForTotal(meta.effects, count, active * powerMult, !!meta.upkeep || hasPower)
  if (totalEffects?.storage) totalEffects.storage = effectiveBuildingStorage(state, meta.id)
  const unit = [...describeEffects(meta.effects), ...describeJobEffects(meta.id), ...describeProcessingEffects(meta.id)]
  const boostMult = meta.boost && entry?.boost === true && state.upgrades[meta.boost.upgrade]
    ? 1 + (meta.boost.multiplier - 1) * (derived.buildingSupply?.[meta.boost.id] ?? 0) : 1
  const total = [...describeEffects(totalEffects), ...describeJobEffects(meta.id, active, state.upgrades, boostMult), ...describeProcessingEffects(meta.id, active, derived)]
  return unit.map((row) => {
    const res = row.resource
    if (res && meta.effects?.prod?.[res] != null && row.label === `${resourceName(res)} 产出`) {
      const selfUse = money(meta.selfUse?.[res] ?? 0)
      const base = money(meta.effects.prod[res])
      const current = moneyMax(ZERO, base.times(active).times(powerMult).minus(selfUse.times(active)))
        .times(derived.sourceFactor?.[res] ?? 1)
      return { ...row, label: `${resourceName(res)} ${meta.selfUse?.[res] ? '净供能（已扣炉内自用）' : '产出'}`,
        value: fmtRate(moneyMax(ZERO, base.minus(selfUse))), total: count ? fmtRate(current) : '' }
    }
    return { ...row, total: count ? total.find(item => item.label === row.label)?.value || '0' : '' }
  })
}

/**
 * 建筑「职位效果」：产出挂在职位上的建筑（采矿场 / 灵石矿 / 药圃 / 山门 / 藏经阁…）
 * 自身 effects 往往是空的，这里从 jobs 数据补出「开放哪个职位 / 让职位多产什么」，
 * 与 `describeEffects` 同格式，供建筑 tooltip 的「效果」分节合并显示。
 *
 * count 用于「每座叠加」的副产出（如灵石矿让矿工产灵石）：传已启用数量即可得到合计值。
 */
export function describeJobEffects(buildingId, count = 1, upgrades = null, boostMult = 1) {
  const out = []
  if (!buildingId) return out
  const push = (label, value, tone, resource) => out.push({ label, value, text: `${label} ${value}`.trim(), tone, ...(resource ? { resource } : {}) })
  for (const job of JOBS) {
    // 这栋建筑开放（或开启基础产出）的职位
    if (job.building === buildingId || job.needs?.building?.id === buildingId) {
      push('开放职位', job.name, 'unlock')
      // 基础产出按每名弟子结算，建筑数量不会将它重复叠加。
      push(`${job.name} 基础产出`, `${resourceName(job.resource)} +${fmt(count > 0 ? job.base : 0)}/秒·人`, 'good', job.resource)
    }
    // 由本建筑开启的额外产出（按人数结算，不随建筑座数叠加）
    for (const output of job.additionalOutputs || []) {
      if (output.building === buildingId || (!output.building && output.upgrade && (job.building === buildingId || job.needs?.building?.id === buildingId))) {
        const available = count > 0 && (!output.upgrade || upgrades == null || upgrades[output.upgrade])
        const condition = output.upgrade ? `（需《${UPGRADE_MAP[output.upgrade]?.name || output.upgrade}》）` : ''
        push(`${job.name} 额外产出`, `${resourceName(output.resource)} +${fmt(available ? output.base : 0)}/秒·人${condition}`, 'good', output.resource)
      }
    }
    // 本建筑让该职位多加的副产出（灵石矿 → 矿工产灵石，可多座叠加）
    const sec = job.secondary
    if (sec && sec.building === buildingId) {
      const base = sec.base * (sec.perBuilding ? count : 1) * boostMult
      push(`${job.name} 额外产出`, `${resourceName(sec.resource)} +${fmtAmount(base)}/秒·人`, 'good', sec.resource)
    }
  }
  return out
}

/** 破境护道的附加效果文案（如「立愿应劫」的 deathReduce）；无附加效果时返回空串。 */
export function aidExtraText(aid) {
  if (!aid?.deathReduce) return ''
  return `，突破失败后身死概率 -${fmtPercent(aid.deathReduce).replace('%', ' 个百分点')}（最低0%）`
}

/** 把解锁条件翻译成人话 */
export function describeNeeds(needs) {
  if (!needs) return []
  const out = []
  if (needs.anyBuildings) out.push(`需建成其一：${needs.anyBuildings.map(b => `${BUILDING_MAP[b.id]?.name || b.id} ×${b.count}`).join(' / ')}`)
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
