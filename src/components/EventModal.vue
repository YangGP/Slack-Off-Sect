<script setup>
/**
 * 事件弹窗：只在真实操作后的安全时机由 App 打开。
 * 展示与选择都复用原事件规则；关闭不自动选项、不重复结算。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { state, derived, ui, actions } from '@/game/store'
import { EVENT_MAP, EVENT_LEVEL_MAP, getEventLevel } from '@/data/events'
import { eventOutcome } from '@/game/engine'
import { eventPreview } from '@/game/eventPreview'
import { fmtTime } from '@/game/format'

const dialog = ref(null)
const closeButton = ref(null)
const now = ref(Date.now())
let timer = null
let previousFocus = null

const modal = computed(() => ui.eventModal)
const pending = computed(() => state.pendingChoice)
const choiceEvent = computed(() => (modal.value?.kind === 'choice' && pending.value ? EVENT_MAP[pending.value.id] : null))
const levelLabel = computed(() => {
  if (choiceEvent.value) return getEventLevel(choiceEvent.value).label
  return EVENT_LEVEL_MAP[modal.value?.level]?.label || ''
})
const remain = computed(() => {
  if (!modal.value) return 0
  return Math.max(0, Math.ceil((modal.value.closeAt - now.value) / 1000))
})
const threatRemain = computed(() => {
  const deadline = state.pendingChoice?.deadline || 0
  return Math.max(0, (deadline - now.value) / 1000)
})

function optionAffordable(option) {
  return eventOutcome(state, derived, option.effect || {}).affordable
}

function close() {
  if (ui.eventModal) actions.closeEventModal()
}

function choose(index) {
  const expected = modal.value
  if (!expected || state.pendingChoice?.id !== expected.eventId || state.pendingChoice?.at !== expected.at) return
  if (Date.now() >= expected.closeAt) { close(); return }
  if (actions.resolveChoice(index)) close()
}

function trapFocus(event) {
  const buttons = [...(dialog.value?.querySelectorAll('button:not([disabled])') || [])]
  if (!buttons.length) return
  const index = buttons.indexOf(document.activeElement)
  const next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
  buttons[next].focus()
}

watch(() => ui.eventModal, async (value, oldValue) => {
  if (typeof document === 'undefined') return
  globalThis.clearInterval(timer)
  timer = null
  if (!value) {
    await nextTick()
    const blocked = ui.rulesetBlock || ui.saveLoadError || ui.offlineLoading || ui.offlineReport
      || ui.analyticsConsent === 'unknown' || ui.analyticsFailureOpen || ui.changelogOpen
    if (!ui.eventModal && !blocked && document.hasFocus() && oldValue && previousFocus?.isConnected) previousFocus.focus()
    return
  }
  previousFocus = document.activeElement
  now.value = Date.now()
  timer = globalThis.setInterval(() => {
    now.value = Date.now()
    if (ui.eventModal && now.value >= ui.eventModal.closeAt) actions.closeEventModal()
  }, 1000)
  await nextTick()
  if (ui.eventModal !== value) return
  const target = closeButton.value || dialog.value?.querySelector('button:not([disabled])') || dialog.value
  target?.focus()
}, { immediate: true })

onBeforeUnmount(() => globalThis.clearInterval(timer))
</script>

<template>
  <Teleport to="body">
    <div v-if="modal && (modal.kind !== 'choice' || choiceEvent)" class="mask event-mask" @click.self="close" @keydown.esc.stop.prevent="close" @keydown.tab.prevent="trapFocus">
      <section ref="dialog" class="dialog event-dialog" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="event-dialog-title" aria-describedby="event-dialog-description">
        <div id="event-dialog-title" class="dialog-head">
          {{ modal.kind === 'choice' ? '宗门抉择' : '山中异动' }}
          <span class="small dim" v-if="levelLabel">{{ levelLabel }}</span>
        </div>
        <div id="event-dialog-description" class="dialog-body">
          <template v-if="modal.kind === 'choice' && choiceEvent">
            <div class="small dim">{{ choiceEvent.name }}</div>
            <p>{{ choiceEvent.text }}</p>
            <p v-if="choiceEvent.threat" class="small bad">还有 {{ fmtTime(threatRemain) }} · 到期依现有阵法防守，不主动消耗成品。</p>
            <div v-for="(opt, i) in choiceEvent.options" :key="opt.label" class="event-option">
              <button class="btn primary" type="button" :disabled="!optionAffordable(opt)" @click="choose(i)">{{ opt.label }}</button>
              <span class="small dim">{{ opt.desc }}</span>
              <div class="small choice-preview">{{ eventPreview(state, derived, opt.effect) }}</div>
            </div>
          </template>
          <template v-else>
            <div class="small dim">{{ modal.title }}</div>
            <p>{{ modal.text }}</p>
          </template>
          <div class="small dim event-countdown">将在 {{ remain }} 秒后关闭；关闭不会替你选择，也不会重复结算。</div>
        </div>
        <div class="dialog-foot">
          <button ref="closeButton" class="btn" type="button" @click="close">关闭</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.event-dialog { max-width: 520px; }
.event-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
  border-top: 1px solid var(--line, #e2dccb);
}
.event-option:first-of-type { border-top: 0; }
.event-countdown { margin-top: 10px; }
</style>
