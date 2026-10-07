<script setup>
import { computed } from 'vue'
import { state, derived, view, actions, highlightCost, clearHighlight } from '@/game/store'
import { REALMS, ASCEND_REALM_INDEX, REINCARNATE_REALM_INDEX } from '@/data/realms'
import { realmCost, canAfford } from '@/game/engine'
import { fmt, fmtAmount, fmtCost, fmtInt, fmtPercent } from '@/game/format'
import { costLabel, enough as enoughOf } from '@/game/pricing'
import { RESOURCE_MAP } from '@/data/resources'
import HoverTip from './HoverTip.vue'

const next = computed(() => REALMS[state.realm + 1] || null)
const cost = computed(() => (next.value ? realmCost(state, derived, state.realm + 1) : null))

/** 破境后的口粮倍率：口粮随境界倍率上涨，破境既升产能也升成本（§5.4） */
const ratio = computed(() => {
  const now = REALMS[state.realm]?.mult ?? 1
  const after = next.value?.mult ?? now
  return now > 0 ? after / now : 1
})
/** 当前每名弟子每秒吃多少灵气（含境界倍率与减耗，取实际值） */
const perPersonUpkeep = computed(() =>
  state.disciples.total > 0 ? (derived.upkeep || 0) / state.disciples.total : derived.discipleUpkeep || 0,
)
const affordable = computed(() => (cost.value ? canAfford(state, cost.value) : false))
const gain = computed(() => view.ascendGain.value)
const canAscend = computed(() => view.canAscend.value)
const reincarnateGain = computed(() => view.reincarnateGain.value)
const canReincarnate = computed(() => view.canReincarnate.value)

function resName(id) {
  return RESOURCE_MAP[id]?.name || id
}

function ascend() {
  const ok = window.confirm(
    `飞升会重置资源、弟子、建筑、修真、技艺·法宝与境界，并获得 ${gain.value} 点仙缘（永久的全局加成）。确定吗？`,
  )
  if (ok) actions.ascend()
}

/**
 * 转世：化神期起可做，清空范围与飞升**完全一样**（连修真/技艺·法宝也不保留），
 * 只结算仙缘 —— 门槛低所以到手少（化神期约 22 点，渡劫期飞升约 197 点）。
 */
function reincarnate() {
  const ok = window.confirm(
    `转世会重置资源、弟子、建筑、修真、技艺·法宝与境界（与飞升相同），并获得 ${reincarnateGain.value} 点仙缘。\n如果继续修到渡劫期再飞升，同一套公式能拿到更多（当前可飞升时约 ${gain.value} 点）。确定转世吗？`,
  )
  if (ok) actions.reincarnate()
}
</script>

