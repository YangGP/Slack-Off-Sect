<script setup>
/**
 * 猎杀页：猎妖师备猎 → 选猎场与弟子 → 出征 → 归队取兽材。
 * 首轮只开放山麓；妖兽来袭关联与生态字段关闭（仅记统计）。
 */
import { computed } from 'vue'
import { state, derived, view, actions } from '@/game/store'
import { HUNT, HUNT_FIELDS, HUNT_FIELD_MAP } from '@/data/hunting'
import { REALMS } from '@/data/realms'
import { resourceName } from '@/data/resources'
import { canDepart, huntableMembers, huntPreview, isHuntUnlocked } from '@/game/engine'
import { fmt, fmtInt, fmtPercent, fmtTime } from '@/game/format'
import HoverTip from './HoverTip.vue'

const fieldId = computed(() => state.hunting.settings.selectedFieldId)
const field = computed(() => HUNT_FIELD_MAP[fieldId.value] || HUNT_FIELDS[0])
const unlocked = computed(() => state.upgrades.wildHunting && state.buildings.huntingCamp?.on)
const mission = computed(() => view.huntMission.value)
const prep = computed(() => state.resources.huntPreparation || 0)
const prepMax = computed(() => derived.max.huntPreparation || 0)
const prepRate = computed(() => derived.rates.huntPreparation || 0)
const waitForPrep = computed(() =>
  prep.value >= HUNT.PREPARATION_COST || prepRate.value <= 0
    ? null
    : (HUNT.PREPARATION_COST - prep.value) / prepRate.value,
)

const members = computed(() => huntableMembers(state))
const selectedIds = computed(() => state.hunting.settings.teamIds || [])
const selectedSet = computed(() => new Set(selectedIds.value))
const preview = computed(() => huntPreview(state, derived, fieldId.value, selectedIds.value))
const rowById = computed(() => new Map((preview.value?.rows || []).map(r => [r.id, r])))
const departCheck = computed(() => canDepart(state, derived, fieldId.value, selectedIds.value))

function toggleMember(id) {
  const cur = new Set(selectedIds.value)
  if (cur.has(id)) cur.delete(id)
  else if (cur.size < HUNT.TEAM_MAX) cur.add(id)
  actions.huntSetTeam([...cur])
}

function selectField(id) {
  actions.huntSetField(id)
}

const prepPct = computed(() =>
  prepMax.value > 0 ? Math.min(1, prep.value / Math.max(1, prepMax.value)) : 0,
)
const missionPct = computed(() => {
  const m = mission.value
  return m ? Math.min(1, m.progressSeconds / Math.max(1, m.actualDuration)) : 0
})
const missionRemain = computed(() => {
  const m = mission.value
  return m ? Math.max(0, m.actualDuration - m.progressSeconds) : 0
})
const lastOutcome = computed(() => state.hunting.lastOutcome)
</script>

