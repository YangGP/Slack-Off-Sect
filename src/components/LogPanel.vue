<script setup>
import { computed } from 'vue'
import { state, derived, actions } from '@/game/store'
import { fmtClock, fmtAmount } from '@/game/format'
import { EVENT_MAP } from '@/data/events'
import { RESOURCE_MAP } from '@/data/resources'
import { eventOutcome } from '@/game/engine'

const log = state.log
const pending = computed(() => {
  const p = state.pendingChoice
  return p ? EVENT_MAP[p.id] : null
})
function preview(effect) {
  if (effect?.decline) return '不消耗物资，不领取奖励'
  const { rows, recruits, required, affordable } = eventOutcome(state, derived, effect || {})
  if (!affordable) return '材料不足：' + Object.entries(required)
    .filter(([res, amount]) => (state.resources[res] || 0) < amount)
    .map(([res, amount]) => `${RESOURCE_MAP[res].name} 需${fmtAmount(amount)}`).join('，')
  const parts = []
  for (const row of rows) {
    const name = RESOURCE_MAP[row.res]?.name || row.res
    if (row.lost > 0) parts.push(`${name} −${fmtAmount(row.lost)}`)
    if (row.gained > 0) parts.push(`${name} +${fmtAmount(row.gained)}`)
    if (row.overflow > 0) parts.push(`${name} ${fmtAmount(row.overflow)} 装不下`)
  }
  if (effect?.recruit) parts.push(recruits ? `弟子 +${recruits}` : '居所已满，无法收徒')
  return parts.join('，') || '当前无物资变化'
}
</script>

<template>
  <div class="box">
    <div class="box-head">
      宗门纪事
      <button class="link" style="margin-left: 8px" @click="actions.clearLog()">清空纪事</button>
      <span class="hint">共 {{ log.length }} 条</span>
    </div>
    <!-- 选择只结算所选项；材料不足时可暂不介入。 -->
    <div v-if="pending" class="choice">
      <div class="choice-head">
        <span class="good">抉择</span>
        <span class="dim small">{{ pending.name }}</span>
      </div>
      <div class="small dim" style="padding: 2px 0 4px">{{ pending.text }}</div>
      <div v-for="(opt, i) in pending.options" :key="opt.label" class="choice-row">
        <button class="btn primary" :disabled="!eventOutcome(state, derived, opt.effect || {}).affordable" @click="actions.resolveChoice(i)">{{ opt.label }}</button>
        <span class="small dim">{{ opt.desc }}</span>
        <div class="small choice-preview">{{ preview(opt.effect) }}</div>
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
