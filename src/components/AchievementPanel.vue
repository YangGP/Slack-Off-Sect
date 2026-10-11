<script setup>
import { computed } from 'vue'
import { state } from '@/game/store'
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD } from '@/data/achievements'
import { fmtPercent } from '@/game/format'
import HoverTip from './HoverTip.vue'

/** 奖励暂时为 0（待重新设计），界面要如实说，不能还写着「每条 +2%」 */
const hasReward = ACHIEVEMENT_REWARD > 0

const done = computed(() => ACHIEVEMENTS.filter((a) => state.achievements[a.id]))
const todo = computed(() => ACHIEVEMENTS.filter((a) => !state.achievements[a.id]))
const bonus = computed(() => fmtPercent(done.value.length * ACHIEVEMENT_REWARD))
</script>

<template>
  <div class="box">
    <div class="box-head">
      <HoverTip label="成就"><template #tip>
          <p>成就记录你做过什么，飞升与转世都不会失去。</p>
          <p v-if="hasReward">每条成就提供 +{{ fmtPercent(ACHIEVEMENT_REWARD) }} 全局产出。</p>
          <p v-else>当前成就不提供全局加成。</p>
        </template></HoverTip><span class="hint"
        >已达成 {{ done.length }} / {{ ACHIEVEMENTS.length }}<template v-if="hasReward"
          >，全局 +{{ bonus }}</template
        ></span
      >
    </div>
    <div class="box-body">
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
