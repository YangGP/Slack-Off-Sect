<script setup>
/**
 * 参悟表：修真（解锁层）与技艺·法宝（数值层）共用一张表。
 * 三层信息与猫国一致：可参悟的列表 / 条件未达成的折叠 / 已参悟的折叠。
 * 价格沿用猫国的紧凑写法：够就写需求，不够写「现有/需求」并标红。
 * 修真条目写「参悟」，法宝写「炼成」—— 一个是研究，一个是器物。
 */
import { computed } from 'vue'
import { state, derived, view, actions, highlightCost, clearHighlight } from '@/game/store'
import { canAfford, refineCost, treasureLevel, treasureMult, isProgressionVisible } from '@/game/engine'
import { describeEffects, describeNeeds, scaleEffectsBy } from '@/game/effectsText'
import { effectRows, effectLine } from '@/game/unlockText'
import { fmt, fmtCost } from '@/game/format'
import { costLabel, enough as enoughOf } from '@/game/pricing'
import { RESOURCE_MAP } from '@/data/resources'
import { CULTIVATION, CULTIVATION_STAGE_OF } from '@/data/upgrades'
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

/**
 * 「效果」列的文本。
 *
 * 注意分工：**解锁信息只由 unlockText 表达**（它会把「节点声明」与「建筑门槛」两侧合起来，
 * 而且多个建筑之间有顿号），数值与规则效果才交给 describeEffects。
 * 以前两边都渲染、再加上手写的 note，同一件事会说三遍（例如"解锁建筑 灵脉井；解锁建筑：灵脉井；…"）。
 */
/**
 * 悬停**整行**都要出提示：把事件转给这一行里的提示触发器（`.tip-trigger`）。
 *
 * 为什么不直接把 HoverTip 包住整行：HoverTip 渲染的是一个 `<span>` 外壳，
 * 而 `<tr>` 里只能放 `<td>` —— 包起来会破坏表格结构。转发事件既保住结构，
 * 又让玩家在行内任意位置（名称、等级、花费）悬停都能看到同一条提示。
 */
function rowEnter(ev, meta) {
  if (meta?.cost) highlightCost(meta.cost)
  ev?.currentTarget?.querySelector?.('.tip-trigger')?.dispatchEvent(new MouseEvent('mouseenter'))
}
function rowLeave(ev) {
  clearHighlight()
  ev?.currentTarget?.querySelector?.('.tip-trigger')?.dispatchEvent(new MouseEvent('mouseleave'))
}

/** 修真节点所属的五段主线（技艺 / 法宝没有段，返回 null） */
const stageOf = (id) => CULTIVATION_STAGE_OF[id] || null

/** 这一段的第一行（用来插段标题行） */
function isStageStart(list, i) {
  if (!list[i]?.stage) return false
  return i === 0 || list[i - 1]?.stage?.key !== list[i].stage.key
}

const available = computed(() =>
  availableIds.value
    .map((id) => props.list.find((u) => u.id === id))
    .filter(Boolean)
    // 修真页按五段主线排序（同一段内保持数据顺序），界面因此能分组显示
    .sort((a, b) => (stageOf(a.id)?.index ?? 99) - (stageOf(b.id)?.index ?? 99))
    .map((u) => ({
      meta: u,
      stage: stageOf(u.id),
      affordable: canAfford(state, u.cost),
    })),
)

