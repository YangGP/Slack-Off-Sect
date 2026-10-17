<script setup>
import { computed } from 'vue'
import { state, derived, view, ui, actions } from '@/game/store'
import { fmtInt, fmtPercent, fmtRate, fmtTime } from '@/game/format'
import { ZERO, moneyIsPositive, moneySubtract } from '@/game/decimal'
import { idleDisciples, nextArrivalIn, resourceFlow } from '@/game/engine'
import { CURRENT_VERSION } from '@/data/changelog'
import { IS_DEV_PREVIEW } from '@/game/deployment'
import { isModuleEnabled } from '@/data/modules'
import { MODULE_UI } from '@/modules/uiRegistry'
import ResourcePanel from './components/ResourcePanel.vue'
import TabNav from './components/TabNav.vue'
import SectPanel from './components/SectPanel.vue'
import DisciplePanel from './components/DisciplePanel.vue'
import CultivationPanel from './components/CultivationPanel.vue'
import SkillPanel from './components/SkillPanel.vue'
import CraftPanel from './components/CraftPanel.vue'
import RealmPanel from './components/RealmPanel.vue'
import FaithPanel from './components/FaithPanel.vue'
import AchievementPanel from './components/AchievementPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import DebugPanel from './components/DebugPanel.vue'
import LogPanel from './components/LogPanel.vue'
import CalendarPanel from './components/CalendarPanel.vue'
import TotalsPanel from './components/TotalsPanel.vue'
import BuffBar from './components/BuffBar.vue'
import OfflineModal from './components/OfflineModal.vue'
import ChangelogModal from './components/ChangelogModal.vue'
import AnalyticsModal from './components/AnalyticsModal.vue'
import HabitabilityTip from './components/HabitabilityTip.vue'
import HoverTip from './components/HoverTip.vue'

const corePanels = {
  sect: SectPanel,
  disciples: DisciplePanel,
  cultivation: CultivationPanel,
  skills: SkillPanel,
  craft: CraftPanel,
  faith: FaithPanel,
  realm: RealmPanel,
  achievements: AchievementPanel,
  settings: SettingsPanel,
}

/** 核心面板 + 已启用模块贡献的面板（模块关闭时不挂载） */
const panels = computed(() => {
  const out = { ...corePanels }
  for (const m of MODULE_UI) {
    if (isModuleEnabled(state, m.id)) out[m.tab.id] = m.panel
  }
  return out
})

const activePanel = computed(() => ui.debug && ui.debugPage ? DebugPanel : panels.value[state.ui.tab] || SectPanel)
const idle = computed(() => idleDisciples(state))
const qiFlow = computed(() => resourceFlow(derived, 'qi'))
/** 顶栏的灵气出项与阵眼维护按正数展示：金额取反只能在脚本里用 Decimal 助手算 */
const qiExpense = computed(() => moneySubtract(ZERO, qiFlow.value.expense))
const qiMaintenance = computed(() => moneySubtract(ZERO, derived.maintenance?.qi ?? ZERO))
/** 维护费是金额（Decimal 恒为真）：只有真的非零才写「含阵眼维护」 */
const hasQiMaintenance = computed(() => moneyIsPositive(derived.maintenance?.qi ?? ZERO))
/** 净额正负：金额是对象，模板里不能直接和 0 比较 */
const qiNetNegative = computed(() => qiFlow.value.net.isNegative())
const karmaPositive = computed(() => moneyIsPositive(state.karma))
/** 有空房时顶栏显示「下一位弟子还有多久」 */
const waitNext = computed(() => nextArrivalIn(state, derived))
// 最近一次操作提示，4 秒后自行消失（不弹气泡，只在状态行显示一行字）
const status = computed(() => ui.toast?.text || '')
/** 离线进度是有界比例（Number），取整只在脚本里做 */
const offlinePercent = computed(() => Math.floor(ui.offlineProgress.percent))
const analyticsDialogOpen = computed(() => !ui.rulesetBlock && !ui.offlineLoading && !ui.offlineReport && !ui.saveLoadError
  && (ui.analyticsConsent === 'unknown' || ui.analyticsFailureOpen))

