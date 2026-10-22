<script setup>
import { computed, reactive, watch } from 'vue'
import { state, derived, view, actions, highlightCost, clearHighlight } from '@/game/store'
import { REALMS, ASCEND_REALM_INDEX, REINCARNATE_REALM_INDEX, realmProductionBase } from '@/data/realms'
import { DAO_HEART_DIVISOR } from '@/data/faith'
import { breakthroughPreview, canAfford, realmProductionMultiplier, karmaMultipliers, canAttest } from '@/game/engine'
import { fmt, fmtAmount, fmtCost, fmtPercent } from '@/game/format'
import { ZERO, money, moneyToNumber } from '@/game/decimal'
import { enough as enoughOf } from '@/game/pricing'
import { aidExtraText } from '@/game/effectsText'
import { resourceName } from '@/data/resources'
import { CONFIG } from '@/data/config'
import HoverTip from './HoverTip.vue'
import CostRows from './CostRows.vue'

const next = computed(() => REALMS[state.realm + 1] || null)
const aids = reactive({})
watch(() => state.realm, () => {
  for (const id of Object.keys(aids)) delete aids[id]
}, { flush: 'sync' })
const preview = computed(() => breakthroughPreview(state, derived, aids))
const cost = computed(() => next.value ? preview.value.cost : null)

/** 破境后的口粮倍率：口粮随境界倍率上涨，破境既升产能也升成本（§5.4） */
const ratio = computed(() => {
  const now = realmProductionBase(REALMS[state.realm]?.mult ?? 1)
  const after = next.value ? realmProductionBase(next.value.mult) : now
  return now > 0 ? after / now : 1
})
/** 当前每名弟子每秒吃多少灵气（含境界倍率与减耗，取实际值）；金额 ÷ 人数，全程 Decimal */
const perPersonUpkeep = computed(() =>
  state.disciples.total > 0
    ? money(derived.upkeep).div(state.disciples.total)
    : money(derived.discipleUpkeep ?? ZERO),
)
/** 破境后的每人口粮与涨幅（涨跌是有界比例，转 Number 后再格式化） */
const upkeepAfter = computed(() => perPersonUpkeep.value.times(ratio.value))
const upkeepRise = computed(() => ((ratio.value - 1) * 100).toFixed(0))
/** 破境后的有效生产倍率之比：含万民归心，口粮使用削减后的基础生产倍率。 */
const productionRatio = computed(() => {
  const nowMult = derived.realmProductionMult || 1
  const afterMult = next.value ? realmProductionMultiplier(state, next.value.mult) : nowMult
  return nowMult > 0 ? afterMult / nowMult : 1
})
/** 当前勾选护道的材料加成合计（预览 chance 已含）。 */
const selectedAidBonus = computed(() =>
  preview.value.availableAids.reduce((sum, aid) => sum + (aids[aid.id] ? aid.bonus : 0), 0),
)
/** 仙缘仓储加成：倍率减 1 留在 Decimal 域，转百分比前才转 Number */
const karmaStorageBonus = computed(() => moneyToNumber(derived.karmaStorageMult.minus(1)))
const affordable = computed(() => (cost.value ? canAfford(state, cost.value) : false))
/** 结算的仙缘是金额（Decimal）：显示前统一走 fmtInt，不要直接拼对象 */
const gain = computed(() => view.ascendGain.value)
const gainText = computed(() => fmtAmount(gain.value))
const canAscend = computed(() => view.canAscend.value)
const reincarnateGain = computed(() => view.reincarnateGain.value)
const reincarnateGainText = computed(() => fmtAmount(reincarnateGain.value))
const canReincarnate = computed(() => view.canReincarnate.value)
const reincarnationEffects = computed(() => ({
  before: karmaMultipliers(state.karma),
  after: karmaMultipliers(money(state.karma).plus(reincarnateGain.value)),
}))
const unusedDaoHeart = computed(() => canAttest(state) && money(state.resources.vow).gte(DAO_HEART_DIVISOR))
const karmaEffectText = value => '+' + fmtPercent(moneyToNumber(value.minus(1)), 2)
/** 身死结算的仙缘也是金额 */
const deathKarmaText = computed(() => fmtAmount(preview.value.deathKarma))

/** 飞升的唯一条件是渡劫期（转世不是门槛，只是常见路线） */
const ascendRealmOk = computed(() => state.realm >= ASCEND_REALM_INDEX)

