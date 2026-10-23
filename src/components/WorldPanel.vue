<script setup>
import { computed, reactive } from 'vue'
import { state, derived, actions } from '@/game/store'
import { WORLD_DEFS } from '@/data/samsara'
import { REALMS } from '@/data/realms'
import { worldUnlocked, worldCost, canAfford } from '@/game/engine'
import { fmtCost, fmt, fmtPercent, fmtTime } from '@/game/format'
import { resourceName } from '@/data/resources'
const selection = reactive({})
const available = computed(() => state.disciples.members.filter(m => !m.onMission))
const label = cost => Object.entries(cost).map(([id, n]) => `${resourceName(id)} ${fmtCost(n)}`).join('、')
function station(world) {
  const member = state.disciples.members.find(m => m.id === Number(selection[world.id]))
  if (!member) return
  if (member.realm < world.safe && !window.confirm(`该弟子低于安全境界，驻守有死亡风险且死亡减免不生效。每小时风险约${fmtPercent(1 - Math.exp(-0.02 * 2 ** (world.safe - member.realm - 1)))}，时间越长累计风险越高。继续派驻？`)) return
  actions.samsara('stationDisciple', world.id, member.id)
}
</script>
<template>
  <div class="box">
    <div class="box-head">万千世界</div>
    <div class="box-body">
      <p class="small dim">天工坊合成仙材。一界一名驻守，驻守者让出岗位、继续自然修炼；达标安全，低境冒险。维护不足按供给比例停产，不损毁设施。</p>
      <p class="small">当前驻守供给 {{ fmtPercent(derived.worldFlow?.supply ?? 1) }}；灵能与天砖均需留存。召回停止驻守与风险，设施和库存随轮回清空。</p>
      <section v-for="world in WORLD_DEFS" :key="world.id" class="world">
        <div class="world-head"><b>{{ world.name }}</b><span class="small dim">{{ resourceName(world.out) }} · 宗门{{ REALMS[world.realm].name }}开放</span></div>
        <div class="world-stats small">
          <div><span class="dim">采集 / 承载</span><b>{{ state.worlds[world.id].level }} / {{ 1 + state.worlds[world.id].capacity }} 级</b></div>
          <div><span class="dim">每级产出 / 小时</span><b class="good">{{ resourceName(world.out) }} {{ fmt(world.rate * 3600) }}</b></div>
          <div><span class="dim">每级维护 / 小时</span><span>灵能 {{ fmt(world.energy * 3600) }} · 天砖 {{ fmt(world.maintenance * 3600) }}</span></div>
        </div>
        <p class="small dim">安全驻守：{{ REALMS[world.safe].name }}；低境驻守有累计死亡风险，死亡减免无效。</p>
        <div class="world-upgrades">
          <div><button class="btn" :disabled="!worldUnlocked(state, world.id) || !canAfford(state, worldCost(state, world.id))" @click="actions.samsara('buildWorld', world.id)">建设采集点</button><span class="small dim">{{ label(worldCost(state, world.id)) }}</span></div>
          <div><button class="btn" :disabled="!worldUnlocked(state, world.id) || !canAfford(state, worldCost(state, world.id, true))" @click="actions.samsara('buildWorld', world.id, true)">扩充承载</button><span class="small dim">{{ label(worldCost(state, world.id, true)) }}</span></div>
        </div>
        <div v-if="state.worlds[world.id].memberId" class="btn-row">
          驻守：{{ state.disciples.members.find(m => m.id === state.worlds[world.id].memberId)?.name }}
          · 已驻守 {{ fmtTime(state.worlds[world.id].exposure) }}
          <button class="btn" @click="actions.samsara('stationDisciple', world.id, null)">召回</button>
        </div>
        <div v-else class="btn-row">
          <select v-model="selection[world.id]" :aria-label="`${world.name}驻守人选`">
            <option :value="undefined" disabled>选择驻守弟子</option>
            <option v-for="m in available" :key="m.id" :value="m.id">{{ m.name }} · {{ REALMS[m.realm].name }}{{ m.realm < world.safe ? '（危险）' : '（安全）' }}</option>
          </select>
          <button class="btn" :disabled="!state.worlds[world.id].level || !selection[world.id]" @click="station(world)">派驻</button>
        </div>
      </section>
    </div>
  </div>
</template>
<style scoped>
.world { border-top: 1px solid var(--line-soft); padding: 16px 0; }
.world-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; }
.world-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 12px; margin: 12px 0; }
.world-stats > div { display: flex; flex-direction: column; gap: 4px; font-variant-numeric: tabular-nums; }
.world-upgrades { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 10px; }
.world-upgrades > div { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
.world p { margin: 8px 0 12px; }
.btn-row { gap: 8px; margin: 12px 0 0; }
select { max-width: 100%; }
@container content (max-width: 620px) {
  .world-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .world-stats > div:last-child { grid-column: 1 / -1; }
}
</style>
