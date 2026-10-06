<script setup>
/**
 * 炼制（左栏，资源表下方）—— 全项目唯一的炼制面板。
 *
 * 为什么在这儿：灵石是宗门的铸造货币（凝气成石 45 灵气 → 1 灵石），
 * 「看账 → 补灵石 → 回中间盖房子」是最高频的一串动作，
 * 所以炼制和资源放在同一屏，不用切页签。
 *
 * 三种做法：
 *   制作 —— 瞬发，固定 1 份
 *   ¼料 / ½料 / 全部 —— 把「当前材料能做出来的份数」取 1/4、1/2、全部，一次做掉
 *   自动 —— 参悟《心有灵犀》后勾选，每份耗时一份一份做，离线也照做
 */
import { computed } from 'vue'
import { state, derived, actions, highlightCost, clearHighlight } from '@/game/store'
import { CRAFTS } from '@/data/crafts'
import { isCraftUnlocked, canAfford, autoCraftStatus, maxCraftable } from '@/game/engine'
import { costLabel } from '@/game/pricing'
import { describeNeeds } from '@/game/effectsText'
import { fmt, fmtCost, fmtPercent, fmtStock } from '@/game/format'
import { RESOURCE_MAP } from '@/data/resources'
import HoverTip from './HoverTip.vue'

/** 批量快捷：按「材料能做出的份数」取比例 */
const BATCHES = [
  { frac: 0.25, label: '¼料' },
  { frac: 0.5, label: '½料' },
  { frac: 1, label: '全部' },
]

const rows = computed(() =>
  CRAFTS.filter((c) => isCraftUnlocked(state, c)).map((c) => {
    const canMake = maxCraftable(state, derived, c.id)
    return {
      meta: c,
      affordable: canAfford(state, c.cost),
      progress: state.craftProgress[c.id] || 0,
      auto: !!state.autoCraft[c.id],
      have: state.resources[c.out] || 0,
      autoStatus: autoCraftStatus(state, derived, c.id),
      batches: BATCHES.map((b) => ({ ...b, count: Math.floor(canMake * b.frac) })),
    }
  }),
)

const locked = computed(() =>
  CRAFTS.filter((c) => !isCraftUnlocked(state, c)).map((c) => ({
    meta: c,
    needs: describeNeeds(c.needs).join('，'),
  })),
)

function resName(id) {
  return RESOURCE_MAP[id]?.name || id
}
</script>

<template>
  <div class="box">
    <div class="box-head">
      炼制<span class="hint">制作加成 +{{ fmtPercent(derived.craftBonus) }}</span>
    </div>
    <div class="box-body">
      <div v-if="!rows.length" class="empty">还没有可用配方。</div>

      <HoverTip
        v-for="row in rows"
        :key="row.meta.id"
        tag="div"
        class="craft-row"
        :width="330"
        @show="highlightCost(row.meta.cost)"
        @hide="clearHighlight"
      >
        <div class="craft-line">
          <span class="craft-name">{{ row.meta.name }}</span>
          <span v-if="row.autoStatus.on" class="small good">
            自动中 · 下一份 {{ row.autoStatus.wait.toFixed(1) }}秒
          </span>
          <span class="have">{{ resName(row.meta.out) }} {{ fmtStock(row.have) }}</span>
          <span v-if="derived.craftBonus > 0" class="small good">+{{ fmtPercent(row.progress) }}</span>
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
            v-for="b in row.batches"
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
              <span class="v good">{{ fmt(row.meta.amount * (1 + derived.craftBonus)) }}</span>
            </div>
            <div class="tip-row">
              <span class="k">这批能做</span>
              <span class="v">
                <template v-for="(b, i) in row.batches" :key="b.label">
                  <template v-if="i"> · </template>{{ b.label }} {{ b.count }} 份
                </template>
              </span>
            </div>
            <div v-if="derived.craftBonus > 0" class="tip-row">
              <span class="k">小数累积</span>
              <span class="v">{{ fmtPercent(row.progress) }}</span>
            </div>

            <div class="tip-section">自动制作</div>
            <div class="tip-row">
              <span class="k">节奏</span>
              <span class="v">每 {{ row.autoStatus.step }} 秒 1 份</span>
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
                  ? '勾上「自动」后一份一份常驻做下去，材料或仓储不够就先歇着，够了接着做；挂着游戏时也照做（总开关在设置页）。'
                  : '参悟《心有灵犀》后才能勾选自动制作。'
              }}
            </div>
          </div>
        </template>
      </HoverTip>

      <details class="fold" v-if="locked.length">
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
