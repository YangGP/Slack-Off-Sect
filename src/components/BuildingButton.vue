<script setup>
/**
 * 建筑按钮（方格按钮）。
 * 悬停提示排版：标题 + 描述 → 价格逐行（不足的显示「现有 / 需要（还差多久）」并标红）
 * → 「效果」分节 → 底部一行风味小字。
 */
import { computed, onBeforeUnmount } from 'vue'
import { state, derived, view, actions, highlightCost, clearHighlight } from '@/game/store'
import { buildingCost, buildingDiscounts, canAfford, buildingBoostAvailable, buildingMeta, productionStageReady } from '@/game/engine'
import { describeBuildingEffects } from '@/game/effectsText'
import { fmt, fmtRate, fmtAmount, fmtEffectPercent } from '@/game/format'
import { money } from '@/game/decimal'
import { costBlocked } from '@/game/pricing'
import { resourceName } from '@/data/resources'
import { BUILDING_FLAVOR } from '@/data/flavor'
import HoverTip from './HoverTip.vue'
import CostRows from './CostRows.vue'

const props = defineProps({
  meta: { type: Object, required: true },
})

const meta = computed(() => buildingMeta(state, props.meta.id))
const stageReady = computed(() => productionStageReady(state, props.meta.id))
function changeStage() {
  const next = entry.value.stage === 1 ? 0 : 1
  const name = next ? '灵能' : '基础'
  const first = buildingCost({ ...state, buildings: { ...state.buildings, [meta.value.id]: { count: 0, stage: next } } }, meta.value.id)
  const label = Object.entries(first).map(([id, n]) => resourceName(id) + ' ' + fmtAmount(n)).join('、')
  if (window.confirm('改为' + name + '阶段将清空本类现有' + count.value + '座，不返材料。需手动重建，首座价：' + label + '。继续？')) actions.setBuildingStage(meta.value.id, next)
}
const entry = computed(() => state.buildings[meta.value.id] || { count: 0, on: true })
const count = computed(() => entry.value.count || 0)
const enabled = computed(() => (entry.value.on === false ? 0 : count.value))
const supply = computed(() => derived.buildingSupply?.[meta.value.id] ?? 1)
const active = computed(() => enabled.value * supply.value)
const boostAvailable = computed(() => buildingBoostAvailable(state, meta.value.id))
const boostOn = computed(() => entry.value.boost === true)
const boostSupply = computed(() => derived.buildingSupply?.[meta.value.boost?.id] ?? 0)
const boostCost = computed(() => Object.entries(meta.value.boost?.upkeep || {}).map(([res, n]) => `${resourceName(res)} ${fmtAmount(money(n).times(3600))}/小时·座`).join('、'))
const hasPower = computed(() => meta.value.upkeepQi != null || meta.value.upkeepEnergy != null)
// 只有「灵气基础 / 灵能高阶」两档都有的建筑才显示档位切换；只吃灵能（如聚仙阵）或只吃灵气的没有可切档。
const hasPowerToggle = computed(() => meta.value.upkeepQi != null && meta.value.upkeepEnergy != null)
const energyReady = computed(() => !!state.upgrades.energyApplication)
const powerMode = computed(() => (
  meta.value.upkeepEnergy != null && entry.value.power === 'energy' && energyReady.value
    ? 'energy'
    : meta.value.upkeepQi == null && meta.value.upkeepEnergy != null ? 'energy' : 'qi'
))
const supplyPercent = computed(() => fmtEffectPercent(supply.value))
const throughputMult = computed(() => meta.value.throughput ? derived.globalMult : 1)
// 建筑始终一次一座（批量选择只留给炼制页）
const price = computed(() => buildingCost(state, meta.value.id, 1))
const discounts = computed(() => buildingDiscounts(state, meta.value.id))
const affordable = computed(() => canAfford(state, price.value))
/** 库存不足且费用超过仓容时，需要先扩仓。 */
const overCap = computed(() => costBlocked(state, derived, price.value))

