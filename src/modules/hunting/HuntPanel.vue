<script setup>
/**
 * 猎杀页：执符使开符 → 选猎场 → 自动组队出征 → 归队取兽材。
 * 信符与宗门外交共用同一池子（见外交页）：备猎与互市抢同一份凭信。
 * v0.421 起不再逐人手选：出征按「钉选必入 → 猎杀天赋 → 闲散 → 在岗」自动选队，
 * 猎杀天赋弟子单列「优先人选」供钉选；自动重复每趟重新选队。
 * 首轮只开放山麓；妖兽来袭关联与生态字段关闭（仅记统计）。
 * 本组件属于「妖兽猎杀」可选模块，由 src/modules/hunting/ui.js 导出。
 */
import { computed } from 'vue'
import { state, derived, view, actions } from '@/game/store'
import { HUNT, HUNT_FIELDS, HUNT_FIELD_MAP } from './data.js'
import { DIPLOMACY } from '@/modules/diplomacy/data.js'
import { REALMS } from '@/data/realms'
import { resourceName } from '@/data/resources'
import { canDepart, huntPreview, autoPickTeam } from '@/game/engine'
import { TALENT_MAP, talentValue, hasHuntTalent } from '@/data/talents'
import { ZERO, moneyGt } from '@/game/decimal'
import { fmtAmount, fmtFixed, fmtPercent, fmtTime } from '@/game/format'
import HoverTip from '@/components/HoverTip.vue'

const fieldId = computed(() => state.hunting.settings.selectedFieldId)
const field = computed(() => HUNT_FIELD_MAP[fieldId.value] || HUNT_FIELDS[0])
const unlocked = computed(() => state.upgrades.wildHunting && state.buildings.huntingCamp?.on)
const mission = computed(() => view.huntMission.value)

/** 钉选名单（优先人选）：自动组队时必入。 */
const pinnedIds = computed(() => {
  const existing = new Set(state.disciples.members.map(member => member.id))
  return (state.hunting.settings.teamIds || []).filter(id => existing.has(id))
})
const pinnedSet = computed(() => new Set(pinnedIds.value))
const autoSize = computed(() => state.hunting.settings.autoTeamSize ?? HUNT.TEAM_MAX)

/** 本次出征的自动选队结果与预览（钉选必入、天赋与闲散优先）。 */
const autoIds = computed(() => (mission.value ? [] : autoPickTeam(state, derived, fieldId.value)))
const preview = computed(() => huntPreview(state, derived, fieldId.value, autoIds.value))
const previewRows = computed(() => preview.value?.rows || [])
const departCheck = computed(() => canDepart(state, derived, fieldId.value, autoIds.value))

/** 猎杀天赋及所有已钉选弟子均可管理，兼容旧档中无猎杀天赋的名单。 */
const priorityMembers = computed(() => (state.disciples?.members || [])
  .filter(m => hasHuntTalent(m) || pinnedSet.value.has(m.id))
  .map(m => ({
    ...m,
    huntText: (m.talents || [])
      .map(entry => {
        const meta = TALENT_MAP[entry?.id]
        if (!meta || (meta.category !== 'huntSuccess' && meta.category !== 'huntYield')) return null
        const value = Math.round(talentValue(meta, entry.level || 1) * 100)
        return `${meta.name}（${meta.category === 'huntSuccess' ? `准头 +${value}` : `收获 +${value}%`}）`
      })
      .filter(Boolean)
      .join('、'),
  })))

function togglePin(id) {
  const cur = new Set(pinnedIds.value)
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
          <p>执符使在执符堂开具信符，每趟出征消耗 {{ HUNT.WARRANT_COST }} 枚。选定猎场后自动组队入山，归队后获得兽材。</p>
          <p>自动选队：钉选必入，持猎杀天赋与闲散弟子优先，最多按人数上限挑选。</p>
          <p>信符与宗门外交共用：每回互市消耗 {{ DIPLOMACY.WARRANT_COST }} 枚，两边抢同一份凭信。</p>
          <p>出征期间弟子停止原岗位，但仍修炼、消耗口粮；不能被转岗、逐出或再次派出。</p>
          <p>兽材按整数入库，不足 1 的部分跨任务累计，不丢失。</p>
        </template></HoverTip>
      <span class="hint">首轮只开放山麓；来袭关联尚未启用</span>
    </div>
    <div class="box-body">
      <div v-if="!unlocked" class="empty">
        尚未开放猎杀：需掌握《山野猎法》，并启用执符堂（筑基期）。
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

        <!-- 自动组队配置 -->
        <div class="box-sub">自动组队（钉选必入 · 天赋与闲散优先）</div>
        <div class="hunt-autocfg">
          <label class="small">人数上限
            <select aria-label="自动组队人数上限" :value="autoSize" @change="actions.huntSetAutoTeamSize(Number($event.target.value))">
              <option v-for="n in HUNT.TEAM_MAX" :key="n" :value="n">{{ n }} 人</option>
            </select>
          </label>
          <span class="small dim">每趟出征自动挑选，无需手选；钉选人数可顶破上限。</span>
        </div>

        <!-- 优先人选：猎杀天赋弟子 -->
        <div class="box-sub">优先人选（猎杀天赋及已钉选弟子，勾选即钉选必入）</div>
        <div v-if="!priorityMembers.length" class="small dim" style="padding: 4px 0">
          门中暂无猎杀天赋弟子：出征时按期望贡献自动选队。
        </div>
        <div v-else class="hunt-members">
          <label
            v-for="m in priorityMembers"
            :key="m.id"
            class="hunt-member"
            :class="{ on: pinnedSet.has(m.id), dim: m.onMission }"
          >
            <input type="checkbox" :checked="pinnedSet.has(m.id)" @change="togglePin(m.id)">
            <span>{{ m.name }}</span>
            <span class="dim">{{ REALMS[m.realm]?.name || '凡体' }}</span>
            <span class="talent">{{ m.huntText }}</span>
            <span v-if="m.onMission" class="dim">出征中</span>
          </label>
        </div>

        <!-- 自动选队预览 -->
        <div class="box-sub">本次自动选队（{{ previewRows.length }} 人）</div>
        <div v-if="!previewRows.length" class="small warn">没有可出征的弟子（全员已在出征中）。</div>
        <div v-else class="hunt-members">
          <span v-for="r in previewRows" :key="r.id" class="hunt-member on">
            <span>{{ r.name }}</span>
            <span class="dim">{{ REALMS[r.realm]?.name || '凡体' }}</span>
            <span class="dim">效率 ×{{ r.A.toFixed(2) }}</span>
            <span class="dim">成功率 {{ fmtPercent(r.p) }}</span>
            <span v-if="r.y > 1" class="dim">收获 ×{{ r.y.toFixed(2) }}</span>
            <span v-if="pinnedSet.has(r.id)" class="pin-mark">钉</span>
          </span>
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
          <button class="btn primary" :disabled="!departCheck.ok" @click="actions.huntDepart(fieldId)">
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
.hunt-autocfg {
  display: flex;
  align-items: center;
  gap: 10px;
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
.hunt-member.dim {
  opacity: 0.55;
}
.hunt-member .talent {
  color: #9fc28a;
}
.hunt-member .pin-mark {
  border: 1px solid #d8b98a;
  border-radius: 3px;
  padding: 0 3px;
  font-size: 10px;
  line-height: 14px;
}
.hunt-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}
</style>
