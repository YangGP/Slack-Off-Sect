<script setup>
/**
 * 猎杀页：执符使开符 → 选猎场与弟子 → 出征 → 归队取兽材。
 * 信符与宗门外交共用同一池子（见外交页）：备猎与互市抢同一份凭信。
 * 首轮只开放山麓；妖兽来袭关联与生态字段关闭（仅记统计）。
 * 本组件属于「妖兽猎杀」可选模块，由 src/modules/hunting/ui.js 导出。
 */
import { computed } from 'vue'
import { state, derived, view, actions } from '@/game/store'
import { HUNT, HUNT_FIELDS, HUNT_FIELD_MAP } from './data.js'
import { DIPLOMACY } from '@/modules/diplomacy/data.js'
import { REALMS } from '@/data/realms'
import { resourceName } from '@/data/resources'
import { canDepart, huntableMembers, huntPreview } from '@/game/engine'
import { ZERO, moneyGt } from '@/game/decimal'
import { fmtAmount, fmtFixed, fmtPercent, fmtTime } from '@/game/format'
import HoverTip from '@/components/HoverTip.vue'

const fieldId = computed(() => state.hunting.settings.selectedFieldId)
const field = computed(() => HUNT_FIELD_MAP[fieldId.value] || HUNT_FIELDS[0])
const unlocked = computed(() => state.upgrades.wildHunting && state.buildings.huntingCamp?.on)
const mission = computed(() => view.huntMission.value)

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

const missionPct = computed(() => {
  const m = mission.value
  return m ? Math.min(1, m.progressSeconds / Math.max(1, m.actualDuration)) : 0
})
const missionRemain = computed(() => {
  const m = mission.value
  return m ? Math.max(0, m.actualDuration - m.progressSeconds) : 0
})
const lastOutcome = computed(() => state.hunting.lastOutcome)

/**
 * 期望兽材与战报猎获都是金额（Decimal），模板里不能直接做算术/比较：
 * 在这里算好展示文案与「是否有整数入库」再暴露给模板。
 */
const expectedGainRows = computed(() => Object.entries(preview.value?.expectedGains || {})
  .map(([res, amount]) => ({ res, name: resourceName(res), text: fmtFixed(amount) })))
const lastGainRows = computed(() => Object.entries(lastOutcome.value?.gains || {})
  .map(([res, amount]) => ({ res, name: resourceName(res), text: fmtAmount(amount), positive: moneyGt(amount, ZERO) })))
const lastGainAny = computed(() => lastGainRows.value.some(row => row.positive))
</script>

<template>
  <div class="box">
    <div class="box-head">
      <HoverTip label="妖兽猎杀"><template #tip>
          <p>执符使在营房开具信符，每趟出征消耗 {{ HUNT.WARRANT_COST }} 枚。选猎场与 1~{{ HUNT.TEAM_MAX }} 名弟子入山，归队后获得兽材。</p>
          <p>信符与宗门外交共用：每回互市消耗 {{ DIPLOMACY.WARRANT_COST }} 枚，两边抢同一份凭信。</p>
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
                <span v-for="row in expectedGainRows" :key="row.res" style="margin-right: 12px">
                  {{ row.name }} ≈ {{ row.text }}
                </span>
                <span v-if="!expectedGainRows.length" class="dim">—</span>
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
        <div class="small dim">已取消，弟子归队（不退信符）。</div>
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
                <span v-for="row in lastGainRows" :key="row.res" style="margin-right: 12px">
                  {{ row.name }} ×{{ row.text }}
                </span>
                <span v-if="!lastGainAny" class="dim">本轮无整数入库</span>
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
