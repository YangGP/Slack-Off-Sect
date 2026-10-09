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
  woodGrowth,
} from '@/game/engine'
import { CONFIG } from '@/data/config'
import { fmt } from '@/game/format'
import BuildingButton from './BuildingButton.vue'
import HoverTip from './HoverTip.vue'

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
const growth = computed(() => woodGrowth(state, derived))

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

    <div v-if="showCore" class="build-item">
      <HoverTip :width="300">
        <button class="build-btn" :class="{ poor: !growth.affordable }" :disabled="!growth.affordable" @click="actions.growWood()">
          催生灵木
        </button>
        <template #tip>
          <div class="tip-body">
            <div class="tip-title">催生灵木</div>
            <div class="tip-desc">以灵气催动山中木芽，取得营造所需的灵木。开局即可使用。</div>
            <div class="tip-section">价格与收益</div>
            <div class="tip-row">
              <span class="k">每次兑换</span>
              <span class="v">灵气 {{ fmt(CONFIG.GROW_WOOD_QI_COST) }} → 灵木 {{ fmt(CONFIG.GROW_WOOD_GAIN) }}</span>
            </div>
            <div class="tip-row">
              <span class="k">本次费用</span>
              <span class="v" :class="{ bad: !growth.affordable && growth.gain > 0 }">灵气 {{ fmt(growth.cost.qi) }}</span>
            </div>
            <div class="tip-row">
              <span class="k">本次收益</span>
              <span class="v good">灵木 +{{ fmt(growth.gain) }}</span>
            </div>
            <div class="tip-flavor">满仓时停止；剩余容量不足时同比减少费用与收益。</div>
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
