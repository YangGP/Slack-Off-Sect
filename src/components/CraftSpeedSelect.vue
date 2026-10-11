<script setup>
// 独立组件只接收稳定的名称和速度，库存、倒计时刷新不重写正在展开的原生下拉框。
import { CONFIG } from '@/data/config'

defineProps({ name: String, speed: Number })
const emit = defineEmits(['change'])
</script>

<template>
  <label class="small craft-speed-setting">自动速限
    <select :aria-label="`${name}自动炼制速度`" :value="speed" @change="emit('change', Number($event.target.value))">
      <option v-for="value in CONFIG.AUTO_CRAFT_SPEEDS" :key="value" :value="value">{{ value }}×</option>
    </select>
  </label>
</template>
