<script setup>
/**
 * 建筑按钮（猫国式的方格按钮）。
 * 悬停提示照猫国的排版：标题 + 描述 → 价格逐行（不足的显示「现有 / 需要（还差多久）」并标红）
 * → 「效果」分节 → 底部一行风味小字。
 */
import { computed, onBeforeUnmount } from 'vue'
import { state, derived, actions, highlightCost, clearHighlight } from '@/game/store'
import { buildingCost, canAfford, maxAffordable } from '@/game/engine'
import { describeEffects, scaleEffectsForTotal, describeNeeds, describeJobEffects } from '@/game/effectsText'
import { fmt, fmtRate, fmtTime } from '@/game/format'
import { costLabel, enough as enoughOf } from '@/game/pricing'
import { RESOURCE_MAP } from '@/data/resources'
import { BUILDING_FLAVOR } from '@/data/flavor'
import HoverTip from './HoverTip.vue'

const props = defineProps({
  meta: { type: Object, required: true },
})

const entry = computed(() => state.buildings[props.meta.id] || { count: 0, on: true })
const count = computed(() => entry.value.count || 0)
const enabled = computed(() => (entry.value.on === false ? 0 : count.value))
const supply = computed(() => derived.buildingSupply?.[props.meta.id] ?? 1)
const active = computed(() => enabled.value * supply.value)
// 建筑始终一次一座（批量选择只留给炼制页）
const price = computed(() => buildingCost(state, props.meta.id, 1))
const affordable = computed(() => canAfford(state, price.value))
const maxCount = computed(() => maxAffordable(state, props.meta.id))

/**
 * 效果逐条成行：**每种资源（每项效果）自己一行** ——
 * 库房这种多资源建筑以前会挤成「灵木上限 +360，灵石上限 +240…」一长串，根本读不了。
 * 两列分别是「每座的值」和「合计值」（合计由 `scaleEffectsForTotal` 按已建 / 启用数算出）。
 */
const effectRows = computed(() => {
  // 建筑自身效果 + 职位效果：像采矿场 / 灵石矿这种「产出挂在职位上」的建筑，
  // effects 是空的，靠 describeJobEffects 从 jobs 数据补出「开放职位 / 职位副产」。
  const unit = [...describeEffects(props.meta.effects), ...describeJobEffects(props.meta.id, 1)]
  const total =
    count.value > 0
      ? [
          ...describeEffects(scaleEffectsForTotal(props.meta.effects, count.value, active.value, !!props.meta.upkeep)),
          ...describeJobEffects(props.meta.id, active.value),
        ]
      : []
  return unit.map((u, i) => ({
    key: `${u.label}-${i}`,
    label: u.label,
    value: u.value,
    total: total.find((row) => row.label === u.label)?.value || (count.value > 0 ? '0' : ''),
    tone: u.tone,
  }))
})
const needsText = computed(() => describeNeeds(props.meta.needs).join('，'))
const flavor = computed(() => BUILDING_FLAVOR[props.meta.id] || '')

/** 维护费逐条成行：这些建筑才有「停用」按钮，停用即停费 */
const upkeepRows = computed(() =>
  Object.entries(props.meta.upkeep || {}).map(([res, v]) => ({
    key: res,
    label: RESOURCE_MAP[res]?.name || res,
    unit: fmtRate(-v),
    total: enabled.value > 0 ? fmtRate(-v * active.value) : '',
  })),
)

function resName(id) {
  return RESOURCE_MAP[id]?.name || id
}

/** 够就只显示价格；不够就显示「现有 / 需要（还差多久）」——与参悟表共用同一套写法 */
function priceText(res, amount) {
  return costLabel(state, derived, res, amount)
}

function enough(res, amount) {
  return enoughOf(state, res, amount)
}

