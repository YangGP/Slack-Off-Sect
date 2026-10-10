<script setup>
/**
 * 修真页：解锁 / 系统层（对标猫国的「科学」）。
 * 负责开建筑、开系统与材料专业研究，以灵机仓容和产业前置推进。
 */
import { CULTIVATION } from '@/data/upgrades'
import UpgradeTable from './UpgradeTable.vue'
</script>

<template>
  <UpgradeTable :list="CULTIVATION" kind="cultivation" title="修真" hint="扩充灵机上限，推进研究与产业" />
</template>
