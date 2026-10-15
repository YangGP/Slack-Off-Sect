<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { state, derived, actions } from '@/game/store'
import { JOBS } from '@/data/jobs'
import { idleDisciples, nextArrivalIn, isManualRecruit, jobOutputs, discipleBreakthroughPreview, discipleDismissalPreview, discipleAidPreview, recruitPreview, canAfford } from '@/game/engine'
import { REALMS } from '@/data/realms'
import { cultivationRequired, cultivationRate, discipleFactor, discipleAnnualBaseUpkeep, discipleDismissalCost, discipleResidenceYears, discipleTrainingCost, SPIRITUAL_ROOTS, SPIRITUAL_ROOT_MAP, sortDisciples, RECRUIT_TIERS } from '@/data/disciples'
import { TALENT_MAP, TALENT_TIERS, TALENT_TIER_MAP, talentBonus, talentMatches, talentDescription } from '@/data/talents'
import { costLabel } from '@/game/pricing'
import { RESOURCE_MAP } from '@/data/resources'
import { describeNeeds } from '@/game/effectsText'
import { fmt, fmtCost, fmtRate, fmtTime } from '@/game/format'
import HabitabilityTip from './HabitabilityTip.vue'
import HoverTip from './HoverTip.vue'
import StableSelect from './StableSelect.vue'

const idle = computed(() => idleDisciples(state))
const waitNext = computed(() => nextArrivalIn(state, derived))
// 主动招募（《招贤纳士》解锁）：与自动前来互斥，见 docs/DISCIPLE-PROGRESSION.md §2.5。
const recruitManual = computed(() => isManualRecruit(state, derived))
const recruitCards = computed(() => derived.recruitModeUnlocked
  ? RECRUIT_TIERS.map(tier => recruitPreview(state, derived, tier.id))
  : [])
const jobDrafts = reactive({})
const managementOpen = ref(false)
const managementToggle = ref(null)
const managementPanel = ref(null)
async function toggleManagement() {
  managementOpen.value = !managementOpen.value
  await nextTick()
  if (managementOpen.value) managementPanel.value?.focus({ preventScroll: true })
  else managementToggle.value?.focus({ preventScroll: true })
}
const realmFilter = ref('all')
const rootFilter = ref('all')
const talentFilter = ref('all')
const trainFilter = ref('all')
const sortOrder = ref('arrival')
const page = ref(0)
const selected = ref([])
const targetRole = ref('idle')
const selectedSet = computed(() => new Set(selected.value))
const filtered = computed(() => sortDisciples(state.disciples.members.filter(member =>
  (realmFilter.value === 'all' || member.realm === Number(realmFilter.value)) &&
  (rootFilter.value === 'all' || member.spiritualRoot === rootFilter.value) &&
  (trainFilter.value === 'all' || (trainFilter.value === 'mentored' ? member.mentored === true : (member.aidBonus || 0) > 0)) &&
  talentMatches(member, talentFilter.value)), sortOrder.value, derived.trainingActive))
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 30)))
const visible = computed(() => filtered.value.slice(Math.min(page.value, pages.value - 1) * 30, (Math.min(page.value, pages.value - 1) + 1) * 30))
const selectedIds = computed(() => filtered.value.filter(member => selectedSet.value.has(member.id)).map(member => member.id))
const dismissal = computed(() => discipleDismissalPreview(state, selectedIds.value))
const filteredReady = computed(() => filtered.value.filter(member => discipleBreakthroughPreview(state, member).ready).length)
const canBatchBreakthrough = computed(() => filtered.value.some(member => selectedSet.value.has(member.id) && discipleBreakthroughPreview(state, member).ready))
const realmOptions = [{ value: 'all', label: '全部境界' }, ...REALMS.map((realm, index) => ({ value: String(index), label: realm.name }))]
const rootOptions = [{ value: 'all', label: '全部灵根' }, ...SPIRITUAL_ROOTS.map(root => ({ value: root.id, label: root.name }))]
const talentOptions = [{ value: 'all', label: '全部天赋' }, { value: 'none', label: '无天赋' },
  { value: 'cultivation', label: '修炼天赋' }, { value: 'breakthrough', label: '突破天赋' },
  { value: 'job', label: '岗位专长' }, ...JOBS.map(job => ({ value: `job:${job.id}`, label: `${job.name}专长` }))]
