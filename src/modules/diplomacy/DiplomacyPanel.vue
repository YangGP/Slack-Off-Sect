<script setup>
/**
 * 宗门外交页：三家邻宗，固定汇率互市，机缘骰给额外掉落。
 * 信符与猎杀共用同一池子：每回互市消耗 50 枚，备猎与互市抢同一份凭信。
 * 本组件属于「宗门外交」可选模块，由 src/modules/diplomacy/ui.js 导出。
 */
import { computed } from 'vue'
import { state, derived, actions } from '@/game/store'
import { DIPLOMACY, DIPLOMACY_SECTS } from './data.js'
import { resourceName } from '@/data/resources'
import { REALMS } from '@/data/realms'
import { isDiplomacyUnlocked, tradePreview } from '@/game/engine'
import { ZERO } from '@/game/decimal'
import { fmtAmount, fmtPercent } from '@/game/format'
import HoverTip from '@/components/HoverTip.vue'

const unlocked = computed(() => isDiplomacyUnlocked(state))
const fortunePct = computed(() => fmtPercent(tradePreview(state, derived, DIPLOMACY_SECTS[0].id)?.fortuneChance || 0))
const warrant = computed(() => state.resources.warrant ?? ZERO)
const warrantMax = computed(() => derived.max.warrant ?? ZERO)

function previewOf(sectId) {
  return tradePreview(state, derived, sectId)
}

function costText(cost) {
  return Object.entries(cost).map(([res, amount]) => `${resourceName(res)} ×${fmtAmount(amount)}`).join('、')
}

function fortuneText(options) {
  const parts = []
  for (const [res, amount] of Object.entries(options || {})) {
    parts.push(`${resourceName(res)} ≈${fmtAmount(amount)}`)
  }
  return parts.join(' 或 ')
}

function trade(sectId) {
  actions.diplomacyTrade(sectId)
}
</script>

<template>
  <div class="box">
    <div class="box-head">
      <HoverTip label="宗门外交"><template #tip>
          <p>与邻宗互市：付出富余资源与信符，换回紧缺物资。每回互市消耗 {{ DIPLOMACY.WARRANT_COST }} 枚信符——与猎杀出征共用同一池子。</p>
          <p>每次交易另有{{ fortunePct }}概率触发机缘，额外获得一份掉落；山门越多，机缘越易（每座 +1%，封顶 35%）。</p>
          <p>机缘掉落按当前产能定价：按产能折算的奖励不超过该资源仓储的 {{ Math.round(DIPLOMACY.FORTUNE_STORAGE_SHARE * 100) }}%，但保底数量不受此限；实际入库仍受仓容限制。</p>
        </template></HoverTip>
      <span class="hint">信符 {{ fmtAmount(warrant) }} / {{ fmtAmount(warrantMax) }} · 每回互市 {{ DIPLOMACY.WARRANT_COST }} 枚</span>
    </div>
    <div class="box-body">
      <div v-if="!unlocked" class="empty">
        尚未与邻宗建立往来：需参悟《邻宗往来》，且宗门达到{{ REALMS[DIPLOMACY.MIN_REALM].name }}。
      </div>
      <template v-else>
        <div v-for="sect in DIPLOMACY_SECTS" :key="sect.id" class="diplomacy-sect">
          <div class="diplomacy-head">
            <span class="diplomacy-glyph">{{ sect.glyph }}</span>
            <span><b>{{ sect.name }}</b></span>
            <span class="dim small" style="margin-left: 8px">{{ sect.desc }}</span>
          </div>
          <table class="grid">
            <tbody>
              <tr>
                <td class="dim nowrap">付出</td>
                <td class="num">{{ costText(sect.pays) }} + 信符 ×{{ DIPLOMACY.WARRANT_COST }}</td>
                <td class="dim nowrap">换得</td>
                <td class="num">{{ costText(sect.gains) }}</td>
              </tr>
              <tr>
                <td class="dim nowrap">机缘</td>
                <td class="num" colspan="3">
                  {{ fortuneText(previewOf(sect.id)?.fortuneOptions) }}
                  <span class="dim">（每次 {{ fortunePct }}）</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="diplomacy-actions">
            <button
              class="btn primary"
              :disabled="!previewOf(sect.id)?.warrantEnough || !previewOf(sect.id)?.affordable || !previewOf(sect.id)?.hasRoom"
              @click="trade(sect.id)"
            >
              互市
            </button>
            <span v-if="!previewOf(sect.id)?.warrantEnough" class="bad small">信符不足</span>
            <span v-else-if="!previewOf(sect.id)?.affordable" class="bad small">材料不足</span>
            <span v-else-if="!previewOf(sect.id)?.hasRoom" class="bad small">仓储已满</span>
            <span v-else-if="previewOf(sect.id)?.overflow" class="warn small">部分回报超出仓容，超出部分不入库</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.diplomacy-sect {
  padding: 6px 0;
  border-top: 1px solid var(--border, #3a3a3a);
}
.diplomacy-sect:first-child {
  border-top: none;
}
.diplomacy-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 4px;
}
.diplomacy-glyph {
  font-size: 0.9em;
  color: var(--dim, #999);
}
.diplomacy-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}
</style>