function ascend() {
  const ok = window.confirm(
    `飞升会重置资源、弟子、建筑、修真、技艺·法宝与境界，并获得 ${gainText.value} 点仙缘与 1 颗道果（都是永久的）。本世香火 ${fmt(state.resources.faith || ZERO)}、愿力 ${fmt(state.resources.vow || ZERO)} 与本世仪轨会清空；道心与永久修持保留，不会自动证心。首颗道果解锁自动炼制、配方优先与材料保留。确定吗？`,
  )
  if (ok) actions.ascend()
}

/**
 * 转世：化神期起可做，清空范围与飞升**完全一样**（连修真/技艺·法宝也不保留），
 * 只结算仙缘；具体收益取决于本世实际入库灵机及当前境界。
 */
function reincarnate() {
  const ok = window.confirm(
    `转世会重置资源、弟子、建筑、修真、技艺·法宝与境界（与飞升相同），并获得 ${reincarnateGainText.value} 点仙缘。本世香火 ${fmt(state.resources.faith || ZERO)}、愿力 ${fmt(state.resources.vow || ZERO)} 与本世仪轨会清空；道心与永久修持保留，不会自动证心。\n继续修到渡劫期可选择飞升，额外结一颗道果；仙缘仍按届时本世积累结算。确定转世吗？`,
  )
  if (ok) actions.reincarnate()
}
</script>

