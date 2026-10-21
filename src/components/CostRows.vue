<script setup>
/**
 * 悬停提示里的「价格」分节：一种资源一行，不够的标红。
 * 建筑、参悟表、破境与炼制共用同一套写法，避免各处复制同一段 markup。
 */
import { state, derived } from '@/game/store'
import { costLabel, enough, costCapBlocked, costCapHint } from '@/game/pricing'
import { resourceName } from '@/data/resources'

defineProps({
  cost: { type: Object, required: true },
})
</script>

<template>
  <div class="tip-section">价格</div>
  <div v-for="(amount, res) in cost" :key="res" class="tip-row">
    <span class="k" :class="{ blocked: costCapBlocked(state, derived, res, amount) }">
      {{ resourceName(res) }}<span v-if="costCapBlocked(state, derived, res, amount)" class="cap-star" :title="costCapHint(state, derived, res, amount)">*</span>
    </span>
    <span class="v" :class="{ bad: !enough(state, res, amount) || costCapBlocked(state, derived, res, amount) }"
      :title="costCapHint(state, derived, res, amount)">{{ costLabel(state, derived, res, amount) }}</span>
  </div>
</template>