const trainOptions = [{ value: 'all', label: '全部培养' }, { value: 'mentored', label: '传功中' }, { value: 'aid', label: '已护道' }]
const sortOptions = [{ value: 'arrival', label: '入门先后' }, { value: 'progress', label: '进度优先' }, { value: 'rate', label: '速度优先' }]
const roleOptions = computed(previous => {
  const options = [{ value: 'idle', label: '闲散' }, ...JOBS.filter(job => derived.unlockedJobs.includes(job.id)).map(job => ({ value: job.id, label: job.name }))]
  // 派生数据每帧重新计算，但实际可用岗位未变时保留选项数组身份。
  return previous?.length === options.length && options.every((option, index) => option.value === previous[index].value) ? previous : options
})
watch([realmFilter, rootFilter, talentFilter, trainFilter], () => { page.value = 0; selected.value = [] })
watch(sortOrder, () => { page.value = 0 })
const managementRows = computed(() => visible.value.map(member => ({
  ...member, factor: discipleFactor(member, state.realm),
  jobFactor: discipleFactor(member, state.realm) * (1 + talentBonus(member, 'job')),
  talentRows: (member.talents || []).map(entry => {
    const meta = TALENT_MAP[entry.id]
    return meta ? { ...meta, level: entry.level, description: talentDescription(meta, entry.level) } : null
  }).filter(Boolean),
  talentTier: [...TALENT_TIERS].reverse().find(tier => member.talents?.some(entry => TALENT_MAP[entry.id]?.tier === tier.id))?.name,
  mentored: member.mentored === true,
  trainingCost: discipleTrainingCost(member, state.realm),
  aid: discipleAidPreview(state, member),
  rate: cultivationRate(member, derived.trainingActive), root: SPIRITUAL_ROOT_MAP[member.spiritualRoot],
  upkeep: derived.discipleWeight > 0 ? derived.upkeep * discipleFactor(member, state.realm) / derived.discipleWeight : 0,
  preview: discipleBreakthroughPreview(state, member),
  annualBaseUpkeep: discipleAnnualBaseUpkeep(member, state.realm),
  dismissalCost: discipleDismissalCost(member, state.realm),
  dismissalAffordable: Number.isSafeInteger(discipleDismissalCost(member, state.realm)) && canAfford(state, { qi: discipleDismissalCost(member, state.realm) }),
  residenceYears: discipleResidenceYears(member),
})))
function costText(cost) {
  return Object.entries(cost).map(([id, amount]) => `${RESOURCE_MAP[id].name} ${costLabel(state, derived, id, amount)}`).join('；')
}
function assignSelected() {
  actions.assignDisciples(selectedIds.value, targetRole.value === 'idle' ? null : targetRole.value)
}
async function dismiss(ids) {
  if (actions.dismissDisciples(ids).dismissed) {
    const remaining = new Set(state.disciples.members.map(member => member.id))
    selected.value = selected.value.filter(id => remaining.has(id))
    await nextTick()
    managementPanel.value?.focus({ preventScroll: true })
  }
}
function memberTip(event, type) {
  event.currentTarget.querySelector('.tip-trigger')?.dispatchEvent(new MouseEvent(type))
}

const rows = computed(() =>
  JOBS.map((job) => {
    const unlocked = derived.unlockedJobs.includes(job.id)
    const count = state.disciples.jobs[job.id] || 0
    const outputs = jobOutputs(state, job).map(({ resource, base }) => {
      const average = count > 0 ? (derived.discipleJobWeights?.[job.id] || count) / count : 1
      const perDisciple = base * average * (1 + (derived.jobRatio?.[job.id] || 0)) * derived.discipleMult * (derived.sourceFactor[resource] ?? 1)
      return { resource, name: RESOURCE_MAP[resource].name, perDisciple, total: perDisciple * count }
    })
    return {
      ...job,
      unlocked,
      count,
      outputs,
      needsText: describeNeeds(job.needs).join('，'),
    }
  }),
)

function editJob(jobId, event) {
  const value = event.target.value
  jobDrafts[jobId] = value
  // 原生增减按钮首先发 input；立即结算，避免等待 change 时被实时刷新改回。
  if (value.trim() === '') return
  const n = Number(value)
  if (Number.isFinite(n)) actions.setJob(jobId, n)
}

