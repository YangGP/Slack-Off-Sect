<script setup>
/**
 * D7 香火页：香火 → 愿力 → 道心，本世仪轨与永久道心修持。
 * 只做展示与动作入口；报价、门槛与结算都在 systems/faith.js。
 */
import { computed, ref } from 'vue'
import { state, actions } from '@/game/store'
import { fmt, fmtPercent, fmtCost } from '@/game/format'
import { ZERO, money, moneyAvailable, moneyMax, moneyToNumber } from '@/game/decimal'
import { RITUALS, CULTIVATION, FAITH_UPGRADE_MAP } from '@/data/faith'
import { UPGRADE_MAP } from '@/data/upgrades'
import { RESOURCE_MAP } from '@/data/resources'
import { CONFIG } from '@/data/config'
import {
  canAfford, canAttest, canCondense, faithNeedsMet, faithNeedsText, faithQuote, faithRatioBonus,
  faithStorageRatio, isCostRevealed, isTreasureForged, isUpgradeUnlocked, learned, refineCost,
  totalDaoHeart, treasureLevel, treasureMult, vowGainFactor,
} from '@/game/engine'

const condenseDraft = ref('')
const attestDraft = ref('')
const quote = computed(() => faithQuote(state))
const reserve = computed(() => money(state.settings.craftReserves?.faith ?? ZERO))
const faithAvailable = computed(() => moneyAvailable(state.resources.faith ?? ZERO, reserve.value))
const vowBalance = computed(() => state.resources.vow ?? ZERO)
const daoHeartBalance = computed(() => state.resources.daoHeart ?? ZERO)
const daoHeartTotal = computed(() => totalDaoHeart(state))
const condenseReady = computed(() => canCondense(state))
const attestReady = computed(() => canAttest(state))
/** 香火产出汇总只用于显示：大乘愿典走中央研究效果，仪轨走本世等级，两者不重复结算。 */
const scriptureBonus = computed(() => (learned(state, 'greatVowScripture') ? 1.2 : 0))

function fillCondense(frac) {
  condenseDraft.value = faithAvailable.value.times(frac).toString()
}
function fillAttest(frac) {
  attestDraft.value = moneyMax(ZERO, vowBalance.value.times(frac)).toString()
}
function doCondense() {
  if (actions.condenseVow(condenseDraft.value || '0')) condenseDraft.value = ''
}
function doAttest() {
  if (actions.attestDaoHeart(attestDraft.value || '0')) attestDraft.value = ''
}

/** 完整费用：一次性研究可能同时收香火/愿力/灵机/符箓/灵石，不能只列三种。 */
function costText(cost) {
  return Object.entries(cost || {})
    .map(([id, amount]) => (RESOURCE_MAP[id]?.name || id) + ' ' + fmtCost(amount))
    .join(' + ')
}
function missingText(missing) {
  return missing && missing.length ? '需' + missing.join('、') : ''
}

/** 一次性条目：凝愿法/聚愿鼎走普通研究，其余走香火专属购买；未露出的新条目先不展示。 */
const oneTime = computed(() => {
  const rows = Object.values(FAITH_UPGRADE_MAP).map(meta => {
    const owned = learned(state, meta.id)
    const missing = faithNeedsMet(state, meta.needs) ? [] : faithNeedsText(state, meta.needs)
    return {
      meta, owned, cost: meta.cost, action: () => actions.buyFaithUpgrade(meta.id),
      missing, reveal: owned || isCostRevealed(state, meta.cost),
    }
  })
  for (const id of ['vowPower', 'vowCauldron']) {
    const meta = UPGRADE_MAP[id]
    if (!meta) continue
    const owned = learned(state, id)
    const missing = isUpgradeUnlocked(state, meta) ? [] : faithNeedsText(state, meta.needs)
    rows.push({
      meta, owned, cost: meta.cost, action: () => actions.research(id),
      missing, reveal: owned || isCostRevealed(state, meta.cost),
    })
  }
  return rows
    .filter(row => row.reveal)
    .map(row => {
      const row2 = {
        ...row,
        affordable: canAfford(state, row.cost || {}),
        locked: row.missing.length > 0,
        costText: costText(row.cost),
      }
      if (row.meta.id === 'vowCauldron' && row.owned) {
        const cost = refineCost(state, 'vowCauldron')
        row2.treasure = {
          level: treasureLevel(state, 'vowCauldron'),
          mult: treasureMult(state, row.meta),
          nextMult: treasureMult(state, row.meta) + CONFIG.TREASURE_REFINE_STEP,
          costText: costText(cost),
          canRefine: isTreasureForged(state, 'vowCauldron') && !!cost && canAfford(state, cost),
        }
      }
      return row2
    })
})

