<script setup>
import { computed } from 'vue'
import { state, actions } from '@/game/store'
import { challengeQuote } from '@/game/engine'
import { resourceName } from '@/data/resources'
import { fmtCost, fmtPercent } from '@/game/format'
const quote = computed(() => challengeQuote(state))
const cost = computed(() => Object.entries(quote.value.cost).map(([id, n]) => `${resourceName(id)} ${fmtCost(n)}`).join('、'))
const ready = computed(() => state.disciples.members.filter(m => m.realm >= 10 && m.finalReady).length)
function enter() {
  if (window.confirm('进入全员飞升后，按本世人数峰值锁定目标，关闭逐出与常规招募，只补普通凡体新人；不能取消，可手动重置但不结新道果。进入挑战？')) actions.samsara('beginChallenge')
}
function resolve(reset) {
  if (window.confirm(reset ? '重置本世，仅结仙缘，不新增道果；培养和本世准备清空。继续？' : `集体渡劫成功率${fmtPercent(quote.value.chance)}。失败将轮回，仅结部分道果。开始？`)) actions.samsara('resolveChallenge', reset)
}
</script>
<template>
  <div v-if="state.realm >= 10 || state.challenge.active || state.samsara.completions" class="box">
    <div class="box-head">全员飞升</div>
    <div class="box-body">
      <template v-if="state.challenge.completed"><p class="good">全宗飞升圆满，愿无一人被遗忘。</p><p>可继续经营与查看名录，也可通过普通飞升主动开启新世。永久通关记录 {{ state.samsara.completions }} 次。</p></template>
      <template v-else-if="!state.challenge.active"><p class="small">宗门达到渡劫后，可继续培养全员、完成个人准备和公共护道，挑战集体飞升。目标取本世人数峰值，至少10人。</p><button class="btn" :disabled="state.realm < 10" @click="enter">进入全员挑战</button></template>
      <template v-else>
        <div class="challenge-stats"><span>目标 <b>{{ state.challenge.target }}</b> 人</span><span>在宗 <b>{{ state.disciples.members.length }}</b> 人</span><span>个人准备 <b>{{ ready }}</b> 人</span></div>
        <p v-if="quote.blockedHousing" class="bad">尚缺成员；住房不足时请先补建，系统自动补普通凡体弟子。</p>
        <p>公共护道 {{ state.challenge.protection }}/10；集体成功率 {{ fmtPercent(quote.chance) }}。每级材料在投入时消耗，失败及重置不退还。</p>
        <div class="btn-row challenge-protection"><button class="btn" :disabled="state.challenge.protection >= 10" @click="actions.samsara('prepareChallenge')">投入下一级护道</button><span class="small dim">{{ cost }}</span></div>
        <p class="small">渡劫弟子逐名准备：每人清灵髓30、灵宝2、九转丹5，可在弟子页操作。</p>
        <div class="btn-row"><button class="btn primary" :disabled="!quote.ready || state.challenge.protection < 1" @click="resolve(false)">发起集体渡劫</button>
        <button class="btn danger" @click="resolve(true)">手动重置本世</button></div>
      </template>
    </div>
  </div>
</template>
<style scoped>
.challenge-stats { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 12px; font-variant-numeric: tabular-nums; }
.challenge-protection { margin-bottom: 12px; }
</style>
