<script setup>
import { computed } from 'vue'
import { state, derived } from '@/game/store'
import { nextArrivalIn } from '@/game/engine'
import { fmt, fmtPercent, fmtTime } from '@/game/format'
import { CONFIG } from '@/data/config'
import HoverTip from './HoverTip.vue'

const waitNext = computed(() => nextArrivalIn(state, derived))
</script>

<template>
  <HoverTip :width="340">
    <span tabindex="0" class="tip-label" data-habitability>
      宜居度 <b :class="derived.habitabilityMult < 1 || derived.discipleMult < 1 ? 'bad' : derived.habitabilityMult > 1 ? 'good' : ''">{{ fmt(derived.habitability) }}</b>
    </span>
    <template #heading>宜居度 · 当前效果</template>
    <template #tip>
      <div class="tip-row"><span class="k">当前宜居度 / 弟子数</span><span class="v">{{ fmt(derived.habitability) }} / {{ state.disciples.total }}</span></div>
      <div class="tip-section">当前效果</div>
      <div class="tip-row">
        <span class="k">全局产出</span>
        <span class="v" :class="derived.habitabilityMult < 1 ? 'bad' : 'good'">×{{ derived.habitabilityMult.toFixed(2) }}（{{ derived.habitabilityMult >= 1 ? '+' : '' }}{{ fmtPercent(derived.habitabilityMult - 1, 1) }}）</span>
      </div>
      <div class="tip-row"><span class="k">弟子岗位</span><span class="v" :class="derived.discipleMult < 1 ? 'bad' : ''">×{{ derived.discipleMult.toFixed(2) }}{{ derived.discipleMult < 1 ? ' · 拥挤减产' : ' · 正常' }}</span></div>
      <div class="tip-row"><span class="k">弟子岗位综合倍率</span><span class="v">×{{ (derived.habitabilityMult * derived.discipleMult).toFixed(2) }}</span></div>
      <div class="tip-row"><span class="k">弟子离开概率</span><span class="v" :class="derived.leaveChance > 0 ? 'bad' : ''">{{ fmtPercent(derived.leaveChance, 1) }} / {{ fmtTime(CONFIG.HABITABILITY_LEAVE_INTERVAL) }}</span></div>
      <div class="tip-row"><span class="k">弟子前来</span><span class="v">{{ derived.leaveChance > 0 ? '宜居度不足 · 暂停来人' : waitNext === null ? '居所已满' : '正常' }}</span></div>
      <div class="tip-section">宜居度来源</div>
      <div class="tip-row"><span class="k">基础</span><span class="v">{{ CONFIG.HABITABILITY_BASE }}</span></div>
      <div class="tip-row"><span class="k">建筑 / 修真（含入住配套）</span><span class="v good">+{{ fmt(derived.habitabilityBonus) }}</span></div>
      <div v-if="derived.housingHabitability > 0" class="tip-row"><span class="k">其中入住配套</span><span class="v good">+{{ fmt(derived.housingHabitability) }}</span></div>
      <div class="tip-row"><span class="k">断供惩罚</span><span class="v" :class="state.habitabilityPenalty < 0 ? 'bad' : ''">{{ fmt(state.habitabilityPenalty) }}</span></div>
      <div class="tip-section">规则</div>
      <div class="tip-desc">宜居度低于0，每点全局减产1%；超过弟子数+{{ CONFIG.HABITABILITY_BONUS_MARGIN }}后，每点增产{{ fmtPercent(CONFIG.HABITABILITY_GAIN_PER_POINT, 2) }}，增减幅度最多{{ fmtPercent(CONFIG.HABITABILITY_GLOBAL_CAP) }}。</div>
      <div class="tip-desc">弟子不少于20人且宜居度低于弟子数−20时，岗位产出减半。弟子不少于50人且宜居度低于弟子数−50时，每60秒按缺口×2%的概率离开1人（最高50%），期间暂停来人。</div>
      <div class="tip-flavor">宜居度维持在弟子数+40～60，可获得5%～10%的全局增产；清风小院和膳养堂可改善起居。综合倍率包含宜居度与岗位拥挤的影响；长期断供仍会独立导致弟子离开。</div>
    </template>
  </HoverTip>
</template>
