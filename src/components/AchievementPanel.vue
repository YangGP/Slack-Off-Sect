<script setup>
import { computed } from 'vue'
import { state } from '@/game/store'
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD } from '@/data/achievements'
import { fmtPercent } from '@/game/format'

const done = computed(() => ACHIEVEMENTS.filter((a) => state.achievements[a.id]))
const todo = computed(() => ACHIEVEMENTS.filter((a) => !state.achievements[a.id]))
const bonus = computed(() => fmtPercent(done.value.length * ACHIEVEMENT_REWARD))
</script>

<template>
  <div class="box">
    <div class="box-head">
      成就<span class="hint">已达成 {{ done.length }} / {{ ACHIEVEMENTS.length }}，全局 +{{ bonus }}</span>
    </div>
    <div class="box-body">
      <div class="small dim" style="padding-bottom: 4px">
        每条成就提供 +{{ fmtPercent(ACHIEVEMENT_REWARD) }} 全局产出，飞升也不会失去。
      </div>
      <div class="ach-list">
        <div v-for="a in done" :key="a.id" class="ach-item done">
          <span class="name">{{ a.name }}</span> — {{ a.desc }}
        </div>
      </div>
      <div v-if="!done.length" class="empty">还没有达成任何成就。</div>

      <details class="fold">
        <summary>尚未达成（{{ todo.length }} 条）</summary>
        <div class="ach-list" style="padding-top: 4px">
          <div v-for="a in todo" :key="a.id" class="ach-item">
            <span class="name">{{ a.name }}</span> — {{ a.desc }}
          </div>
        </div>
        <div v-if="!todo.length" class="empty">所有成就都已达成，你已是传说。</div>
      </details>
    </div>
  </div>
</template>
