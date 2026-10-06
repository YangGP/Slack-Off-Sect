<script setup>
/**
 * 参悟表：修真（解锁层）与技艺·法宝（数值层）共用一张表。
 * 三层信息与猫国一致：可参悟的列表 / 条件未达成的折叠 / 已参悟的折叠。
 * 价格沿用猫国的紧凑写法：够就写需求，不够写「现有/需求」并标红。
 * 修真条目写「参悟」，法宝写「炼成」—— 一个是研究，一个是器物。
 */
import { computed } from 'vue'
import { state, derived, view, actions, highlightCost, clearHighlight } from '@/game/store'
import { canAfford, refineCost, treasureLevel, treasureMult } from '@/game/engine'
import { describeEffects, describeNeeds, scaleEffectsBy } from '@/game/effectsText'
import { fmt, fmtCost } from '@/game/format'
import { costLabel, enough as enoughOf } from '@/game/pricing'
import { RESOURCE_MAP } from '@/data/resources'
import { CULTIVATION } from '@/data/upgrades'
import { CONFIG } from '@/data/config'
import HoverTip from './HoverTip.vue'

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

const available = computed(() =>
  availableIds.value
    .map((id) => props.list.find((u) => u.id === id))
    .filter(Boolean)
    .map((u) => ({
      meta: u,
      eff:
        [
          describeEffects(u.effects)
            .map((t) => t.text)
            .join('，'),
          // 纯解锁型的修真节点（本身没有数值效果）用 note 说明它开出了什么
          u.note || '',
        ]
          .filter(Boolean)
          .join('；'),
      affordable: canAfford(state, u.cost),
    })),
)

const locked = computed(() =>
  props.list
    .filter((u) => !state.upgrades[u.id] && !availableIds.value.includes(u.id))
    .map((u) => ({
      meta: u,
      needs: describeNeeds(u.needs).join('，') || '条件未知',
    })),
)

const researched = computed(() => props.list.filter((u) => state.upgrades[u.id]))

/** 已炼成、可继续祭炼的法宝（只有法宝能祭炼） */
const forged = computed(() =>
  props.list
    .filter((u) => u.kind === 'treasure' && state.upgrades[u.id])
    .map((u) => {
      const cost = refineCost(state, u.id)
      const mult = treasureMult(state, u)
      const text = (m) =>
        describeEffects(scaleEffectsBy(u.effects, m))
          .map((t) => t.text)
          .join('，')
      return {
        meta: u,
        level: treasureLevel(state, u.id),
        mult,
        cost,
        affordable: !!cost && canAfford(state, cost),
        eff: text(mult),
        unitEff: text(mult + CONFIG.TREASURE_REFINE_STEP),
      }
    }),
)

