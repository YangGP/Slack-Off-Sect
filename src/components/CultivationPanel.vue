<script setup>
/**
 * 修真页：解锁 / 系统层。
 * 负责开建筑、开系统与材料专业研究，以灵机仓容和产业前置推进。
 */
import { computed } from 'vue'
import { CULTIVATION } from '@/data/upgrades'

// 香火专属条目在香火页购买，不从普通修真列表进入。
const list = computed(() => CULTIVATION.filter((u) => u.page !== 'faith'))
import UpgradeTable from './UpgradeTable.vue'
</script>

<template>
  <UpgradeTable :list="list" kind="cultivation" title="修真" hint="扩充灵机上限，推进研究与产业" />
</template>
