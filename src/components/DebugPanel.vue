<script setup>
import { computed, reactive, ref } from 'vue'
import { RESOURCES } from '@/data/resources'
import { state, derived, actions, ui } from '@/game/store'
import { fmtStock, fmtCost } from '@/game/format'
import { MONEY_INFINITY } from '@/game/decimal'

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
/** 永久货币以顶层字段为准（与资源栏镜像同值） */
const quantity = id => id === 'karma' || id === 'dao' ? state[id] : state.resources[id]
/** 仓容可能是 MONEY_INFINITY 哨兵：只有有限上限才写数字 */
const maxOf = id => derived.max[id] ?? MONEY_INFINITY
function apply(id) {
  const raw = drafts[id] ?? ''
  if (!String(raw).trim() || !actions.setDebugResource(id, String(raw).trim())) {
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
      <p>
        <label><input type="checkbox" :checked="state.__debugProductionBoost === true"
          :disabled="!!ui.saveLoadError || !!ui.rulesetBlock || ui.offlineLoading"
          @change="actions.setDebugProductionBoost($event.target.checked)" /> 全局产出 ×10</label>
        <span class="small dim">（独立乘区；关闭调试或刷新后取消）</span>
      </p>
      <input v-model="search" type="search" aria-label="搜索调试资源" placeholder="搜索资源名称或 ID" />
      <p v-if="error" class="bad" role="alert">{{ error }}</p>
      <div class="debug-table-wrap">
        <table class="debug-table">
          <colgroup><col class="resource-col" /><col class="quantity-col" /><col class="quantity-col" /><col class="input-col" /><col class="action-col" /></colgroup>
          <thead><tr><th>资源</th><th>当前数量</th><th>仓储上限</th><th>设置数量</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="resource in resources" :key="resource.id" :data-resource="resource.id">
              <td>{{ resource.name }} <span class="small dim">{{ resource.id }}</span></td>
              <td>{{ fmtStock(quantity(resource.id)) }}</td>
              <td>{{ maxOf(resource.id).isFinite() ? fmtCost(maxOf(resource.id)) : '不限' }}</td>
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
