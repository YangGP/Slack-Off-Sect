<script setup>
import { computed } from 'vue'
import { state, view, actions } from '@/game/store'
import { ACHIEVEMENTS } from '@/data/achievements'
import { idleDisciples } from '@/game/engine'

const TABS = [
  { id: 'sect', name: '宗门' },
  { id: 'disciples', name: '弟子' },
  { id: 'cultivation', name: '修真' },
  { id: 'skills', name: '技艺' },
  { id: 'craft', name: '炼制' },
  { id: 'realm', name: '境界' },
  { id: 'achievements', name: '成就' },
  { id: 'settings', name: '设置' },
]

const badges = computed(() => ({
  disciples: idleDisciples(state),
  cultivation: (view.researchableCultivation.value || []).length,
  skills: (view.researchableSkills.value || []).length,
  achievements: `${Object.keys(state.achievements).length}/${ACHIEVEMENTS.length}`,
}))

function badgeOf(id) {
  const b = badges.value[id]
  if (!b) return ''
  return `(${b})`
}
</script>

<template>
  <nav class="tabs">
    <template v-for="(t, i) in TABS" :key="t.id">
      <span v-if="i" class="divider">|</span>
      <button class="tab" :class="{ active: state.ui.tab === t.id }" @click="actions.setTab(t.id)">
        {{ t.name }}<span v-if="badgeOf(t.id)" class="badge"> {{ badgeOf(t.id) }}</span>
      </button>
    </template>
  </nav>
</template>
