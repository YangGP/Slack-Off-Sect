<script setup>
/** 完整炼制页与左栏快捷炼制共用同一套操作、状态和悬停明细。 */
import { computed, reactive } from 'vue'
import { state, derived, actions, highlightCost, clearHighlight } from '@/game/store'
import { CRAFTS, QUICK_CRAFT_LIMIT, ADVANCED_CRAFT_OUTPUTS } from '@/data/crafts'
import { isCraftUnlocked, autoCraftStatus, maxCraftable, craftYield } from '@/game/engine'
import { costLabel } from '@/game/pricing'
import { describeNeeds } from '@/game/effectsText'
import { fmt, fmtPercent, fmtStock } from '@/game/format'
import { RESOURCE_MAP } from '@/data/resources'
import { CONFIG } from '@/data/config'
import { CALENDAR } from '@/data/calendar'
import HoverTip from './HoverTip.vue'

const props = defineProps({ compact: Boolean })
const FILTERS = [{ id: 'all', name: '全部' }, { id: 'basic', name: '基础' }, { id: 'advanced', name: '进阶' }, { id: 'auto', name: '已选自动' }]
const filter = computed(() => state.ui.craftFilter || 'all')
// 库存每帧刷新；编辑中的草稿不能被尚未提交的库存目标覆盖。
const targetDrafts = reactive({})

/** 批量快捷：按「材料能做出的份数」取比例 */
const BATCHES = [
  { frac: 0.25, label: '¼料' },
  { frac: 0.5, label: '½料' },
  { frac: 1, label: '全部' },
]

const allRows = computed(() =>
  CRAFTS.filter((c) => isCraftUnlocked(state, c)).map((c) => {
    const canMake = maxCraftable(state, derived, c.id)
    return {
      meta: c,
      yield: craftYield(derived, c),
      affordable: canMake >= 1,
      progress: state.craftProgress[c.id] || 0,
      auto: !!state.autoCraft[c.id],
      have: state.resources[c.out] || 0,
      max: derived.max[c.out],
      autoStatus: autoCraftStatus(state, derived, c.id),
      batches: BATCHES.map((b) => ({ ...b, count: Math.floor(canMake * b.frac) })),
    }
  }),
)

const rows = computed(() => {
  if (props.compact) return allRows.value.filter(row => state.settings.quickCrafts.includes(row.meta.id))
  return allRows.value.filter(row => filter.value === 'auto' ? row.auto : filter.value === 'basic' ? !ADVANCED_CRAFT_OUTPUTS.includes(row.meta.out) : filter.value === 'advanced' ? ADVANCED_CRAFT_OUTPUTS.includes(row.meta.out) : true)
})

const locked = computed(() =>
  CRAFTS.filter((c) => !isCraftUnlocked(state, c)).map((c) => ({
    meta: c,
    needs: describeNeeds(c.needs).join('，'),
  })),
)

function resName(id) {
  return RESOURCE_MAP[id]?.name || id
}

function updateTarget(id, event) {
  actions.setCraftTarget(id, event.target.value)
  delete targetDrafts[id]
  event.target.value = String(autoCraftStatus(state, derived, id).target)
}
function updateQuick(id, event) {
  actions.toggleQuickCraft(id)
  event.target.checked = state.settings.quickCrafts.includes(id)
}
const condenseStatus = computed(() => {
  if (!state.settings.autoCraftOn) return '凝灵诀 · 总开关已暂停'
  const target = autoCraftStatus(state, derived, 'condenseStone').target
  if (target > 0 && state.resources.stone >= target) return '凝灵诀 · 目标已达'
  if (state.resources.stone >= derived.max.stone) return '凝灵诀 · 灵石满仓'
  return '凝灵诀 · 节气满仓自凝'
})
</script>