<template>
  <div class="box">
    <div class="box-head">
      <HoverTip label="修行境界"><template #tip>
          <p>{{ REALMS[state.realm].desc }}</p>
          <p>当前宗门境界提供全局产出倍率，口粮也随倍率增加。化神期起可转世，渡劫期可飞升。</p>
          <p>前{{ CONFIG.POPULATION_UPKEEP_FREE }}名弟子按基础口粮供养，此后规模越大，全体口粮越高，最多增至{{ 1 + CONFIG.POPULATION_UPKEEP_EXTRA_CAP }}倍；当前规模额外口粮 +{{ Math.round(((derived.populationUpkeepMult || 1) - 1) * 1000) / 10 }}%。灵气明细可查看额外开销。</p>
        </template></HoverTip>
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
            <td class="num">×{{ derived.realmProductionMult.toFixed(2) }}</td>
            <td class="dim nowrap">本世灵机</td>
            <td class="num">{{ fmtAmount(state.stats.lifeInsight ?? ZERO) }}</td>
          </tr>
          <tr>
            <td class="dim nowrap">仙缘</td>
            <td class="num">
              <HoverTip :width="320">
                <span>{{ fmtAmount(state.karma) }} <span class="dim">×{{ derived.karmaMult.toFixed(2) }}</span></span>
                <template #heading>仙缘<span class="tip-right">永久加成</span></template>
                <template #tip>
                  <div class="tip-desc">转世与飞升带走的因果，下一世还在身上。</div>
                  <div class="tip-section">加成倍率</div>
                  <div class="tip-row">
                    <span class="k">每点</span><span class="v good">全局产出 +{{ fmtPercent(CONFIG.KARMA_BONUS_PER_POINT) }}</span>
                  </div>
                  <div class="tip-row">
                    <span class="k">软上限</span>
                    <span class="v">
                      +{{ fmtPercent(CONFIG.KARMA_BONUS_CAP) }}（
                      {{ Math.round(CONFIG.KARMA_BONUS_CAP * 0.75 / CONFIG.KARMA_BONUS_PER_POINT) }}
                      点之后递减）
                    </span>
                  </div>
                  <div class="tip-row">
                    <span class="k">当前</span><span class="v">×{{ derived.karmaMult.toFixed(2) }}</span>
                  </div>
                  <div class="tip-section">仓储加成</div>
                  <div class="tip-row">
                    <span class="k">每点</span><span class="v good">适用资源有限容量 +{{ fmtPercent(CONFIG.KARMA_STORAGE_PER_POINT, 2) }}（信符除外）</span>
                  </div>
                  <div class="tip-row">
                    <span class="k">增长方式</span><span class="v">先线性后递减，渐近 +{{ fmtPercent(CONFIG.KARMA_STORAGE_CAP) }}；加工品无需仓容</span>
                  </div>
                  <div class="tip-row">
                    <span class="k">当前仓储</span><span class="v good">+{{ fmtPercent(karmaStorageBonus, 1) }}</span>
                  </div>
                </template>
              </HoverTip>
            </td>
            <td class="dim nowrap">道果</td>
            <td class="num">
              <HoverTip :width="320">
                <span>{{ fmtAmount(state.dao ?? ZERO) }} <span class="dim">×{{ derived.daoMult.toFixed(2) }}</span></span>
                <template #heading>道果<span class="tip-right">只有飞升给</span></template>
                <template #tip>
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
                </template>
              </HoverTip>
            </td>
            <td class="dim nowrap">破境折扣</td>
            <td class="num">{{ fmtPercent(derived.breakthroughDiscount) }}</td>
          </tr>
        </tbody>
      </table>

    </div>
  </div>

  <div class="box">
    <div class="box-head">
      <HoverTip label="破境"><template #tip>
          <p>辅助方案可叠加，须备齐整组材料，费用另加于基础材料，换境后需重新选择。每次尝试均消耗全部投料，失败不退回。</p>
          <p v-if="!preview.tribulation">失败无额外惩罚，不损失修为。</p>
          <p v-else>突破失败后：身死 {{ fmtPercent(preview.deathOnFailure) }}、退境 {{ fmtPercent(preview.regressionOnFailure) }}、保境 {{ fmtPercent(preview.holdOnFailure) }}（合计 100%，以本次突破失败为前提；单次总风险见下方概率）。身死清空范围同转世，保留已有仙缘、道果、道心、永久修持、成就与累计统计；本次仙缘保留 {{ fmtPercent(preview.deathKeepRatio) }}，不结道果。存活则另扣突破所用库存材料的 2%，全局产出降低 5% 持续 120 秒（重复失败只刷新时间）。</p>
        </template></HoverTip><span class="hint">{{ next ? '下一境：' + next.name : '已至此界尽头' }}</span>
    </div>
    <div class="box-body">
      <template v-if="next">
        <div style="padding: 6px 0">
          {{ preview.tribulation ? '渡劫成功率' : '突破成功率' }}
          <b class="good">{{ fmtPercent(preview.chance) }}</b>
          <span class="dim">（基础 {{ fmtPercent(preview.baseChance) }}，材料护道 +{{ fmtPercent(selectedAidBonus) }}，应劫正愿 +{{ fmtPercent(preview.vowBonus) }}，上限 {{ fmtPercent(preview.chanceCap) }}）</span>
        </div>
        <div class="small" style="display: flex; gap: 16px; flex-wrap: wrap; padding-bottom: 6px">
          <label v-for="aid in preview.availableAids" :key="aid.id">
            <input v-model="aids[aid.id]" type="checkbox">
            {{ aid.name }} +{{ fmtPercent(aid.bonus) }}{{ aidExtraText(aid) }}：
            <span v-for="(amount, res) in aid.cost" :key="res" :class="{ lack: !enoughOf(state, res, amount) }" style="margin-right: 6px">{{ resourceName(res) }} {{ fmtCost(amount) }}</span>
          </label>
        </div>
        <div v-if="preview.deathOnFailure" class="small bad" style="padding-bottom: 6px">
          本次总退境概率 {{ fmtPercent(preview.regressionRisk, 1) }}，本次总身死概率 {{ fmtPercent(preview.deathRisk, preview.deathRisk < 0.01 ? 2 : 1) }}，本次总保境概率 {{ fmtPercent(preview.holdRisk, 1) }}。
          身死立即重开，本次仙缘保留 {{ fmtPercent(preview.deathKeepRatio) }}，获得 {{ deathKarmaText }} 点，不结道果。
        </div>
        <div style="padding: 4px 0">
          全局产出 ×{{ derived.realmProductionMult.toFixed(2) }} →
          <span class="good">×{{ realmProductionMultiplier(state, next.mult).toFixed(2) }}</span>
          <span class="dim">（生产 ×{{ productionRatio.toFixed(2) }}，口粮 ×{{ ratio.toFixed(2) }}）</span>
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
                      {{ resourceName(res) }} {{ fmtCost(amount) }}
                    </span>
                  </span>
                  <template #heading>
                    {{ next.name }}
                    <span class="tip-right">基础境界倍率 ×{{ realmProductionBase(next.mult).toFixed(2) }}</span>
                  </template>
                  <template #tip>
                    <div class="tip-desc">{{ next.desc }}</div>

                    <CostRows :cost="cost" />

                    <div class="tip-section">效果</div>
                    <div class="tip-row">
                      <span class="k">破境后</span>
                      <span class="v good">全局产出 ×{{ realmProductionMultiplier(state, next.mult).toFixed(2) }}</span>
                    </div>
                    <div class="tip-row">
                      <span class="k">现在</span>
                      <span class="v">全局产出 ×{{ derived.realmProductionMult.toFixed(2) }}</span>
                    </div>
                    <!-- 口粮随境界倍率上涨（§5.4）：破境是一次「产能升级」，也是一次「养人涨价」，
                         不写出来玩家会在破境那一刻突然发现灵气净额变负 -->
                    <div class="tip-row">
                      <span class="k">每人口粮</span>
                      <span class="v warn">
                        {{ perPersonUpkeep.toFixed(2) }}/秒 → {{ upkeepAfter.toFixed(2) }}/秒（↑{{
                          upkeepRise
                        }}%）
                      </span>
                    </div>
                  </template>
                </HoverTip>
              </td>
              <td class="right">
                <button class="btn primary" :disabled="!affordable" @click="actions.breakthrough(aids)">
                  冲击 {{ next.name }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
      <div v-else class="empty">已经达到渡劫期，可以选择飞升。</div>
    </div>
  </div>

  <div class="box">
    <div class="box-head">
      <HoverTip label="转世与飞升"><template #tip>
          <p>两者清空范围相同，都结算仙缘；飞升额外结一颗道果。转世并非飞升门槛。</p>
          <p>重置：资源、弟子、建筑、修真、技艺·法宝（含祭炼等级）、制作进度、境界。保留：成就、仙缘、道果、道心与永久修持、累计统计与宗门纪事。</p>
          <p>首颗道果解锁「道果统筹」：重修时即可自动炼制，可指定优先配方并保留材料。</p>
        </template></HoverTip>
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
              <span class="dim">·</span> 仓储 +{{ fmtPercent(karmaStorageBonus, 1) }}
            </td>
          </tr>
        </tbody>
      </table>


      <div class="box-sub">转世</div>
      <div class="tip-row">
        <span class="k">门槛</span>
        <span class="v" :class="canReincarnate ? 'good' : 'dim'">
          {{ canReincarnate ? '已达成' : '需修到 ' + REALMS[REINCARNATE_REALM_INDEX].name }}
        </span>
      </div>
      <div class="tip-row">
        <span class="k">可得仙缘</span>
        <!-- 门槛未达成时不要显示数字：那只是「按当前境界套公式」的值，玩家转不了世 -->
        <span v-if="canReincarnate" class="v good">{{ reincarnateGainText }} 点</span>
        <span v-else class="v dim">待修到 {{ REALMS[REINCARNATE_REALM_INDEX].name }} 结算</span>
      </div>
      <div v-if="canReincarnate && (state.stats.reincarnations || 0) === 0" class="small dim">
        首次转世结算 ×{{ CONFIG.FIRST_REINCARNATION_KARMA_MULT }}；之后恢复常规公式。
      </div>
      <div style="padding: 8px 0">
        <template v-if="canReincarnate">
          <div class="tip-row">
            <span class="k">仙缘产出加成</span>
            <span class="v">{{ karmaEffectText(reincarnationEffects.before.karmaMult) }} → {{ karmaEffectText(reincarnationEffects.after.karmaMult) }}</span>
          </div>
          <div class="tip-row">
            <span class="k">仙缘仓储加成</span>
            <span class="v">{{ karmaEffectText(reincarnationEffects.before.karmaStorageMult) }} → {{ karmaEffectText(reincarnationEffects.after.karmaStorageMult) }}</span>
          </div>
          <p class="small dim">仓储加成仅作用于有上限资源，加工品不受仓容限制。仅比较永久仙缘的加成；境界、建筑与研究需要重修，道心和永久修持保留。</p>
          <p v-if="unusedDaoHeart" class="small">已有愿力可证心；请先前往香火页处理。转世会清空愿力，不会自动证心。</p>
        </template>
        <button class="btn" :disabled="!canReincarnate" @click="reincarnate">转世</button>
      </div>

      <div class="box-sub">
        飞升
      </div>
      <div class="tip-row">
        <span class="k">境界</span>
        <span class="v" :class="ascendRealmOk ? 'good' : 'dim'">
          {{ ascendRealmOk ? '已达成' : '需修到 ' + REALMS[ASCEND_REALM_INDEX].name }}
        </span>
      </div>
      <div class="tip-row">
        <span class="k">可得</span>
        <!-- 同理：飞升要在渡劫期结算，境界没到就别报数字（越晚结算越值钱，写早了会误导） -->
        <span v-if="ascendRealmOk" class="v good">{{ gainText }} 点仙缘 + 1 颗道果</span>
        <span v-else class="v dim">待修到 {{ REALMS[ASCEND_REALM_INDEX].name }} 结算</span>
      </div>
      <div style="padding: 8px 0">
        <button class="btn danger" :disabled="!canAscend" @click="ascend">飞升</button>
      </div>
    </div>
  </div>
</template>
