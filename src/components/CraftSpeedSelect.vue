<script setup>
// 独立组件只接收稳定的名称和速度，库存、倒计时刷新不重写正在展开的原生下拉框。
import { CONFIG } from '@/data/config'
import StableSelect from './StableSelect.vue'

defineProps({ name: String, speed: Number })
const emit = defineEmits(['change'])
const options = CONFIG.AUTO_CRAFT_SPEEDS.map(value => ({ value, label: `${value}×` }))
</script>

<template>
  <label class="small craft-speed-setting">自动速限
    <StableSelect :label="`${name}自动炼制速度`" :model-value="speed" :options="options" @update:model-value="emit('change', $event)" />
  </label>
</template>
