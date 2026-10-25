<script setup>
import { computed, reactive } from 'vue'
import { state, derived, actions } from '@/game/store'
import { WORLD_DEFS } from '@/data/samsara'
import { WORLD_FACILITIES } from '@/data/worldFacilities'
import { UPGRADE_MAP } from '@/data/upgrades'
import { REALMS } from '@/data/realms'
import { worldUnlocked, worldCost, canAfford, worldFacilityCost, worldFacilityUnlocked } from '@/game/engine'
import { fmtCost, fmt, fmtPercent, fmtTime, fmtAmount } from '@/game/format'
import { resourceName } from '@/data/resources'
import StableSelect from './StableSelect.vue'
const selection = reactive({})
const available = computed(() => state.disciples.members.filter(m => !m.onMission))
const shareOptions = [{ value: 0, label: '关闭' }, { value: 0.25, label: '最多25%' }, { value: 0.5, label: '最多50%' }]
const recipeOptions = [{ value: '', label: '选择支援配方' }, { value: 'condensePill', label: '凝元炼丹' }, { value: 'refineNineTurnPill', label: '九转炼丹' }]
const memberOptions = computed(() => Object.fromEntries(WORLD_DEFS.map(world => [world.id,
  [{ value: undefined, label: '选择驻守弟子', disabled: true },
    ...available.value.map(member => ({ value: member.id, label: `${member.name} · ${REALMS[member.realm].name}${member.realm < world.safe ? '（危险）' : '（安全）'}` }))]])))
const label = cost => Object.entries(cost).map(([id, n]) => `${resourceName(id)} ${fmtCost(n)}`).join('、')
const rowOf = world => derived.worldPlan?.rows.find(r => r.world.id === world.id)
const branchOf = id => derived.worldPlan?.branches?.[id]
const divertedHourly = (world, id) => rowOf(world)?.branches[id]?.times(3600).div(derived.worldPlan.seconds) || 0
function setShare(f, value) {
  actions.samsara('configureWorldFacility', f.id, value)
}
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
        <div v-if="rowOf(world)" class="small world-account">
          <div>有效采集 {{ rowOf(world).n }} 级 · 闲置 {{ Math.max(0, state.worlds[world.id].level - rowOf(world).n) }} 级</div>
          <div>{{ resourceName(world.out) }}毛产 {{ fmtAmount(rowOf(world).gross.times(3600).div(derived.worldPlan.seconds)) }}／小时 · 分流 {{ fmtAmount(rowOf(world).gross.minus(rowOf(world).net).times(3600).div(derived.worldPlan.seconds)) }} · 净入库 {{ fmtAmount(rowOf(world).net.times(3600).div(derived.worldPlan.seconds)) }}</div>
          <div>实际维护／小时：灵能 {{ fmtAmount(rowOf(world).energyPaid.times(3600).div(derived.worldPlan.seconds)) }} · 天砖 {{ fmtAmount(rowOf(world).brickPaid.times(3600).div(derived.worldPlan.seconds)) }}</div>
          <div v-if="world.id === 'marrow' && state.worlds.marrow.facilities.marrowPool.on">澄髓池附加供给 {{ fmtPercent(rowOf(world).poolSupply) }}；缺草或缺液只停强化，不停基础清髓。</div>
          <div v-if="derived.worldPlan.supply < 0.999" class="warn">灵能或天砖供给不足，产出与支援按实际预算降载。</div>
        </div>
        <div class="world-facilities">
          <div v-for="f in WORLD_FACILITIES.filter(f => f.world === world.id)" :key="f.id" class="facility small">
            <b>{{ f.name }}</b><span class="dim"> · 单座设施</span>
            <p class="dim">{{ f.desc }}</p>
            <template v-if="!state.worlds[world.id].facilities[f.id].built">
              <button class="btn" :disabled="!worldFacilityUnlocked(state, f.id) || !canAfford(state, worldFacilityCost(state, f.id))" @click="actions.samsara('buildWorldFacility', f.id)">建设</button>
              <span class="dim"> {{ label(worldFacilityCost(state, f.id)) }} · 需《{{ UPGRADE_MAP[f.research].name }}》</span>
            </template>
            <template v-else>
              <template v-if="f.branch">
                <label>分流预算
                  <StableSelect :label="`${f.name}分流预算`" :model-value="state.worlds[world.id].facilities[f.id].share" :options="shareOptions" @update:model-value="setShare(f, $event)" />
                </label>
                <StableSelect v-if="f.id === 'marrowFurnace'" label="丹髓炉支援配方" :model-value="state.worlds.marrow.facilities.marrowFurnace.recipe || ''" :options="recipeOptions" @update:model-value="actions.samsara('configureWorldFacility', f.id, $event || null)" />
                <div class="dim">{{ branchOf(f.id)?.reason || '支援关闭' }} · 实际支援 {{ fmtPercent(branchOf(f.id)?.effect || 0) }} · 实际分流 {{ fmtAmount(divertedHourly(world, f.id)) }}／小时</div>
              </template>
              <button v-else class="btn" @click="actions.samsara('configureWorldFacility', f.id, !state.worlds[world.id].facilities[f.id].on)">{{ state.worlds[world.id].facilities[f.id].on ? '关闭运行' : '启用运行' }}</button>
            </template>
          </div>
        </div>
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
          <StableSelect v-model="selection[world.id]" :label="`${world.name}驻守人选`" :options="memberOptions[world.id]" />
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
.world-account { margin: 10px 0; line-height: 1.8; font-variant-numeric: tabular-nums; }
.world-facilities { margin: 12px 0; }
.facility { border-top: 1px solid var(--line-soft); padding: 10px 0; }
.world-upgrades > div { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
.world p { margin: 8px 0 12px; }
.btn-row { gap: 8px; margin: 12px 0 0; }
select { max-width: 100%; }
@container content (max-width: 620px) {
  .world-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .world-stats > div:last-child { grid-column: 1 / -1; }
}
</style>
