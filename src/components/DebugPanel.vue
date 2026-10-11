<script setup>
import { computed, reactive, ref } from 'vue'
import { RESOURCES } from '@/data/resources'
import { state, derived, actions, ui } from '@/game/store'

const search = ref('')
const drafts = reactive({})
const error = ref('')
const primaryIds = ['qi', 'insight', 'faith']
const orderedResources = [
  ...primaryIds.map(id => RESOURCES.find(r => r.id === id)),
  ...RESOURCES.filter(r => !primaryIds.includes(r.id)),
]
const resources = computed(() => {
  const query = search.value.trim().toLowerCase()
  return orderedResources.filter(r => `${r.name} ${r.id}`.toLowerCase().includes(query))
})
const quantity = id => id === 'karma' || id === 'dao' ? state[id] : state.resources[id]
function apply(id) {
  const raw = drafts[id] ?? ''
  if (!String(raw).trim() || !actions.setDebugResource(id, Number(raw))) {
    error.value = !String(raw).trim() ? '请输入资源数量' : ui.toast?.text || '修改失败'
    return
  }
  error.value = ''
}
</script>

<template>
  <div class="box debug-panel">
    <div class="box-head">调试页面 <button class="btn" @click="actions.closeDebug()">关闭调试</button></div>
    <div class="box-body">
      <input v-model="search" type="search" aria-label="搜索调试资源" placeholder="搜索资源名称或 ID" />
      <p v-if="error" class="bad" role="alert">{{ error }}</p>
      <div class="debug-table-wrap">
        <table class="debug-table">
          <colgroup><col class="resource-col" /><col class="quantity-col" /><col class="quantity-col" /><col class="input-col" /><col class="action-col" /></colgroup>
          <thead><tr><th>资源</th><th>当前数量</th><th>仓储上限</th><th>设置数量</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="resource in resources" :key="resource.id" :data-resource="resource.id">
              <td>{{ resource.name }} <span class="small dim">{{ resource.id }}</span></td>
              <td>{{ Math.floor(quantity(resource.id) || 0) }}</td>
              <td>{{ Number.isFinite(derived.max[resource.id]) ? derived.max[resource.id] : '不限' }}</td>
              <td><input type="number" min="0" :max="Number.MAX_SAFE_INTEGER" :step="resource.integer ? 1 : 'any'"
                :aria-label="`${resource.name}调试数量`" :value="drafts[resource.id] ?? ''" placeholder="输入目标数量"
                @input="drafts[resource.id] = $event.target.value" @keydown.enter="apply(resource.id)" /></td>
              <td><button class="btn" :disabled="!!ui.saveLoadError" @click="apply(resource.id)">应用</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p><button class="btn" :disabled="!!ui.saveLoadError" @click="actions.triggerEvent()">来一次奇遇</button></p>
    </div>
  </div>
</template>

<style scoped>
.box-head { display: flex; align-items: center; justify-content: space-between; }
.debug-table-wrap { overflow-x: auto; margin-top: 12px; }
.debug-table { width: 100%; min-width: 680px; table-layout: fixed; border-collapse: collapse; text-align: left; }
.resource-col { width: 25%; }
.quantity-col { width: 20%; }
.input-col { width: 25%; }
.action-col { width: 10%; }
th, td { padding: 6px; border-bottom: 1px solid var(--border, #444); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
input[type="number"] { width: 100%; min-width: 0; box-sizing: border-box; }
</style>