<template>
  <div class="box">
    <div class="box-head">
      修行境界<span class="hint">每突破一境，全局产出永久提升</span>
    </div>
    <div class="box-body">
      <div class="realm-track">
        <template v-for="(r, i) in REALMS" :key="r.name">
          <span :class="{ done: i < state.realm, now: i === state.realm }">{{ r.name }}</span>
          <span v-if="i < REALMS.length - 1" class="dim"> → </span>
        </template>
      </div>

      <table class="grid">
        <tbody>
          <tr>
            <td class="dim nowrap">当前境界</td>
            <td class="num good">{{ view.realmName.value }}</td>
            <td class="dim nowrap">境界倍率</td>
            <td class="num">×{{ derived.realmMult.toFixed(2) }}</td>
            <td class="dim nowrap">仙缘</td>
            <td class="num">{{ fmtInt(state.karma) }}（×{{ derived.karmaMult.toFixed(2) }}）</td>
          </tr>
          <tr>
            <td class="dim nowrap">本世感悟</td>
            <td class="num">{{ fmtAmount(state.stats.lifeInsight || 0) }}</td>
            <td class="dim nowrap">破境折扣</td>
            <td class="num">{{ fmtPercent(derived.breakthroughDiscount) }}</td>
            <td class="dim nowrap">飞升所需</td>
            <td class="num" :class="canAscend ? 'good' : 'dim'">
              {{ canAscend ? '已达成' : REALMS[ASCEND_REALM_INDEX].name }}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="small dim" style="padding-top: 4px">{{ REALMS[state.realm].desc }}</div>
    </div>
  </div>

  <div class="box">
    <div class="box-head">
      破境<span class="hint">{{ next ? '下一境：' + next.name : '已至此界尽头' }}</span>
    </div>
    <div class="box-body">
      <template v-if="next">
        <div class="small dim">{{ next.desc }}</div>
        <div style="padding: 4px 0">
          全局产出 ×{{ derived.realmMult.toFixed(2) }} → <span class="good">×{{ next.mult.toFixed(2) }}</span>
        </div>
        <table class="grid">
          <tbody>
            <tr @mouseenter="highlightCost(cost)" @mouseleave="clearHighlight()">
              <td class="dim nowrap">花费</td>
              <!-- 花费列只写需求值；明细按建筑（宗门）的排版放进悬停提示 -->
              <td class="cost nowrap">
                <HoverTip :width="380">
                  <span class="cost-line">
                    <span
                      v-for="(amount, res) in cost"
                      :key="res"
                      :class="{ lack: !enoughOf(state, res, amount) }"
                    >
                      {{ resName(res) }} {{ fmtCost(amount) }}
                    </span>
                  </span>
                  <template #tip>
                    <div class="tip-body">
                      <div class="tip-title">
                        {{ next.name }}
                        <span class="tip-right">境界倍率 ×{{ next.mult.toFixed(2) }}</span>
                      </div>
                      <div class="tip-desc">{{ next.desc }}</div>

                      <div class="tip-section">价格</div>
                      <div v-for="(amount, res) in cost" :key="res" class="tip-row">
                        <span class="k">{{ resName(res) }}</span>
                        <span class="v" :class="{ bad: !enoughOf(state, res, amount) }">
                          {{ costLabel(state, derived, res, amount) }}
                        </span>
                      </div>

                      <div class="tip-section">效果</div>
                      <div class="tip-row">
                        <span class="k">破境后</span>
                        <span class="v good">全局产出 ×{{ next.mult.toFixed(2) }}</span>
                      </div>
                      <div class="tip-row">
                        <span class="k">现在</span>
                        <span class="v">全局产出 ×{{ (REALMS[state.realm]?.mult ?? 1).toFixed(2) }}</span>
                      </div>
                      <!-- 口粮随境界倍率上涨（§5.4）：破境是一次「产能升级」，也是一次「养人涨价」，
                           不写出来玩家会在破境那一刻突然发现灵气净额变负 -->
                      <div class="tip-row">
                        <span class="k">每人口粮</span>
                        <span class="v warn">
                          {{ perPersonUpkeep.toFixed(3) }}/秒 → {{ (perPersonUpkeep * ratio).toFixed(3) }}/秒（↑{{
                            ((ratio - 1) * 100).toFixed(0)
                          }}%）
                        </span>
                      </div>
                    </div>
                  </template>
                </HoverTip>
              </td>
              <td>
                <button class="btn primary" :disabled="!affordable" @click="actions.breakthrough()">
                  冲击 {{ next.name }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
      <div v-else class="empty">已经是渡劫期，接下来只有飞升一途。</div>
    </div>
  </div>

  <div class="box">
    <div class="box-head">
      飞升<span class="hint">转世重修，带走仙缘</span>
    </div>
    <div class="box-body">
      <table class="grid">
        <tbody>
          <tr>
            <td class="dim nowrap">本次可得仙缘</td>
            <td class="num good">{{ gain }} 点</td>
            <td class="dim nowrap">飞升后仙缘加成</td>
            <td class="num">每点 +2%，超出 150 点后递减（上限 +200%）</td>
            <td class="dim nowrap">已飞升</td>
            <td class="num">{{ state.stats.ascensions }} 次</td>
          </tr>
          <tr>
            <td class="dim nowrap">道果</td>
            <td class="num">{{ fmtInt(state.dao || 0) }} 颗（×{{ derived.daoMult.toFixed(2) }}）</td>
            <td class="dim nowrap">已转世</td>
            <td class="num">
              {{ state.stats.reincarnations }} 次
              <span v-if="view.reincarnationsNeeded.value > 0" class="dim">
                （飞升还需 {{ view.reincarnationsNeeded.value }} 次）
              </span>
            </td>
            <td class="dim nowrap">仙缘软上限</td>
            <td class="num dim">最多 +200%（超出递减）</td>
          </tr>
        </tbody>
      </table>

      <div class="small dim" style="padding: 6px 0">
        重置：资源、弟子、建筑、修真、技艺·法宝（含法宝祭炼等级）、制作进度、境界。
        保留：成就（每条 +2% 全局）、仙缘、累计统计与宗门纪事。
      </div>

      <div class="dim" style="margin-top: 10px">
        转世<span class="hint">化神期起可做：清空范围与飞升相同，只结算仙缘</span>
      </div>
      <div class="tip-row" style="margin: 4px 0 8px">
        <span class="k">转世可得仙缘</span>
        <span class="v">{{ reincarnateGain }}</span>
        <span class="k" style="margin-left: 14px">转世门槛</span>
        <span class="v" :class="canReincarnate ? 'good' : 'dim'">
          {{ canReincarnate ? '已达成' : REALMS[REINCARNATE_REALM_INDEX].name }}
        </span>
      </div>
      <button class="btn" :disabled="!canReincarnate" @click="reincarnate">
        转世（获得仙缘 {{ reincarnateGain }}）
      </button>
      <div v-if="!canReincarnate" class="dim" style="margin-top: 6px">
        还需修到「{{ REALMS[REINCARNATE_REALM_INDEX].name }}」才能转世。
      </div>

      <button class="btn danger" :disabled="!canAscend" @click="ascend">
        飞升（获得仙缘 {{ gain }}）
      </button>
      <span v-if="!canAscend && view.reincarnationsNeeded.value > 0" class="small dim">
        飞升还需先转世 {{ view.reincarnationsNeeded.value }} 次（当前已转世
        {{ state.stats.reincarnations }} 次）。
      </span>
      <span v-else-if="!canAscend" class="small dim">
        还需修到「{{ REALMS[ASCEND_REALM_INDEX].name }}」才能飞升。
      </span>
    </div>
  </div>
</template>
