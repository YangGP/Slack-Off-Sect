<script setup>
/** 完整炼制页与左栏快捷炼制共用同一套操作、状态和悬停明细。 */
import { computed, reactive } from 'vue'
import { state, derived, actions, highlightCost, clearHighlight } from '@/game/store'
import { CRAFTS, ADVANCED_CRAFT_OUTPUTS, craftCost } from '@/data/crafts'
import { PROCESSING_STATIONS } from '@/data/industry'
import { isCraftUnlocked, autoCraftStatus, maxCraftableMoney, craftYield, craftTarget, isProgressionVisible, isCostRevealed, processingPlan, processingBottleneck } from '@/game/engine'
import { describeNeeds } from '@/game/effectsText'
import { fmt, fmtPercent, fmtStock, fmtCost } from '@/game/format'
import { ZERO, MONEY_INFINITY, money, moneyGte, moneyGt, moneyLt, moneySum, moneyToCount, moneyToRatio } from '@/game/decimal'
import { enough as enoughOf } from '@/game/pricing'
import { resourceName } from '@/data/resources'
import { CONFIG } from '@/data/config'
import { CALENDAR } from '@/data/calendar'
import HoverTip from './HoverTip.vue'
import CostRows from './CostRows.vue'
import CraftSpeedSelect from './CraftSpeedSelect.vue'
import StableSelect from './StableSelect.vue'

const props = defineProps({ compact: Boolean })
const FILTERS = [{ id: 'all', name: '全部' }, { id: 'basic', name: '基础' }, { id: 'advanced', name: '进阶' }, { id: 'auto', name: '已选自动' }]
const filter = computed(() => state.ui.craftFilter || 'all')
const modeOptions = computed(() => [{ value: 'normal', label: '普通' },
  ...(derived.autoCraftSpeedUnlocked ? [{ value: 'overload', label: '灵气超载' }] : []),
  ...(derived.energyCraftUnlocked ? [{ value: 'energy', label: '灵能驱动' }] : [])])
const reserveOptions = [0, 10, 20, 30, 50].map(value => ({ value, label: `${value}% 仓储` }))
const priorityOptions = computed(() => unlockedRecipes.value.map(recipe => ({ value: recipe.id, label: recipe.name })))
// 库存每帧刷新；编辑中的草稿不能被尚未提交的库存目标覆盖。
const targetDrafts = reactive({})
const reserveDrafts = reactive({})
const weightDrafts = reactive({})
const plan = computed(() => processingPlan(state, derived))
const stationRows = computed(() => PROCESSING_STATIONS.map(station => {
  const lines = Object.values(plan.value).filter(line => line.station === station.id)
  const first = lines[0]
  return {
    ...station,
    capacity: derived.processingCapacity[station.id] || 0,
    used: lines.reduce((sum, line) => sum + line.work, 0),
    boost: first?.boost || 0,
    mode: first?.mode || 'normal',
    powerReason: first?.powerReason || '',
    // 动力消耗是金额：逐条求和走 moneySum，不能用原生加法。
    drain: moneySum(lines.flatMap(line => Object.values(line.powerDrain))),
  }
}).filter(station => station.capacity > 0 || allRows.value.some(row => row.autoStatus.line?.station === station.id)))

/** 每秒金额 → 每分钟文本；出项（负数）取正后另走 expensePerMinute。 */
function perMinute(value) {
  return fmt(money(value ?? ZERO).times(60))
}
function expensePerMinute(value) {
  return fmt(money(value ?? ZERO).negated().times(60))
}
/** 金额 × 每分钟次数（自动产线的投入展示） */
function perMinuteCost(value, perMinuteCount) {
  return fmt(money(value).times(perMinuteCount))
}
/** 制作进度是金额域的小数余量，转百分比前先夹到 [0,1] */
function progressPercent(value) {
  return fmtPercent(moneyToRatio(value ?? ZERO))
}
/** 成品是否已满仓（上限可能是 MONEY_INFINITY 哨兵） */
function outputFull(row) {
  return moneyGte(row.have, row.max)
}
/** 这一份产出是否因加成而超过配方标称值 */
function yieldBonus(row) {
  return moneyGt(row.yield, row.meta.amount)
}
/** 库存目标是金额（整数，不封顶安全整数）：输入框里写普通整数串或科学计数法，不能写 k/m 缩写 */
function targetText(id) {
  return craftTarget(state, derived, id).toString()
}
function targetLabel(id) {
  const target = craftTarget(state, derived, id)
  return target.isZero() ? '不限' : fmtStock(target)
}
/** 逐项材料保留量（金额）在输入框里的字符串形态；新档由初始状态写入建议值。 */
function reserveText(id) {
  return (state.settings.craftReserves?.[id] ?? ZERO).toString()
}

