<script setup>
/**
 * 宗门页：筛选行 + 建筑按钮网格（猫国式的中间内容区）。
 *
 * 吸取天地灵气是开局的手动来源，原料由弟子采集。
 */
import { computed } from 'vue'
import { state, derived, view, actions } from '@/game/store'
import { BUILDINGS, BUILDING_GROUPS, BUILDING_DISPLAY_ORDER } from '@/data/buildings'
import {
  isBuildingUnlocked,
  canAfford,
  buildingCost,
  countOf,
  clickGain,
  craftYield,
  maxCraftable,
} from '@/game/engine'
import { CRAFT_MAP } from '@/data/crafts'
import { CONFIG } from '@/data/config'
import { fmt } from '@/game/format'
import BuildingButton from './BuildingButton.vue'
import HoverTip from './HoverTip.vue'

/**
 * 催生灵木的入口数据：与炼制页取的是同一配方、同一套判据。
 * 它既在炼制页里（可自动、可批量），也在建筑列表这里（开局顺手点）。
 */
const grow = computed(() => {
  const meta = CRAFT_MAP.growWood
  const canMake = maxCraftable(state, derived, 'growWood')
  return {
    meta,
    canMake,
    affordable: canMake >= 1,
    yield: craftYield(derived, meta),
    have: state.resources.wood || 0,
    max: derived.max.wood || 0,
  }
})

const FILTERS = [
  { id: 'all', name: '全部' },
  { id: 'affordable', name: '可建造' },
  { id: 'owned', name: '已建成' },
  { id: 'toggle', name: '可切换' },
]

const groups = view.buildingsByGroup
const filter = computed(() => state.ui.sectFilter || 'all')
const buildingOrder = new Map(BUILDING_DISPLAY_ORDER.map((id, index) => [id, index]))

/** 核心按钮只在「全部 / 可建造」里出现 */
const showCore = computed(() => filter.value === 'all' || filter.value === 'affordable')

const gain = computed(() => clickGain(state, derived))
/** 已解锁的建筑（未解锁的还没露面） */
const unlocked = computed(() => BUILDINGS.filter((b) => isBuildingUnlocked(state, b.id)))

const list = computed(() => {
  const f = filter.value
  let items = unlocked.value
  if (f === 'affordable') {
    items = items.filter((b) => canAfford(state, buildingCost(state, b.id, 1)))
  } else if (f === 'owned' || f === 'toggle') {
    items = items.filter((b) => countOf(state, b.id) > 0)
  } else if (f !== 'all') {
    items = items.filter((b) => b.group === f)
  }
  // 新建筑未指定展示顺序时放在末尾；价格、库存和数量不影响位置。
  return [...items].sort((a, b) => (buildingOrder.get(a.id) ?? Infinity) - (buildingOrder.get(b.id) ?? Infinity))
})

const tabs = computed(() => [
  ...FILTERS,
  ...BUILDING_GROUPS.filter((g) => groups.value[g.id]?.length).map((g) => ({ id: g.id, name: g.name })),
])
</script>

<template>
  <div class="filters">
    <template v-for="(t, i) in tabs" :key="t.id">
      <span v-if="i" class="divider">·</span>
      <button class="filter" :class="{ on: filter === t.id }" @click="state.ui.sectFilter = t.id">
        {{ t.name }}
      </button>
    </template>
  </div>

  <div class="build-grid">
    <!-- 核心按钮 1：吸取天地灵气（照猫国的「采集猫薄荷」放在建筑列表最前面） -->
    <div v-if="showCore" class="build-item">
      <HoverTip :width="300">
        <button class="build-btn" :class="{ poor: !showCore }" @click="actions.drawQi()">
          吸取天地灵气
        </button>
        <template #tip>
          <div class="tip-body">
            <div class="tip-title">吸取天地灵气</div>
            <div class="tip-desc">
              伸手一引，天地间游散的灵气自会入体。开局什么都没有时，这是唯一的进项。
            </div>
            <div class="tip-section">收益</div>
            <div class="tip-row">
              <span class="k">每次点击</span>
              <span class="v good">灵气 +{{ fmt(gain) }}</span>
            </div>
            <div class="tip-row">
              <span class="k">聚灵阵加持</span>
              <span class="v">前{{ CONFIG.CLICK_QI_FULL_FIELDS }}座每座 +{{ fmt(CONFIG.CLICK_QI_PER_FIELD) }}，之后增益递减</span>
            </div>
            <div class="tip-row">
              <span class="k">已吸取</span>
              <span class="v">{{ state.stats.clicks || 0 }} 次</span>
            </div>
            <div class="tip-flavor">点击手不停，灵气自然来。</div>
          </div>
        </template>
      </HoverTip>
    </div>

    <!-- 核心按钮 2：催生灵木（与炼制页同一配方，这里给一个开局顺手的入口） -->
    <div v-if="showCore" class="build-item">
      <HoverTip :width="300">
        <button
          class="build-btn"
          :class="{ poor: !grow.affordable }"
          :disabled="!grow.affordable"
          @click="actions.craft('growWood')"
        >
          催生灵木
        </button>
        <template #tip>
          <div class="tip-body">
            <div class="tip-title">催生灵木</div>
            <div class="tip-desc">{{ grow.meta.desc }}</div>
            <div class="tip-section">价格与收益</div>
            <div class="tip-row">
              <span class="k">每份</span>
              <span class="v">灵气 {{ fmt(grow.meta.cost.qi) }} → 灵木 {{ fmt(grow.yield) }}</span>
            </div>
            <div class="tip-row">
              <span class="k">本次可做</span>
              <span class="v" :class="{ bad: !grow.affordable }">{{ grow.canMake }} 份</span>
            </div>
            <div class="tip-row">
              <span class="k">灵木现有</span>
              <span class="v">{{ fmt(grow.have) }} / {{ fmt(grow.max) }}</span>
            </div>
            <div class="tip-flavor">点一下立刻出一份；满仓自然停下。炼制页里也能连续或自动催生。</div>
          </div>
        </template>
      </HoverTip>
    </div>

    <BuildingButton v-for="meta in list" :key="meta.id" :meta="meta" />
  </div>

  <div v-if="!list.length && !showCore" class="empty">
    这里暂时没有可造的东西 —— 换个筛选，或者先去左栏攒点资源。
  </div>
</template>
