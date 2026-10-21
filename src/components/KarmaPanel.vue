<script setup>
/**
 * 仙缘页：跨轮回保留的永久修持商店，仙缘计价。
 * 只做展示与动作入口；报价、门槛与扣费都在 systems/karmaShop.js。
 * 关键口径必须常驻提示：已修持花掉的仙缘不再计入产出乘区，防止被当 bug。
 */
import { computed } from 'vue'
import { state, derived, actions } from '@/game/store'
import { fmt, fmtAmount, fmtPercent } from '@/game/format'
import { ZERO, money, moneyGte } from '@/game/decimal'
import { KARMA_PERKS } from '@/data/karmaShop'
import { karmaNeedsMet, karmaNeedsText, karmaShopBonuses, perkCost, rebirthCount } from '@/game/engine'

const balance = computed(() => money(state.karma ?? ZERO))
const totalSpent = computed(() => money(state.karmaProgression?.totalSpent ?? ZERO))
const rebirths = computed(() => rebirthCount(state))
/** 当前生效的修持效果汇总（只看等级，与余额无关）。 */
const bonuses = computed(() => karmaShopBonuses(state))
/** 头部乘区读派生层：宿慧/因果田等已在 recompute 里并入。 */
const productionMult = computed(() => derived.karmaMult ?? 1)
const storageMult = computed(() => derived.karmaStorageMult ?? 1)

const perkRows = computed(() => KARMA_PERKS.map(meta => {
  const level = state.karmaProgression?.levels?.[meta.id] | 0
  const cost = perkCost(state, meta.id)
  const missing = karmaNeedsMet(state, meta.needs) ? [] : karmaNeedsText(state, meta.needs)
  return {
    meta, level, cost,
    affordable: moneyGte(balance.value, cost),
    ready: missing.length === 0,
    missing,
  }
}))

function missingText(missing) {
  return missing && missing.length ? '需' + missing.join('、') : ''
}
</script>

<template>
  <div class="karma-panel">
    <div class="box karma-overview">
      <div class="box-head">仙缘修持</div>
      <div class="box-body">
        <p class="small dim karma-note">
          转世与飞升带走的因果。可在此修持跨轮回保留的永久特权；
          <b class="karma-warn">已修持花掉的仙缘不再计入产出与仓储加成</b>——「囤加成」还是「买特权」，是每一轮轮回的核心抉择。
        </p>
        <div class="karma-balances">
          <div class="karma-balance">
            <span class="k">仙缘余额</span>
            <b>{{ fmtAmount(balance) }}</b>
            <span class="small dim">计入产出乘区</span>
          </div>
          <div class="karma-balance">
            <span class="k">已修持投入</span>
            <b>{{ fmtAmount(totalSpent) }}</b>
            <span class="small dim">跨轮回保留 · 不计加成</span>
          </div>
          <div class="karma-balance">
            <span class="k">轮迴</span>
            <b>{{ rebirths }}</b>
            <span class="small dim">转世 + 飞升次数</span>
          </div>
        </div>
        <p class="small dim karma-note">
          当前全局产出 ×{{ fmt(productionMult) }}（仙缘乘区），有限仓储 ×{{ fmt(storageMult) }}；
          离线上限 +{{ bonuses.offlineHours }} 小时、建筑造价 −{{ fmtPercent(bonuses.buildingDiscount) }}、
          仙缘独立结算 +{{ fmtPercent(bonuses.insightBonus) }}、仙缘所得同层加成 +{{ fmtPercent(bonuses.ascendBonus) }}、身死保留 {{ fmtPercent(0.5 + bonuses.deathKeepBonus) }}。
        </p>
      </div>
    </div>

    <div class="box karma-card">
      <div class="box-head">永久修持</div>
      <div class="box-body">
        <div v-for="row in perkRows" :key="row.meta.id" class="small karma-entry">
          <div class="karma-entry-head">
            <b>{{ row.meta.name }}</b> {{ row.level }}/{{ row.meta.max }}
            <span v-if="row.level >= row.meta.max" class="good">已圆满</span>
          </div>
          <div class="dim karma-note">{{ row.meta.desc }}</div>
          <div class="btn-row karma-actions">
            <span class="small">下一级 {{ fmtAmount(row.cost) }} 仙缘</span>
            <button
              class="btn"
              :disabled="row.level >= row.meta.max || !row.affordable || !row.ready"
              @click="actions.buyKarmaPerk(row.meta.id)"
            >升级</button>
            <span v-if="row.missing.length" class="small bad">{{ missingText(row.missing) }}</span>
            <span v-else-if="row.ready && !row.affordable && row.level < row.meta.max" class="small dim">仙缘不足</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.karma-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.karma-balances {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  margin: 6px 0;
}
.karma-balance {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--line, #d8d0bd);
  border-radius: 6px;
}
.karma-balance .k { font-size: 12px; color: var(--dim, #777); }
.karma-balance b { font-size: 18px; line-height: 1.2; overflow-wrap: anywhere; }
.karma-warn { color: #a05a2c; }
.karma-card { min-width: 0; }
.karma-entry { padding: 6px 0; border-top: 1px solid var(--line, #e2dccb); min-width: 0; }
.karma-entry:first-of-type { border-top: 0; }
.karma-entry-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.karma-actions { padding: 4px 0 6px; }
.karma-note { margin: 4px 0; overflow-wrap: anywhere; }
.karma-panel :deep(.btn-row) {
  flex-wrap: wrap;
  white-space: normal;
  gap: 6px 10px;
}
.karma-panel :deep(.btn) { min-height: 32px; }
.karma-panel :deep(.btn:focus-visible) { outline: 2px solid #7a5c2e; outline-offset: 2px; }
.karma-panel :deep(.btn:disabled) { opacity: 0.55; cursor: not-allowed; }
</style>
