<script setup>
import { computed } from 'vue'
import { state, actions } from '@/game/store'
import { fmtClock } from '@/game/format'

const log = state.log
const pending = computed(() => {
  const p = state.pendingChoice
  return p ? EVENT_MAP[p.id] : null
})
</script>

<template>
  <div class="box">
    <div class="box-head">
      宗门纪事
      <button class="link" style="margin-left: 8px" @click="actions.clearLog()">清空纪事</button>
      <span class="hint">共 {{ log.length }} 条</span>
    </div>
    <!-- 未决的选择类事件：选一个，另一个的代价也要接受（收益 > 代价） -->
    <div v-if="pending" class="choice">
      <div class="choice-head">
        <span class="good">抉择</span>
        <span class="dim small">{{ pending.name }}</span>
      </div>
      <div class="small dim" style="padding: 2px 0 4px">{{ pending.text }}</div>
      <div v-for="(opt, i) in pending.options" :key="opt.label" class="choice-row">
        <button class="btn primary" @click="actions.resolveChoice(i)">{{ opt.label }}</button>
        <span class="small dim">{{ opt.desc }}</span>
      </div>
    </div>

    <div class="log">
      <div v-if="!log.length" class="empty">山中清静，暂无大事。</div>
      <div v-for="item in log" :key="item.id" class="log-line" :class="item.kind">
        <span class="log-dot">○</span>
        <span class="log-text">{{ item.text }}</span>
        <span class="log-time">{{ fmtClock(item.at) }}</span>
      </div>
    </div>
  </div>
</template>