/** D7 大版本提示：导出的是旧键原始载荷，不是内存里的空白新状态。 */
function downloadLegacy() {
  const text = actions.exportLegacySave()
  if (!text) return
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = '摸鱼宗门-旧规则存档备份.json'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div v-if="ui.rulesetBlock" class="offline-loading" role="alertdialog" aria-modal="true" aria-label="规则代际提示">
    <div class="offline-loading-content">
      <div class="offline-loading-head">规则代际更新：需要开始新宗门</div>
      <div class="box-body">
        <p class="small">检测到旧规则存档（D7 之前的代际）。新规则不继承资源、建筑、弟子、研究、仙缘、道果、成就及累计统计；旧存档保留为原始备份，不会被删除或覆盖。</p>
        <div class="btn-row">
          <button class="btn" @click="downloadLegacy">导出旧存档</button>
          <button class="btn primary" @click="actions.startNewGeneration()">开始新宗门</button>
        </div>
      </div>
    </div>
  </div>
  <div v-if="ui.offlineLoading" class="offline-loading" role="status" aria-live="polite">
    <div class="offline-loading-content">
      <div class="offline-loading-head">
        <span class="loading-spinner" aria-hidden="true"></span>
        <span>正在结算挂机收益…</span>
        <span class="offline-loading-percent">{{ offlinePercent }}%</span>
      </div>
      <progress class="offline-progress" aria-label="离线结算进度" :value="ui.offlineProgress.percent" max="100">{{ offlinePercent }}%</progress>
      <div class="offline-loading-detail">
        <template v-if="ui.offlineProgress.totalSeconds">已结算 {{ fmtTime(ui.offlineProgress.completedSeconds) }} / {{ fmtTime(ui.offlineProgress.totalSeconds) }}</template>
        <template v-else>正在准备结算…</template>
      </div>
    </div>
  </div>
  <div class="wrap" :inert="!!ui.rulesetBlock || ui.offlineLoading || analyticsDialogOpen" :aria-busy="ui.offlineLoading">
    <div v-if="ui.saveLoadError" class="update-notice bad" role="alert">
      <strong>本地存档读取失败，游戏与保存已暂停，原存档未被覆盖。</strong>
      <span>请在设置中导入有效备份。错误：{{ ui.saveLoadError }}</span>
    </div>
    <div v-if="ui.saveRecoveryNotice" class="update-notice" role="status">{{ ui.saveRecoveryNotice }}</div>
    <div class="title-line">
      摸鱼宗门<span class="sub">Slack Off Sect</span>
      <span v-if="IS_DEV_PREVIEW" class="small warn">开发预览版 · dev1</span>
      <a class="github-link" href="https://github.com/YangGP/Slack-Off-Sect" target="_blank" rel="noopener noreferrer" aria-label="在新标签页打开项目 GitHub 仓库">GitHub ↗</a>
    </div>

    <div v-if="IS_DEV_PREVIEW" class="update-notice" role="note" aria-label="开发预览提示">
      开发预览版使用独立存档，可能随开发调整规则；游玩数据采集已关闭。
    </div>
    <div class="update-notice" role="note" aria-label="版本更新提示">
      <HoverTip :label="`${CURRENT_VERSION} · 更新说明`"><template #tip><p>资源产出、建筑造价与修真解锁已大幅调整。建议旧档达到转世条件后转世，重新体验新版节奏。</p></template></HoverTip>
      <button class="btn" type="button" @click="actions.setTab('realm')">前往境界</button>
    </div>

    <div class="stat-line">
      境界 <b>{{ view.realmName.value }}</b>
      <span class="sep">·</span>弟子 <b>{{ state.disciples.total }}/{{ derived.maxDisciples }}</b>
      <template v-if="waitNext !== null">
        <span class="dim">（下一位 {{ fmtTime(waitNext) }}）</span>
      </template>
      <template v-if="idle > 0">
        <span class="sep">·</span>闲散 <b class="warn">{{ idle }}</b>
      </template>
      <span class="sep">·</span><HabitabilityTip />
      <span v-if="derived.discipleMult < 1" class="bad">（弟子产出减半）</span>
      <span v-if="derived.leaveChance > 0" class="bad">（有离开风险）</span>
      <span class="sep">·</span>灵气进项 <b class="good">{{ fmtRate(qiFlow.income) }}</b>
      <span class="sep">·</span>出项
      <b class="bad">{{ fmtRate(qiExpense) }}</b>
      <span class="dim" v-if="hasQiMaintenance">（含阵眼维护 {{ fmtRate(qiMaintenance) }}）</span>
      <span class="sep">·</span>净额
      <b :class="qiNetNegative ? 'bad' : 'good'">{{ fmtRate(qiFlow.net) }}</b>
      <span class="sep">·</span>全局 <b>×{{ derived.globalMult.toFixed(2) }}</b>
      <span class="dim">（加成 +{{ fmtPercent(derived.ratioAll) }}）</span>
      <template v-if="karmaPositive">
        <span class="sep">·</span>仙缘 <b>{{ fmtInt(state.karma) }}</b>
      </template>
      <span class="sep">·</span>挂机 <b>{{ fmtTime(state.stats.playTime) }}</b>
    </div>

    <div class="status-line">{{ status }}</div>

    <TabNav />

    <div class="cols">
      <!-- 左列：资源明细与常用快捷；完整操作在炼制页 -->
      <aside class="left">
        <ResourcePanel />
        <CraftPanel compact />
      </aside>

      <!-- 中列：唯一的一层边框容器，建筑网格/面板从顶部直接开始 -->
      <main class="main">
        <div class="panel" :class="{ 'panel-craft': !(ui.debug && ui.debugPage) && state.ui.tab === 'craft' }">
          <component :is="activePanel" />
        </div>
      </main>

      <!-- 右列：天象 + 历法 + 累计 + 宗门纪事 -->
      <aside class="right">
        <BuffBar />
        <CalendarPanel />
        <TotalsPanel />
        <LogPanel />
      </aside>
    </div>

    <OfflineModal />
  </div>
  <ChangelogModal />
  <AnalyticsModal />
</template>
