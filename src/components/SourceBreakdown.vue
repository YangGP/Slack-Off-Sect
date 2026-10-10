<script setup>
/**
 * 某个资源的收支明细：进项逐条列出「来源 ×数量 数值」，出项同理，最后给净额与趋势。
 * 供资源栏、宗门台账的悬停提示复用。
 */
import { computed } from 'vue'
import { state, derived } from '@/game/store'
import { CRAFTS } from '@/data/crafts'
import { isCraftUnlocked, resourceFlow } from '@/game/engine'
import { RESOURCE_MAP } from '@/data/resources'
import { fmt, fmtCost, fmtRate, fmtStock, fmtTime } from '@/game/format'

const props = defineProps({
  resId: { type: String, required: true },
})

const meta = computed(() => RESOURCE_MAP[props.resId] || { name: props.resId })
const flow = computed(() => resourceFlow(derived, props.resId))
const income = computed(() => flow.value.income)
// 出项 = 口粮/维护费 + 此刻正在跑的自动制作（也要吃材料）。
// 后者并进来，净额与满仓/耗尽预估才不会被高估；结算口径的 expense 不含它（见 computeAutoCraftDrain）
const expenseItems = computed(() => flow.value.expenseItems)
const expense = computed(() => flow.value.expense)
const net = computed(() => flow.value.net)
const max = computed(() => derived.max[props.resId] ?? Infinity)
const amount = computed(() => state.resources[props.resId] || 0)
const karmaStorageText = computed(() => `${((derived.karmaStorageMult - 1) * 100).toFixed(1).replace(/\.0$/, '')}%`)
/** 整枚计数的资源（灵石/丹药/符箓/法器）不显示小数 */
const amountText = computed(() =>
  fmtStock(amount.value),
)
const factor = computed(() => derived.sourceFactor[props.resId] || 1)

const sources = computed(() =>
  (derived.sources[props.resId] || []).filter((s) => Math.abs(s.value) >= 0.0005),
)

/** 灵石、丹药这类只能靠制作获得的资源，额外指出配方来源 */
const recipes = computed(() =>
  CRAFTS.filter((c) => c.out === props.resId && isCraftUnlocked(state, c)).map((c) => c.name),
)

function etaText() {
  if (!net.value) return ''
  if (net.value > 0) {
    if (!Number.isFinite(max.value)) return ''
    const left = max.value - amount.value
    if (left <= 1e-6) return '已满仓'
    return '满仓还需 ' + fmtTime(left / net.value)
  }
  if (amount.value <= 0) return ''
  return '按此速度 ' + fmtTime(amount.value / -net.value) + ' 后耗尽'
}

function pctText() {
  if (!Number.isFinite(max.value) || max.value <= 0) return ''
  // 存档如果带着超过上限的数值（例如旧档导入），这里夹一下，避免显示 430% 这种数
  return Math.min(100, Math.round((amount.value / max.value) * 100)) + '%'
}

/**
 * 把「加成倍率」拆成逐项：资源加成 / 全局加成 / 季节 / 增益 / 全局倍率。
 * 每一项都列出是谁贡献的（`derived.bonus`，由 recompute 记账）。
 */
