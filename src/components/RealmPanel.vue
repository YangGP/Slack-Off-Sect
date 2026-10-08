<script setup>
import { computed } from 'vue'
import { state, derived, view, actions, highlightCost, clearHighlight } from '@/game/store'
import { REALMS, ASCEND_REALM_INDEX, REINCARNATE_REALM_INDEX } from '@/data/realms'
import { realmCost, canAfford } from '@/game/engine'
import { fmt, fmtAmount, fmtCost, fmtInt, fmtPercent } from '@/game/format'
import { costLabel, enough as enoughOf } from '@/game/pricing'
import { RESOURCE_MAP } from '@/data/resources'
import { CONFIG } from '@/data/config'
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

/** 飞升的唯一条件是渡劫期（转世不是门槛，只是常见路线） */
const ascendRealmOk = computed(() => state.realm >= ASCEND_REALM_INDEX)

function resName(id) {
  return RESOURCE_MAP[id]?.name || id
}

function ascend() {
  const ok = window.confirm(
    `飞升会重置资源、弟子、建筑、修真、技艺·法宝与境界，并获得 ${gain.value} 点仙缘与 1 颗道果（都是永久的）。首颗道果解锁自动炼制、配方优先与材料保留。确定吗？`,
  )
  if (ok) actions.ascend()
}

/**
 * 转世：化神期起可做，清空范围与飞升**完全一样**（连修真/技艺·法宝也不保留），
 * 只结算仙缘 —— 门槛低所以到手少（化神期约 25 点，渡劫期飞升约 197 点）。
 */
function reincarnate() {
  const ok = window.confirm(
    `转世会重置资源、弟子、建筑、修真、技艺·法宝与境界（与飞升相同），并获得 ${reincarnateGain.value} 点仙缘。\n如果继续修到渡劫期再飞升，同一套公式能拿到更多（当前可飞升时约 ${gain.value} 点），还多结一颗道果。确定转世吗？`,
  )
  if (ok) actions.reincarnate()
}
</script>

