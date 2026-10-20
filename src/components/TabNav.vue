<script setup>
import { computed } from 'vue'
import { state, view, actions, ui } from '@/game/store'
import { ACHIEVEMENTS } from '@/data/achievements'
import { canAfford, faithUnlocked, idleDisciples, karmaShopUnlocked } from '@/game/engine'
import { UPGRADE_MAP } from '@/data/upgrades'
import { isModuleEnabled, insertAfter } from '@/data/modules'
import { MODULE_UI } from '@/modules/uiRegistry'

const CORE_TABS = [
  { id: 'sect', name: '宗门' },
  { id: 'realm', name: '境界' },
  { id: 'disciples', name: '弟子' },
  { id: 'cultivation', name: '修真' },
  { id: 'skills', name: '技艺' },
  { id: 'craft', name: '炼制' },
  { id: 'faith', name: '香火' },
  { id: 'karma', name: '仙缘' },
  { id: 'achievements', name: '成就' },
  { id: 'settings', name: '设置' },
]

const badges = computed(() => ({
  disciples: idleDisciples(state),
  cultivation: view.researchableCultivation.value.filter((id) => canAfford(state, UPGRADE_MAP[id].cost)).length,
  skills: view.researchableSkills.value.filter((id) => canAfford(state, UPGRADE_MAP[id].cost)).length,
  achievements: `${Object.keys(state.achievements).length}/${ACHIEVEMENTS.length}`,
}))
/** 核心标签 + 已启用模块标签（按各自锚点插回，关闭则不显示） */
const tabs = computed(() => {
  let list = [...CORE_TABS]
  if (!faithUnlocked(state)) list = list.filter(t => t.id !== 'faith')
  if (!karmaShopUnlocked(state)) list = list.filter(t => t.id !== 'karma')
  for (const m of MODULE_UI) {
    if (!isModuleEnabled(state, m.id)) continue
    list = insertAfter(list, m.tab.after, [m.tab])
  }
  return ui.debug ? [...list, { id: 'debug', name: '调试' }] : list
})

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