function updateWeight(id, event) {
  actions.setCraftWeight(id, event.target.value)
  delete weightDrafts[id]
  event.target.value = String(state.settings.craftWeights[id] || 1)
}

/** 批量快捷：按「材料能做出的份数」取比例 */
const BATCHES = [
  { frac: 0.25, label: '¼料' },
  { frac: 0.5, label: '½料' },
  { frac: 1, label: '全部' },
]

const unlockedRecipes = computed(() => CRAFTS.filter(c => isCraftUnlocked(state, c)))
const allRows = computed(() =>
  unlockedRecipes.value.filter(c => !props.compact || state.settings.quickCrafts.includes(c.id)).map((c) => {
    // 份数是金额：按钮可用性与「¼料 / ½料 / 全部」都用完整份数，不截成安全整数。
    const canMakeMoney = maxCraftableMoney(state, derived, c.id)
    const canMake = moneyToCount(canMakeMoney)
    const autoStatus = autoCraftStatus(state, derived, c.id, plan.value)
    return {
      meta: c,
      cost: craftCost(derived, c),
      yield: craftYield(derived, c),
      affordable: canMake >= 1,
      progress: state.craftProgress[c.id] ?? ZERO,
      auto: !!state.autoCraft[c.id],
      have: state.resources[c.out] ?? ZERO,
      max: derived.max[c.out] ?? MONEY_INFINITY,
      autoStatus,
      batches: BATCHES.map((b) => ({ ...b, count: canMakeMoney.times(b.frac).floor() })),
    }
  }),
)

const allAuto = computed(() => allRows.value.length > 0 && allRows.value.every(row => row.auto))
const reserveResources = computed(() => [...new Set(allRows.value.flatMap(row => Object.keys(row.meta.cost)))]
  .filter(id => state.seen[id]))

function updateReserve(id, event) {
  // 保留量是金额：输入框只把原始字符串交出去，由 store 按金额域解码校验。
  actions.setSetting('craftReserves', { ...state.settings.craftReserves, [id]: event.target.value })
  delete reserveDrafts[id]
  event.target.value = reserveText(id)
}
const someAuto = computed(() => allRows.value.some(row => row.auto))

const rows = computed(() => {
  // 30% 峰值露出只约束完整炼制页；左栏快捷入口是玩家已固定的配方，不能因为还没见过费用资源就整块消失。
  if (props.compact) return allRows.value
  const revealed = allRows.value.filter(row => isCostRevealed(state, row.meta.cost))
  return revealed.filter(row => filter.value === 'auto' ? row.auto : filter.value === 'basic' ? !ADVANCED_CRAFT_OUTPUTS.includes(row.meta.out) : filter.value === 'advanced' ? ADVANCED_CRAFT_OUTPUTS.includes(row.meta.out) : true)
})

// 完整页才显示瓶颈；快捷栏不计算，同一行的原因和缺口共享一次结果。
const bottlenecks = computed(() => Object.fromEntries(rows.value.filter(row => row.autoStatus.line)
  .map(row => [row.meta.id, processingBottleneck(state, derived, row.meta.id, plan.value, row.autoStatus)])))

const locked = computed(() =>
  CRAFTS.filter((c) => !isCraftUnlocked(state, c) && isProgressionVisible(state, c.needs, c.cost)).map((c) => ({
    meta: c,
    needs: describeNeeds(c.needs).join('，'),
  })),
)

