<script setup>
/**
 * 宗门页：筛选行 + 建筑按钮网格（猫国式的中间内容区）。
 *
 * 网格最前面三个是「核心按钮」：
 *   1. 吸取天地灵气 —— 开局什么都没有时唯一的灵气来源（点一下 +N）
 *   2. 拾取石材     —— 为制作灵石提供矿物载体
 *   3. 凝气成石     —— 将灵气灌入石材，开局第一间屋子就花它
 * 这三个不参与分组筛选，只跟着「全部 / 可建造」走。
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
  CRAFT_MAP,
  maxCraftable,
  timeToAfford,
} from '@/game/engine'
import { RESOURCE_MAP } from '@/data/resources'
import { CONFIG } from '@/data/config'
import { costLabel } from '@/game/pricing'
import { fmt, fmtCost, fmtStock, fmtTime } from '@/game/format'
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

/** 「凝气成石」的即时状态（成本、能否做、能做几份） */
const stone = computed(() => {
  const meta = CRAFT_MAP.condenseStone
  const cost = meta.cost
  return {
    meta,
    cost,
    affordable: canAfford(state, cost),
    canMake: maxCraftable(state, derived, 'condenseStone'),
  }
})

function costLine(cost) {
  return Object.entries(cost)
    .map(([res, v]) => `${RESOURCE_MAP[res]?.name || res} ${fmtCost(v)}`)
    .join(' + ')
}

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
        <button class="build-btn" :disabled="state.resources.rock >= derived.max.rock" @click="actions.gatherRock()">
          拾取石材
        </button>
        <template #tip>
          <div class="tip-body">
            <div class="tip-title">拾取石材</div>
            <div class="tip-desc">从山坡拾取普通岩石，每次获得石矿 1。灌入灵气可制作灵石；建成采石场后可持续供料。</div>
            <div class="tip-row"><span class="k">现有 / 上限</span><span class="v">{{ fmtStock(state.resources.rock || 0) }} / {{ fmtStock(derived.max.rock) }}</span></div>
          </div>
        </template>
      </HoverTip>
    </div>

    <!-- 核心按钮 3：以石材承载灵气 -->
    <div v-if="showCore" class="build-item">
      <HoverTip :width="320">
        <button
          class="build-btn"
          :class="{ poor: !stone.affordable }"
          @click="actions.craft('condenseStone')"
        >
          凝气成石
        </button>
        <template #tip>
          <div class="tip-body">
            <div class="tip-title">
              凝气成石
              <span class="tip-right">灵石 ×1</span>
            </div>
            <div class="tip-desc">{{ stone.meta.desc }}</div>
            <div class="tip-section">价格</div>
            <div v-for="(amount, res) in stone.cost" :key="res" class="tip-row">
              <span class="k">{{ RESOURCE_MAP[res]?.name || res }}</span>
              <span class="v" :class="{ bad: (state.resources[res] || 0) < amount }">
                {{ costLabel(state, derived, res, amount) }}
              </span>
            </div>
            <div class="tip-section">产出</div>
            <div class="tip-row">
              <span class="k">现有</span>
              <span class="v">灵石 {{ fmtStock(state.resources.stone || 0) }}</span>
            </div>
            <div class="tip-row">
              <span class="k">材料够做</span>
              <span class="v">{{ stone.canMake }} 份</span>
            </div>
            <div class="tip-flavor">
              点一下立刻得一枚；要批量或挂机自动做，用左栏炼制块（{{ costLine(stone.cost) }}）。
            </div>
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
