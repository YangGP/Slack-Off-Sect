<script setup>
import { computed } from 'vue'
import { state, derived, view, ui } from '@/game/store'
import { fmt, fmtInt, fmtPercent, fmtRate, fmtTime } from '@/game/format'
import { idleDisciples, nextArrivalIn, resourceFlow } from '@/game/engine'
import ResourcePanel from './components/ResourcePanel.vue'
import TabNav from './components/TabNav.vue'
import SectPanel from './components/SectPanel.vue'
import DisciplePanel from './components/DisciplePanel.vue'
import CultivationPanel from './components/CultivationPanel.vue'
import SkillPanel from './components/SkillPanel.vue'
import CraftPanel from './components/CraftPanel.vue'
import RealmPanel from './components/RealmPanel.vue'
import AchievementPanel from './components/AchievementPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import LogPanel from './components/LogPanel.vue'
import CalendarPanel from './components/CalendarPanel.vue'
import TotalsPanel from './components/TotalsPanel.vue'
import BuffBar from './components/BuffBar.vue'
import OfflineModal from './components/OfflineModal.vue'

const panels = {
  sect: SectPanel,
  disciples: DisciplePanel,
  cultivation: CultivationPanel,
  skills: SkillPanel,
  realm: RealmPanel,
  achievements: AchievementPanel,
  settings: SettingsPanel,
}

const activePanel = computed(() => panels[state.ui.tab] || SectPanel)
const idle = computed(() => idleDisciples(state))
const qiFlow = computed(() => resourceFlow(derived, 'qi'))
/** 有空房时顶栏显示「下一位弟子还有多久」 */
const waitNext = computed(() => nextArrivalIn(state, derived))
// 最近一次操作提示，4 秒后自行消失（不弹气泡，只在状态行显示一行字）
const status = computed(() => (ui.toast && Date.now() - ui.toast.at < 4000 ? ui.toast.text : ''))
</script>

<template>
  <div class="wrap">
    <div class="title-line">
      摸鱼宗门<span class="sub">Slack Off Sect</span>
      <a class="github-link" href="https://github.com/YangGP/Slack-Off-Sect" target="_blank" rel="noopener noreferrer" aria-label="在新标签页打开项目 GitHub 仓库">GitHub ↗</a>
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
      <span class="sep">·</span>士气
      <b :class="derived.morale < 60 ? 'bad' : ''">{{ fmt(derived.morale) }}%</b>
      <span class="sep">·</span>灵气进项 <b class="good">{{ fmtRate(qiFlow.income) }}</b>
      <span class="sep">·</span>出项
      <b class="bad">{{ fmtRate(-qiFlow.expense) }}</b>
      <span class="dim" v-if="derived.maintenance?.qi">（含阵眼维护 {{ fmtRate(-derived.maintenance.qi) }}）</span>
      <span class="sep">·</span>净额
      <b :class="qiFlow.net < 0 ? 'bad' : 'good'">{{ fmtRate(qiFlow.net) }}</b>
      <span class="sep">·</span>全局 <b>×{{ derived.globalMult.toFixed(2) }}</b>
      <span class="dim">（加成 +{{ fmtPercent(derived.ratioAll) }}）</span>
      <template v-if="state.karma > 0">
        <span class="sep">·</span>仙缘 <b>{{ fmtInt(state.karma) }}</b>
      </template>
      <span class="sep">·</span>挂机 <b>{{ fmtTime(state.stats.playTime) }}</b>
    </div>

    <div class="status-line">{{ status }}</div>

    <TabNav />

    <div class="cols">
      <!-- 左列：资源明细 + 炼制（炼制只在这儿，不占页签） -->
      <aside class="left">
        <ResourcePanel />
        <CraftPanel />
      </aside>

      <!-- 中列：唯一的一层边框容器，建筑网格/面板从顶部直接开始 -->
      <main class="main">
        <div class="panel">
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
</template>
