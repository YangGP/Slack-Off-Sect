<script setup>
/**
 * 参悟表：修真（解锁层）与技艺·法宝（数值层）共用一张表。
 * 三层信息：可参悟的列表 / 条件未达成的折叠 / 已参悟的折叠。
 * 价格使用紧凑写法：够就写需求，不够写「现有/需求」并标红。
 * 修真条目写「参悟」，法宝写「炼成」—— 一个是研究，一个是器物。
 */
import { computed } from 'vue'
import { state, derived, view, actions, highlightCost, clearHighlight } from '@/game/store'
import { canAfford, refineCost, treasureLevel, treasureMult, isProgressionVisible, isCostRevealed, researchCost } from '@/game/engine'
import { describeEffects, describeNeeds, scaleEffectsBy } from '@/game/effectsText'
import { effectRows, effectLine } from '@/game/unlockText'
import { fmt, fmtCost } from '@/game/format'
import { ZERO, money, moneyGte, moneyMax } from '@/game/decimal'
import { enough as enoughOf, costBlocked } from '@/game/pricing'
import { resourceName } from '@/data/resources'
import { CULTIVATION } from '@/data/upgrades'
import { CONFIG } from '@/data/config'
import HoverTip from './HoverTip.vue'
import CostRows from './CostRows.vue'

const props = defineProps({
  /** 本页负责的那一层：CULTIVATION（修真）或 TECHNIQUES（技艺 + 法宝） */
  list: { type: Array, required: true },
  title: { type: String, required: true },
  hint: { type: String, default: '' },
  /** 'cultivation' | 'technique'：决定读哪一组 view 里的可参悟 / 已参悟 */
  kind: { type: String, default: 'cultivation' },
  /** 可选的筛选行（技艺页用来分「全部 / 技艺 / 法宝」） */
  filters: { type: Array, default: () => [] },
  filter: { type: String, default: 'all' },
  filterKey: { type: String, default: '' },
  note: { type: String, default: '' },
})

const availableIds = computed(() =>
  props.kind === 'technique' ? view.researchableSkills.value : view.researchableCultivation.value,
)
const researchedIds = computed(() =>
  props.kind === 'technique' ? view.researchedSkills.value : view.researchedCultivation.value,
)

// 仓容只影响列表分组；已有库存能支付时仍允许参悟。仓容与存量都是金额，比较留在 Decimal 域。
const capacityReady = (u) => {
  if (props.kind !== 'cultivation') return true
  const cost = money(researchCost(state, u)?.insight ?? ZERO)
  return moneyGte(moneyMax(derived.max.insight ?? ZERO, state.resources.insight ?? ZERO), cost)
}
const capacityLocked = computed(() => props.list
  .filter((u) => availableIds.value.includes(u.id) && isCostRevealed(state, researchCost(state, u)) && !capacityReady(u))
  .sort((a, b) => money(a.cost.insight).cmp(money(b.cost.insight))).map(u => ({ ...u, cost: researchCost(state, u) })))

/**
 * 「效果」列的文本。
 *
 * 注意分工：**解锁信息只由 unlockText 表达**（它会把「节点声明」与「建筑门槛」两侧合起来，
 * 而且多个建筑之间有顿号），数值与规则效果才交给 describeEffects。
 * 以前两边都渲染、再加上手写的 note，同一件事会说三遍（例如"解锁建筑 聚灵大阵；解锁建筑：聚灵大阵；…"）。
 */
/**
 * 悬停**整行**都要出提示：把事件转给这一行里的提示触发器（`.tip-trigger`）。
 *
 * 为什么不直接把 HoverTip 包住整行：HoverTip 渲染的是一个 `<span>` 外壳，
 * 而 `<tr>` 里只能放 `<td>` —— 包起来会破坏表格结构。转发事件既保住结构，
 * 又让玩家在行内任意位置（名称、等级、效果或花费）悬停都能看到同一条提示。
 */
function rowEnter(ev, item) {
  const cost = item?.cost || item?.meta?.cost
  if (cost) highlightCost(cost)
  ev?.currentTarget?.querySelector?.('.tip-trigger')?.dispatchEvent(new MouseEvent('mouseenter'))
}
function rowLeave(ev) {
  clearHighlight()
  ev?.currentTarget?.querySelector?.('.tip-trigger')?.dispatchEvent(new MouseEvent('mouseleave'))
}

