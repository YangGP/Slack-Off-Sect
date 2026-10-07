import { reactive, computed } from 'vue'
import { CONFIG } from '@/data/config'
import { RESOURCES, VISIBLE_RESOURCES } from '@/data/resources'
import { JOBS } from '@/data/jobs'
import { BUILDINGS } from '@/data/buildings'
import { CULTIVATION, ALL_UPGRADES } from '@/data/upgrades'
import { TECHNIQUES } from '@/data/techniques'
import { ACHIEVEMENTS } from '@/data/achievements'
import { REALMS, ASCEND_REALM_INDEX, REINCARNATE_REALM_INDEX } from '@/data/realms'
import { createInitialState, normalizeState, resetForAscension, resetForReincarnation } from './state'
import * as E from './engine'
import {
  saveToStorage,
  loadFromStorage,
  clearStorage,
  exportSave,
  parseImport,
} from './save'

// ============================================================
// 单例状态
// ============================================================

const restored = loadFromStorage()
export const state = reactive(restored ? normalizeState(restored) : createInitialState())
export const derived = reactive(E.createDerived())

/** 临时 UI 状态（不存档） */
export const ui = reactive({
  offlineReport: null,
  toast: null,
  message: null,
  lastSavedAt: restored?.lastSaveAt || 0,
  /**
   * 悬停购买项时高亮左栏资源行：
   *   need —— 这项花费涉及的资源
   *   lack —— 其中当前不够的那些（左栏会额外标红）
   */
  highlight: { need: [], lack: [] },
})

/** 悬停某个花费时高亮对应资源；cost 形如 { qi: 100, wood: 20 } */
export function highlightCost(cost) {
  const need = Object.keys(cost || {})
  ui.highlight = {
    need,
    lack: need.filter((res) => (state.resources[res] || 0) < cost[res]),
  }
}

export function clearHighlight() {
  if (ui.highlight.need.length) ui.highlight = { need: [], lack: [] }
}

E.recompute(state, derived)

// ============================================================
// 离线收益
// ============================================================

