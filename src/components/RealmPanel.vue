<script setup>
import { computed } from 'vue'
import { state, derived, view, actions, highlightCost, clearHighlight } from '@/game/store'
import { REALMS, ASCEND_REALM_INDEX } from '@/data/realms'
import { realmCost, canAfford } from '@/game/engine'
import { fmt, fmtAmount, fmtCost, fmtInt, fmtPercent } from '@/game/format'
import { costLabel, enough as enoughOf } from '@/game/pricing'
import { RESOURCE_MAP } from '@/data/resources'
import HoverTip from './HoverTip.vue'

const next = computed(() => REALMS[state.realm + 1] || null)
const cost = computed(() => (next.value ? realmCost(state, derived, state.realm + 1) : null))
const affordable = computed(() => (cost.value ? canAfford(state, cost.value) : false))
const gain = computed(() => view.ascendGain.value)
const canAscend = computed(() => view.canAscend.value)

function resName(id) {
  return RESOURCE_MAP[id]?.name || id
}

function ascend() {
  const ok = window.confirm(
    `飞升会重置资源、弟子、建筑、修真、技艺·法宝与境界，并获得 ${gain.value} 点仙缘（永久的全局加成）。确定吗？`,
  )
  if (ok) actions.ascend()
}
</script>

<template>
  <div class="box">
    <div class="box-head">
      修行境界<span class="hint">每突破一境，全局产出永久提升</span>
    </div>
    <div class="box-body">
      <div class="realm-track">
        <template v-for="(r, i) in REALMS" :key="r.name">
          <span :class="{ done: i < state.realm, now: i === state.realm }">{{ r.name }}</span>
          <span v-if="i < REALMS.length - 1" class="dim"> → </span>
        </template>
      </div>

      <table class="grid">
        <tbody>
          <tr>
            <td class="dim nowrap">当前境界</td>
            <td class="num good">{{ view.realmName.value }}</td>
            <td class="dim nowrap">境界倍率</td>
            <td class="num">×{{ derived.realmMult.toFixed(2) }}</td>
            <td class="dim nowrap">仙缘</td>
            <td class="num">{{ fmtInt(state.karma) }}（×{{ derived.karmaMult.toFixed(2) }}）</td>
          </tr>
          <tr>
            <td class="dim nowrap">本世感悟</td>
            <td class="num">{{ fmtAmount(state.stats.lifeInsight || 0) }}</td>
            <td class="dim nowrap">破境折扣</td>
            <td class="num">{{ fmtPercent(derived.breakthroughDiscount) }}</td>
            <td class="dim nowrap">飞升所需</td>
            <td class="num" :class="canAscend ? 'good' : 'dim'">
              {{ canAscend ? '已达成' : REALMS[ASCEND_REALM_INDEX].name }}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="small dim" style="padding-top: 4px">{{ REALMS[state.realm].desc }}</div>
    </div>
  </div>

  <div class="box">
    <div class="box-head">
      破境<span class="hint">{{ next ? '下一境：' + next.name : '已至此界尽头' }}</span>
    </div>
    <div class="box-body">
      <template v-if="next">
        <div class="small dim">{{ next.desc }}</div>
        <div style="padding: 4px 0">
          全局产出 ×{{ derived.realmMult.toFixed(2) }} → <span class="good">×{{ next.mult.toFixed(2) }}</span>
        </div>
        <table class="grid">
          <tbody>
            <tr @mouseenter="highlightCost(cost)" @mouseleave="clearHighlight()">
              <td class="dim nowrap">花费</td>
              <!-- 花费列只写需求值；明细按建筑（宗门）的排版放进悬停提示 -->
              <td class="cost nowrap">
                <HoverTip :width="380">
                  <span class="cost-line">
                    <span
                      v-for="(amount, res) in cost"
                      :key="res"
                      :class="{ lack: !enoughOf(state, res, amount) }"
                    >
                      {{ resName(res) }} {{ fmtCost(amount) }}
                    </span>
                  </span>
                  <template #tip>
                    <div class="tip-body">
                      <div class="tip-title">
                        {{ next.name }}
                        <span class="tip-right">境界倍率 ×{{ next.mult.toFixed(2) }}</span>
                      </div>
                      <div class="tip-desc">{{ next.desc }}</div>

                      <div class="tip-section">价格</div>
                      <div v-for="(amount, res) in cost" :key="res" class="tip-row">
                        <span class="k">{{ resName(res) }}</span>
                        <span class="v" :class="{ bad: !enoughOf(state, res, amount) }">
                          {{ costLabel(state, derived, res, amount) }}
                        </span>
                      </div>

                      <div class="tip-section">效果</div>
                      <div class="tip-row">
                        <span class="k">破境后</span>
                        <span class="v good">全局产出 ×{{ next.mult.toFixed(2) }}</span>
                      </div>
                      <div class="tip-row">
                        <span class="k">现在</span>
                        <span class="v">全局产出 ×{{ (REALMS[state.realm]?.mult ?? 1).toFixed(2) }}</span>
                      </div>
                    </div>
                  </template>
                </HoverTip>
              </td>
              <td>
                <button class="btn primary" :disabled="!affordable" @click="actions.breakthrough()">
                  冲击 {{ next.name }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
      <div v-else class="empty">已经是渡劫期，接下来只有飞升一途。</div>
    </div>
  </div>

  <div class="box">
    <div class="box-head">
      飞升<span class="hint">转世重修，带走仙缘</span>
    </div>
    <div class="box-body">
      <table class="grid">
        <tbody>
          <tr>
            <td class="dim nowrap">本次可得仙缘</td>
            <td class="num good">{{ gain }} 点</td>
            <td class="dim nowrap">飞升后仙缘加成</td>
            <td class="num">×{{ (1 + (state.karma + gain) * 0.02).toFixed(2) }}（每点 +2%）</td>
            <td class="dim nowrap">已飞升</td>
            <td class="num">{{ state.stats.ascensions }} 次</td>
          </tr>
        </tbody>
      </table>

      <div class="small dim" style="padding: 6px 0">
        重置：资源、弟子、建筑、修真、技艺·法宝（含法宝祭炼等级）、制作进度、境界。
        保留：成就（每条 +2% 全局）、仙缘、累计统计与宗门纪事。
      </div>

      <button class="btn danger" :disabled="!canAscend" @click="ascend">
        飞升（获得仙缘 {{ gain }}）
      </button>
      <span v-if="!canAscend" class="small dim">
        还需修到「{{ REALMS[ASCEND_REALM_INDEX].name }}」才能飞升。
      </span>
    </div>
  </div>
</template>
