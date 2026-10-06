<script setup>
/**
 * 累计统计：挂机时长、累计产出、建造/制作次数、天灾与飞升次数等。
 * （原先的「宗门台账」把每秒收支、倍率分解、人员也放在这里，
 *   这些信息左栏资源表 / 通栏 / 弟子页都已经有了，这里只留累计项。）
 */
import { computed } from 'vue'
import { state, derived } from '@/game/store'
import { JOBS } from '@/data/jobs'
import { fmt, fmtAmount, fmtPercent, fmtTime } from '@/game/format'
import { idleDisciples } from '@/game/engine'

const idle = computed(() => idleDisciples(state))
const assigned = computed(() =>
  JOBS.map((j) => ({ name: j.name, count: state.disciples.jobs[j.id] || 0 })).filter((j) => j.count > 0),
)
</script>

<template>
  <div class="box">
    <details class="fold" style="margin: 0">
      <summary>
        累计
        <span class="hint">
          挂机 {{ fmtTime(state.stats.playTime) }} · 灵气 {{ fmtAmount(state.stats.totalQi) }} · 飞升
          {{ state.stats.ascensions }} 次
        </span>
      </summary>

      <div style="padding-top: 4px">
        <div class="kv">
          <span class="k">挂机时长</span>
          <span class="v">{{ fmtTime(state.stats.playTime) }}</span>
        </div>
        <div class="kv">
          <span class="k">累计灵气</span>
          <span class="v">{{ fmtAmount(state.stats.totalQi) }}</span>
        </div>
        <div class="kv">
          <span class="k">累计感悟</span>
          <span class="v">{{ fmtAmount(state.stats.totalInsight) }}</span>
        </div>
        <div class="kv">
          <span class="k">累计香火</span>
          <span class="v">{{ fmtAmount(state.stats.totalFaith) }}</span>
        </div>
        <div class="kv">
          <span class="k">建造 / 制作</span>
          <span class="v">{{ state.stats.buildingsBuilt }} 座 / {{ state.stats.craftCount }} 次</span>
        </div>
        <div class="kv">
          <span class="k">弟子前来</span>
          <span class="v">{{ state.stats.recruits }} 人</span>
        </div>
        <div class="kv">
          <span class="k">妖兽侵袭</span>
          <span class="v" :class="state.stats.disasters ? 'bad' : ''">{{ state.stats.disasters }} 次</span>
        </div>
        <div class="kv">
          <span class="k">飞升</span>
          <span class="v">{{ state.stats.ascensions }} 次</span>
        </div>
        <div class="kv">
          <span class="k">全局倍率</span>
          <span class="v">×{{ derived.globalMult.toFixed(2) }}（加成 +{{ fmtPercent(derived.ratioAll) }}）</span>
        </div>

        <template v-if="assigned.length">
          <div class="box-head" style="padding-top: 6px">人员</div>
          <div v-for="j in assigned" :key="j.name" class="kv">
            <span class="k">{{ j.name }}</span>
            <span class="v">{{ j.count }} 人</span>
          </div>
          <div class="kv">
            <span class="k">闲散</span>
            <span class="v" :class="idle > 0 ? 'warn' : ''">{{ idle }} 人</span>
          </div>
        </template>
      </div>
    </details>
  </div>
</template>
