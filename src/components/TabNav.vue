<script setup>
import { computed } from 'vue'
import { state, view, actions, ui } from '@/game/store'
import { ACHIEVEMENTS } from '@/data/achievements'
import { canAfford, idleDisciples } from '@/game/engine'
import { UPGRADE_MAP } from '@/data/upgrades'

const TABS = [
  { id: 'sect', name: '宗门' },
  { id: 'disciples', name: '弟子' },
  { id: 'cultivation', name: '修真' },
  { id: 'skills', name: '技艺' },
  { id: 'craft', name: '炼制' },
  { id: 'hunt', name: '猎杀' },
  { id: 'realm', name: '境界' },
  { id: 'achievements', name: '成就' },
  { id: 'settings', name: '设置' },
]

const badges = computed(() => ({
  disciples: idleDisciples(state),
  cultivation: view.researchableCultivation.value.filter((id) => canAfford(state, UPGRADE_MAP[id].cost)).length,
  skills: view.researchableSkills.value.filter((id) => canAfford(state, UPGRADE_MAP[id].cost)).length,
  achievements: `${Object.keys(state.achievements).length}/${ACHIEVEMENTS.length}`,
}))
const tabs = computed(() => ui.debug ? [...TABS, { id: 'debug', name: '调试' }] : TABS)

function badgeOf(id) {
  const b = badges.value[id]
  if (!b) return ''
  return `(${b})`
}
</script>

<template>
  <nav class="tabs">
    <template v-for="(t, i) in tabs" :key="t.id">
      <span v-if="i" class="divider">|</span>
      <button class="tab" :class="{ active: t.id === 'debug' ? ui.debugPage : !(ui.debug && ui.debugPage) && state.ui.tab === t.id }" @click="actions.setTab(t.id)">
        {{ t.name }}<span v-if="badgeOf(t.id)" class="badge"> {{ badgeOf(t.id) }}</span>
      </button>
    </template>
  </nav>
</template>
