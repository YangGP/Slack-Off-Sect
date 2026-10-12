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
import { ref, nextTick, watch, onMounted, onBeforeUnmount, useId } from 'vue'

const props = defineProps({
  width: { type: Number, default: 360 },
  delay: { type: Number, default: 120 },
  /** 触发器的标签名：默认 span，放进 div/td 里时可传 div */
  tag: { type: String, default: 'span' },
  label: { type: String, default: '' },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  /** 按容器定位并避让整个区域，例如表格行中的操作按钮。 */
  anchor: { type: String, default: '' },
})

// 让外部可以跟着提示的显隐做事（例如高亮左栏资源行）
const emit = defineEmits(['show', 'hide'])

const open = ref(false)
const trigger = ref(null)
const tip = ref(null)
const tipId = useId()
let timer = null
let observer = null

function place() {
  const el = trigger.value
  if (!el || !tip.value || typeof el.getBoundingClientRect !== 'function') return
  const rect = (props.anchor ? el.closest(props.anchor) || el : el).getBoundingClientRect()
  const viewport = window.visualViewport
  const root = document.documentElement
  const viewportLeft = viewport?.offsetLeft || 0
  const viewportTop = viewport?.offsetTop || 0
  // 缩放、软键盘、嵌入式浏览器均可能让可见视口小于布局视口。
  const vw = Math.min(...[viewport?.width, root.clientWidth, window.innerWidth].filter(value => value > 0))
  const vh = Math.min(...[viewport?.height, root.clientHeight, window.innerHeight].filter(value => value > 0))
  const margin = 8
  const node = tip.value
  // 同步限制尺寸，再测量；重定位也同步写入，避免内容变高时闪出底边。
  node.style.maxWidth = Math.max(0, vw - margin * 2) + 'px'
  node.style.maxHeight = Math.max(0, vh - margin * 2) + 'px'
  let { width, height } = node.getBoundingClientRect()
  let left = rect.right + margin
  const rightEdge = viewportLeft + vw - margin
  const bottomEdge = viewportTop + vh - margin
  if (left + width > rightEdge) {
    left = rect.left - width - margin
  }
  left = Math.max(viewportLeft + margin, Math.min(left, rightEdge - width))
  // 竖直方向贴着触发元素，超出视口就上提。
  let top = Math.max(viewportTop + margin, Math.min(rect.top, bottomEdge - height))
  // 整行两侧都放不下时，改用上下空位，限高滚动，避免盖住行内操作。
  if (props.anchor && rect.right + margin + width > rightEdge && rect.left - width - margin < viewportLeft + margin) {
    const above = Math.max(0, Math.min(rect.top - margin, bottomEdge) - (viewportTop + margin))
    const below = Math.max(0, bottomEdge - Math.max(rect.bottom + margin, viewportTop + margin))
    const useBelow = height <= below || (height > above && below >= above)
    node.style.maxHeight = Math.min(height, useBelow ? below : above) + 'px'
    height = node.getBoundingClientRect().height
    top = useBelow ? Math.max(rect.bottom + margin, viewportTop + margin) : Math.min(rect.top - margin, bottomEdge) - height
  }
  node.style.top = top + 'px'
  node.style.left = left + 'px'
  node.style.visibility = 'visible'
}

function show() {
  // 原生下拉菜单展开时，避免实时变化的提示框与选择控件互相干扰。
  if (trigger.value?.contains(document.activeElement) && document.activeElement?.matches('select')) return
  clearTimeout(timer)
  timer = setTimeout(async () => {
    if (trigger.value?.contains(document.activeElement) && document.activeElement?.matches('select')) return
    open.value = true
    await nextTick()
    if (!open.value) return
    place()
    emit('show')
  }, props.delay)
}

function hide() {
  clearTimeout(timer)
  open.value = false
  emit('hide')
}

function onFocus(e) {
  if (e.target?.matches('select')) hide()
  else show()
}

function onPointerDown(e) {
  if (e.target?.closest('select')) hide()
}

function onKey(e) {
  if (e.key === 'Escape') hide()
}

// 提示不抢鼠标事件；在触发器上滚轮即可阅读超长内容。
function scrollTip(e) {
  if (!open.value || !tip.value || tip.value.scrollHeight <= tip.value.clientHeight || !e.deltaY) return
  e.preventDefault()
  tip.value.scrollTop += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? tip.value.clientHeight : 1)
}

function onScroll(e) {
  if (e.target !== tip.value) hide()
}

watch(tip, (el) => {
  observer?.disconnect()
  if (el && observer) observer.observe(el)
})

onMounted(() => {
  if (window.ResizeObserver) observer = new window.ResizeObserver(place)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', place)
  window.visualViewport?.addEventListener('resize', place)
  window.visualViewport?.addEventListener('scroll', place)
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  observer?.disconnect()
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', place)
  window.visualViewport?.removeEventListener('resize', place)
  window.visualViewport?.removeEventListener('scroll', place)
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
    :aria-describedby="open ? tipId : undefined"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="onFocus"
    @pointerdown="onPointerDown"
    @focusout="hide"
    @wheel="scrollTip"
  >
    <slot><span class="tip-label" tabindex="0" :aria-label="`${label}说明`">{{ label }}</span></slot>
    <Teleport to="body">
      <div
        v-if="open"
        ref="tip"
        :id="tipId"
        class="tip"
        role="tooltip"
        :style="{ width: width + 'px' }"
      >
        <div class="tip-body">
          <div v-if="$slots.heading || title || label" class="tip-title">
            <slot name="heading">{{ title || label }}</slot>
          </div>
          <div v-if="description" class="tip-desc">{{ description }}</div>
          <slot name="tip" />
        </div>
      </div>
    </Teleport>
  </component>
</template>