<template>
  <div class="box">
    <div class="box-head">
      修行境界<span class="hint">每突破一境，全局产出永久提升</span>
      <span class="hint faint">　化神期起可转世 · 渡劫期起可飞升</span>
    </div>
    <div class="box-body">
      <!-- 境界阶梯：已达（灰）/ 当前（黑）/ 未达（淡）。两个里程碑写在头顶的提示里 -->
      <div class="realm-track">
        <template v-for="(r, i) in REALMS" :key="r.name">
          <span :class="{ done: i < state.realm, now: i === state.realm, faint: i > state.realm }">{{
            r.name
          }}</span>
          <span v-if="i < REALMS.length - 1" class="faint">→</span>
        </template>
      </div>

      <table class="grid">
        <tbody>
          <tr>
            <td class="dim nowrap">当前境界</td>
            <td class="num good">{{ view.realmName.value }}</td>
            <td class="dim nowrap">境界倍率</td>
            <td class="num">×{{ derived.realmMult.toFixed(2) }}</td>
            <td class="dim nowrap">本世感悟</td>
            <td class="num">{{ fmtAmount(state.stats.lifeInsight || 0) }}</td>
          </tr>
          <tr>
            <td class="dim nowrap">仙缘</td>
            <td class="num">
              <HoverTip :width="320">
                <span>{{ fmtInt(state.karma) }} <span class="dim">×{{ derived.karmaMult.toFixed(2) }}</span></span>
                <template #tip>
                  <div class="tip-body">
                    <div class="tip-title">仙缘<span class="tip-right">永久加成</span></div>
                    <div class="tip-desc">转世与飞升带走的因果，下一世还在身上。</div>
                    <div class="tip-section">加成倍率</div>
                    <div class="tip-row">
                      <span class="k">每点</span><span class="v good">全局产出 +2%</span>
                    </div>
                    <div class="tip-row">
                      <span class="k">软上限</span>
                      <span class="v">
                        +200%（
                        {{ Math.round(CONFIG.KARMA_BONUS_CAP * 0.75 / CONFIG.KARMA_BONUS_PER_POINT) }}
                        点之后递减）
                      </span>
                    </div>
                    <div class="tip-row">
                      <span class="k">当前</span><span class="v">×{{ derived.karmaMult.toFixed(2) }}</span>
                    </div>
                    <div class="tip-section">仓储加成</div>
                    <div class="tip-row">
                      <span class="k">每点</span><span class="v good">全部有限容量 +{{ fmtPercent(CONFIG.KARMA_STORAGE_PER_POINT, 2) }}</span>
                    </div>
                    <div class="tip-row">
                      <span class="k">软上限</span><span class="v">+{{ fmtPercent(CONFIG.KARMA_STORAGE_CAP) }}（{{ Math.round(CONFIG.KARMA_STORAGE_CAP * 0.75 / CONFIG.KARMA_STORAGE_PER_POINT) }}点之后递减）</span>
                    </div>
                    <div class="tip-row">
                      <span class="k">当前仓储</span><span class="v good">+{{ fmtPercent(derived.karmaStorageMult - 1, 1) }}</span>
                    </div>
                  </div>
                </template>
              </HoverTip>
            </td>
            <td class="dim nowrap">道果</td>
            <td class="num">
              <HoverTip :width="320">
                <span>{{ fmtInt(state.dao || 0) }} <span class="dim">×{{ derived.daoMult.toFixed(2) }}</span></span>
                <template #tip>
                  <div class="tip-body">
                    <div class="tip-title">道果<span class="tip-right">只有飞升给</span></div>
                    <div class="tip-desc">飞升时结下的道果，比仙缘更高一层。</div>
                    <div class="tip-section">效果</div>
                    <div class="tip-row">
                      <span class="k">全局产出</span>
                      <span class="v good">每颗 +{{ fmtPercent(CONFIG.DAO_PRODUCTION_BONUS) }}</span>
                    </div>
                    <div class="tip-row">
                      <span class="k">转世/飞升仙缘</span>
                      <span class="v good">每颗 +{{ fmtPercent(CONFIG.DAO_KARMA_GAIN_BONUS) }}</span>
                    </div>
                    <div class="tip-row">
                      <span class="k">当前</span><span class="v">×{{ derived.daoMult.toFixed(2) }}</span>
                    </div>
                  </div>
                </template>
              </HoverTip>
            </td>
            <td class="dim nowrap">破境折扣</td>
            <td class="num">{{ fmtPercent(derived.breakthroughDiscount) }}</td>
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
          全局产出 ×{{ derived.realmMult.toFixed(2) }} →
          <span class="good">×{{ next.mult.toFixed(2) }}</span>
          <span class="dim">（×{{ ratio.toFixed(2) }}）</span>
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
              <td class="right">
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
      转世与飞升<span class="hint">两者清空范围相同，都只结算仙缘；飞升额外结一颗道果</span>
    </div>
    <div class="box-body">
      <table class="grid">
        <tbody>
          <tr>
            <td class="dim nowrap">已转世</td>
            <td class="num">{{ state.stats.reincarnations }} 次</td>
            <td class="dim nowrap">已飞升</td>
            <td class="num">{{ state.stats.ascensions }} 次</td>
            <td class="dim nowrap">永久加成</td>
            <td class="num">
              仙缘 ×{{ derived.karmaMult.toFixed(2) }} <span class="dim">·</span> 道果 ×{{
              derived.daoMult.toFixed(2)
              }}
              <span class="dim">·</span> 仓储 +{{ fmtPercent(derived.karmaStorageMult - 1, 1) }}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="small dim" style="padding: 6px 0">
        重置：资源、弟子、建筑、修真、技艺·法宝（含祭炼等级）、制作进度、境界。
        保留：成就、仙缘、道果、累计统计与宗门纪事。
      </div>

      <div class="box-sub">转世<span class="hint">化神期起 · 早期的那一层</span></div>
      <div class="tip-row">
        <span class="k">门槛</span>
        <span class="v" :class="canReincarnate ? 'good' : 'dim'">
          {{ canReincarnate ? '已达成' : '需修到 ' + REALMS[REINCARNATE_REALM_INDEX].name }}
        </span>
      </div>
      <div class="tip-row">
        <span class="k">可得仙缘</span>
        <!-- 门槛未达成时不要显示数字：那只是「按当前境界套公式」的值，玩家转不了世 -->
        <span v-if="canReincarnate" class="v good">{{ reincarnateGain }} 点</span>
        <span v-else class="v dim">待修到 {{ REALMS[REINCARNATE_REALM_INDEX].name }} 结算</span>
      </div>
      <div style="padding: 8px 0">
        <button class="btn" :disabled="!canReincarnate" @click="reincarnate">转世</button>
        <span v-if="!canReincarnate" class="small dim" style="margin-left: 10px">
          还需修到「{{ REALMS[REINCARNATE_REALM_INDEX].name }}」才能转世。
        </span>
      </div>

      <div class="box-sub">
        飞升<span class="hint">渡劫期 · 终极目标；转世是常见路线，但不是必需</span>
      </div>
      <div class="small" :class="state.dao > 0 ? 'good' : 'dim'">
        首颗道果解锁「道果统筹」：重修时即可自动炼制，可指定优先配方并保留材料。
      </div>
      <div class="tip-row">
        <span class="k">境界</span>
        <span class="v" :class="ascendRealmOk ? 'good' : 'dim'">
          {{ ascendRealmOk ? '已达成' : '需修到 ' + REALMS[ASCEND_REALM_INDEX].name }}
        </span>
      </div>
      <div class="tip-row">
        <span class="k">本世转世</span>
        <span class="v">
          {{ state.stats.reincarnations }} 次<span class="dim">
            （常见路线 ≈ {{ CONFIG.ASCEND_TURNS_REFERENCE }} 次）</span
          >
        </span>
      </div>
      <div class="tip-row">
        <span class="k">可得</span>
        <!-- 同理：飞升要在渡劫期结算，境界没到就别报数字（越晚结算越值钱，写早了会误导） -->
        <span v-if="ascendRealmOk" class="v good">{{ gain }} 点仙缘 + 1 颗道果</span>
        <span v-else class="v dim">待修到 {{ REALMS[ASCEND_REALM_INDEX].name }} 结算</span>
      </div>
      <div style="padding: 8px 0">
        <button class="btn danger" :disabled="!canAscend" @click="ascend">飞升</button>
        <span v-if="!canAscend" class="small dim" style="margin-left: 10px">
          还需修到「{{ REALMS[ASCEND_REALM_INDEX].name }}」才能飞升。
        </span>
      </div>
    </div>
  </div>
</template>