function applyOfflineProgress() {
  if (!restored) return
  if (state.settings.offlineProgress === false) return
  const elapsed = (Date.now() - (restored.lastSaveAt || Date.now())) / 1000
  if (elapsed < 30) return
  const capSeconds = Math.floor((derived.offlineHours || CONFIG.OFFLINE_CAP_HOURS) * 3600)
  const seconds = Math.min(elapsed, capSeconds)
  const result = E.simulateOffline(state, derived, seconds, {})
  const gains = Object.entries(result.gains)
    .map(([id, amount]) => ({
      id,
      name: RESOURCES.find((r) => r.id === id)?.name || id,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)
  ui.offlineReport = {
    awaySeconds: elapsed,
    simulatedSeconds: seconds,
    capped: elapsed > capSeconds,
    gains,
    disciples: result.disciples || 0,
  }
  if (gains.length) {
    state.stats.offlineGains += gains.reduce((s, g) => s + g.amount, 0)
  }
  const extra = result.disciples > 0 ? `，另有 ${result.disciples} 名弟子慕名而来` : ''
  E.pushLog(
    state,
    `闭关 ${E.clamp(Math.floor(elapsed / 60), 0, 999999)} 分钟，弟子们替你干活${
      gains.length ? '，收获见离线报告' : '，可惜库房已满'
    }${extra}`,
    'event',
  )
  E.recompute(state, derived)
}

applyOfflineProgress()

// ============================================================
// 主循环
// ============================================================

let handle = null
let last = Date.now()
let autosaveAcc = 0
let recomputeAcc = 0

/** 把一段时间推进游戏；跨度太大时切成 1 秒步长，避免公式失真 */
export function advance(dt) {
  if (dt <= 0) return
  if (dt > 3) {
    const result = E.simulateOffline(state, derived, Math.min(dt, 6 * 3600), {})
    const parts = Object.entries(result.gains)
      .slice(0, 4)
      .map(([id, amount]) => `${RESOURCES.find((r) => r.id === id)?.name || id}+${Math.round(amount)}`)
    if (dt > 60) {
      E.pushLog(state, `挂机 ${Math.round(dt)} 秒${parts.length ? '，' + parts.join('，') : ''}`, 'info')
    }
  } else {
    E.tick(state, derived, dt)
  }
  E.recompute(state, derived)
}

function step() {
  const now = Date.now()
  let dt = (now - last) / 1000
  last = now
  if (dt > 0.001) {
    advance(dt)
    autosaveAcc += dt
    recomputeAcc += dt
    if (recomputeAcc >= CONFIG.RECOMPUTE_MIN_GAP) {
      recomputeAcc = 0
      E.recompute(state, derived)
    }
    if (state.settings.autosave && autosaveAcc >= CONFIG.AUTOSAVE_MS / 1000) {
      autosaveAcc = 0
      saveNow()
    }
  } else {
    E.recompute(state, derived)
  }
}

function onHide() {
  if (document.visibilityState === 'hidden') saveNow()
}

function onBeforeUnload() {
  saveNow()
}

export function startLoop() {
  if (handle) return
  last = Date.now()
  handle = setInterval(step, CONFIG.TICK_MS)
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('beforeunload', onBeforeUnload)
}

export function stopLoop() {
  if (!handle) return
  clearInterval(handle)
  handle = null
  document.removeEventListener('visibilitychange', onHide)
  window.removeEventListener('beforeunload', onBeforeUnload)
}

export function saveNow() {
  const ok = saveToStorage(state)
  if (ok) ui.lastSavedAt = Date.now()
  return ok
}

/** 任何会改变数值的操作之后调用：立即重算 + 提示 */
function afterAction(text, kind = 'good') {
  E.recompute(state, derived)
  if (text) toast(text, kind)
}

export function toast(text, kind = 'info') {
  ui.toast = { text, kind, at: Date.now() }
  ui.message = text
}

// ============================================================
// 对外动作
// ============================================================

export const actions = {
  buy(id, count = 1) {
    const meta = E.BUILDING_MAP[id]
    const n = E.buyBuilding(state, derived, id, count)
    if (n > 0) {
      afterAction(`建成 ${meta?.name} ×${n}`, 'good')
      return true
    }
    toast(meta && !E.isBuildingUnlocked(state, id) ? '尚未解锁该建筑' : '资源不足', 'bad')
    return false
  },
  buyMax(id) {
    const n = E.maxAffordable(state, id)
    if (n <= 0) {
      toast('资源不足', 'bad')
      return 0
    }
    return actions.buy(id, n)
  },
  sell(id, count = 1) {
    const n = E.sellBuilding(state, derived, id, count)
    if (n > 0) afterAction(`拆除 ${E.BUILDING_MAP[id]?.name} ×${n}`, 'info')
    return n
  },
  toggle(id) {
    const on = E.toggleBuilding(state, derived, id)
    if (on === null) {
      toast('这座建筑没有维护费，停用只会白亏产出', 'bad')
      return null
    }
    afterAction(`${E.BUILDING_MAP[id]?.name} ${on ? '启用' : '停用'}`, 'info')
    return on
  },
  shiftJob(jobId, delta) {
    E.shiftJob(state, derived, jobId, delta)
  },
  setJob(jobId, value) {
    E.setJob(state, derived, jobId, value)
  },
  fillJob(jobId) {
    E.fillJob(state, derived, jobId)
    afterAction(`闲散弟子已派往${JOBS.find((j) => j.id === jobId)?.name}`, 'good')
  },
  clearJobs() {
    for (const j of JOBS) state.disciples.jobs[j.id] = 0
    afterAction('所有弟子回家歇着了', 'info')
  },
  research(id) {
    const ok = E.research(state, derived, id)
    afterAction(ok ? `参悟《${E.UPGRADE_MAP[id]?.name}》` : '', ok ? 'good' : '')
    return ok
  },
  /** 制作一份（瞬发） */
  craft(id, { times = 1 } = {}) {
    const before = state.stats.craftCount
    E.craft(state, derived, id, { times })
    const made = state.stats.craftCount - before
    if (made > 0) afterAction(`制作完成 ×${made}`, 'good')
    else toast('材料不足或仓储已满', 'bad')
  },

  /** 按比例做一批：把「材料能做出来的份数」取 frac 份一次做掉（界面上的 ¼料 / ½料 / 全部） */
  craftBatch(id, frac = 1) {
    const before = state.stats.craftCount
    const made = E.craftBatch(state, derived, id, frac)
    if (made > 0) afterAction(`制作完成 ×${made}`, 'good')
    else toast('材料不足或仓储已满', 'bad')
  },

  /** 手动吸取天地灵气（开局唯一的灵气来源，对标猫国的采集猫薄荷） */
  drawQi(times = 1) {
    let total = 0
    for (let i = 0; i < times; i++) total += E.drawQi(state, derived)
    E.recompute(state, derived)
    return total
  },

  /** 祭炼法宝：每级效果 +30%，花费 ×1.7 递增 */
  refineTreasure(id) {
    const lv = E.refineTreasure(state, derived, id)
    if (lv > 0) toast(`《${E.UPGRADE_MAP[id]?.name}》祭炼至 ${lv} 级`, 'good')
    else toast('未炼成或材料不足', 'bad')
  },

  /** 「自动制作」的每配方开关（需要先参悟《心有灵犀》，总开关在设置页） */
  toggleAutoCraft(id) {
    const on = E.toggleAutoCraft(state, derived, id)
    if (on === false && !derived.autoCraftUnlocked) toast('需参悟《心有灵犀》或取得首颗道果', 'bad')
  },
  setCraftTarget(id, value) {
    if (E.setCraftTarget(state, derived, id, value)) {
      E.recompute(state, derived)
      saveNow()
    }
  },
  breakthrough() {
    const ok = E.breakthrough(state, derived)
    if (ok) toast(`突破成功：${REALMS[state.realm].name}`, 'good')
  },
  /**
   * 转世重修：化神期起可做，清空的东西与飞升完全一样（资源 / 弟子 / 建筑 /
   * 修真 / 技艺·法宝 / 境界），只结算仙缘。门槛低 → 到手少（化神期约 22 点）。
   * 与飞升的分工见 docs/DESIGN.md「转世与飞升」。
   */
  reincarnate() {
    if (!E.canReincarnate(state)) {
      toast('尚未到化神期，无法转世', 'bad')
      return false
    }
    const gain = E.reincarnationGain(state, derived)
    const name = REALMS[state.realm].name
    resetForReincarnation(state, gain)
    E.recompute(state, derived)
    E.pushLog(state, `自【${name}】转世重修，携仙缘 ${gain} 点再入红尘`, 'realm')
    saveNow()
    toast(`转世成功，获得仙缘 ${gain}`, 'good')
    return true
  },
  ascend() {
    if (!E.canAscend(state)) {
      toast('尚未到渡劫期，无法飞升', 'bad')
      return false
    }
    const gain = E.ascensionGain(state, derived)
    const name = REALMS[state.realm].name
    resetForAscension(state, gain)
    E.recompute(state, derived)
    E.pushLog(state, `自【${name}】飞升，携仙缘 ${gain} 点转世重修`, 'realm')
    saveNow()
    toast(`飞升成功，获得仙缘 ${gain} 与 1 颗道果，道果统筹已开启`, 'good')
    return true
  },
  /** 调试/彩蛋：立刻触发一次奇遇 */
  resolveChoice(index) {
    const event = E.resolveChoice(state, derived, index)
    if (!event) return false
    afterAction('', '')
    saveNow()
    return true
  },
  triggerEvent() {
    E.fireEvent(state, derived)
    afterAction('', '')
  },
  save() {
    saveNow()
    toast('已存档', 'good')
  },
  /** 清空宗门纪事（右侧列表顶部的小链接） */
  clearLog() {
    state.log = []
    toast('纪事已清空', 'info')
  },
  exportText() {
    return exportSave(state)
  },
  importText(text) {
    const next = parseImport(text)
    const keys = Object.keys(state)
    for (const k of keys) {
      if (!(k in next)) delete state[k]
    }
    Object.assign(state, next)
    E.recompute(state, derived)
    saveNow()
    toast('读档成功', 'good')
    return true
  },
  resetGame() {
    clearStorage()
    const fresh = createInitialState()
    const keys = Object.keys(state)
    for (const k of keys) if (!(k in fresh)) delete state[k]
    Object.assign(state, fresh)
    E.recompute(state, derived)
    saveNow()
    ui.offlineReport = null
    toast('已重新开山立派', 'good')
  },
  setSetting(key, value) {
    state.settings[key] = value
    saveNow()
  },
  setTab(tab) {
    state.ui.tab = tab
  },
  dismissOffline() {
    ui.offlineReport = null
  },
}

// ============================================================
// 常用派生视图（供组件使用）
// ============================================================

export const view = {
  visibleResources: computed(() =>
    VISIBLE_RESOURCES.filter(
      (id) => id === 'qi' || state.seen[id] || (state.resources[id] || 0) > 0 || (state.peak?.[id] || 0) > 0,
    ).map((id) => RESOURCES.find((r) => r.id === id)),
  ),
  idle: computed(() => E.idleDisciples(state)),
  // 注意：这几个 computed 统一返回 **id 数组**，与 derived.unlockedBuildings 等保持一致，
  // 避免出现「拿 id 去 includes 一个对象数组」这类判断永远为假的坑。
  assignableJobs: computed(() =>
    JOBS.filter((j) => E.isJobUnlocked(state, j)).map((j) => j.id),
  ),
  lockedJobs: computed(() => JOBS.filter((j) => !E.isJobUnlocked(state, j)).map((j) => j.id)),
  /** 两层合起来（引擎派生数据里也是这个口径） */
  researchableUpgrades: computed(() =>
    ALL_UPGRADES.filter((u) => !state.upgrades[u.id] && E.isUpgradeUnlocked(state, u)).map((u) => u.id),
  ),
  researchedUpgrades: computed(() =>
    ALL_UPGRADES.filter((u) => state.upgrades[u.id]).map((u) => u.id),
  ),
  /** 修真（解锁层）与技艺·法宝（数值层）各自的可参悟 / 已参悟 */
  researchableCultivation: computed(() =>
    CULTIVATION.filter((u) => !state.upgrades[u.id] && E.isUpgradeUnlocked(state, u)).map((u) => u.id),
  ),
  researchableSkills: computed(() =>
    TECHNIQUES.filter((u) => !state.upgrades[u.id] && E.isUpgradeUnlocked(state, u)).map((u) => u.id),
  ),
  researchedCultivation: computed(() => CULTIVATION.filter((u) => state.upgrades[u.id]).map((u) => u.id)),
  researchedSkills: computed(() => TECHNIQUES.filter((u) => state.upgrades[u.id]).map((u) => u.id)),
  unlockedAchievements: computed(() => ACHIEVEMENTS.filter((a) => state.achievements[a.id])),
  lockedAchievements: computed(() => ACHIEVEMENTS.filter((a) => !state.achievements[a.id])),
  achievementsCount: computed(() => Object.keys(state.achievements).length),
  activeBuffs: computed(() => state.buffs.filter((b) => (b.until || 0) > Date.now())),
  nextRealm: computed(() => REALMS[state.realm + 1] || null),
  realmName: computed(() => REALMS[state.realm]?.name || '凡体'),
  ascendGain: computed(() => E.ascensionGain(state, derived)),
  canAscend: computed(() => E.canAscend(state)),
  reincarnateGain: computed(() => E.reincarnationGain(state, derived)),
  canReincarnate: computed(() => E.canReincarnate(state)),
  progressToReincarnate: computed(() =>
    Math.min(1, state.realm / Math.max(1, REINCARNATE_REALM_INDEX)),
  ),
  progressToAscend: computed(() =>
    Math.min(1, state.realm / Math.max(1, ASCEND_REALM_INDEX)),
  ),
  buildingsByGroup: computed(() => {
    const groups = {}
    for (const b of BUILDINGS) {
      const unlocked = E.isBuildingUnlocked(state, b.id)
      if (!unlocked && !(state.buildings[b.id]?.count > 0)) continue
      ;(groups[b.group] ||= []).push(b)
    }
    return groups
  }),
}

export { E as engine, CONFIG, BUILDINGS, JOBS, CULTIVATION, TECHNIQUES, ALL_UPGRADES, ACHIEVEMENTS, REALMS, RESOURCES }
