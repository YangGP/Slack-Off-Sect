<script setup>
import { state, derived, view, ui } from '@/game/store'
import { fmt, fmtCost, fmtFixed, fmtResource } from '@/game/format'
import { RESOURCE_MAP } from '@/data/resources'
import HoverTip from './HoverTip.vue'
import SourceBreakdown from './SourceBreakdown.vue'

const resources = view.visibleResources

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

function incomeOf(id) {
  return derived.rates[id] || 0
}

/** 出项 = 弟子口粮（灵气）+ 带维护费建筑的持续消耗 */
function expenseOf(id) {
  return -(derived.expense?.[id] || 0)
}

/** 第三列是净额（进项 − 出项），带正负号 */
function netOf(id) {
  return incomeOf(id) - expenseOf(id)
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

/** 资源自身的产出加成 + 季节影响，猫国里显示成 [+35%]；减产时标红 */
function bonusOf(id) {
  const r = (derived.ratio?.[id] || 0) + (derived.seasonRatio?.[id] || 0)
  if (Math.abs(r) < 0.0005) return ''
  return `${r > 0 ? '+' : ''}${Math.round(r * 100)}%`
}

function bonusTone(id) {
  const r = (derived.ratio?.[id] || 0) + (derived.seasonRatio?.[id] || 0)
  return r > 0 ? 'good' : 'bad'
}
</script>

<template>
  <div class="box">
    <table class="res-table">
      <tbody>
        <HoverTip
          v-for="r in resources"
          :key="r.id"
          tag="tr"
          :width="350"
          :class="{ 'res-hl': isNeeded(r.id), 'res-lack': isLacking(r.id) }"
        >
          <td class="res-name">{{ r.name }}</td>
          <td class="num res-amount">{{ amountText(r.id) }}</td>
          <td class="num res-max">{{ maxLabel(r.id) }}</td>
          <td class="num res-rate" :class="{ neg: netOf(r.id) < 0, zero: !netOf(r.id) }">
            {{ netOf(r.id) ? (netOf(r.id) > 0 ? '+' : '') + fmt(netOf(r.id)) + '/秒' : '' }}
          </td>
          <td class="num res-bonus" :class="bonusTone(r.id)">{{ bonusOf(r.id) }}</td>
          <template #tip>
            <SourceBreakdown :res-id="r.id" />
          </template>
        </HoverTip>
      </tbody>
    </table>
  </div>
</template>