function updateTarget(id, event) {
  // 库存目标是金额：输入框交出字符串，setCraftTarget 自己按金额域校验并转整数。
  actions.setCraftTarget(id, event.target.value)
  delete targetDrafts[id]
  event.target.value = targetText(id)
}
function updateQuick(id, event) {
  actions.toggleQuickCraft(id)
  event.target.checked = state.settings.quickCrafts.includes(id)
}
const condenseStatus = computed(() => {
  if (!state.settings.autoCraftOn) return '凝灵诀 · 总开关已暂停'
  if (!state.upgrades.qiLiquid) return '凝灵诀 · 需凝气化液'
  const liquid = state.resources.spiritLiquid ?? ZERO
  const target = craftTarget(state, derived, 'condenseLiquid')
  if (target.gt(0) && moneyGte(liquid, target)) return '凝灵诀 · 目标已达'
  if (moneyGte(liquid, derived.max.spiritLiquid ?? MONEY_INFINITY)) return '凝灵诀 · 灵液满仓'
  const qiCost = craftCost(derived, CRAFTS.find(c => c.id === 'condenseLiquid')).qi
  if (moneyLt(state.resources.qi ?? ZERO, qiCost ?? ZERO)) return '凝灵诀 · 缺灵气暂停'
  return '凝灵诀 · 节气满仓自凝灵液'
})
</script>