<template>
  <div class="box">
    <div class="box-head">
      <HoverTip label="妖兽猎杀"><template #tip>
          <p>猎妖师在营地备下猎备，每趟出征消耗 {{ HUNT.PREPARATION_COST }}。选猎场与 1~{{ HUNT.TEAM_MAX }} 名弟子入山，归队后获得兽材。</p>
          <p>出征期间弟子停止原岗位，但仍修炼、消耗口粮；不能被转岗、逐出或再次派出。</p>
          <p>兽材按整数入库，不足 1 的部分跨任务累计，不丢失。</p>
        </template></HoverTip>
      <span class="hint">首轮只开放山麓；来袭关联尚未启用</span>
    </div>
    <div class="box-body">
      <div v-if="!unlocked" class="empty">
        尚未开放猎杀：需掌握《山野猎法》，并启用猎杀营地（筑基期）。
      </div>
      <template v-else>
        <!-- 猎备 -->
        <table class="grid">
          <tbody>
            <tr>
              <td class="dim nowrap">猎备</td>
              <td class="num">
                {{ fmtInt(prep) }} / {{ fmtInt(prepMax) }}
                <span class="dim">（{{ fmtPercent(prepPct) }}）</span>
                <div class="hunt-bar"><span :style="{ width: (prepPct * 100) + '%' }" /></div>
              </td>
              <td class="dim nowrap">准备速度</td>
              <td class="num">
                <span v-if="prepRate > 0">{{ fmt(prepRate) }}/秒</span>
                <span v-else class="warn">无（派猎妖师到营地）</span>
                <span v-if="waitForPrep !== null" class="dim"> · 距一次出征约 {{ fmtTime(waitForPrep) }}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 猎场选择 -->
        <div class="box-sub">猎场</div>
        <div class="hunt-fields">
          <button
            v-for="f in HUNT_FIELDS"
            :key="f.id"
            class="btn"
            :class="{ primary: f.id === fieldId }"
            :disabled="state.realm < f.entryRealm"
            @click="selectField(f.id)"
          >
            {{ f.name }}
            <span class="dim">（宗门 ≥ {{ REALMS[f.entryRealm].name }}）</span>
          </button>
        </div>
        <div class="small dim" style="padding: 4px 0">{{ field.desc }}</div>

        <!-- 出征队伍 -->
        <div class="box-sub">出征队伍（已选 {{ selectedIds.length }} / {{ HUNT.TEAM_MAX }}）</div>
        <div v-if="!members.length" class="small warn">没有可派出的弟子（全员已在出征中）。</div>
        <div v-else class="hunt-members">
          <label v-for="m in members" :key="m.id" class="hunt-member" :class="{ on: selectedSet.has(m.id) }">
            <input type="checkbox" :checked="selectedSet.has(m.id)" @change="toggleMember(m.id)">
            <span>{{ m.name }}</span>
            <span class="dim">{{ REALMS[m.realm]?.name || '凡体' }}</span>
            <template v-if="rowById.get(m.id)">
              <span class="dim">效率 ×{{ rowById.get(m.id).A.toFixed(2) }}</span>
              <span class="dim">成功率 {{ fmtPercent(rowById.get(m.id).p) }}</span>
            </template>
          </label>
        </div>

        <!-- 预览 -->
        <table v-if="preview" class="grid">
          <tbody>
            <tr>
              <td class="dim nowrap">行程</td>
              <td class="num">{{ fmtTime(preview.duration) }}</td>
              <td class="dim nowrap">预计成功</td>
              <td class="num">{{ preview.expectedSuccess.toFixed(2) }} 人</td>
            </tr>
            <tr>
              <td class="dim nowrap">期望收获</td>
              <td class="num" colspan="3">
                <span v-for="(amount, res) in preview.expectedGains" :key="res" style="margin-right: 12px">
                  {{ resourceName(res) }} ≈ {{ amount.toFixed(2) }}
                </span>
                <span v-if="!Object.keys(preview.expectedGains).length" class="dim">—</span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 操作 -->
        <div v-if="!mission" class="hunt-actions">
          <button class="btn primary" :disabled="!departCheck.ok" @click="actions.huntDepart(fieldId, selectedIds)">
            出征 {{ field.name }}
          </button>
          <span v-if="!departCheck.ok" class="bad small">{{ departCheck.reason }}</span>
          <label class="small" style="margin-left: auto">
            <input type="checkbox" :checked="state.hunting.settings.autoRepeat" @change="actions.huntSetAutoRepeat($event.target.checked)">
            自动重复
          </label>
        </div>
        <div v-else class="hunt-actions">
          <div style="flex: 1">
            <div class="small">
              出征中：{{ field.name }} · 队伍 {{ mission.snapshots.length }} 人
              <span class="dim">· 剩余 {{ fmtTime(missionRemain) }}</span>
            </div>
            <div class="hunt-bar"><span :style="{ width: (missionPct * 100) + '%' }" /></div>
          </div>
          <button class="btn" @click="actions.huntCancel()">召回</button>
        </div>
      </template>
    </div>
  </div>

  <div class="box" v-if="unlocked">
    <div class="box-head">上次归队</div>
    <div class="box-body">
      <div v-if="!lastOutcome" class="empty">还没有出征记录。</div>
      <template v-else-if="lastOutcome.cancelled">
        <div class="small dim">已取消，弟子归队（不退猎备）。</div>
      </template>
      <template v-else>
        <div class="small">
          {{ HUNT_FIELD_MAP[lastOutcome.fieldId]?.name || lastOutcome.fieldId }} ·
          队伍 {{ lastOutcome.teamSize }} 人，成功
          <b :class="lastOutcome.successCount > 0 ? 'good' : 'bad'">{{ lastOutcome.successCount }}</b> 人
        </div>
        <table class="grid">
          <tbody>
            <tr>
              <td class="dim nowrap">入库</td>
              <td class="num">
                <span v-for="(amount, res) in lastOutcome.gains" :key="res" style="margin-right: 12px">
                  {{ resourceName(res) }} ×{{ amount }}
                </span>
                <span v-if="!Object.values(lastOutcome.gains || {}).some(v => v > 0)" class="dim">本轮无整数入库</span>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
      <div class="small dim" style="padding-top: 6px">
        累计出征 {{ state.hunting.statistics.departures }} 次 · 完成 {{ state.hunting.statistics.completedMissions }} 次 ·
        猎杀成功 {{ state.hunting.statistics.successfulHunters }} 人次
      </div>
    </div>
  </div>
</template>

<style scoped>
.hunt-bar {
  height: 6px;
  margin-top: 4px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  overflow: hidden;
}
.hunt-bar > span {
  display: block;
  height: 100%;
  background: #d8b98a;
  transition: width 0.2s linear;
}
.hunt-fields {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 4px 0;
}
.hunt-members {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding: 4px 0;
}
.hunt-member {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.hunt-member.on {
  color: #d8b98a;
}
.hunt-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}
</style>
