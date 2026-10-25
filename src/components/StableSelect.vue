<script setup>
import { nextTick, onBeforeUpdate, ref, shallowRef, useAttrs } from 'vue'

// 原生菜单展开期间固定整个 DOM 快照；父页刷新不重写 value、选项或属性。
defineOptions({ inheritAttrs: false })
const props = defineProps({
  modelValue: { type: [String, Number], default: undefined },
  label: { type: String, required: true },
  options: { type: Array, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const attrs = useAttrs()
const element = ref(null)
let interacting = false

function snapshot() {
  return { value: props.modelValue, label: props.label, disabled: props.disabled,
    attrs: { ...attrs },
    options: props.options.map(option => ({ value: option.value, label: String(option.label ?? ''), disabled: !!option.disabled })) }
}
const view = shallowRef(snapshot())
const domValue = value => value == null ? '' : String(value)

function sync() {
  if (interacting) return
  const next = snapshot(), previous = view.value
  const keys = Object.keys(next.attrs)
  if (Object.is(next.value, previous.value) && next.label === previous.label && next.disabled === previous.disabled &&
    keys.length === Object.keys(previous.attrs).length && keys.every(key => Object.is(next.attrs[key], previous.attrs[key])) &&
    next.options.length === previous.options.length && next.options.every((option, index) => {
      const old = previous.options[index]
      return Object.is(option.value, old.value) && option.label === old.label && option.disabled === old.disabled
    })) return
  view.value = next
}
onBeforeUpdate(sync)

function begin() { interacting = true }
async function settle() {
  // 先等父页动作与 props 更新，拒绝的设置也必须恢复为真实值。
  await nextTick()
  interacting = false
  sync()
  await nextTick()
  const current = view.value
  const value = current.options.some(option => Object.is(option.value, current.value)) ? domValue(current.value) : ''
  if (element.value && element.value.value !== value) element.value.value = value
}
function commit(event) {
  const option = view.value.options[event.target.selectedIndex]
  if (!props.disabled && option && !option.disabled &&
    props.options.some(current => Object.is(current.value, option.value) && !current.disabled)) {
    emit('update:modelValue', option.value)
  }
  settle()
}
function onKeyup(event) {
  if (event.key === 'Escape' || event.key === 'Enter') settle()
}
</script>

<template>
  <select ref="element" v-memo="[view]" v-bind="view.attrs" :aria-label="view.label" :disabled="view.disabled" :value="domValue(view.value)"
    @pointerdown="begin" @focus="begin" @keydown="begin" @keyup="onKeyup" @blur="settle" @change="commit">
    <option v-for="option in view.options" :key="`${typeof option.value}:${option.value}`" :value="domValue(option.value)" :disabled="option.disabled">{{ option.label }}</option>
  </select>
</template>