const signed = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`
const detailOf = (list) =>
  list
    .filter((x) => Math.abs(x.value) > 0.0005)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .map((x) => `${x.label}${x.count > 1 ? ' ×' + x.count : ''} ${signed(x.value)}`)
    .join('、')

const bonusRows = computed(() => {
  const b = derived.bonus
  if (!b) return []
  const res = props.resId
  const rows = []
  const ratioList = b.ratio?.[res] || []
  if (ratioList.length) {
    rows.push({
      key: 'ratio',
      label: '资源加成',
      text: signed(ratioList.reduce((s, x) => s + x.value, 0)),
      detail: detailOf(ratioList),
    })
  }
  if (b.ratioAll?.length) {
    rows.push({
      key: 'ratioAll',
      label: '全局加成',
      text: signed(b.ratioAll.reduce((s, x) => s + x.value, 0)),
      detail: detailOf(b.ratioAll),
    })
  }
  const season = derived.seasonRatio?.[res] || 0
  if (Math.abs(season) > 0.0005) {
    rows.push({
      key: 'season',
      label: '季节',
      text: signed(season),
      detail: derived.calendar?.seasonName || '',
    })
  }
  const buffResList = b.buffRes?.[res] || []
  const buffAllList = b.buffAll || []
  if (buffResList.length || buffAllList.length) {
    const all = [...buffResList, ...buffAllList]
    rows.push({
      key: 'buff',
      label: '天象增益',
      text: signed(all.reduce((s, x) => s + x.value, 0)),
      detail: detailOf(all),
    })
  }
  // 全局倍率：境界 × 仙缘 × 宜居度 × 增益
  if (Math.abs(b.globalMult - 1) > 0.0005) {
    rows.push({
      key: 'global',
      label: '全局倍率',
      text: `×${b.globalMult.toFixed(2)}`,
      detail: [
        `境界 ×${b.realmMult.toFixed(2)}`,
        `仙缘 ×${b.karmaMult.toFixed(2)}`,
        `宜居度 ×${b.habitabilityMult.toFixed(2)}`,
      ]
        .concat(Math.abs(b.buffAllTotal || 0) > 0.0005 ? [`天象 ×${(1 + b.buffAllTotal).toFixed(2)}`] : [])
        .join(' · '),
    })
  }
  if (derived.discipleMult < 1 && sources.value.some(s => s.kind === 'job')) {
    rows.push({ key: 'crowding', label: '岗位拥挤', text: `×${derived.discipleMult.toFixed(2)}`, detail: '仅弟子岗位产出，已计入各职位进项' })
  }
  return rows
})
</script>

<template>
  <div class="tip-body">
    <div class="tip-title">
      {{ meta.name }}
      <span class="tip-right">{{ amountText }}<template v-if="Number.isFinite(max)"> / {{ fmtCost(max) }}</template></span>
    </div>
    <!-- 与建筑（宗门）的提示同一套排版：标题 → 描述 → 分节 -->
    <div class="tip-desc">{{ meta.desc }}</div>
    <div v-if="meta.storageWeight != null" class="tip-row">
      <span class="k">通用扩仓</span>
      <span class="v">基础容量的 {{ Math.round(meta.storageWeight * 1000) / 10 }}%；专属仓储全额计入</span>
    </div>
    <div v-if="Number.isFinite(max) && derived.karmaStorageMult > 1" class="tip-row">
      <span class="k">仙缘仓储</span><span class="v good">总容量 +{{ karmaStorageText }}</span>
    </div>

    <div class="tip-section tip-row">
      <span class="k">进项</span>
      <span class="v good">{{ fmtRate(income) }}</span>
    </div>
    <div v-if="sources.length" class="tip-src">
      <div v-for="s in sources" :key="s.kind + s.id" class="tip-row">
        <span class="k">
          {{ s.label }}<template v-if="s.kind === 'building'"> ×{{ s.count }}</template
          ><template v-else-if="s.kind === 'job'"> ×{{ s.count }} 人</template>
        </span>
        <span class="v">+{{ fmt(s.value) }}/秒</span>
      </div>
    </div>
    <div v-else class="tip-src tip-row">
      <span class="k">没有持续产出</span>
    </div>

    <template v-if="expenseItems.length">
      <div class="tip-section tip-row">
        <span class="k">出项</span>
        <span class="v bad">-{{ fmt(expense) }}/秒</span>
      </div>
      <div class="tip-src">
        <div v-for="(item, i) in expenseItems" :key="'e' + i" class="tip-row">
          <span class="k">
            {{ item.label }}<template v-if="item.count"> ×{{ item.count }}</template>
          </span>
          <span class="v" :class="item.value < 0 ? 'bad' : 'good'">
            {{ fmtRate(item.value) }}
          </span>
        </div>
      </div>
    </template>

    <div class="tip-row tip-total">
      <span class="k">净额</span>
      <span class="v" :class="net >= 0 ? 'good' : 'bad'">{{ fmtRate(net) }}</span>
    </div>

    <div v-if="bonusRows.length" class="tip-section tip-row">
      <span class="k">加成倍率</span>
      <span class="v">×{{ factor.toFixed(2) }}</span>
    </div>
    <!-- 把这一个 ×N 拆开：每项是谁加了多少 -->
    <div v-if="bonusRows.length" class="tip-src">
      <div v-for="row in bonusRows" :key="row.key" class="bonus-row">
        <div class="tip-row">
          <span class="k">{{ row.label }}</span>
          <span class="v" :class="row.value >= 0 ? 'good' : 'bad'">{{ row.text }}</span>
        </div>
        <div v-if="row.detail" class="bonus-detail">{{ row.detail }}</div>
      </div>
    </div>
    <div v-if="recipes.length" class="tip-row">
      <span class="k">制作来源</span>
      <span class="v">{{ recipes.join('、') }}</span>
    </div>
    <div v-if="pctText()" class="tip-row">
      <span class="k">存量占比</span>
      <span class="v">{{ pctText() }}</span>
    </div>
    <div v-if="etaText()" class="tip-row">
      <span class="k">趋势</span>
      <span class="v">{{ etaText() }}</span>
    </div>
  </div>
</template>
