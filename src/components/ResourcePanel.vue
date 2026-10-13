<script setup>
import { computed } from 'vue'
import { state, derived, view, ui, actions } from '@/game/store'
import { fmt, fmtCost, fmtResource, fmtStock } from '@/game/format'
import { RESOURCE_MAP, RESOURCE_GROUPS } from '@/data/resources'
import { resourceFlow } from '@/game/engine'
import HoverTip from './HoverTip.vue'
import SourceBreakdown from './SourceBreakdown.vue'

const resources = view.visibleResources
const groups = computed(() => {
  const visible = new Set(resources.value.map(resource => resource.id))
  return RESOURCE_GROUPS.map(group => {
    const rows = group.resources.filter(id => visible.has(id)).map(id => RESOURCE_MAP[id])
    const collapsed = !!state.ui.collapsedResourceGroups?.[group.id]
    const temporary = collapsed && rows.some(resource => isNeeded(resource.id))
    return { ...group, rows, temporary, expanded: !collapsed || temporary }
  }).filter(group => group.rows.length)
})

/** 悬停购买项时，左栏把相关资源行染出来；不够的再重一档 */
function isNeeded(id) {
  return ui.highlight.need.includes(id)
}

function isLacking(id) {
  return ui.highlight.lack.includes(id)
}

function amountOf(id) {
  return state.resources[id] || 0
}

function maxOf(id) {
  return derived.max[id] ?? Infinity
}

/** 第三列是净额（进项 − 出项），带正负号 */
function netOf(id) {
  return resourceFlow(derived, id).net
}

/** 整枚计数的资源（灵石/丹药/符箓/法器）不显示小数，连续资源保留两位 */
function amountText(id) {
  const v = amountOf(id)
  return fmtResource(id, v)
}

function maxLabel(id) {
  const max = maxOf(id)
  return Number.isFinite(max) ? '/' + fmtCost(max) : ''
}

</script>

<template>
  <div class="box">
    <table class="res-table">
      <template v-for="group in groups" :key="group.id">
        <tbody class="res-group-heading" :data-resource-group="group.id">
          <tr>
            <th colspan="4" scope="colgroup">
              <button class="res-group-toggle" :aria-expanded="group.expanded" :aria-controls="`res-group-${group.id}`"
                :aria-label="`${group.name}分组`" @click="actions.toggleResourceGroup(group.id)">
                <span class="res-group-arrow" aria-hidden="true">{{ group.expanded ? '▾' : '▸' }}</span>
                <span>{{ group.name }}</span>
                <span class="res-group-count">{{ group.rows.length }}项</span>
                <span v-if="group.temporary" class="res-group-preview">查看用料</span>
              </button>
            </th>
          </tr>
        </tbody>
        <tbody :id="`res-group-${group.id}`" class="res-group-rows">
          <template v-if="group.expanded">
            <HoverTip
              v-for="r in group.rows"
              :key="r.id"
              tag="tr"
              :width="350"
              :description="r.desc"
              :class="{ 'res-hl': isNeeded(r.id), 'res-lack': isLacking(r.id) }"
            >
              <td class="res-name">{{ r.name }}</td>
              <td class="num res-amount">{{ amountText(r.id) }}</td>
              <td class="num res-max">{{ maxLabel(r.id) }}</td>
              <td class="num res-rate" :class="{ neg: netOf(r.id) < 0, zero: !netOf(r.id) }">
                {{ netOf(r.id) ? (netOf(r.id) > 0 ? '+' : '') + fmt(netOf(r.id)) + '/秒' : '' }}
              </td>
              <template #heading>
                {{ r.name }}<span class="tip-right">{{ fmtStock(amountOf(r.id)) }}<template v-if="Number.isFinite(maxOf(r.id))"> / {{ fmtCost(maxOf(r.id)) }}</template></span>
              </template>
              <template #tip>
                <SourceBreakdown :res-id="r.id" />
              </template>
            </HoverTip>
          </template>
        </tbody>
      </template>
    </table>
  </div>
</template>
