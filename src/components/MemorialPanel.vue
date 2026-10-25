<script setup>
import { SECT_STORY } from '@/data/narrative'
import HoverTip from '@/components/HoverTip.vue'
import { computed, ref } from 'vue'
import { state } from '@/game/store'
import { REALMS } from '@/data/realms'
import { SPIRITUAL_ROOT_MAP } from '@/data/disciples'
import { fmt, fmtPercent } from '@/game/format'
const page = ref(0)
const pages = computed(() => Math.max(1, Math.ceil((state.samsara.records.length + state.disciples.members.length) / 30)))
// 只将当前页成员转成展示记录；历史名录不会随每帧修为变化全量复制。
const visible = computed(() => {
  const count = state.disciples.members.length, total = count + state.samsara.records.length
  const start = Math.min(page.value, pages.value - 1) * 30, rows = []
  for (let i = start; i < Math.min(total, start + 30); i++) {
    if (i >= count) { rows.push(state.samsara.records[state.samsara.records.length - 1 - (i - count)]); continue }
    const m = state.disciples.members[count - 1 - i]
    rows.push({ id: `current-${m.id}`, name: m.name, realm: m.realm, root: m.spiritualRoot, contribution: m.lifetimeCultivation || 0,
      loyalty: m.loyalty ?? 1, life: (state.stats.reincarnations || 0) + (state.stats.ascensions || 0) + (state.stats.breakthroughDeaths || 0) + 1,
      outcome: m.collectiveAscended ? '飞升圆满' : '在宗' })
  }
  return rows
})
</script>
<template>
  <div class="box">
    <div class="box-head"><HoverTip label="门人名录"><template #tip><p>{{ SECT_STORY.memorial }}</p>名录跨轮回保留，仅供纪念。旧档从当前弟子起录；历史人物不重复参与道果结算。</template></HoverTip></div>
    <div class="box-body">


      <div class="table-scroll" tabindex="0" role="region" aria-label="门人名录，可横向滚动">
      <table class="grid memorial-table"><thead><tr><th>世</th><th>姓名</th><th>境界</th><th>灵根</th><th>入宗后修为</th><th>同心</th><th>结局</th></tr></thead>
        <tbody><tr v-for="r in visible" :key="r.id"><td>{{ r.life }}</td><td>{{ r.name }}</td><td>{{ REALMS[r.realm]?.name }}</td><td>{{ SPIRITUAL_ROOT_MAP[r.root]?.name }}</td><td>{{ fmt(r.contribution) }}</td><td>{{ fmtPercent(r.loyalty) }}</td><td><span v-if="r.collectiveAscended && r.outcome !== '飞升圆满'">飞升圆满 · </span>{{ r.outcome }}</td></tr></tbody>
      </table>
      </div>
      <div class="btn-row"><button class="btn" :disabled="page <= 0" @click="page--">上一页</button><span>{{ Math.min(page, pages - 1) + 1 }}/{{ pages }}</span><button class="btn" :disabled="page >= pages - 1" @click="page++">下一页</button></div>
    </div>
  </div>
</template>
<style scoped>
.memorial-table { min-width: 660px; font-variant-numeric: tabular-nums; }
.memorial-table td { border-bottom: 1px solid var(--line-soft); }
.btn-row { margin-top: 12px; }
</style>
