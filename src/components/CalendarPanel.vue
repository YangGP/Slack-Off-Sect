<script setup>
/**
 * 历法：第几年、哪一季、哪个节气、第几天，以及本季对产出的影响。
 * 时间换算见 src/data/calendar.js（1 天 = CALENDAR.DAY_SECONDS 秒，1 节气 = 15 天，1 季 = 6 节气）。
 */
import { computed } from 'vue'
import { state, derived } from '@/game/store'
import { TERMS, CALENDAR, DAYS_PER_SEASON } from '@/data/calendar'
import { fmtTime } from '@/game/format'
import { RESOURCE_MAP } from '@/data/resources'

const cal = computed(() => derived.calendar || null)

/** 本季影响：正绿负红 */
const effects = computed(() => {
  const ratio = cal.value?.seasonRatio || {}
  return Object.entries(ratio).map(([res, v]) => ({
    name: RESOURCE_MAP[res]?.name || res,
    text: `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
    good: v > 0,
  }))
})

const nextTerm = computed(() => {
  const c = cal.value
  if (!c) return ''
  return TERMS[(c.termIndex + 1) % TERMS.length]
})

/** 换算提示从常量推出来，避免改了 DAY_SECONDS 之后这里写死的数字又过期 */
const timeHint = computed(() => {
  const minutes = (DAYS_PER_SEASON * CALENDAR.DAY_SECONDS) / 60
  return `1 天 = ${CALENDAR.DAY_SECONDS} 秒，1 季 = ${Number(minutes.toFixed(2))} 分钟`
})
</script>

<template>
  <div class="box" v-if="cal">
    <div class="box-head">
      历法<span class="hint">{{ timeHint }}</span>
    </div>
    <div class="cal-date">
      第 {{ cal.year }} 年 · {{ cal.seasonName }} · 第 {{ cal.day }} 天
    </div>
    <div class="small dim">
      {{ cal.termName }}（本节气第 {{ Math.floor(cal.dayInTerm) + 1 }} 天）
      —— {{ fmtTime(cal.secondsLeftInTerm) }}后转 {{ nextTerm }}
    </div>
    <div class="small dim">
      本季还剩 {{ Math.floor(cal.daysLeftInSeason) }} 天（约 {{ fmtTime(cal.secondsLeftInSeason) }}）
    </div>

    <div class="box-head" style="padding-top: 6px">{{ cal.seasonName }}季影响</div>
    <div v-if="effects.length" class="cal-effects">
      <span v-for="e in effects" :key="e.name" class="cal-effect" :class="{ bad: !e.good }">
        {{ e.name }} {{ e.text }}
      </span>
    </div>
    <div v-else class="small dim">本季对产出没有影响。</div>
    <div class="small dim" style="padding-top: 2px">{{ cal.seasonDesc }}</div>
  </div>
</template>
