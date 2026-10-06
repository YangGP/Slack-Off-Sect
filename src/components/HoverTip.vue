<script setup>
/**
 * 通用悬停提示（tooltip）组件。
 *
 * 用法：
 *   <HoverTip>
 *     <span>鼠标移到我身上</span>
 *     <template #tip>提示内容（可以是任意组件）</template>
 *   </HoverTip>
 *
 * 行为：默认插槽是触发器，鼠标移入（或键盘聚焦）后延迟一小会儿，
 * 把 #tip 内容用 Teleport 挂到 body 上做固定定位，避免被表格/滚动容器裁掉。
 * 提示框永远不与鼠标抢事件（pointer-events: none）。
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  width: { type: Number, default: 300 },
  delay: { type: Number, default: 120 },
  /** 触发器的标签名：默认 span，放进 div/td 里时可传 div */
  tag: { type: String, default: 'span' },
})

// 让外部可以跟着提示的显隐做事（例如高亮左栏资源行）
const emit = defineEmits(['show', 'hide'])

const open = ref(false)
const trigger = ref(null)
const pos = ref({ top: 0, left: 0 })
let timer = null

function place() {
  const el = trigger.value
  if (!el || typeof el.getBoundingClientRect !== 'function') return
  const rect = el.getBoundingClientRect()
  const vw = window.innerWidth || 1280
  const vh = window.innerHeight || 800
  const margin = 8
  // 优先放在触发元素右侧；右边放不下就翻到左侧
  let left = rect.right + margin
  if (left + props.width > vw - margin) {
    left = rect.left - props.width - margin
  }
  if (left < margin) left = margin
  // 竖直方向贴着触发元素，超出视口就上提
  let top = rect.top
  const estimated = 240
  if (top + estimated > vh - margin) top = Math.max(margin, vh - estimated - margin)
  pos.value = { top, left }
}

function show() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    place()
    open.value = true
    emit('show')
  }, props.delay)
}

function hide() {
  clearTimeout(timer)
  open.value = false
  emit('hide')
}

function onKey(e) {
  if (e.key === 'Escape') hide()
}

onMounted(() => {
  window.addEventListener('scroll', hide, true)
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  window.removeEventListener('scroll', hide, true)
  window.removeEventListener('keydown', onKey)
  emit('hide')
})

defineExpose({ show, hide, open })
</script>

<template>
  <component
    :is="tag"
    ref="trigger"
    class="tip-trigger"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <slot />
    <Teleport to="body">
      <div
        v-if="open"
        class="tip"
        role="tooltip"
        :style="{ top: pos.top + 'px', left: pos.left + 'px', width: width + 'px' }"
      >
        <slot name="tip" />
      </div>
    </Teleport>
  </component>
</template>