/** 各列表都按数据文件的书写顺序展示：想调整顺序直接重排数据即可。 */
const available = computed(() =>
  availableIds.value
    .map((id) => props.list.find((u) => u.id === id))
    .filter(Boolean)
    .filter((u) => isCostRevealed(state, researchCost(state, u)))
    .filter(capacityReady)
    .map((u) => ({
      meta: { ...u, cost: researchCost(state, u) },
      affordable: canAfford(state, researchCost(state, u)),
    })),
)

const locked = computed(() =>
  props.list
    .filter((u) => !state.upgrades[u.id] && !availableIds.value.includes(u.id))
    .filter((u) => isProgressionVisible(state, u.needs, researchCost(state, u)))
    .map((u) => ({
      meta: u,
      needs: describeNeeds(u.needs).join('，') || '条件未知',
    })),
)

const researched = computed(() => props.list.filter((u) => state.upgrades[u.id] && u.kind !== 'treasure'))

/** 已炼成、可继续祭炼的法宝（只有法宝能祭炼） */
const forged = computed(() =>
  props.list
    .filter((u) => u.kind === 'treasure' && state.upgrades[u.id])
    .map((u) => {
      const cost = refineCost(state, u.id)
      const mult = treasureMult(state, u)
      const supply = derived.upgradeSupply[u.id] ?? 1
      return {
        meta: u,
        level: treasureLevel(state, u.id),
        mult,
        cost,
        affordable: !!cost && canAfford(state, cost),
        effects: describeEffects(scaleEffectsBy(u.effects, mult * supply)),
        nextEffects: describeEffects(scaleEffectsBy(u.effects, mult + CONFIG.TREASURE_REFINE_STEP)),
        nextMult: mult + CONFIG.TREASURE_REFINE_STEP,
        supply,
        upkeep: Object.entries(u.upkeep || {}).map(([res, amount]) => ({ resource: res, value: `${fmt(amount * mult)}/秒` })),
      }
    }),
)

/** 花费列只写「需要多少」；排版与建筑（宗门）的悬停提示完全一致 */
function costText(res, amount) {
  void res
  return fmtCost(amount)
}

/** 这一条的层名，写在提示标题右侧（对应建筑提示右边的「已建 N」） */
function kindName(meta) {
  if (meta.kind === 'treasure') return '法宝'
  return CULTIVATION.some((u) => u.id === meta.id) ? '修真' : '技艺'
}
</script>