/**
 * 效果逐条成行：**每种资源（每项效果）自己一行** ——
 * 库房这种多资源建筑以前会挤成「灵木上限 +360，灵石上限 +240…」一长串，根本读不了。
 * 每座基础值与当前合计分开显示；当前产出使用经济结算的倍率。
 */
const effectRows = computed(() => {
  const visible = new Set(view.visibleResources.value.map(resource => resource.id))
  return describeBuildingEffects(meta.value, state, derived).filter(row => row.tone !== 'unlock' && (!row.resource || visible.has(row.resource))).map((u, i) => ({
    key: `${u.label}-${i}`,
    label: u.label,
    value: u.value,
    total: u.total,
    tone: u.tone,
  }))
})
const flavor = computed(() => BUILDING_FLAVOR[meta.value.id] || '')

/**
 * 维护费逐条成行：这些建筑才有「停用」按钮，停用即停费。
 * 单价与合计都在金额域取反后交给 fmtRate，不在模板里做原生乘法。
 */
function upkeepRate(unit, activeCount = 1, mult = 1) {
  return fmtRate(money(unit).times(activeCount).times(mult).negated())
}
const upkeepRows = computed(() =>
  Object.entries(meta.value.upkeep || {}).map(([res, v]) => ({
    key: res,
    label: resourceName(res),
    unit: upkeepRate(v),
    total: enabled.value > 0 ? upkeepRate(v, active.value, throughputMult.value) : '',
  })),
)

// 持续供能档（变更 4）：默认灵气基础，可切灵能高阶（需已掌握《灵能输配》）。
const powerRow = computed(() => {
  if (!hasPower.value) return null
  const energy = powerMode.value === 'energy'
  const res = energy ? 'qiEnergy' : 'qi'
  const nominal = energy ? (meta.value.upkeepEnergy ?? 0) : (meta.value.upkeepQi ?? 0)
  const entries = derived.expenseSources?.[res] || []
  const paid = entries.filter(e => e.id === meta.value.id).reduce((total, e) => total.plus(e.value.negated()), money(0))
  const unit = active.value > 0 ? paid.div(active.value) : money(nominal)
  return {
    res,
    label: resourceName(res),
    unit: upkeepRate(unit),
    // paid 已包含实际吞吐、供给与数量，不能再次乘吞吐倍率。
    total: enabled.value > 0 ? upkeepRate(paid) : '',
  }
})

function sell() {
  if (window.confirm(`确定拆除一座${meta.value.name}吗？只返还一半材料。`)) {
    actions.sell(meta.value.id, 1)
  }
}

// 悬停时把这项花费涉及的资源在左栏高亮出来
function onTipShow() {
  highlightCost(price.value)
}

onBeforeUnmount(clearHighlight)
</script>

