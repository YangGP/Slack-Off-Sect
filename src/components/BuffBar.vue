<script setup>
import { view } from '@/game/store'
import { fmtPercent, fmtTime } from '@/game/format'

const buffs = view.activeBuffs

function remain(b) {
  return Math.max(0, ((b.until || 0) - Date.now()) / 1000)
}
</script>

<template>
  <div v-if="buffs.length" class="buffs">
    天象：
    <template v-for="(b, i) in buffs" :key="b.id">
      <span class="buff" :class="{ neg: b.mult < 0 }">
        {{ b.name }} {{ b.mult > 0 ? '+' : '' }}{{ fmtPercent(b.mult) }}（{{ fmtTime(remain(b)) }}）
      </span>
      <span v-if="i < buffs.length - 1" class="dim"> · </span>
    </template>
  </div>
</template>
