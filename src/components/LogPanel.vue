<script setup>
import { computed, ref } from 'vue'
import { state, derived, actions } from '@/game/store'
import { fmtClock, fmtAmount, fmtTime } from '@/game/format'
import { EVENT_MAP, EVENT_LEVELS, EVENT_LEVEL_MAP, getEventLevel } from '@/data/events'
import { RESOURCE_MAP } from '@/data/resources'
import { eventOutcome, eventEffect } from '@/game/engine'

const FILTERS = [
  { id: 'all', name: '全部' },
  { id: 'info', name: '日常' },
  { id: 'good', name: '进展' },
  { id: 'bad', name: '警示' },
  { id: 'event', name: '事件' },
  { id: 'realm', name: '境界' },
]
const filter = ref('all')
const levelFilter = ref(0)
const keyword = ref('')
const log = computed(() => state.log)
const filteredLog = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase()
  return log.value.filter((item) =>
    (filter.value === 'all' || (item.kind || 'info') === filter.value)
    && (!levelFilter.value || item.eventLevel === levelFilter.value)
    && (!query || item.text.toLocaleLowerCase().includes(query)),
  )
})
const pending = computed(() => {
  const p = state.pendingChoice
  return p ? EVENT_MAP[p.id] : null
})
const threatTime = computed(() => {
  state.stats.playTime // 主循环刷新倒计时。
  return Math.max(0, ((state.pendingChoice?.deadline || 0) - Date.now()) / 1000)
})
const peaceTime = computed(() => {
  state.stats.playTime
  return Math.max(0, ((state.affairs?.beastPeaceUntil || 0) - Date.now()) / 1000)
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
  const resolved = eventEffect(state, derived, effect || {})
  if (resolved.buff) parts.push(`${resolved.buff.name}：灵草产出 −25%，${fmtTime(resolved.buff.duration)}`)
  if (resolved.peaceSeconds) parts.push(`安宁 ${fmtTime(resolved.peaceSeconds)}`)
  return parts.join('，') || '当前无物资变化'
}
</script>

<template>
  <div class="box">
    <div class="box-head">
      宗门纪事
      <button class="link" style="margin-left: 8px" @click="actions.clearLog()">清空纪事</button>
      <span class="hint">显示 {{ filteredLog.length }} / {{ log.length }} 条</span>
    </div>
    <div class="filters log-filters" aria-label="纪事类型筛选">
      <button
        v-for="f in FILTERS"
        :key="f.id"
        class="filter"
        :class="{ on: filter === f.id }"
        :aria-pressed="filter === f.id"
        @click="filter = f.id"
      >{{ f.name }}</button>
      <input v-model="keyword" class="log-search" type="search" aria-label="搜索纪事" placeholder="搜索纪事">
      <button v-if="filter !== 'all' || keyword || levelFilter" class="filter" @click="filter = 'all'; keyword = ''; levelFilter = 0">重置</button>
    </div>
    <div class="filters log-filters" aria-label="事件等级筛选">
      <button class="filter" :class="{ on: levelFilter === 0 }" :aria-pressed="levelFilter === 0" @click="levelFilter = 0">全部等级</button>
      <button v-for="level in EVENT_LEVELS" :key="level.id" class="filter" :class="{ on: levelFilter === level.id }" :aria-pressed="levelFilter === level.id" @click="levelFilter = level.id">{{ level.label }}</button>
    </div>
    <div v-if="peaceTime > 0" class="small good">药圃安宁 · 还有 {{ fmtTime(peaceTime) }}，妖兽暂不再来。</div>
    <!-- 普通来访可谢绝；已有威胁按期限默认防守。 -->
    <div v-if="pending" class="choice">
      <div class="choice-head">
        <span class="good">抉择</span>
        <span class="dim small">{{ getEventLevel(pending).label }} · {{ pending.name }}</span>
      </div>
      <div class="small dim" style="padding: 2px 0 4px">{{ pending.text }}</div>
      <div v-if="pending.threat" class="small dim">还有 {{ fmtTime(threatTime) }} · 到期依现有阵法防守，不主动消耗成品。</div>
      <div v-for="(opt, i) in pending.options" :key="opt.label" class="choice-row">
        <button class="btn primary" :disabled="!eventOutcome(state, derived, opt.effect || {}).affordable" @click="actions.resolveChoice(i)">{{ opt.label }}</button>
        <span class="small dim">{{ opt.desc }}</span>
        <div class="small choice-preview">{{ preview(opt.effect) }}</div>
      </div>
    </div>

    <div class="log">
      <div v-if="!log.length" class="empty">山中清静，暂无大事。</div>
      <div v-else-if="!filteredLog.length" class="empty">没有符合筛选条件的纪事。</div>
      <div v-for="item in filteredLog" :key="item.id" class="log-line" :class="item.kind">
        <span class="log-dot">○</span>
        <span class="log-text"><span v-if="EVENT_LEVEL_MAP[item.eventLevel]" class="dim small">[{{ EVENT_LEVEL_MAP[item.eventLevel].label }}] </span>{{ item.text }}</span>
        <span class="log-time">{{ fmtClock(item.at) }}</span>
      </div>
    </div>
  </div>
</template>