function commitJob(jobId, event) {
  const value = event.target.value
  if (value.trim() !== '' && Number.isFinite(Number(value))) actions.setJob(jobId, Number(value))
  delete jobDrafts[jobId]
  event.target.value = String(state.disciples.jobs[jobId] || 0)
}
</script>

<template>
  <div class="box" @keydown.esc="managementOpen && toggleManagement()">
    <div class="box-head disciple-head">
      <HoverTip v-if="!managementOpen" label="职位分配"><template #tip><p>人数来自门中弟子，闲散弟子不产出；分配岗位不影响自动修炼。</p></template></HoverTip>
      <HoverTip v-else label="弟子管理"><template #tip>
          <p>工作时也自动修炼，灵根影响修炼速度与突破成功率，修满后等待突破；目标境界不能超过宗门。</p>
          <p>天赋类型固定，修炼、岗位专长和突破效果只作用于本人。宗门每高于突破目标一境，成功率增加10个百分点，最高99%。</p>
          <p>掌握《传功授业》后可对弟子传功：持续耗灵气加速本人修炼、不停岗；也可预付个人护道材料，加成其下一次突破。</p>
          <p>突破失败消耗材料，损失20%本境修为并调息60秒。批量突破逐人扣料，材料不足即停止。</p>
          <p>宗门退境保留弟子境界，岗位加成与口粮暂按较低的宗门境界计算；宗门恢复后加成恢复。</p>
          <p>逐出费用＝当前每游戏年基础口粮×（在宗门待满的游戏年数＋1），每人向上取整。年基础口粮按当前宗门及弟子有效境界计算，不计减耗、断供、传功或历史突破费用；一年为18分钟。确认后移除个人成长与岗位，整批灵气不足则不执行。</p>
        </template></HoverTip>
      <button ref="managementToggle" class="btn" :aria-expanded="managementOpen" aria-controls="disciple-management" @click="toggleManagement">{{ managementOpen ? '收起管理' : '弟子管理' }}</button>
    </div>
    <div class="box-body disciple-content">
      <div v-if="derived.autoTalentJobsUnlocked" class="small auto-talent-jobs">
        <HoverTip title="知人善任" description="启用后持续将有岗位专长的弟子调到对应已开放岗位，包括新入门与突破后领悟专长者。无岗位专长者保持分工，出征者归队后调配；需要手动改派专长弟子时请先暂停。">
          <label class="sw"><input type="checkbox" aria-label="按天赋自动分工" :checked="state.settings.autoTalentJobs" @change="actions.setSetting('autoTalentJobs', $event.target.checked)" />按天赋自动分工</label>
        </HoverTip>
      </div>
      <div v-show="!managementOpen" class="assignment-surface">
      <div v-if="state.disciples.total > derived.maxDisciples" class="small dim">
        现有弟子超过居所容量，原有弟子与分工保留；扩建出空位后继续收徒。
      </div>
      <table class="grid job-grid">
        <thead>
          <tr>
            <th>职位</th>
            <th>人数</th>
            <th>平均每人 / 秒</th>
            <th>合计 / 秒</th>
            <th>分配</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="job in rows" :key="job.id" :class="{ off: !job.unlocked }">
            <td class="nowrap"><HoverTip :label="job.name" :description="job.desc" /></td>
            <td class="num">{{ job.count }}</td>
            <td class="num good">
              <div v-for="output in job.outputs" :key="output.resource">
                <span v-if="job.outputs.length > 1">{{ output.name }} </span>{{ fmtRate(output.perDisciple) }}
              </div>
            </td>
            <td class="num">
              <div v-for="output in job.outputs" :key="output.resource">
                <span v-if="job.outputs.length > 1">{{ output.name }} </span>{{ job.count > 0 ? fmtRate(output.total) : '—' }}
              </div>
            </td>
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
                  step="1"
                  :max="job.count + idle"
                  :aria-label="`${job.name}分配人数`"
                  :value="jobDrafts[job.id] ?? job.count"
                  @input="editJob(job.id, $event)"
                  @change="commitJob(job.id, $event)"
                  @blur="commitJob(job.id, $event)"
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
        <HoverTip title="全员休息" description="把弟子全部退回闲散。">
          <button class="btn" @click="actions.clearJobs()">全员休息</button>
        </HoverTip>
      </div>

      <div class="small dim">
        弟子总数 {{ state.disciples.total }} / {{ derived.maxDisciples }}，闲散 {{ idle }}；
        平均每人 灵气 -{{ fmt(derived.upkeep / Math.max(1, state.disciples.total)) }}/秒，
        <HabitabilityTip />。
      </div>
      <div class="small dim">
        宜居度全局倍率 ×{{ derived.habitabilityMult.toFixed(2) }}，弟子岗位倍率 ×{{ derived.discipleMult.toFixed(2) }}。
      </div>
      <div v-if="derived.leaveChance > 0" class="small bad">当前每次检查离开概率 {{ fmt(derived.leaveChance * 100) }}%。</div>
      <div class="small dim">
        <template v-if="recruitManual">主动招募模式：停用自动前来，可用下方礼聘招募弟子。</template>
        <template v-else-if="derived.leaveChance > 0">宜居度不足，改善居住环境后恢复弟子前来。</template>
        <template v-else-if="waitNext === null">居所已满，扩建居所才会再有人来。</template>
        <template v-else>下一位弟子约 {{ fmtTime(waitNext) }}后到。</template>
      </div>

      <div v-if="derived.recruitModeUnlocked" class="recruit-block">
        <div class="recruit-header">
          <span class="recruit-heading">招募方式</span>
          <div class="recruit-mode">
            <span :class="{ selected: !recruitManual }">自动前来</span>
            <button
              class="recruit-switch"
              type="button"
              role="switch"
              aria-label="主动招募"
              :aria-checked="recruitManual"
              @click="actions.setRecruitMode(recruitManual ? 'auto' : 'manual')"
            ><span class="recruit-switch-thumb" aria-hidden="true"></span></button>
            <span :class="{ selected: recruitManual }">主动招募</span>
          </div>
        </div>
        <div v-if="recruitManual" class="recruit-tiers">
          <HoverTip v-for="card in recruitCards" :key="card.tierId" :title="`礼聘·${card.tier.name}`" :description="card.tier.desc">
            <button class="btn recruit-tier" :disabled="!card.ready || !card.affordable" @click="actions.recruitDisciple(card.tierId)">
              <span class="recruit-tier-title"><span class="recruit-glyph" aria-hidden="true">{{ card.tier.glyph }}</span>{{ card.tier.name }}</span>
              <span class="recruit-tier-cost">{{ costText(card.cost) }}</span>
            </button>
            <template #tip>
              <div class="tip-row"><span class="k">起点境界</span><span class="v">{{ card.realmRangeText }}</span></div>
              <div class="tip-row"><span class="k">花费</span><span class="v" :class="card.affordable ? '' : 'bad'">{{ costText(card.cost) }}</span></div>
              <div class="tip-desc" :class="card.ready ? '' : 'bad'">{{ card.status }}</div>
              <div class="tip-flavor">档位越高，天赋品级越高、越易招到高境界起点；起点按宗门境界浮动，入宗即具境界，口粮与逐出费用随境界计。</div>
            </template>
          </HoverTip>
        </div>
      </div>

      </div>
      <div v-if="managementOpen" id="disciple-management" ref="managementPanel" class="management-surface" role="region" aria-label="弟子管理" tabindex="-1">
      <div class="management-filters" role="group" aria-label="弟子筛选与排序">
        <label class="management-field"><span>境界</span>
          <StableSelect v-model="realmFilter" label="弟子境界筛选" :options="realmOptions" />
        </label>
        <label class="management-field"><span>灵根</span>
          <StableSelect v-model="rootFilter" label="弟子灵根筛选" :options="rootOptions" />
        </label>
        <label class="management-field"><span>天赋</span>
          <StableSelect v-model="talentFilter" label="弟子天赋筛选" :options="talentOptions" />
        </label>
        <label v-if="derived.discipleTrainingUnlocked" class="management-field"><span>培养</span>
          <StableSelect v-model="trainFilter" label="弟子培养筛选" :options="trainOptions" />
        </label>
        <label class="management-field"><span>排序</span>
          <StableSelect v-model="sortOrder" label="弟子排序" :options="sortOptions" />
        </label>
      </div>
      <div class="management-selection">
        <span class="small dim">当前 {{ filtered.length }} 人 · 待突破 {{ filteredReady }} 人</span>
        <div class="management-selection-actions">
          <span class="small dim">已选 {{ selectedIds.length }} 人</span>
          <button class="btn" :disabled="!filtered.length" @click="selected = filtered.map(member => member.id)">选择本分类</button>
          <button class="btn" :disabled="!selectedIds.length" @click="selected = []">取消选择</button>
        </div>
      </div>
      <div class="management-batch" role="group" aria-label="弟子批量操作">
        <div class="management-assignment">
          <label class="management-job"><span class="small dim">岗位</span>
            <StableSelect v-model="targetRole" label="所选弟子的岗位" :options="roleOptions" />
          </label>
          <button class="btn" :disabled="!selectedIds.length" @click="assignSelected">分配所选弟子</button>
        </div>
        <div class="management-selection-actions">
          <button class="btn" :disabled="!canBatchBreakthrough" @click="actions.breakthroughDisciples(selectedIds)">所选弟子突破</button>
          <template v-if="derived.discipleTrainingUnlocked">
            <button class="btn" :disabled="!selectedIds.length" @click="actions.setMentored(selectedIds, true)">所选传功</button>
            <button class="btn" :disabled="!selectedIds.length" @click="actions.setMentored(selectedIds, false)">所选停功</button>
            <button class="btn" :disabled="!selectedIds.length" @click="actions.applyDiscipleAid(selectedIds)">所选护道</button>
          </template>
          <HoverTip title="逐出所选弟子">
            <button class="btn danger" :disabled="!dismissal.count || !dismissal.affordable" @click="dismiss(selectedIds)">逐出所选 · 灵气 {{ fmtCost(dismissal.cost.qi) }}</button>
            <template #tip>
              <div class="tip-row"><span class="k">人数</span><span class="v">{{ dismissal.count }} 人</span></div>
              <div class="tip-row"><span class="k">费用</span><span class="v" :class="{ bad: !dismissal.affordable }">{{ costLabel(state, derived, 'qi', dismissal.cost.qi) }}</span></div>
              <div class="tip-note">逐人按当前每年基础口粮×（已满年数＋1）计费、向上取整；确认后移除个人成长与岗位。</div>
            </template>
          </HoverTip>
        </div>
      </div>
      <div v-if="managementRows.length">
        <table class="grid disciple-list">
          <thead><tr><th>选择</th><th>弟子</th><th>灵根</th><th>岗位</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="member in managementRows" :key="member.id" @mouseenter="memberTip($event, 'mouseenter')" @mouseleave="memberTip($event, 'mouseleave')">
              <td><input v-model="selected" type="checkbox" :value="member.id" :aria-label="`选择弟子${member.id}`" /></td>
              <td class="nowrap">
                <HoverTip :width="360" anchor="tr">
                  <span class="disciple-name" tabindex="0" :aria-label="`${member.name}（弟子${member.id}）详情`">{{ member.name }}</span>
                  <template #heading>{{ member.name }}<span class="tip-right">#{{ member.id }} · {{ REALMS[member.realm].name }}</span></template>
                  <template #tip>
                    <div class="tip-row"><span class="k">在宗门停留</span><span class="v">已满 {{ member.residenceYears }} 年 · {{ fmtTime(member.residenceSeconds) }}</span></div>
                    <div class="tip-row"><span class="k">累计灵气消耗</span><span class="v">{{ fmt(member.totalQiConsumed) }}</span></div>
                    <div class="tip-row"><span class="k">每年基础口粮</span><span class="v">灵气 {{ fmt(member.annualBaseUpkeep) }}</span></div>
                    <div class="tip-row"><span class="k">逐出费用</span><span class="v">灵气 {{ fmtCost(member.dismissalCost) }}</span></div>
                    <div class="tip-section">修炼</div>
                    <div class="tip-row"><span class="k">灵根 / 速度</span><span class="v">{{ member.root?.name || '三灵根' }} · {{ fmt(member.rate) }}修为/秒<template v-if="member.root?.breakthrough"> · 突破 {{ member.root.breakthrough > 0 ? '+' : '' }}{{ member.root.breakthrough }}pt</template></span></div>
                    <div v-if="cultivationRequired(member.realm)" class="tip-row"><span class="k">本境修为</span><span class="v">{{ fmt(member.cultivation) }} / {{ fmt(cultivationRequired(member.realm)) }}</span></div>
                    <div class="tip-row"><span class="k">状态</span><span class="v">{{ member.preview.status }}<template v-if="member.cooldown > 0"> · 剩余{{ fmtTime(member.cooldown) }}</template><template v-else-if="member.preview.status === '修炼中'"> · 约{{ fmtTime((member.preview.required - member.cultivation) / member.rate) }}修满</template></span></div>
                    <div class="tip-section">岗位</div>
                    <div class="tip-row"><span class="k">当前岗位</span><span class="v">{{ JOBS.find(job => job.id === member.roleId)?.name || '闲散' }}</span></div>
                    <div class="tip-row"><span class="k">个人岗位系数</span><span class="v">×{{ member.jobFactor.toFixed(2) }}</span></div>
                    <div class="tip-row"><span class="k">口粮</span><span class="v">灵气 {{ fmtRate(-member.upkeep) }}</span></div>
                    <div v-if="member.realm > state.realm" class="tip-desc">宗门退境，个人境界保留；岗位系数与口粮暂按宗门境界计算。</div>
                    <div class="tip-section">天赋</div>
                    <div v-if="!member.talentRows.length" class="tip-desc">无天赋</div>
                    <template v-for="talent in member.talentRows" :key="talent.id">
                      <div class="tip-row"><span class="k">{{ talent.name }}</span><span class="v">{{ TALENT_TIER_MAP[talent.tier]?.name }}级 · Lv.{{ talent.level }}</span></div>
                      <div class="tip-desc">{{ talent.description }}<span v-if="talent.jobId && talent.jobId !== member.roleId" class="dim">（当前岗位未生效）</span></div>
                    </template>
                    <template v-if="derived.discipleTrainingUnlocked">
                      <div class="tip-section">培养</div>
                      <div class="tip-row"><span class="k">传功</span><span class="v">{{ member.mentored ? (member.trainingCost > 0 ? `灵气 -${fmt(member.trainingCost)}/秒` : '已开启 · 本境已满') : '未开启' }}</span></div>
                      <div v-if="member.aid.pending" class="tip-row"><span class="k">个人护道</span><span class="v">下次突破 +{{ fmt(member.aid.bonus * 100) }} 个百分点</span></div>
                    </template>
                    <template v-if="member.realm < REALMS.length - 1">
                      <div class="tip-section">突破</div>
                      <div class="tip-row"><span class="k">目标 / 成功率</span><span class="v">{{ REALMS[member.preview.target].name }} · {{ fmt(member.preview.chance * 100) }}%</span></div>
                      <div class="tip-desc">花费：{{ costText(member.preview.cost) }}</div>
                      <div class="tip-desc" :class="member.preview.ready && !member.preview.affordable ? 'bad' : ''">{{ member.preview.ready ? (member.preview.affordable ? '可突破' : '材料不足') : member.preview.status }}</div>
                      <div class="tip-flavor">失败消耗材料，损失20%本境修为并调息60秒。</div>
                    </template>
                  </template>
                </HoverTip>
                <div class="small dim">{{ REALMS[member.realm].name }}</div>
                <div class="small dim">{{ member.talentRows.length ? `${member.talentTier}级 · ${member.talentRows.length}条天赋` : '无天赋' }}</div>
              </td>
              <td class="nowrap">{{ member.root?.name || '三灵根' }}</td>
              <td>{{ JOBS.find(job => job.id === member.roleId)?.name || '闲散' }}</td>
              <td class="nowrap">
                <template v-if="cultivationRequired(member.realm)">
                  <span :class="member.preview.ready && !member.preview.affordable ? 'bad' : member.preview.ready ? 'good' : 'dim'">{{ member.preview.ready && !member.preview.affordable ? '材料不足' : member.preview.status }}</span>
                  <div v-if="member.preview.status === '修炼中'" class="small dim">{{ Math.floor(Math.min(1, member.cultivation / member.preview.required) * 100) }}%</div>
                  <div v-else-if="member.cooldown > 0" class="small dim">{{ fmtTime(member.cooldown) }}</div>
                </template>
                <span v-else>圆满</span>
              </td>
              <td>
                <template v-if="derived.discipleTrainingUnlocked">
                  <button class="btn" :aria-pressed="member.mentored" @click="actions.setMentored([member.id], !member.mentored)">{{ member.mentored ? '停功' : '传功' }}</button>
                  <button v-if="member.realm < REALMS.length - 1" class="btn" :disabled="member.aid.pending || !member.aid.affordable" @click="actions.applyDiscipleAid([member.id])">{{ member.aid.pending ? '已护道' : '护道' }}</button>
                </template>
                <template v-if="member.realm < REALMS.length - 1">
                  <button class="btn" :disabled="!member.preview.ready || !member.preview.affordable" @click="actions.breakthroughDisciples([member.id])">突破</button>
                </template>
                <span v-else>圆满</span>
                <button class="btn danger" :aria-label="`逐出弟子${member.id}`" :disabled="!member.dismissalAffordable" @click="dismiss([member.id])">逐出</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="small dim">此分类暂无弟子。</p>
      <div v-if="pages > 1" class="btn-row">
        <button class="btn" :disabled="page <= 0" @click="page = Math.max(0, Math.min(page, pages - 1) - 1)">上一页</button>
        <span>{{ Math.min(page, pages - 1) + 1 }} / {{ pages }} 页，每页30人</span>
        <button class="btn" :disabled="page >= pages - 1" @click="page++">下一页</button>
      </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auto-talent-jobs {
  margin-bottom: 8px;
}
.recruit-block {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--line-soft);
  background: #fcfbf8;
}
.recruit-header,
.recruit-mode,
.recruit-tier-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.recruit-header {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.recruit-heading {
  font-size: 13px;
  font-weight: 600;
}
.recruit-mode {
  font-size: 13px;
  color: var(--dim);
}
.recruit-mode .selected {
  color: var(--text);
  font-weight: 600;
}
.recruit-switch {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  width: 44px;
  height: 26px;
  padding: 3px;
  border: 1px solid var(--line-2);
  border-radius: 20px;
  background: #e5e5e5;
  cursor: pointer;
  transition: background-color 160ms ease, border-color 160ms ease;
}
.recruit-switch[aria-checked='true'] {
  background: var(--accent);
  border-color: var(--accent);
}
.recruit-switch-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--bg);
  transition: transform 160ms ease;
}
.recruit-switch[aria-checked='true'] .recruit-switch-thumb {
  transform: translateX(18px);
}
.recruit-switch:hover {
  border-color: var(--text);
}
.recruit-switch:focus-visible,
.recruit-tier:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.recruit-tiers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line-soft);
}
.recruit-tier {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 10px 12px;
  text-align: left;
  border-color: var(--line);
}
.recruit-tier:hover:not(:disabled) {
  border-color: var(--accent);
  background: #fff9f0;
}
.recruit-tier-title {
  font-size: 14px;
  font-weight: 600;
}
.recruit-glyph {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid currentColor;
  color: var(--accent);
  font-size: 12px;
}
.recruit-tier-cost {
  font-size: 12px;
  line-height: 1.6;
  color: var(--dim);
  overflow-wrap: anywhere;
}
.recruit-tier:disabled .recruit-glyph,
.recruit-tier:disabled .recruit-tier-cost {
  color: inherit;
}
@media (prefers-reduced-motion: reduce) {
  .recruit-switch,
  .recruit-switch-thumb {
    transition: none;
  }
}
.disciple-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
}
.disciple-content {
  display: grid;
  min-width: 0;
}
.assignment-surface,
.management-surface {
  grid-area: 1 / 1;
  min-width: 0;
}
.management-surface {
  position: relative;
  z-index: 1;
  background: var(--bg);
}
.management-surface:focus {
  outline: none;
}
.management-surface .btn-row {
  flex-wrap: wrap;
}
.management-filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 10px;
}
.management-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  font-size: 13px;
  color: var(--dim);
}
.management-field select {
  width: 100%;
  min-width: 0;
}
.management-selection,
.management-selection-actions,
.management-batch,
.management-assignment,
.management-job {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
}
.management-selection,
.management-batch {
  justify-content: space-between;
}
.management-selection {
  margin-bottom: 8px;
}
.management-batch {
  padding: 8px 0;
  margin-bottom: 8px;
  border-top: 1px solid var(--line-soft);
  border-bottom: 1px solid var(--line-soft);
}
.management-field select,
.management-job select,
.management-selection .btn,
.management-batch .btn {
  height: 30px;
  margin: 0;
}
.management-selection .btn,
.management-batch .btn {
  font-size: 13px;
  padding: 4px 10px;
}
@media (max-width: 479px) {
  .management-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .management-field:last-child {
    grid-column: 1 / -1;
  }
}
.disciple-name {
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
</style>