<template>
  <div class="box">
    <div class="box-head">
      <HoverTip :label="title"><template #tip><p>{{ hint }}</p><p v-if="note">{{ note }}</p></template></HoverTip><span class="hint">已参悟 {{ researched.length + forged.length }}</span>
    </div>
    <div class="box-body">
      <div v-if="filters.length" class="filters">
        <template v-for="(f, i) in filters" :key="f.id">
          <span v-if="i" class="divider">·</span>
          <button class="filter" :class="{ on: filter === f.id }" @click="state.ui[filterKey] = f.id">
            {{ f.name }}
          </button>
        </template>
      </div>

      <!-- 已炼成的法宝：可以反复祭炼，每级效果 +30%、花费 ×1.7 递增 -->
      <table v-if="forged.length" class="grid upgrade-table">
        <colgroup><col class="upgrade-name" /><col /><col class="upgrade-action" /></colgroup>
        <thead>
          <tr>
            <th>已炼成的法宝</th>
            <th>{{ kind === 'technique' ? '效果' : '花费' }}</th>
            <th class="right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in forged"
            :key="item.meta.id"
            @mouseenter="rowEnter($event, item)"
            @mouseleave="rowLeave($event)"
          >
            <td class="nowrap">
              <span :class="{ bad: costBlocked(state, derived, item.cost) }">{{ item.meta.name }}</span><span v-if="costBlocked(state, derived, item.cost)" class="cap-star" title="费用超过仓容上限，需先扩仓">*</span> <span class="small dim">法宝 · Lv.{{ item.level }} ×{{ item.mult.toFixed(2) }}</span>
              <span v-if="item.upkeep.length" class="small dim"> · {{ state.upgradeEnabled[item.meta.id] === false ? '已停用' : item.supply > 0 ? `供能 ${Math.round(item.supply * 100)}%` : '缺灵能停效' }}</span>
            </td>
            <td class="cost nowrap">
              <HoverTip :width="380" anchor="tr">
                <span class="cost-line" tabindex="0" :aria-label="`${item.meta.name}祭炼详情`">
                  <span v-if="kind === 'technique'">{{ item.effects.map(row => row.text).join('；') || '暂无生效效果' }}</span>
                  <template v-else>
                  <span
                    v-for="(amount, res) in item.cost"
                    :key="res"
                    :class="{ lack: !enoughOf(state, res, amount) }"
                  >
                    {{ resourceName(res) }} {{ costText(res, amount) }}
                  </span>
                  </template>
                </span>
                <template #heading>
                  {{ item.meta.name }}
                  <span class="tip-right">法宝 · Lv.{{ item.level }} ×{{ item.mult.toFixed(2) }}</span>
                </template>
                <template #tip>
                  <div class="tip-desc">{{ item.meta.desc }}</div>
                  <div v-if="item.meta.refine?.materials" class="tip-row">
                    <span class="k">进阶祭炼</span>
                    <span class="v">第{{ (item.meta.refine.materialFromLevel || 0) + 1 }}次起需{{ Object.keys(item.meta.refine.materials).map(resourceName).join('、') }}，用量随层数增加</span>
                  </div>

                  <CostRows :cost="item.cost" />

                  <div class="tip-section">效果</div>
                  <div v-for="(row, ri) in item.effects" :key="ri" class="tip-row">
                    <span class="k">{{ row.label }}</span>
                    <span class="v" :class="row.tone">{{ row.value }}</span>
                  </div>
                  <div class="tip-section">祭炼后{{ item.upkeep.length ? '满供' : '' }} · Lv.{{ item.level + 1 }} ×{{ item.nextMult.toFixed(2) }}</div>
                  <div v-for="(row, ri) in item.nextEffects" :key="ri" class="tip-row">
                    <span class="k">{{ row.label }}</span>
                    <span class="v" :class="row.tone">{{ row.value }}</span>
                  </div>
                  <template v-if="item.upkeep.length">
                    <div class="tip-section">维护</div>
                    <div v-for="row in item.upkeep" :key="row.resource" class="tip-row">
                      <span class="k">满供消耗 · {{ resourceName(row.resource) }}</span>
                      <span class="v bad">{{ row.value }}</span>
                    </div>
                    <div class="tip-note">供能不足按比例运行，当前效果已计入实际供能。</div>
                  </template>
                </template>
              </HoverTip>
            </td>
            <td class="right">
              <button v-if="item.meta.upkeep" class="btn" :aria-label="`${item.meta.name}启停`" @click="actions.toggleUpkeepUpgrade(item.meta.id)">
                {{ state.upgradeEnabled[item.meta.id] === false ? '启用' : '停用' }}
              </button>
              <button class="btn primary" :disabled="!item.affordable" @click="actions.refineTreasure(item.meta.id)">
                祭炼
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <table class="grid upgrade-table" v-if="available.length">
        <colgroup><col class="upgrade-name" /><col /><col class="upgrade-action" /></colgroup>
        <thead>
          <tr>
            <th>名称</th>
            <th>{{ kind === 'technique' ? '效果' : '花费' }}</th>
            <th class="right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in available" :key="item.meta.id" @mouseenter="rowEnter($event, item.meta)" @mouseleave="rowLeave($event)">
            <td class="nowrap">
              <span :class="{ bad: costBlocked(state, derived, item.meta.cost) }">{{ item.meta.name }}</span><span v-if="costBlocked(state, derived, item.meta.cost)" class="cap-star" title="费用超过仓容上限，需先扩仓">*</span>
              <span v-if="item.meta.kind === 'treasure'" class="small dim">法宝</span>
            </td>
            <!-- 技艺页展示效果，修真页展示花费；完整费用保留在悬停提示中。 -->
            <td class="cost nowrap">
              <HoverTip :width="380" anchor="tr">
                <span class="cost-line">
                  <span v-if="kind === 'technique'">{{ effectLine(item.meta, describeEffects) || '—' }}</span>
                  <template v-else>
                  <span
                    v-for="(amount, res) in item.meta.cost"
                    :key="res"
                    :class="{ lack: !enoughOf(state, res, amount) }"
                  >
                    {{ resourceName(res) }} {{ costText(res, amount) }}
                  </span>
                  </template>
                </span>
                <template #heading>
                  {{ item.meta.name }}
                  <span class="tip-right">{{ kindName(item.meta) }}</span>
                </template>
                <template #tip>
                  <div class="tip-desc">{{ item.meta.desc }}</div>

                  <CostRows :cost="item.meta.cost" />

                  <div class="tip-section">效果</div>
                  <!-- 数值、规则和解锁清单均按单个效果成行。 -->
                  <div v-for="(row, ri) in effectRows(item.meta, describeEffects)" :key="ri" class="tip-row">
                    <span class="k">{{ row.label }}</span>
                    <span class="v" :class="row.tone || 'good'">{{ row.value }}</span>
                  </div>
                  <div v-if="item.meta.effectDesc" class="tip-note">{{ item.meta.effectDesc }}</div>
                  <template v-if="describeNeeds(item.meta.needs).length">
                    <div class="tip-section">条件</div>
                    <div v-for="(condition, ci) in describeNeeds(item.meta.needs)" :key="ci" class="tip-condition">{{ condition }}</div>
                  </template>
                </template>
              </HoverTip>
            </td>
            <td class="right">
              <button class="btn primary" :disabled="!item.affordable" @click="actions.research(item.meta.id)">
                {{ item.meta.kind === 'treasure' ? '炼成' : '参悟' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">暂时没有可参悟的条目，建设对应产业、推进研究或扩充灵机上限后会逐步开放。</div>

      <details class="fold" v-if="capacityLocked.length">
        <summary>需扩充灵机上限（{{ capacityLocked.length }} 条）</summary>
        <div class="small dim">扩建藏经阁、讲经堂、观星台等设施，或参悟灵机仓容技艺。</div>
        <table class="grid">
          <tbody>
            <tr v-for="item in capacityLocked" :key="item.id">
              <td class="nowrap dim">{{ item.name }}</td>
              <td class="small dim">灵机上限 {{ fmtCost(derived.max.insight) }} / 需要 {{ fmtCost(item.cost.insight) }}</td>
            </tr>
          </tbody>
        </table>
      </details>

      <details class="fold" v-if="locked.length">
        <summary>下一步（{{ locked.length }} 条，条件达成后开放）</summary>
        <table class="grid">
          <tbody>
            <tr v-for="item in locked" :key="item.meta.id">
              <td class="nowrap dim">{{ item.meta.name }}</td>
              <td class="small dim">{{ item.needs }}</td>
            </tr>
          </tbody>
        </table>
      </details>

      <details class="fold" v-if="researched.length">
        <summary>已参悟（{{ researched.length }} 条）</summary>
        <table class="grid" style="padding-top: 4px">
          <tbody>
            <tr v-for="item in researched" :key="item.id">
              <td class="nowrap">
                <HoverTip :width="380" anchor="tr">
                  <span class="good">{{ item.name }}</span>
                  <span class="small dim">　{{ kindName(item) }}</span>
                  <template #heading>
                    {{ item.name }}
                    <span class="tip-right">{{ kindName(item) }}</span>
                  </template>
                  <template #tip>
                    <div class="tip-desc">{{ item.desc }}</div>

                    <div class="tip-section">效果</div>
                    <div v-for="(row, ri) in effectRows(item, describeEffects)" :key="ri" class="tip-row">
                      <span class="k">{{ row.label }}</span>
                      <span class="v" :class="row.tone || 'good'">{{ row.value }}</span>
                    </div>
                    <div v-if="item.effectDesc" class="tip-note">{{ item.effectDesc }}</div>
                  </template>
                </HoverTip>
              </td>
              <td class="small">{{ effectLine(item, describeEffects) || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </div>
  </div>
</template>

<style scoped>
.upgrade-table {
  table-layout: fixed;
}
.upgrade-name {
  width: 38%;
}
.upgrade-action {
  width: 112px;
}
.upgrade-table .nowrap {
  white-space: normal;
  overflow-wrap: anywhere;
}
.upgrade-table td.right {
  white-space: nowrap;
}
.upgrade-table + .upgrade-table { margin-top: 18px; }
.upgrade-table tbody td { border-bottom: 1px solid var(--line-soft); }
@container content (max-width: 540px) {
  .upgrade-name { width: 32%; }
  .upgrade-action { width: 72px; }
  .upgrade-table td.right { white-space: normal; }
  .upgrade-table td.right .btn { margin: 2px 0; padding: 4px 7px; }
}
</style>
