<script setup>
/**
 * 猎杀页：只选择有猎杀加成的弟子，普通弟子自动补位；点击后立即结算，不占用岗位。
 * 自动重复按固定间隔执行；间隔是猎杀频率，不是弟子占用时长。
 */
import { computed } from 'vue'
import { state, derived, actions } from '@/game/store'
import { HUNT, HUNT_FIELDS, HUNT_FIELD_MAP } from './data.js'
import { DIPLOMACY } from '@/modules/diplomacy/data.js'
import { REALMS } from '@/data/realms'
import { resourceName } from '@/data/resources'
import { canDepart, huntPreview, resolveHuntTeam, huntCost } from '@/game/engine'
import { hasHuntTalent, talentBonus, TALENT_MAP } from '@/data/talents'
import { ZERO, moneyGt } from '@/game/decimal'
import { fmtAmount, fmtFixed, fmtPercent, fmtTime } from '@/game/format'
import HoverTip from '@/components/HoverTip.vue'

const fieldId = computed(() => state.hunting.settings.selectedFieldId)
const field = computed(() => HUNT_FIELD_MAP[fieldId.value] || HUNT_FIELDS[0])
const unlocked = computed(() => state.upgrades.wildHunting && state.buildings.huntingCamp?.on)
const settings = computed(() => state.hunting.settings)
const bonusMembers = computed(() => state.disciples.members
  .filter(member => member.realm >= (field.value.minDiscipleRealm || 0) && hasHuntTalent(member)))
const selectedIds = computed(() => {
  const eligible = new Set(bonusMembers.value.map(member => member.id))
  return [...new Set(settings.value.teamIds || [])].filter(id => eligible.has(id)).slice(0, HUNT.TEAM_MAX)
})
const selectedSet = computed(() => new Set(selectedIds.value))
const members = computed(() => bonusMembers.value.map(member => ({ ...member,
  selected: selectedSet.value.has(member.id),
  successBonus: talentBonus(member, 'huntSuccess'),
  yieldBonus: talentBonus(member, 'huntYield'),
})))
const teamIds = computed(() => resolveHuntTeam(state, derived, fieldId.value))
const preview = computed(() => huntPreview(state, derived, fieldId.value, teamIds.value))
const selectedRows = computed(() => (preview.value?.rows || []).filter(row => selectedSet.value.has(row.id)))
// 与同一阵容不计猎杀天赋时比较，包含成功率封顶，避免把人数或境界变化算作天赋加成。
const baselinePreview = computed(() => {
  const ids = new Set(teamIds.value)
  const baseline = { ...state, disciples: { ...state.disciples,
    members: state.disciples.members.filter(member => ids.has(member.id)).map(member => ({ ...member,
      talents: (member.talents || []).filter(entry => !['huntSuccess', 'huntYield'].includes(TALENT_MAP[entry.id]?.category)),
    })),
  } }
  return huntPreview(baseline, derived, fieldId.value, teamIds.value)
})
const departCheck = computed(() => canDepart(state, derived, fieldId.value, teamIds.value))
const cost = computed(() => huntCost(derived))
const lastOutcome = computed(() => state.hunting.lastOutcome)
const interval = computed(() => settings.value.autoIntervalSeconds || HUNT.AUTO_INTERVAL_DEFAULT)
const remain = computed(() => Math.max(0, interval.value - (settings.value.elapsedSeconds || 0)))
const expectedGainRows = computed(() => Object.entries(preview.value?.expectedGains || {})
  .map(([res, amount]) => ({ res, name: resourceName(res), text: fmtFixed(amount),
    bonus: fmtFixed(amount.minus(baselinePreview.value?.expectedGains?.[res] ?? ZERO)),
  })))
const lastGainRows = computed(() => Object.entries(lastOutcome.value?.gains || {})
  .map(([res, amount]) => ({ res, name: resourceName(res), text: fmtAmount(amount), positive: moneyGt(amount, ZERO) })))
const lastGainAny = computed(() => lastGainRows.value.some(row => row.positive))

function toggleMember(id) {
  const cur = new Set(selectedIds.value)
  if (cur.has(id)) cur.delete(id)
  else if (cur.size < HUNT.TEAM_MAX) cur.add(id)
  actions.huntSetTeam([...cur])
}

function selectField(id) {
  actions.huntSetField(id)
}

function setInterval(value) {
  actions.huntSetAutoInterval(Number(value))
}
</script>

