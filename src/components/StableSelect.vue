<script setup>
// 隔离高频页面刷新，避免重复写入正在操作的原生下拉框。
defineProps({
  modelValue: { type: String, required: true },
  label: { type: String, required: true },
  options: { type: Array, required: true },
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <select :aria-label="label" :value="modelValue" @change="emit('update:modelValue', $event.target.value)">
    <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
  </select>
</template>
