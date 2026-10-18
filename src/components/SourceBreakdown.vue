<script setup>
/**
 * 某个资源的收支明细：进项逐条列出「来源 ×数量 数值」，出项同理，最后给净额与趋势。
 * 供资源栏、宗门台账的悬停提示复用。
 */
import { computed } from 'vue'
import { state, derived } from '@/game/store'
import { CRAFTS } from '@/data/crafts'
import { isCraftUnlocked, resourceFlow, reactorAppliesTo } from '@/game/engine'
import { RESOURCE_MAP } from '@/data/resources'
import { fmt, fmtRate, fmtTime } from '@/game/format'
import { MONEY_INFINITY, ONE, ZERO, money, moneyToNumber, moneyToRatio } from '@/game/decimal'

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
const netNegative = computed(() => net.value.isNegative())
const max = computed(() => derived.max[props.resId] ?? MONEY_INFINITY)
const amount = computed(() => state.resources[props.resId] ?? ZERO)
const karmaStorageText = computed(() => `${(moneyToNumber(derived.karmaStorageMult.minus(1)) * 100).toFixed(1).replace(/\.0$/, '')}%`)
/** 仙缘仓储倍率是金额域的无界倍率：正负比较留在 Decimal 域 */
const karmaStorageActive = computed(() => derived.karmaStorageMult.gt(1))
const factor = computed(() => derived.sourceFactor?.[props.resId] ?? ONE)

// 来源明细是金额：过滤微小项用 Decimal 绝对值比较，不先转 Number。
const sources = computed(() =>
  (derived.sources[props.resId] || []).filter((s) => money(s.value).abs().gte(0.0005)),
)

/** 出项条目的正负（减耗条目是正数，其余为负） */
function itemNegative(value) {
  return money(value).isNegative()
}

/** 灵石、丹药这类只能靠制作获得的资源，额外指出配方来源 */
const recipes = computed(() =>
  CRAFTS.filter((c) => c.out === props.resId && isCraftUnlocked(state, c)).map((c) => c.name),
)

function etaText() {
  const rate = net.value
  if (rate.isZero()) return ''
  if (rate.isPositive()) {
    if (!max.value.isFinite()) return ''
    const left = max.value.minus(amount.value)
    if (left.lte(1e-6)) return '已满仓'
    return '满仓还需 ' + fmtTime(moneyToNumber(left.div(rate)))
  }
  if (!amount.value.isPositive()) return ''
  return '按此速度 ' + fmtTime(moneyToNumber(amount.value.div(rate.negated()))) + ' 后耗尽'
}

function pctText() {
  if (!max.value.isFinite() || !max.value.isPositive()) return ''
  // 存档如果带着超过上限的数值（例如旧档导入），先在 Decimal 域夹到 [0,1]，避免显示 430% 这种数
  return Math.round(moneyToRatio(amount.value.div(max.value)) * 100) + '%'
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
  // 湮灭炉增产：独立一层，唯独不作用于粒子链（分子 / 正负灵子 / 灵能）。
  const reactorList = reactorAppliesTo(res) ? (b.reactorRatio || []) : []
  if (reactorList.length) {
    rows.push({
      key: 'reactor',
      label: '湮灭炉增产',
      text: signed(reactorList.reduce((s, x) => s + x.value, 0)),
      detail: detailOf(reactorList),
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
  // 全局倍率：境界 × 仙缘 × 宜居度 × 增益（globalMult 是无界金额倍率，比较留在 Decimal 域）
  if (b.globalMult.minus(1).abs().gt(0.0005)) {
    rows.push({
      key: 'global',
      label: '全局倍率',
      text: `×${b.globalMult.toFixed(2)}`,
      detail: [
        `境界 ×${b.realmMult.toFixed(2)}`,
        `仙缘 ×${b.karmaMult.toFixed(2)}`,
        `宜居度 ×${b.habitabilityMult.toFixed(2)}`,
      ]
        .concat(b.realmProductionMult > b.realmMult ? [`万民归心 ×${(b.realmProductionMult / b.realmMult).toFixed(2)}`] : [])
        .concat(b.debugProductionMult > 1 ? [`DEBUG产出 ×${b.debugProductionMult}`] : [])
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
    <div v-if="!max.isFinite()" class="tip-row"><span class="k">库存</span><span class="v">无仓容上限</span></div>
    <div v-if="max.isFinite() && meta.storageWeight != null" class="tip-row">
      <span class="k">通用扩仓</span>
      <span class="v">基础容量的 {{ Math.round(meta.storageWeight * 1000) / 10 }}%；专属仓储全额计入</span>
    </div>
    <div v-if="max.isFinite() && karmaStorageActive" class="tip-row">
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
          <span class="v" :class="itemNegative(item.value) ? 'bad' : 'good'">
            {{ fmtRate(item.value) }}
          </span>
        </div>
      </div>
    </template>

    <div class="tip-row tip-total">
      <span class="k">净额</span>
      <span class="v" :class="netNegative ? 'bad' : 'good'">{{ fmtRate(net) }}</span>
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
</template>