<template>
  <div class="box">
    <div class="box-head">
      <HoverTip label="妖兽猎杀"><template #tip>
          <p>可选择有猎杀天赋的弟子参与，普通弟子自动补足至多 {{ HUNT.TEAM_MAX }} 人；每次消耗 {{ cost }} 枚信符，不占用岗位、不改变生产。</p>
          <p>自动重复按固定间隔执行；间隔只改变频率，不改变单次奖励。</p>
          <p>信符与外交共用：每回互市消耗 {{ DIPLOMACY.WARRANT_COST }} 枚。</p>
          <p>兽材按整数入库，不足 1 的部分跨次累计。</p>
        </template></HoverTip>
      <span class="hint">首轮只开放山麓；来袭关联尚未启用</span>
    </div>
    <div class="box-body">
      <div v-if="!unlocked" class="empty">
        尚未开放猎杀：需掌握《山野猎法》，并启用执符堂（筑基期）。
      </div>
      <template v-else>
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

        <div class="box-sub">猎杀加成（已选 {{ selectedIds.length }} / {{ HUNT.TEAM_MAX }}）</div>
        <p class="small dim">仅列出有猎杀天赋的弟子。普通弟子自动补位，未勾选的加成弟子不参与。</p>
        <div v-if="!members.length" class="small dim">暂无有猎杀加成的弟子，仍可由普通弟子猎杀。</div>
        <div v-else class="hunt-members">
          <label v-for="m in members" :key="m.id" class="hunt-member" :class="{ on: m.selected }">
            <input type="checkbox" :checked="m.selected" :disabled="!m.selected && selectedIds.length >= HUNT.TEAM_MAX" @change="toggleMember(m.id)">
            <span>{{ m.name }}</span>
            <span class="dim">{{ REALMS[m.realm]?.name || '凡体' }}</span>
            <span v-if="m.successBonus > 0">准头 +{{ fmtFixed(m.successBonus * 100, 0) }} 个百分点</span>
            <span v-if="m.yieldBonus > 0">收获 +{{ fmtPercent(m.yieldBonus) }}</span>
          </label>
        </div>

        <div v-if="selectedRows.length" class="hunt-bonus-results">
          <div v-for="row in selectedRows" :key="row.id" class="small">
            {{ row.name }}：实际成功率 {{ fmtPercent(row.p, 1) }} · 收获倍率 ×{{ fmtFixed(row.y) }}
          </div>
        </div>

        <table v-if="preview" class="grid">
          <tbody>
            <tr>
              <td class="dim nowrap">参与人数</td>
              <td class="num" colspan="3">{{ teamIds.length }} 人（加成弟子 {{ selectedIds.length }} 人，普通弟子 {{ teamIds.length - selectedIds.length }} 人）</td>
            </tr>
            <tr>
              <td class="dim nowrap">单次费用</td>
              <td class="num">{{ cost }} 信符</td>
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
            <tr v-if="selectedRows.length">
              <td class="dim nowrap">
                <HoverTip label="天赋额外收获"><template #tip>与相同阵容不计个人猎杀天赋时比较，已计入成功率上限。</template></HoverTip>
              </td>
              <td class="num" colspan="3">
                <span v-for="row in expectedGainRows" :key="row.res" style="margin-right: 12px">{{ row.name }} +{{ row.bonus }}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="hunt-actions">
          <button class="btn primary" :disabled="!departCheck.ok" @click="actions.huntDepart(fieldId)">
            猎杀一次
          </button>
          <span v-if="!departCheck.ok" class="bad small">{{ departCheck.reason }}</span>
          <label class="small" style="margin-left: auto">
            <input type="checkbox" :checked="settings.autoRepeat" @change="actions.huntSetAutoRepeat($event.target.checked)">
            自动重复
          </label>
        </div>
        <div v-if="settings.autoRepeat" class="hunt-autocfg">
          <label class="small">每
            <select :value="interval" @change="setInterval($event.target.value)">
              <option v-for="n in [60, 120, 300, 600]" :key="n" :value="n">{{ n }} 秒</option>
            </select>
            <input type="number" min="30" max="3600" step="30" :value="interval" style="width: 5.5em" @change="setInterval($event.target.value)">
            猎杀一次
          </label>
          <span class="small dim">下次约 {{ fmtTime(remain) }} 后；失败周期跳过，不补发。</span>
        </div>
      </template>
    </div>
  </div>

  <div class="box" v-if="unlocked">
    <div class="box-head">上次猎杀</div>
    <div class="box-body">
      <div v-if="!lastOutcome" class="empty">还没有猎杀记录。</div>
      <template v-else-if="lastOutcome.cancelled">
        <div class="small dim">旧任务已迁移结算。</div>
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
        累计猎杀 {{ state.hunting.statistics.departures }} 次 ·
        完成 {{ state.hunting.statistics.completedMissions }} 次 ·
        猎杀成功 {{ state.hunting.statistics.successfulHunters }} 人次
      </div>
    </div>
  </div>
</template>

<style scoped>
.hunt-fields { display: flex; gap: 8px; flex-wrap: wrap; padding: 4px 0; }
.hunt-autocfg { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 4px 0; }
.hunt-members { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 4px 0; }
.hunt-member { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.hunt-member.on { color: #d8b98a; }
.hunt-bonus-results { display: grid; gap: 4px; padding: 8px 0; }
.hunt-actions { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
</style>