const ritualRows = computed(() => RITUALS.map(meta => {
  const info = quote.value.rituals[meta.id]
  const missing = faithNeedsMet(state, meta.needs) ? [] : faithNeedsText(state, meta.needs)
  return {
    meta, level: info.level, cap: info.cap, cost: info.cost,
    affordable: canAfford(state, { vow: info.cost }), missing,
    ready: missing.length === 0,
    reveal: info.level > 0 || isCostRevealed(state, { vow: info.cost }),
  }
}).filter(row => row.level > 0 || row.reveal))

const cultivationRows = computed(() => CULTIVATION.map(meta => {
  const info = quote.value.cultivation[meta.id]
  const missing = faithNeedsMet(state, meta.needs) ? [] : faithNeedsText(state, meta.needs)
  return {
    meta, level: info.level, cost: info.cost,
    affordable: canAfford(state, { daoHeart: info.cost }), missing,
    ready: missing.length === 0,
    reveal: info.level > 0 || isCostRevealed(state, { daoHeart: info.cost }),
  }
}).filter(row => row.level > 0 || row.reveal))
</script>

<template>
  <div class="box">
    <div class="box-head">香火修持</div>
    <div class="box-body">
      <div class="small dim">
        香火 → 愿力 → 道心。愿力随本世清空；道心与永久修持跨轮回保留。
      </div>
      <div class="res-line" style="padding-top: 6px">
        香火 <b>{{ fmt(state.resources.faith || ZERO) }}</b>
        <span class="sep">·</span>愿力 <b>{{ fmt(vowBalance) }}</b>
        <span class="sep">·</span>道心 <b>{{ fmt(daoHeartBalance) }}</b>
        <span class="dim">（累计 {{ fmt(daoHeartTotal) }}）</span>
      </div>
      <div class="small dim">
        香火保留量 {{ fmt(reserve) }}；香火产出加成 +{{ fmtPercent(faithRatioBonus(state) + scriptureBonus) }}（仪轨 +{{ fmtPercent(faithRatioBonus(state)) }}、大乘愿典 +{{ fmtPercent(scriptureBonus) }}），仓容加成 +{{ fmtPercent(faithStorageRatio(state)) }}。
      </div>
    </div>
  </div>

  <div class="box">
    <div class="box-head">凝愿</div>
    <div class="box-body">
      <div class="small dim">
        香火按当前《凝愿真解》等级转换为愿力；当前增益 +{{ fmtPercent(moneyToNumber(vowGainFactor(state))) }}。
      </div>
      <div class="btn-row" style="padding-top: 6px">
        <input v-model="condenseDraft" class="qty" inputmode="decimal" aria-label="凝愿投入香火" placeholder="投入香火">
        <button class="btn" :disabled="!condenseReady" @click="fillCondense(0.25)">25%</button>
        <button class="btn" :disabled="!condenseReady" @click="fillCondense(0.5)">50%</button>
        <button class="btn" :disabled="!condenseReady" @click="fillCondense(1)">全部</button>
        <button class="btn primary" :disabled="!condenseReady" @click="doCondense">凝愿</button>
      </div>
      <div v-if="!condenseReady" class="small dim">需学会《凝愿法》，且当前境界至少金丹。</div>
    </div>
  </div>

  <div class="box">
    <div class="box-head">证心</div>
    <div class="box-body">
      <div class="small dim">愿力按 10000 : 1 证为道心；只扣当前余额，不重置宗门与仪轨。</div>
      <div class="btn-row" style="padding-top: 6px">
        <input v-model="attestDraft" class="qty" inputmode="decimal" aria-label="证心投入愿力" placeholder="投入愿力">
        <button class="btn" :disabled="!attestReady" @click="fillAttest(0.25)">25%</button>
        <button class="btn" :disabled="!attestReady" @click="fillAttest(0.5)">50%</button>
        <button class="btn" :disabled="!attestReady" @click="fillAttest(1)">全部</button>
        <button class="btn primary" :disabled="!attestReady" @click="doAttest">证心</button>
      </div>
      <div v-if="!attestReady" class="small dim">需学会《凝愿法》，且当前境界至少化神。</div>
    </div>
  </div>

  <div class="box">
    <div class="box-head">本世仪轨</div>
    <div class="box-body">
      <div v-for="row in ritualRows" :key="row.meta.id" class="small">
        <b>{{ row.meta.name }}</b> {{ row.level }}/{{ row.cap }}
        <span class="dim">· {{ row.meta.desc }}</span>
        <div class="btn-row" style="padding: 4px 0 8px">
          <span class="small">下一级 {{ fmt(row.cost) }} 愿力</span>
          <button class="btn" :disabled="row.level >= row.cap || !row.affordable || !row.ready" @click="actions.buyRitual(row.meta.id)">升级</button>
          <span v-if="row.missing.length" class="small bad">{{ missingText(row.missing) }}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="box">
    <div class="box-head">道心修持</div>
    <div class="box-body">
      <div v-for="row in cultivationRows" :key="row.meta.id" class="small">
        <b>{{ row.meta.name }}</b> {{ row.level }}/{{ row.meta.max }}
        <span class="dim">· {{ row.meta.desc }}</span>
        <div class="btn-row" style="padding: 4px 0 8px">
          <span class="small">下一级 {{ fmt(row.cost) }} 道心</span>
          <button class="btn" :disabled="row.level >= row.meta.max || !row.affordable || !row.ready" @click="actions.buyCultivation(row.meta.id)">升级</button>
          <span v-if="row.missing.length" class="small bad">{{ missingText(row.missing) }}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="box">
    <div class="box-head">护道与法器</div>
    <div class="box-body">
      <div v-for="row in oneTime" :key="row.meta.id" class="small">
        <b>{{ row.meta.name }}</b>
        <span v-if="row.owned" class="good">已掌握</span>
        <span v-else class="dim">· {{ row.meta.desc || row.meta.effectDesc }}</span>

        <template v-if="row.owned && row.treasure">
          <div class="small dim" style="padding: 4px 0">
            祭炼 {{ row.treasure.level }} 级 · 当前效果 ×{{ row.treasure.mult.toFixed(2) }} → 下级 ×{{ row.treasure.nextMult.toFixed(2) }}
          </div>
          <div class="btn-row" style="padding: 4px 0 8px">
            <span class="small">下级祭炼 {{ row.treasure.costText }}</span>
            <button class="btn" :disabled="!row.treasure.canRefine" @click="actions.refineTreasure('vowCauldron')">祭炼</button>
          </div>
        </template>

        <div v-else-if="!row.owned" class="btn-row" style="padding: 4px 0 8px">
          <span class="small">费用 {{ row.costText }}</span>
          <button class="btn" :disabled="!row.affordable || row.locked" @click="row.action()">
            {{ row.meta.id === 'vowPower' || row.meta.id === 'vowCauldron' ? '参悟' : '修持' }}
          </button>
          <span v-if="row.locked" class="small bad">{{ missingText(row.missing) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
