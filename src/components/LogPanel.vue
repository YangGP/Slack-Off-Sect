<script setup>
import { computed, ref } from 'vue'
import { state, actions } from '@/game/store'
import { fmtClock, fmtTime } from '@/game/format'
import { EVENT_LEVEL_MAP } from '@/data/events'
import { CONFIG } from '@/data/config'

const FILTERS = [
  { id: 'all', name: '全部' },
  { id: 'info', name: '日常' },
  { id: 'good', name: '进展' },
  { id: 'bad', name: '警示' },
  { id: 'event', name: '事件' },
  { id: 'realm', name: '境界' },
]
const filter = ref('all')
const keyword = ref('')
const log = computed(() => state.log.slice(0, CONFIG.LOG_DISPLAY_LIMIT))
const filteredLog = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase()
  return log.value.filter((item) =>
    (filter.value === 'all' || (item.kind || 'info') === filter.value)
    && (!query || item.text.toLocaleLowerCase().includes(query)),
  )
})
const peaceTime = computed(() => {
  state.stats.playTime
  return Math.max(0, ((state.affairs?.beastPeaceUntil || 0) - Date.now()) / 1000)
})
</script>

<template>
  <div class="box">
    <div class="box-head">
      宗门纪事
      <button class="link" style="margin-left: 8px" @click="actions.clearLog()">清空纪事</button>
      <span class="hint">最近{{ CONFIG.LOG_DISPLAY_LIMIT }}条 · 显示 {{ filteredLog.length }} / {{ log.length }} 条</span>
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
      <button v-if="filter !== 'all' || keyword" class="filter" @click="filter = 'all'; keyword = ''">重置</button>
    </div>
    <div v-if="peaceTime > 0" class="small good">药圃安宁 · 还有 {{ fmtTime(peaceTime) }}，妖兽暂不再来。</div>
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
