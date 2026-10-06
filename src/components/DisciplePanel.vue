<script setup>
import { computed } from 'vue'
import { state, derived, actions } from '@/game/store'
import { JOBS } from '@/data/jobs'
import { idleDisciples, nextArrivalIn } from '@/game/engine'
import { describeNeeds } from '@/game/effectsText'
import { fmt, fmtRate, fmtTime } from '@/game/format'

const idle = computed(() => idleDisciples(state))
const waitNext = computed(() => nextArrivalIn(state, derived))

const rows = computed(() =>
  JOBS.map((job) => {
    const unlocked = derived.unlockedJobs.includes(job.id)
    const count = state.disciples.jobs[job.id] || 0
    const res = job.resource
    const perDisciple =
      job.base *
      (1 + (derived.jobRatio?.[job.id] || 0)) *
      (1 + (derived.ratio?.[res] || 0)) *
      (1 + (derived.ratioAll || 0)) *
      derived.globalMult
    return {
      ...job,
      unlocked,
      count,
      perDisciple,
      total: perDisciple * count,
      needsText: describeNeeds(job.needs).join('，'),
    }
  }),
)

function setJob(jobId, value) {
  const n = Number(value)
  actions.setJob(jobId, Number.isFinite(n) ? n : 0)
}
</script>

<template>
  <div class="box">
    <div class="box-head">
      职位分配<span class="hint">人数来自门中弟子，闲散的人不干活</span>
    </div>
    <div class="box-body">
      <table class="grid">
        <thead>
          <tr>
            <th>职位</th>
            <th>人数</th>
            <th>每人 / 秒</th>
            <th>合计 / 秒</th>
            <th>分配</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="job in rows" :key="job.id" :class="{ off: !job.unlocked }" :title="job.desc">
            <td class="nowrap">{{ job.name }}</td>
            <td class="num">{{ job.count }}</td>
            <td class="num good">{{ fmtRate(job.perDisciple) }}</td>
            <td class="num">{{ job.count > 0 ? fmtRate(job.total) : '—' }}</td>
            <td class="btn-row">
              <template v-if="job.unlocked">
                <button class="btn" :disabled="job.count <= 0" @click="actions.shiftJob(job.id, -10)">
                  -10
                </button>
                <button class="btn" :disabled="job.count <= 0" @click="actions.shiftJob(job.id, -1)">
                  -1
                </button>
                <input
                  class="qty"
                  type="number"
                  min="0"
                  :value="job.count"
                  @change="setJob(job.id, $event.target.value)"
                />
                <button class="btn" :disabled="idle <= 0" @click="actions.shiftJob(job.id, 1)">
                  +1
                </button>
                <button class="btn" :disabled="idle <= 0" @click="actions.shiftJob(job.id, 10)">
                  +10
                </button>
                <button class="btn" :disabled="idle <= 0" @click="actions.fillJob(job.id)">满</button>
              </template>
              <span v-else class="small dim">未解锁 · {{ job.needsText }}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="box-head" style="padding-top: 8px">分配操作</div>

      <div class="btn-row">
        <button class="btn" @click="actions.clearJobs()">全员休息（把弟子全部退回闲散）</button>
      </div>

      <div class="small dim">
        弟子总数 {{ state.disciples.total }} / {{ derived.maxDisciples }}，闲散 {{ idle }}；
        每人 灵气 -{{ fmt(derived.upkeep / Math.max(1, state.disciples.total)) }}/秒，士气
        {{ fmt(derived.morale) }}%（建筑 / 修真 +{{ fmt(derived.moraleBonus) }}）。
      </div>
      <div class="small dim">
        <template v-if="waitNext === null">居所已满，扩建居所才会再有人来。</template>
        <template v-else>下一位弟子约 {{ fmtTime(waitNext) }}后到。</template>
      </div>
    </div>
  </div>
</template>