<template>
  <div class="box" :class="compact ? 'craft-quick' : 'craft-full'">
    <div class="box-head">
      <HoverTip :label="compact ? '快捷炼制' : '炼制'"><template #tip>
          <p>手动制作与批量按钮立即扣料并合成。自动制作需参悟《心有灵犀》或取得首颗道果；勾选配方后由总开关控制。快捷配方数量不限。</p>
          <p>金丹起，自动产线共用专业设施容量；扩建增加工位，节料技艺减少每份投入，小数收益持续累积。</p>
          <p>各配方可单独选择自动速限。实际速度受共享工位容量约束，提高速限会增加每分钟耗料，每份收益不变。参悟《疾炼法》解锁速限调整。</p>
          <p>分配权重越高，工位紧张时获得的容量越多；达标、满仓或缺料会释放容量，空闲容量自动分给其他产线。手动制作与节气满仓凝液不占常驻工位。</p>
          <p>库存达到目标后暂停，使用成品后自动补回；0表示不限。手动制作不受目标限制。旧存档的未完成订单继续加工，也可暂停或取消。</p>
          <p>新档默认保留知识中间产物：道札 20、道论 2、灵纸 10，避免顶层配方把上游抽干；旧档保持原值，可在逐项保留中改成其他数量（0 表示不保留）。</p>
        </template></HoverTip><span v-if="!compact" class="hint">通用制作加成 +{{ fmtPercent(derived.craftBonus) }}</span>
      <button v-if="compact" class="craft-open" @click="actions.setTab('craft')">全部配方 →</button>
    </div>
    <div class="box-body">
      <div v-if="!compact" class="craft-settings small">
        <label class="sw"><input type="checkbox" :checked="state.settings.autoCraftOn" @change="actions.setSetting('autoCraftOn', $event.target.checked)" />自动制作总开关</label>
        <HoverTip title="全部自动" description="勾选全部已解锁配方，取消勾选则清除全部自动选择；不受筛选影响，总开关保持不变。">
          <label class="sw">
            <input type="checkbox" aria-label="全部自动" :checked="allAuto" :indeterminate.prop="someAuto && !allAuto" :disabled="!derived.autoCraftUnlocked" @change="actions.setAllAutoCraft($event.target.checked)" />全部自动
          </label>
        </HoverTip>
        <span class="dim">已解锁 {{ allRows.length }} / {{ CRAFTS.length }} 个配方</span>
      </div>
      <div v-if="!compact" class="small dim">当前境界加工速度 ×{{ fmt(derived.craftSpeed) }}</div>
      <details v-if="!compact && derived.industrial" class="processing-overview small" aria-label="加工工位容量">
        <summary>加工工位与动力</summary>
        <div v-for="station in stationRows" :key="station.id">
          <span>{{ station.name }}</span>
          <span :class="station.capacity > 0 ? 'dim' : 'warn'">使用 {{ fmt(station.used) }} / {{ fmt(station.capacity + station.boost) }} 容量<span v-if="station.boost">（动力增加 {{ fmt(station.boost) }}）</span></span>
          <label v-if="derived.autoCraftSpeedUnlocked || derived.energyCraftUnlocked">驱动
            <StableSelect :label="`${station.name}驱动方式`" :model-value="station.mode" :options="modeOptions" @update:model-value="actions.setProcessingMode(station.id, $event)" />
          </label>
          <span v-if="!station.drain.isZero()" class="dim">动力消耗 {{ perMinute(station.drain) }} {{ state.settings.processingModes[station.id] === 'energy' ? '灵能' : '灵气' }}/分</span>
          <span v-if="station.mode !== 'normal'" class="dim">{{ station.powerReason }}<template v-if="!station.boost"> · 普通加工</template></span>
        </div>
        <div>
          <HoverTip label="动力与冷却"><template #tip>
              <p>普通工位自然散热，晶核阵提供冷却回路；《冷凝换热》提升回路容量。</p>
              <p>超载与灵能驱动最多增加一倍基础容量，共用冷却回路；仅额外加工耗动力，每容量秒耗10灵气或0.1灵能。提高自动速限才能使用额外容量。</p>
              <p>缺料、仓满或负荷低于基础容量时不耗加工动力；灵能枢另有维持费。</p>
            </template></HoverTip>
          <span class="dim">冷却容量 {{ fmt(derived.processingCoolingCapacity) }} · 灵能供能容量 {{ fmt(derived.processingPowerCapacity) }}</span>
        </div>
      </details>
      <div v-if="!compact && state.buildings.polarizeArray?.count" class="processing-overview small" aria-label="双极供料状态">
        <div><HoverTip label="双极分流"><template #tip><p>正负灵子同时分流，任一侧满仓时只补下游实际用量；断供则降载。</p></template></HoverTip> · 负荷 {{ fmtPercent(derived.buildingSupply.polarizeArray || 0) }}</div>
        <div v-for="id in ['yangParticle', 'yinParticle', 'qiEnergy']" :key="id"><span>{{ resourceName(id) }} {{ fmtStock(state.resources[id]) }} / {{ fmtStock(derived.max[id]) }}</span><span class="dim">产出 {{ perMinute(derived.rates[id]) }}/分 · 设施消耗 {{ expensePerMinute(derived.expense[id]) }}/分</span></div>
      </div>
      <div v-if="!compact && derived.autoCondenseLiquidUnlocked && !state.upgrades.qiLiquid" class="small dim">凝灵诀 · 需凝气化液</div>
      <p v-if="!compact && derived.craftTargetsUnlocked" class="small dim">加工品无仓容上限。设置库存目标可让自动炼制达标暂停、消耗后补回；0表示持续加工。</p>
      <div v-if="!compact && derived.craftTargetsUnlocked" class="small craft-settings">
        <div class="good">
          <HoverTip :label="derived.daoAutomation ? '道果统筹' : derived.autoCraftUnlocked ? '百工统筹' : '凝灵保留'"><template #tip>
              <p>优先加工指定配方，自动炼制遵守材料保留量。首颗道果让重修时即可自动炼制。</p>
              <p v-if="derived.daoAutomation">保留比例仅按有限仓储上限计算，与逐项保留取较高值。加工品无仓容限制，请设置逐项保留数量及库存目标。</p>
              <p>逐项保留指定数量，扩仓不会改变保留量；0表示不保留。保留量仅约束自动炼制，手动制作可动用保留材料。</p>
            </template></HoverTip>
        </div>
        <label v-if="derived.daoAutomation">材料保留
          <StableSelect label="自动炼制材料保留" :model-value="state.settings.craftReservePercent" :options="reserveOptions" @update:model-value="actions.setSetting('craftReservePercent', $event)" />
        </label>
        <label v-if="derived.autoCraftUnlocked">优先
          <StableSelect label="优先配方" :model-value="state.settings.autoCraftPriority" :options="priorityOptions" @update:model-value="actions.setSetting('autoCraftPriority', $event)" />
        </label>
        <details>
          <summary>逐项保留材料</summary>
          <label v-for="id in reserveResources" :key="id">{{ resourceName(id) }}
            <input type="number" min="0" step="any" :aria-label="`${resourceName(id)}保留数量`"
              :value="reserveDrafts[id] ?? reserveText(id)"
              @input="reserveDrafts[id] = $event.target.value" @change="updateReserve(id, $event)" />
          </label>
        </details>
      </div>
      <div v-if="!compact" class="filters">
        <button v-for="f in FILTERS" :key="f.id" class="filter" :class="{ on: filter === f.id }" @click="state.ui.craftFilter = f.id">{{ f.name }}</button>
      </div>
      <div v-if="!rows.length" class="empty">{{ compact ? '前往炼制页选择快捷配方。' : '此筛选下没有可用配方。' }}</div>

      <HoverTip
        v-for="row in rows"
        :key="row.meta.id"
        tag="div"
        class="craft-row"
        :data-craft="row.meta.id"
        :width="330"
        @show="highlightCost(row.cost)"
        @hide="clearHighlight"
      >
        <div v-if="!compact" class="craft-line craft-heading">
          <span class="craft-name">{{ row.meta.name }}</span>
          <span class="have">{{ resourceName(row.meta.out) }} {{ fmtStock(row.have) }}<template v-if="!compact"> / {{ fmtStock(row.max) }}</template></span>
          <label v-if="!compact" class="craft-pin small"><input type="checkbox" :checked="state.settings.quickCrafts.includes(row.meta.id)" :aria-label="`${row.meta.name}快捷炼制`" @change="updateQuick(row.meta.id, $event)" />快捷</label>
        </div>
        <div v-if="!compact" class="craft-cost small">
          <template v-for="(amount, res, index) in row.cost" :key="res"><span v-if="index" class="dim"> + </span><span :class="{ bad: !enoughOf(state, res, amount) }">{{ resourceName(res) }} {{ fmtCost(amount) }}</span></template>
          <span class="dim"> → </span><span class="good">{{ resourceName(row.meta.out) }} {{ fmt(row.yield) }}</span>
          <span v-if="derived.craftBonusByResource[row.meta.out]" class="dim"> · 专业加成 +{{ fmtPercent(derived.craftBonusByResource[row.meta.out]) }}</span>
        </div>
        <details v-if="!compact && row.autoStatus.line" class="craft-detail small">
          <summary>加工明细</summary>
          <div class="processing-line" :data-processing="row.meta.id">
          <span>{{ row.autoStatus.line.name }} · 容量分配 {{ fmtPercent(row.autoStatus.line.share) }}</span>
          <span :class="row.autoStatus.on && !row.autoStatus.ready ? 'warn' : 'dim'">{{ row.autoStatus.on ? (row.autoStatus.ready ? '运行中' : row.autoStatus.reason) : '自动未启用' }}</span>
          <span>当前节拍产出 {{ fmt(row.autoStatus.outputPerMinute) }} {{ resourceName(row.meta.out) }}/分</span>
          <span class="dim">投入：<template v-for="(amount, res, index) in row.cost" :key="res"><template v-if="index">、</template>{{ resourceName(res) }} {{ perMinuteCost(amount, row.autoStatus.perMinute) }}/分</template></span>
          <span class="dim">瓶颈：{{ bottlenecks[row.meta.id].reason }}</span>
          <span v-if="row.autoStatus.on && row.autoStatus.ready && bottlenecks[row.meta.id].inputs.length" class="dim">供料缺口：<template v-for="(input, index) in bottlenecks[row.meta.id].inputs" :key="input.res"><template v-if="index">；</template>{{ resourceName(input.res) }} {{ perMinute(input.deficit) }}/分，库存约 {{ fmt(input.seconds / 60) }} 分</template></span>
          </div>
        </details>
        <div v-if="!compact" class="craft-status small">
          <span v-if="row.autoStatus.on && row.autoStatus.ready" class="good">
            {{ row.autoStatus.orderRemaining && !row.autoStatus.orderPaused ? '订单加工中' : '自动中' }} · 下一份 {{ row.autoStatus.wait.toFixed(1) }}秒
          </span>
          <span v-else-if="row.autoStatus.on" class="small warn">{{ row.autoStatus.reason }}</span>
          <span
            v-else-if="row.meta.id === 'condenseLiquid' && derived.autoCondenseLiquidUnlocked"
            class="small dim"
          >
            {{ condenseStatus }}
          </span>
          <span v-if="!row.autoStatus.on && !(row.meta.id === 'condenseLiquid' && derived.autoCondenseLiquidUnlocked)" class="dim">{{ outputFull(row) ? '成品满仓' : row.affordable ? '可制作' : '材料不足' }}</span>
          <span v-if="!compact && yieldBonus(row)" class="dim"> · 小数累积 {{ progressPercent(row.progress) }}</span>
          <span v-if="row.autoStatus.orderRemaining" :class="row.autoStatus.orderPaused ? 'warn' : 'dim'">订单剩余 {{ row.autoStatus.orderRemaining }} 份{{ row.autoStatus.orderPaused ? ' · 已暂停' : '' }}</span>
        </div>
        <div class="craft-line craft-controls">
          <span v-if="compact" class="craft-name">{{ resourceName(row.meta.out) }}</span>
          <span v-if="compact" class="have">{{ fmtStock(row.have) }}</span>
          <button
            class="btn primary"
            :disabled="!row.affordable"
            @click="actions.craft(row.meta.id)"
          >
            制作
          </button>
          <button
            v-for="b in row.batches.filter(batch => !compact || batch.frac !== 0.25)"
            :key="b.label"
            class="btn"
            :disabled="!b.count.gt(0)"
            @click="actions.craftBatch(row.meta.id, b.frac)"
          >
            {{ b.label }}
          </button>
          <label class="sw">
            <input
              type="checkbox"
              :checked="row.auto"
              :disabled="!derived.autoCraftUnlocked"
              @change="actions.toggleAutoCraft(row.meta.id)"
            />
            自动
          </label>
          <template v-if="!compact && row.autoStatus.orderRemaining">
            <button class="btn" :aria-label="`${row.meta.name}${row.autoStatus.orderPaused ? '恢复' : '暂停'}订单`" @click="actions.manageCraftOrder(row.meta.id, row.autoStatus.orderPaused ? 'resume' : 'pause')">{{ row.autoStatus.orderPaused ? '恢复订单' : '暂停订单' }}</button>
            <button class="btn" :aria-label="`${row.meta.name}取消订单`" @click="actions.manageCraftOrder(row.meta.id, 'cancel')">取消订单</button>
          </template>
          <CraftSpeedSelect v-if="!compact && derived.autoCraftSpeedUnlocked"
            :name="row.meta.name" :speed="derived.autoCraftSpeeds[row.meta.id]"
            @change="actions.setAutoCraftSpeed(row.meta.id, $event)" />
          <label v-if="!compact && row.autoStatus.line" class="small">分配权重
            <input class="qty" type="number" min="1" max="100" step="1"
              :aria-label="`${row.meta.name}加工分配权重`" :value="weightDrafts[row.meta.id] ?? row.autoStatus.line.weight"
              @input="weightDrafts[row.meta.id] = $event.target.value" @change="updateWeight(row.meta.id, $event)" />
          </label>
          <label v-if="!compact && derived.craftTargetsUnlocked" class="small">目标
            <input class="qty" type="number" min="0" step="any" :value="targetDrafts[row.meta.id] ?? targetText(row.meta.id)"
              :aria-label="`${row.meta.name}库存目标`"
              @input="targetDrafts[row.meta.id] = $event.target.value"
              @change="updateTarget(row.meta.id, $event)" />
          </label>
        </div>

        <template #heading>
          {{ row.meta.name }}
                        <span class="tip-right">{{ resourceName(row.meta.out) }} ×{{ row.meta.amount }}</span>
        </template>
      <template #tip>
          <div class="tip-desc">{{ row.meta.desc }}</div>

          <CostRows :cost="row.cost" />

          <div class="tip-section">产出</div>
          <div class="tip-row">
            <span class="k">现有</span>
            <span class="v">{{ resourceName(row.meta.out) }} {{ fmtStock(row.have) }}</span>
          </div>
          <div class="tip-row">
            <span class="k">每次得到</span>
            <span class="v good">{{ fmt(row.yield) }}</span>
          </div>
          <div class="tip-row">
            <span class="k">这批能做</span>
            <span class="v">
              <template v-for="(b, i) in row.batches.filter(batch => !compact || batch.frac !== 0.25)" :key="b.label">
                <template v-if="i"> · </template>{{ b.label }} {{ fmtStock(b.count) }} 份
              </template>
            </span>
          </div>
          <div v-if="derived.craftBonusByResource[row.meta.out]" class="tip-row">
            <span class="k">专业制作加成</span>
            <span class="v good">+{{ fmtPercent(derived.craftBonusByResource[row.meta.out]) }}</span>
          </div>
          <div v-if="yieldBonus(row)" class="tip-row">
            <span class="k">小数累积</span>
            <span class="v">{{ progressPercent(row.progress) }}</span>
          </div>

          <div class="tip-section">自动制作</div>
          <div class="craft-auto-tip">
            <div v-if="compact" class="tip-row">
              <span class="k">状态</span>
              <span class="v" :class="row.autoStatus.on && !row.autoStatus.ready ? 'warn' : 'dim'">
                <template v-if="row.autoStatus.on">{{ row.autoStatus.ready ? '自动中 · 下一份 ' + row.autoStatus.wait.toFixed(1) + '秒' : row.autoStatus.reason }}</template>
                <template v-else-if="row.meta.id === 'condenseLiquid' && derived.autoCondenseLiquidUnlocked">{{ condenseStatus }}</template>
                <template v-else>{{ outputFull(row) ? '成品满仓' : row.affordable ? '可制作' : '材料不足' }}</template>
                <template v-if="row.autoStatus.orderRemaining"> · 订单剩余 {{ row.autoStatus.orderRemaining }} 份{{ row.autoStatus.orderPaused ? ' · 已暂停' : '' }}</template>
              </span>
            </div>
            <div v-if="row.meta.id === 'condenseLiquid' && derived.autoCondenseLiquidUnlocked" class="tip-row">
              <span class="k">凝灵诀</span>
              <span class="v">每 {{ CALENDAR.DAYS_PER_TERM * CALENDAR.DAY_SECONDS }} 秒检查满仓</span>
            </div>
            <div v-if="row.meta.id === 'condenseLiquid' && derived.autoCondenseLiquidUnlocked" class="craft-auto-note">最多转化 {{ fmtPercent(CONFIG.AUTO_CONDENSE_RATIO) }} 灵气；受总开关、库存目标、仓储与道果保留量约束，无需勾选常驻自动。</div>
            <div v-if="derived.craftTargetsUnlocked" class="tip-row">
              <span class="k">库存目标</span><span class="v">{{ targetLabel(row.meta.id) }}</span>
            </div>
            <div v-if="derived.craftTargetsUnlocked" class="craft-auto-note">达到目标后暂停，用掉后补回；0 表示不限。手动制作不受限制，一份制作的加成可能超过目标。</div>
            <div class="tip-row">
              <span class="k">节奏</span>
              <span class="v">每 {{ fmt(row.autoStatus.step) }} 秒 1 份</span>
            </div>
            <div class="tip-row">
              <span class="k">还能做</span>
              <span class="v">{{ row.autoStatus.canMake }} 份（受材料与仓储限制）</span>
            </div>
            <div v-if="row.autoStatus.on" class="tip-row">
              <span class="k">本轮已做</span>
              <span class="v good">{{ row.autoStatus.made }} 份</span>
            </div>
          </div>
          <div class="tip-flavor">
            {{
              derived.autoCraftUnlocked
                ? '勾上「自动」后一份一份常驻做下去，材料、仓储或保留量不允许时先歇着；挂着游戏时也照做（总开关在炼制页或设置页）。'
                : '参悟《心有灵犀》或取得首颗道果后才能勾选自动制作。'
            }}
          </div>
        </template>
      </HoverTip>

      <details class="fold" v-if="!compact && locked.length">
        <summary>尚未解锁的配方（{{ locked.length }} 个）</summary>
        <table class="grid">
          <tbody>
            <tr v-for="row in locked" :key="row.meta.id">
              <td class="nowrap dim"><HoverTip :label="row.meta.name" :description="row.meta.desc" /></td>
              <td class="small dim">{{ row.needs }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </div>
  </div>
</template>

<style scoped>
.craft-auto-tip {
  display: grid;
  gap: 4px;
}
.craft-auto-tip .tip-row {
  display: grid;
  grid-template-columns: 5em minmax(0, 1fr);
  align-items: baseline;
  gap: 12px;
}
.craft-auto-tip .k {
  white-space: nowrap;
}
.craft-auto-tip .v {
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.craft-auto-note {
  margin-bottom: 4px;
  color: var(--dim);
  font-size: 12px;
  line-height: 1.6;
  text-align: left;
}
</style>
