<script setup>
/**
 * 修真页：解锁 / 系统层（对标猫国的「科学」）。
 * 负责开建筑、开系统（自动制作、离线上限、破境折扣…），本身不带 +% 加成。
 */
import { CULTIVATION } from '@/data/upgrades'
import UpgradeTable from './UpgradeTable.vue'
</script>

<template>
  <UpgradeTable :list="CULTIVATION" kind="cultivation" title="修真" hint="研究本源，解锁建筑、系统与法宝" />
</template>