<template>
  <div class="box" :class="compact ? 'craft-quick' : 'craft-full'">
    <div class="box-head">
      {{ compact ? '快捷炼制' : '炼制' }}<span class="hint">通用制作加成 +{{ fmtPercent(derived.craftBonus) }}</span>
      <button v-if="compact" class="craft-open" @click="actions.setTab('craft')">全部配方 →</button>
    </div>
    <div class="box-body">
      <div v-if="!compact" class="craft-settings small">
        <label class="sw"><input type="checkbox" :checked="state.settings.autoCraftOn" @change="actions.setSetting('autoCraftOn', $event.target.checked)" />自动制作总开关</label>
        <span class="dim">已解锁 {{ allRows.length }} / {{ CRAFTS.length }} 个配方 · 快捷最多 {{ QUICK_CRAFT_LIMIT }} 个</span>
      </div>
      <div v-if="!compact" class="small dim">金丹后，境界越高加工越快；当前加工速度 ×{{ fmt(derived.craftSpeed) }}。百工坊与专业设施提高每份产出，小数收益会持续累积。</div>
      <div v-if="!compact && derived.daoAutomation" class="small craft-settings">
        <div class="good">道果统筹 · 重修时即可自动炼制</div>
        <label>材料保留
          <select :value="state.settings.craftReservePercent" @change="actions.setSetting('craftReservePercent', Number($event.target.value))">
            <option v-for="n in [0, 10, 20, 30, 50]" :key="n" :value="n">{{ n }}% 仓储</option>
          </select>
        </label>
        <label>优先
          <select :value="state.settings.autoCraftPriority" @change="actions.setSetting('autoCraftPriority', $event.target.value)">
            <option v-for="row in allRows" :key="row.meta.id" :value="row.meta.id">{{ row.meta.name }}</option>
          </select>
        </label>
        <div class="dim">保留比例按每种材料的仓储上限计算，仅约束自动炼制。</div>
      </div>
      <div v-if="!compact" class="filters">
        <button v-for="f in FILTERS" :key="f.id" class="filter" :class="{ on: filter === f.id }" @click="state.ui.craftFilter = f.id">{{ f.name }}</button>
      </div>
      <div v-if="!rows.length" class="empty">{{ compact ? '前往炼制页选择快捷配方。' : '此筛选下没有可用配方。' }}</div>
      <div v-if="!compact && derived.craftTargetsUnlocked" class="small dim craft-target-hint">库存达到目标后暂停，使用成品后自动补回；0 表示不限。手动制作不受目标限制。</div>

      <HoverTip
        v-for="row in rows"
        :key="row.meta.id"
        tag="div"
        class="craft-row"
        :data-craft="row.meta.id"
        :width="330"
        @show="highlightCost(row.meta.cost)"
        @hide="clearHighlight"
      >
        <div class="craft-line">
          <span class="craft-name">{{ row.meta.name }}</span>
          <span class="have">{{ resName(row.meta.out) }} {{ fmtStock(row.have) }}<template v-if="!compact"> / {{ fmtStock(row.max) }}</template></span>
          <label v-if="!compact" class="craft-pin small"><input type="checkbox" :checked="state.settings.quickCrafts.includes(row.meta.id)" :aria-label="`${row.meta.name}快捷炼制`" @change="updateQuick(row.meta.id, $event)" />快捷</label>
        </div>
        <div v-if="!compact" class="craft-cost small">
          <template v-for="(amount, res, index) in row.meta.cost" :key="res"><span v-if="index" class="dim"> + </span><span :class="{ bad: (state.resources[res] || 0) < amount }">{{ resName(res) }} {{ fmtStock(amount) }}</span></template>
          <span class="dim"> → </span><span class="good">{{ resName(row.meta.out) }} {{ fmt(row.yield) }}</span>
          <span v-if="derived.craftBonusByResource[row.meta.out]" class="dim"> · 专业加成 +{{ fmtPercent(derived.craftBonusByResource[row.meta.out]) }}</span>
        </div>
        <div class="craft-status small">
          <span v-if="row.autoStatus.on && row.autoStatus.ready" class="good">
            自动中 · 下一份 {{ row.autoStatus.wait.toFixed(1) }}秒
          </span>
          <span v-else-if="row.autoStatus.on" class="small warn">{{ row.autoStatus.reason }}</span>
          <span
            v-else-if="row.meta.id === 'condenseStone' && derived.autoCondenseUnlocked"
            class="small dim"
          >
            {{ condenseStatus }}
          </span>
          <span v-if="!row.autoStatus.on && !(row.meta.id === 'condenseStone' && derived.autoCondenseUnlocked)" class="dim">{{ row.have >= row.max ? '成品满仓' : row.affordable ? '可制作' : '材料不足' }}</span>
          <span v-if="!compact && row.yield > row.meta.amount" class="dim"> · 小数累积 {{ fmtPercent(row.progress) }}</span>
        </div>
        <div class="craft-line">
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
            :disabled="b.count < 1"
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
          <label v-if="!compact && derived.craftTargetsUnlocked" class="small">目标
            <input class="qty" type="number" min="0" step="1" :value="targetDrafts[row.meta.id] ?? row.autoStatus.target"
              :aria-label="`${row.meta.name}库存目标`"
              @input="targetDrafts[row.meta.id] = $event.target.value"
              @change="updateTarget(row.meta.id, $event)" />
          </label>
        </div>

        <template #tip>
          <div class="tip-body">
            <div class="tip-title">
              {{ row.meta.name }}
              <span class="tip-right">{{ resName(row.meta.out) }} ×{{ row.meta.amount }}</span>
            </div>
            <div class="tip-desc">{{ row.meta.desc }}</div>

            <div class="tip-section">价格</div>
            <div v-for="(amount, res) in row.meta.cost" :key="res" class="tip-row">
              <span class="k">{{ resName(res) }}</span>
              <span
                class="v"
                :class="{ bad: (state.resources[res] || 0) < amount }"
              >{{ costLabel(state, derived, res, amount) }}</span>
            </div>

            <div class="tip-section">产出</div>
            <div class="tip-row">
              <span class="k">现有</span>
              <span class="v">{{ resName(row.meta.out) }} {{ fmtStock(row.have) }}</span>
            </div>
            <div class="tip-row">
              <span class="k">每次得到</span>
              <span class="v good">{{ fmt(row.yield) }}</span>
            </div>
            <div class="tip-row">
              <span class="k">这批能做</span>
              <span class="v">
                <template v-for="(b, i) in row.batches.filter(batch => !compact || batch.frac !== 0.25)" :key="b.label">
                  <template v-if="i"> · </template>{{ b.label }} {{ b.count }} 份
                </template>
              </span>
            </div>
            <div v-if="derived.craftBonusByResource[row.meta.out]" class="tip-row">
              <span class="k">专业制作加成</span>
              <span class="v good">+{{ fmtPercent(derived.craftBonusByResource[row.meta.out]) }}</span>
            </div>
            <div v-if="row.yield > row.meta.amount" class="tip-row">
              <span class="k">小数累积</span>
              <span class="v">{{ fmtPercent(row.progress) }}</span>
            </div>

            <div class="tip-section">自动制作</div>
            <div v-if="row.meta.id === 'condenseStone' && derived.autoCondenseUnlocked" class="tip-row">
              <span class="k">凝灵诀</span>
              <span class="v">每 {{ CALENDAR.DAYS_PER_TERM * CALENDAR.DAY_SECONDS }} 秒检查满仓，最多转化 {{ fmtPercent(CONFIG.AUTO_CONDENSE_RATIO) }} 灵气；受总开关、库存目标、仓储与道果保留量约束，无需勾选常驻自动。</span>
            </div>
            <div v-if="derived.craftTargetsUnlocked" class="tip-row">
              <span class="k">库存目标</span><span class="v">{{ row.autoStatus.target || '不限' }}（一份制作的加成可能超过目标）</span>
            </div>
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
            <div class="tip-flavor">
              {{
                derived.autoCraftUnlocked
                  ? '勾上「自动」后一份一份常驻做下去，材料、仓储或保留量不允许时先歇着；挂着游戏时也照做（总开关在炼制页或设置页）。'
                  : '参悟《心有灵犀》或取得首颗道果后才能勾选自动制作。'
              }}
            </div>
          </div>
        </template>
      </HoverTip>

      <details class="fold" v-if="!compact && locked.length">
        <summary>尚未解锁的配方（{{ locked.length }} 个）</summary>
        <table class="grid">
          <tbody>
            <tr v-for="row in locked" :key="row.meta.id" :title="row.meta.desc">
              <td class="nowrap dim">{{ row.meta.name }}</td>
              <td class="small dim">{{ row.needs }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </div>
  </div>
</template>