function sell() {
  if (window.confirm(`确定拆除一座${props.meta.name}吗？只返还一半材料。`)) {
    actions.sell(props.meta.id, 1)
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
    <HoverTip :width="380" @show="onTipShow" @hide="clearHighlight">
      <button
        class="build-btn"
        :class="{ poor: !affordable, off: entry.on === false && count > 0 }"
        @click="actions.buy(meta.id, 1)"
      >
        {{ meta.name }}<template v-if="count"> ({{ count }})</template>
        <span v-if="enabled > 0 && supply < 0.999" class="small warn"> · 缺料</span>
      </button>
      <template #tip>
        <div class="tip-body">
          <div class="tip-title">
            {{ meta.name }}
            <span class="tip-right">已建 {{ count }}</span>
          </div>
          <div class="tip-desc">{{ meta.desc }}</div>

          <div class="tip-section">价格</div>
          <div v-for="(amount, res) in price" :key="res" class="tip-row">
            <span class="k">{{ resName(res) }}</span>
            <span class="v" :class="{ bad: !enough(res, amount) }">{{ priceText(res, amount) }}</span>
          </div>
          <div class="tip-row">
            <span class="k">最多可建</span>
            <span class="v">{{ maxCount }}</span>
          </div>

          <div class="tip-section">效果<template v-if="!count">（建成后）</template></div>
          <!-- 一条效果一行：多资源的建筑（库房、谷仓…）不再挤成一长串 -->
          <div v-for="row in effectRows" :key="row.key" class="tip-row">
            <span class="k">{{ row.label }}</span>
            <span class="v" :class="row.tone">
              {{ row.value }}<template v-if="row.total && row.total !== row.value"
                >（合计 {{ row.total }}）</template
              >
            </span>
          </div>
          <div v-if="needsText && !count" class="tip-row">
            <span class="k">解锁</span>
            <span class="v">{{ needsText }}</span>
          </div>
          <template v-if="meta.upkeep">
            <div class="tip-section">维护<template v-if="enabled > 0">（{{ enabled }} 座启用）</template></div>
            <div v-if="enabled > 0" class="tip-row">
              <span class="k">供应</span>
              <span class="v" :class="supply < 0.999 ? 'warn' : 'good'">{{ Math.round(supply * 100) }}% · 按供应比例发挥效果</span>
            </div>
            <!-- 维护费同样一种资源一行 -->
            <div v-for="row in upkeepRows" :key="row.key" class="tip-row">
              <span class="k">{{ row.label }} 消耗</span>
              <span class="v bad">
                {{ row.unit }}<template v-if="row.total && row.total !== row.unit"
                  >（合计 {{ row.total }}）</template
                >
              </span>
            </div>
            <div v-if="enabled === 0" class="tip-row">
              <span class="k">当前</span>
              <span class="v warn">已停用，暂不计维护费</span>
            </div>
            <div class="tip-row">
              <span class="k">说明</span>
              <span class="v">只有带维护费的建筑能停用 —— 停用即停费，效果也一起停</span>
            </div>
          </template>

          <div v-if="count && entry.on === false" class="tip-row">
            <span class="k">状态</span>
            <span class="v warn">{{ meta.upkeep ? '已停用：不出产、也不吃维护费' : '已停用：不出产，仓储与人口保留' }}</span>
          </div>

          <div v-if="flavor" class="tip-flavor">{{ flavor }}</div>
        </div>
      </template>
    </HoverTip>

    <!-- 只有带维护费的建筑能停用：停用即停费，这才是一个真选择（§5.4） -->
    <button
      v-if="count > 0 && meta.upkeep"
      class="side-btn"
      :class="{ on: entry.on === false }"
      :title="entry.on === false ? '重新启用（恢复维护费）' : '停用（省下维护费）'"
      @click="actions.toggle(meta.id)"
    >
      {{ entry.on === false ? '启' : '停' }}
    </button>
    <button v-if="count > 0" class="side-btn danger" title="拆除一座，返还一半材料" @click="sell">
      售
    </button>
  </div>
</template>
