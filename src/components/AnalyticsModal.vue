<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { actions, ui } from '@/game/store'

const dialog = ref(null)
let previousFocus = null
const mode = computed(() => {
  if (ui.rulesetBlock || ui.offlineLoading || ui.offlineReport || ui.saveLoadError) return null
  if (ui.analyticsConsent === 'unknown') return 'consent'
  return ui.analyticsFailureOpen ? 'failure' : null
})
const failureText = computed(() => {
  if (ui.analyticsFailureReason === 'development') return '当前为本地开发模式，数据采集未启用。游戏可以正常游玩。'
  if (ui.analyticsFailureReason === 'unconfigured') return '当前页面尚未配置数据采集，暂时无法开启。游戏可以正常游玩。'
  return '统计模块未能加载，可能受到浏览器隐私保护、扩展或网络影响。数据采集已关闭，不影响游戏；稍后刷新页面后，可在设置中重新开启。'
})

watch(mode, async (value, oldValue) => {
  if (typeof document === 'undefined') return
  if (value && !oldValue) previousFocus = document.activeElement
  await nextTick()
  if (value) dialog.value?.querySelector('button')?.focus()
  else if (previousFocus?.isConnected) previousFocus.focus()
}, { immediate: true, flush: 'post' })

function close() {
  if (mode.value === 'consent') actions.setSetting('analyticsEnabled', false)
  else actions.dismissAnalyticsFailure()
}

function trapFocus(event) {
  const buttons = [...(dialog.value?.querySelectorAll('button') || [])]
  if (!buttons.length) return
  const index = buttons.indexOf(document.activeElement)
  const next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
  buttons[next].focus()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="mode" class="mask analytics-mask" @keydown.esc.stop.prevent="close" @keydown.tab.prevent="trapFocus">
      <section ref="dialog" class="dialog" role="dialog" aria-modal="true" aria-labelledby="analytics-dialog-title" aria-describedby="analytics-dialog-description">
        <div id="analytics-dialog-title" class="dialog-head">{{ mode === 'consent' ? '是否开启游玩数据采集？' : '数据采集未能开启' }}</div>
        <div class="dialog-body">
          <p v-if="mode === 'consent'" id="analytics-dialog-description">
            开启后，会向 Google Analytics 发送境界进度、卡点、破境结果和转世收益等统计数据，帮助调整游戏节奏与数值。不会上传完整存档或角色姓名，你可以随时在设置中关闭。
          </p>
          <p v-else id="analytics-dialog-description">{{ failureText }}</p>
        </div>
        <div class="dialog-foot">
          <template v-if="mode === 'consent'">
            <button class="btn" type="button" @click="actions.setSetting('analyticsEnabled', false)">暂不开启</button>
            <button class="btn primary" type="button" @click="actions.setSetting('analyticsEnabled', true)">开启采集</button>
          </template>
          <button v-else class="btn primary" type="button" @click="actions.dismissAnalyticsFailure()">继续游戏</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.analytics-mask { z-index: 110; }
.dialog-body p { margin: 0; line-height: 1.7; }
</style>