<template>
  <div class="build-item">
    <button v-if="stageReady || entry.stage === 1" class="side-btn" @click="changeStage">{{ entry.stage === 1 ? '退回基础' : '灵能改造' }}</button>
    <HoverTip :width="380" @show="onTipShow" @hide="clearHighlight">
      <button
        class="build-btn"
        :class="{ poor: !affordable, 'over-cap': overCap, off: entry.on === false && count > 0 }"
        @click="actions.buy(meta.id, 1)"
      >
        {{ meta.name }}<span v-if="overCap" class="cap-star" title="费用超过仓容上限，需先扩仓">*</span><template v-if="count"> ({{ count }})</template>
        <span v-if="enabled > 0 && supply < 0.999" class="small warn"> · 缺料</span>
        <span v-if="boostAvailable && boostOn && boostSupply < 0.999 && state.disciples.jobs[meta.boost.job] > 0" class="small warn"> · 注灵缺料</span>
      </button>
      <template #heading>
        {{ meta.name }}
                    <span class="tip-right">已建 {{ count }}</span>
      </template>
      <template #tip>
        <div class="tip-desc">{{ meta.desc }}</div>
        <div v-if="meta.throughput" class="small dim">当前吞吐 ×{{ fmt(derived.globalMult) }}，进料与出料同步提速；缺料时按供给运行。</div>

        <CostRows :cost="price" />
        <template v-if="meta.cost.arrayDiagram">
          <div class="tip-row"><span>道基共鸣</span><span>造价 −{{ fmtEffectPercent(discounts.permanent) }}</span></div>
          <div class="tip-row"><span>依图施工</span><span>造价 −{{ fmtEffectPercent(discounts.knowledge) }}</span></div>
          <div class="small dim">两项分别乘算，当前合计优惠{{ fmtEffectPercent(discounts.total) }}；消耗阵图后按新库存重新报价。</div>
        </template>
        <div v-if="entry.stage === 1" class="small dim">灵能阶段 · 改造清零重建；关闭仅停止运行。</div>
        <div v-if="meta.secondaryBase" class="tip-row"><span>每矿工每座天然灵石</span><span>{{ fmtAmount(meta.secondaryBase * 3600) }}/小时；有效矿工 {{ fmt(derived.discipleJobWeights?.miner || 0) }}</span></div>
        <div v-if="meta.nurseryCapacity" class="tip-row"><span>育草工位实际容量</span><span>{{ fmt(derived.processingCapacity?.nursery || 0) }}</span></div>

        <div class="tip-section">效果（{{ meta.effects?.storage ? '新建每座定额' : '每座基础值' }}<template v-if="count">；括号为当前合计</template><template v-else>；建成后生效</template>）</div>
        <div v-if="meta.effects?.storage" class="small dim">仓储已含针对本建筑的工艺强化与旧档保留容量；资源总仓容比例另计。</div>
        <!-- 一条效果一行：多资源的建筑（库房、谷仓…）不再挤成一长串 -->
        <div v-for="row in effectRows" :key="row.key" class="tip-row">
          <span class="k">{{ row.label }}</span>
          <span class="v" :class="row.tone">
            {{ row.value }}<template v-if="row.total && row.total !== row.value"
              >（合计 {{ row.total }}）</template
            >
          </span>
        </div>
        <template v-if="meta.boost && count && boostAvailable">
          <div class="tip-section">灵液注灵（独立增产开关）</div>
          <div class="tip-desc">每座消耗{{ boostCost }}，满供时矿工灵石采出 ×{{ meta.boost.multiplier }}；仅影响灵石采矿，基础采矿不依赖灵液。</div>
          <div class="tip-row"><span class="k">当前状态</span><span class="v">{{ !boostOn ? '已关闭，不消耗灵液' : !state.disciples.jobs[meta.boost.job] ? '无人采矿，暂不耗液' : `已开启，供给${fmtEffectPercent(boostSupply)} · 灵石采出 ×${fmt(1 + (meta.boost.multiplier - 1) * boostSupply)}` }}</span></div>
        </template>
        <template v-if="meta.upkeep || hasPower">
          <div class="tip-section">维护<template v-if="enabled > 0">（{{ enabled }} 座启用）</template></div>
          <div v-if="enabled > 0" class="tip-row">
            <span class="k">供应</span>
            <span class="v" :class="supply < 0.999 ? 'warn' : 'good'">{{ supplyPercent }} · 按供应比例发挥效果</span>
          </div>
          <!-- 动力与物料维护分开记账，一种资源一行 -->
          <div v-if="powerRow" class="tip-row">
            <span class="k">{{ powerRow.label }} 动力</span>
            <span class="v bad">
              {{ powerRow.unit }}<template v-if="powerRow.total && powerRow.total !== powerRow.unit"
                >（合计 {{ powerRow.total }}）</template
              >
            </span>
          </div>
          <div v-for="row in upkeepRows" :key="row.key" class="tip-row">
            <span class="k">{{ row.label }} 消耗</span>
            <span class="v bad">
              {{ row.unit }}<template v-if="row.total && row.total !== row.unit"
                >（合计 {{ row.total }}）</template
              >
            </span>
          </div>
          <div v-if="hasPower && enabled > 0" class="tip-row">
            <span class="k">供能档</span>
            <span class="v" :class="powerMode === 'energy' ? 'good' : 'muted'">
              {{ entry.stage === 1 ? '灵能阶段（按实际供给运行）' : powerMode === 'energy' ? '灵能高阶（主动效果 ×' + fmt(meta.powerMult || 1) + '，仓储、住额与工位容量不变）' : '灵气基础' }}
            </span>
          </div>
          <div v-if="enabled === 0" class="tip-row">
            <span class="k">当前</span>
            <span class="v warn">{{ count ? '已停用，暂不计维护费' : '尚未建造，暂不计维护费' }}</span>
          </div>
          <div class="tip-row">
            <span class="k">说明</span>
            <span class="v">带维护费或持续供能的建筑可停用 —— 停用即停费，效果也一起停；实体仓储与住房名额保留</span>
          </div>
        </template>

        <div v-if="count && entry.on === false" class="tip-row">
          <span class="k">状态</span>
          <span class="v warn">{{ meta.upkeep || hasPower ? '已停用：不出产、也不吃维护费' : '已停用：不出产，仓储与人口保留' }}</span>
        </div>

        <div v-if="flavor" class="tip-flavor">{{ flavor }}</div>
      </template>
    </HoverTip>

    <HoverTip v-if="boostAvailable" class="side-tip" :title="boostOn ? '关闭灵液注灵' : '开启灵液注灵'" :description="`${boostCost}；满供时灵石采出翻倍，缺液只减少额外增产；关闭不停止普通采矿。`">
      <button class="side-btn" :class="{ on: boostOn }" :aria-pressed="boostOn" :aria-label="boostOn ? '关闭灵液注灵' : '开启灵液注灵'" @click="actions.setBuildingBoost(meta.id, !boostOn)">{{ boostOn ? '停注' : '注灵' }}</button>
    </HoverTip>

    <!-- 灵能高阶：接入后以灵能驱动、效果 ×倍率；需先参悟《灵能输配》 -->
    <HoverTip v-if="count > 0 && hasPowerToggle && (powerMode === 'energy' || energyReady)" class="side-tip"
      :title="powerMode === 'energy' ? '改用灵气基础' : '接入灵能高阶'"
      :description="powerMode === 'energy' ? '回到灵气运行，效果份额降低。' : '以灵能驱动，效果提升；需持续供灵能，断供即降载。'">
      <button
        class="side-btn"
        :class="{ on: powerMode === 'energy' }"
        @click="actions.setBuildingPower(meta.id, powerMode === 'energy' ? 'qi' : 'energy')"
      >
        {{ powerMode === 'energy' ? '灵' : '气' }}
      </button>
    </HoverTip>

    <!-- 只有带维护费 / 持续供能的建筑能停用：停用即停费，这才是一个真选择（§5.4） -->
    <HoverTip v-if="count > 0 && (meta.upkeep || hasPower)" class="side-tip" :title="entry.on === false ? '启用建筑' : '停用建筑'" :description="entry.on === false ? '重新启用，恢复维护费与建筑效果。' : '停用后省下维护费，建筑效果同时停止。'">
      <button
        class="side-btn"
        :class="{ on: entry.on === false }"
        @click="actions.toggle(meta.id)"
      >
        {{ entry.on === false ? '启' : '停' }}
      </button>
    </HoverTip>
    <HoverTip v-if="count > 0" class="side-tip" title="出售建筑" description="拆除一座，返还一半材料。">
      <button class="side-btn danger" @click="sell">
        售
      </button>
    </HoverTip>
  </div>
</template>
