<script setup>
/**
 * 技艺页：数值修饰层（对标猫国的「工坊升级」）。
 * 里面有两类条目：
 *   技艺 —— 自己练出来的手艺（引气诀、伐木要术…），门禁看建筑
 *   法宝 —— 由修真研究解锁、炼成的器物（聚灵珠、飞剑、护山阵盘…），门禁看修真
 * 两者都只加数值、不解锁任何东西，所以放在同一页，用一行筛选区分。
 */
import { computed } from 'vue'
import { state } from '@/game/store'
import { TECHNIQUES } from '@/data/techniques'
import UpgradeTable from './UpgradeTable.vue'

const FILTERS = [
  { id: 'all', name: '全部' },
  { id: 'skill', name: '技艺' },
  { id: 'treasure', name: '法宝' },
]

const filter = computed(() => state.ui.skillFilter || 'all')
const list = computed(() => {
  const f = filter.value
  if (f === 'treasure') return TECHNIQUES.filter((t) => t.kind === 'treasure')
  if (f === 'skill') return TECHNIQUES.filter((t) => t.kind !== 'treasure')
  return TECHNIQUES
})
const treasureCount = TECHNIQUES.filter((t) => t.kind === 'treasure').length
</script>

<template>
  <UpgradeTable
    :list="list"
    kind="technique"
    title="技艺与法宝"
    hint="只加产出，不解锁"
    :filters="FILTERS"
    :filter="filter"
    filter-key="skillFilter"
    :note="`${treasureCount} 件法宝由修真解锁`"
  />
</template>