const locked = computed(() =>
  props.list
    .filter((u) => !state.upgrades[u.id] && !availableIds.value.includes(u.id))
    .filter((u) => isProgressionVisible(state, u.needs))
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
      const supply = derived.upgradeSupply[u.id] ?? 1
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
        eff: text(mult * supply),
        unitEff: text(mult + CONFIG.TREASURE_REFINE_STEP),
        supply,
        upkeep: Object.entries(u.upkeep || {}).map(([res, amount]) => `${resName(res)} ${fmt(amount * mult)}/秒`).join('、'),
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
      {{ title }}<span class="hint">{{ hint }}　已参悟 {{ researched.length }}</span>
      <span class="hint faint">　悬停「花费」查看效果</span>
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
            @mouseenter="rowEnter($event, item)"
            @mouseleave="rowLeave($event)"
          >
            <td class="nowrap">{{ item.meta.name }} <span class="small dim">法宝</span></td>
            <td class="num nowrap">
              Lv.{{ item.level }}<span class="small dim"> ×{{ item.mult.toFixed(2) }}</span>
            </td>
            <td class="eff">{{ item.eff }}<span v-if="item.upkeep" class="small dim"> · {{ item.supply > 0 ? `供能 ${Math.round(item.supply * 100)}%` : '缺灵能停效' }}</span></td>
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
                    <div v-if="item.meta.refine?.materials" class="tip-row">
                      <span class="k">进阶祭炼</span>
                      <span class="v">第{{ (item.meta.refine.materialFromLevel || 0) + 1 }}次起需{{ Object.keys(item.meta.refine.materials).map(resName).join('、') }}，用量随层数增加</span>
                    </div>

                    <div class="tip-section">价格</div>
                    <div v-for="(amount, res) in item.cost" :key="res" class="tip-row">
                      <span class="k">{{ resName(res) }}</span>
                      <span class="v" :class="{ bad: !enoughOf(state, res, amount) }">
                        {{ costLabel(state, derived, res, amount) }}
                      </span>
                    </div>

                    <div class="tip-section">效果</div>
                    <div v-if="item.upkeep" class="tip-row">
                      <span class="k">满供消耗</span>
                      <span class="v">{{ item.upkeep }}；供能不足按比例运行</span>
                    </div>
                    <div class="tip-row">
                      <span class="k">当前</span>
                      <span class="v">{{ item.eff }}（×{{ item.mult.toFixed(2) }}）</span>
                    </div>
                    <div class="tip-row">
                      <span class="k">祭炼后{{ item.upkeep ? '满供' : '' }}（Lv.{{ item.level + 1 }}）</span>
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
            <th class="right">操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(item, i) in available" :key="item.meta.id">
            <tr v-if="isStageStart(available, i)" class="stage-row">
              <td colspan="4">
                {{ item.stage.label }}<span class="small dim">　{{ item.stage.hint }}</span>
              </td>
            </tr>
            <tr @mouseenter="rowEnter($event, item.meta)" @mouseleave="rowLeave($event)">
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
                    <!-- 一个效果一行：数值 / 规则效果各自成行，解锁清单按类成行 -->
                    <div v-for="(row, ri) in effectRows(item.meta, describeEffects)" :key="ri" class="tip-row">
                      <span class="k">{{ row.label }}</span>
                      <span class="v" :class="row.tone || 'good'">{{ row.value }}</span>
                    </div>
                    <div v-if="item.meta.effectDesc" class="tip-row">
                      <span class="k">因此</span>
                      <!-- effectDesc 本身就以「因此」开头，这里去掉前缀，免得标签与正文重复 -->
                      <span class="v">{{ item.meta.effectDesc.replace(/^因此[：:]?\s*/, '') }}</span>
                    </div>
                    <div v-if="item.stage" class="tip-row">
                      <span class="k">所属</span>
                      <span class="v dim">{{ item.stage.label }}　{{ item.stage.hint }}</span>
                    </div>
                    <div v-if="describeNeeds(item.meta.needs).length" class="tip-row">
                      <span class="k">条件</span>
                      <span class="v">{{ describeNeeds(item.meta.needs).join('，') }}</span>
                    </div>
                  </div>
                </template>
              </HoverTip>
            </td>
            <td class="right">
              <button class="btn primary" :disabled="!item.affordable" @click="actions.research(item.meta.id)">
                {{ item.meta.kind === 'treasure' ? '炼成' : '参悟' }}
              </button>
            </td>
          </tr>
          </template>
        </tbody>
      </table>
      <div v-else class="empty">暂时没有可参悟的条目，建设对应产业、推进研究后会逐步开放。</div>

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
        <summary>已参悟（{{ researched.length }} 条）—— 悬停名称看详情</summary>
        <table class="grid" style="padding-top: 4px">
          <tbody>
            <tr v-for="item in researched" :key="item.id">
              <td class="nowrap">
                <HoverTip :width="380">
                  <span class="good">{{ item.name }}</span>
                  <span class="small dim">　{{ kindName(item) }}</span>
                  <template #tip>
                    <div class="tip-body">
                      <div class="tip-title">
                        {{ item.name }}
                        <span class="tip-right">{{ kindName(item) }}</span>
                      </div>
                      <div class="tip-desc">{{ item.desc }}</div>

                      <div class="tip-section">效果</div>
                      <div v-for="(row, ri) in effectRows(item, describeEffects)" :key="ri" class="tip-row">
                        <span class="k">{{ row.label }}</span>
                        <span class="v" :class="row.tone || 'good'">{{ row.value }}</span>
                      </div>
                      <div v-if="item.effectDesc" class="tip-row">
                        <span class="k">因此</span>
                        <!-- effectDesc 本身就以「因此」开头，这里去掉前缀，免得标签与正文重复 -->
                        <span class="v">{{ item.effectDesc.replace(/^因此[：:]?\s*/, '') }}</span>
                      </div>
                    </div>
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