function resName(id) {
  return RESOURCE_MAP[id]?.name || id
}

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
      {{ title }}<span class="hint">{{ hint }}　已参悟 {{ researched.length }} / {{ list.length }}</span>
    </div>
    <div class="box-body">
      <div v-if="filters.length" class="filters">
        <template v-for="(f, i) in filters" :key="f.id">
          <span v-if="i" class="divider">·</span>
          <button class="filter" :class="{ on: filter === f.id }" @click="state.ui[filterKey] = f.id">
            {{ f.name }}
          </button>
        </template>
        <span v-if="note" class="push small dim">{{ note }}</span>
      </div>

      <!-- 已炼成的法宝：可以反复祭炼，每级效果 +30%、花费 ×1.7 递增 -->
      <table v-if="forged.length" class="grid">
        <thead>
          <tr>
            <th>已炼成的法宝</th>
            <th>等级</th>
            <th>当前效果</th>
            <th>下次祭炼</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in forged"
            :key="item.meta.id"
            @mouseenter="highlightCost(item.cost)"
            @mouseleave="clearHighlight()"
          >
            <td class="nowrap">{{ item.meta.name }} <span class="small dim">法宝</span></td>
            <td class="num nowrap">
              Lv.{{ item.level }}<span class="small dim"> ×{{ item.mult.toFixed(2) }}</span>
            </td>
            <td class="eff">{{ item.eff }}</td>
            <td class="cost nowrap">
              <HoverTip :width="380">
                <span class="cost-line">
                  <span
                    v-for="(amount, res) in item.cost"
                    :key="res"
                    :class="{ lack: !enoughOf(state, res, amount) }"
                  >
                    {{ resName(res) }} {{ costText(res, amount) }}
                  </span>
                </span>
                <template #tip>
                  <div class="tip-body">
                    <div class="tip-title">
                      {{ item.meta.name }}
                      <span class="tip-right">法宝 · Lv.{{ item.level }}</span>
                    </div>
                    <div class="tip-desc">{{ item.meta.desc }}</div>

                    <div class="tip-section">价格</div>
                    <div v-for="(amount, res) in item.cost" :key="res" class="tip-row">
                      <span class="k">{{ resName(res) }}</span>
                      <span class="v" :class="{ bad: !enoughOf(state, res, amount) }">
                        {{ costLabel(state, derived, res, amount) }}
                      </span>
                    </div>

                    <div class="tip-section">效果</div>
                    <div class="tip-row">
                      <span class="k">当前</span>
                      <span class="v">{{ item.eff }}（×{{ item.mult.toFixed(2) }}）</span>
                    </div>
                    <div class="tip-row">
                      <span class="k">祭炼后（Lv.{{ item.level + 1 }}）</span>
                      <span class="v good">
                        {{ item.unitEff }}（×{{ (item.mult + 0.3).toFixed(2) }}）
                      </span>
                    </div>
                  </div>
                </template>
              </HoverTip>
            </td>
            <td>
              <button class="btn primary" :disabled="!item.affordable" @click="actions.refineTreasure(item.meta.id)">
                祭炼
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <table class="grid" v-if="available.length">
        <thead>
          <tr>
            <th>名称</th>
            <th>花费</th>
            <th>效果</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in available"
            :key="item.meta.id"
            @mouseenter="highlightCost(item.meta.cost)"
            @mouseleave="clearHighlight()"
          >
            <td class="nowrap">
              {{ item.meta.name }}
              <span v-if="item.meta.kind === 'treasure'" class="small dim">法宝</span>
            </td>
            <!-- 花费列只写「需要多少」；明细按建筑（宗门）的排版放进悬停提示 -->
            <td class="cost nowrap">
              <HoverTip :width="380">
                <span class="cost-line">
                  <span
                    v-for="(amount, res) in item.meta.cost"
                    :key="res"
                    :class="{ lack: !enoughOf(state, res, amount) }"
                  >
                    {{ resName(res) }} {{ costText(res, amount) }}
                  </span>
                </span>
                <template #tip>
                  <div class="tip-body">
                    <div class="tip-title">
                      {{ item.meta.name }}
                      <span class="tip-right">{{ kindName(item.meta) }}</span>
                    </div>
                    <div class="tip-desc">{{ item.meta.desc }}</div>

                    <div class="tip-section">价格</div>
                    <div v-for="(amount, res) in item.meta.cost" :key="res" class="tip-row">
                      <span class="k">{{ resName(res) }}</span>
                      <span class="v" :class="{ bad: !enoughOf(state, res, amount) }">
                        {{ costLabel(state, derived, res, amount) }}
                      </span>
                    </div>

                    <div class="tip-section">效果</div>
                    <div class="tip-row">
                      <span class="k">{{ item.meta.kind === 'treasure' ? '炼成后' : '参悟后' }}</span>
                      <span class="v good">{{ item.eff }}</span>
                    </div>
                    <div v-if="describeNeeds(item.meta.needs).length" class="tip-row">
                      <span class="k">解锁</span>
                      <span class="v">{{ describeNeeds(item.meta.needs).join('，') }}</span>
                    </div>
                  </div>
                </template>
              </HoverTip>
            </td>
            <td class="eff">{{ item.eff }}</td>
            <td>
              <button class="btn primary" :disabled="!item.affordable" @click="actions.research(item.meta.id)">
                {{ item.meta.kind === 'treasure' ? '炼成' : '参悟' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">暂时没有可参悟的条目 —— 换个条件，或者先去攒感悟。</div>

      <details class="fold" v-if="locked.length">
        <summary>条件未达成（{{ locked.length }} 条，达成后才会显现）</summary>
        <table class="grid">
          <tbody>
            <tr v-for="item in locked" :key="item.meta.id" :title="item.meta.desc">
              <td class="nowrap dim">{{ item.meta.name }}</td>
              <td class="small dim">{{ item.needs }}</td>
            </tr>
          </tbody>
        </table>
      </details>

      <details class="fold" v-if="researched.length">
        <summary>已参悟（{{ researched.length }} 条）</summary>
        <div class="small" style="padding-top: 4px">
          <span v-for="u in researched" :key="u.id" class="good">{{ u.name }}　</span>
        </div>
      </details>
    </div>
  </div>
</template>
