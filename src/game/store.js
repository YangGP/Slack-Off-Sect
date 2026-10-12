import { reactive, computed } from 'vue'
import { CONFIG } from '@/data/config'
import { CRAFT_MAP, normalizeQuickCrafts } from '@/data/crafts'
import { RESOURCES, VISIBLE_RESOURCES, resourceName } from '@/data/resources'
import { JOBS } from '@/data/jobs'
import { BUILDINGS } from '@/data/buildings'
import { CULTIVATION, ALL_UPGRADES } from '@/data/upgrades'
import { TECHNIQUES } from '@/data/techniques'
import { ACHIEVEMENTS } from '@/data/achievements'
import { REALMS, ASCEND_REALM_INDEX, REINCARNATE_REALM_INDEX } from '@/data/realms'
import { createInitialState, resetForAscension, resetForReincarnation } from './state'
import * as E from './engine'
import { atLeast } from './numbers'
import { createSaveRepository, exportSave, parseImport } from './save'
import { createGame, createRuntime } from './runtime'

// ============================================================
// 单例状态
// ============================================================

let restored = null
let initialized = false
export const state = reactive(createInitialState())
export const derived = reactive(E.createDerived())

/** 临时 UI 状态（不存档） */
export const ui = reactive({
  saveLoadError: '',
  saveRecoveryNotice: '',
  debug: false,
  debugPage: false,
  offlineReport: null,
  toast: null,
  message: null,
  lastSavedAt: 0,
  /**
   * 悬停购买项时高亮左栏资源行：
   *   need —— 这项花费涉及的资源
   *   lack —— 其中当前不够的那些（左栏会额外标红）
   */
  highlight: { need: [], lack: [] },
})

const game = createGame({ state, derived })
const repository = createSaveRepository()
const runtime = createRuntime({ game, repository,
  onSaved: at => { ui.lastSavedAt = at },
  onAdvance: reportAdvance,
})

/** 明确启动入口；导入 store 不读取存档、不结算离线、不注册浏览器事件。 */
export function initializeGame() {
  if (initialized) return
  initialized = true
  restored = runtime.load()
  ui.saveLoadError = repository.loadError
  ui.saveRecoveryNotice = restored?.__recoveryNotice || ''
  ui.lastSavedAt = restored?.lastSaveAt || 0
  applyOfflineProgress()
  runtime.resetClock()
  // 控制台执行 DEBUG 开启本次页面的调试入口；刷新后恢复隐藏，不写入存档。
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'DEBUG', {
      configurable: true,
      get() {
        ui.debug = true
        ui.debugPage = true
        return '调试模式已开启'
      },
    })
  }

}

/** 悬停某个花费时高亮对应资源；cost 形如 { qi: 100, wood: 20 } */
export function highlightCost(cost) {
  const need = Object.keys(cost || {})
  ui.highlight = {
    need,
    lack: need.filter((res) => !atLeast(state.resources[res] || 0, cost[res])),
  }
}

export function clearHighlight() {
  if (ui.highlight.need.length) ui.highlight = { need: [], lack: [] }
}

// ============================================================
// 离线收益
// ============================================================

function applyOfflineProgress() {
  if (!restored || restored.__recoveryNotice) return
  if (state.settings.offlineProgress === false) return
  const elapsed = (Date.now() - (restored.lastSaveAt || Date.now())) / 1000
  if (elapsed < 30) return
  const capSeconds = Math.floor((derived.offlineHours || CONFIG.OFFLINE_CAP_HOURS) * 3600)
  const seconds = Math.min(elapsed, capSeconds)
  const result = game.simulateOffline(seconds, { startAt: restored.lastSaveAt })
  const gains = Object.entries(result.gains)
    .map(([id, amount]) => ({
      id,
      name: resourceName(id),
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


// ============================================================
// 主循环
// ============================================================

/** 推进入口与主循环共用实例的结算策略。 */
export function advance(dt) {
  const result = game.advance(dt)
  reportAdvance(dt, result)
}

function reportAdvance(dt, result) {
  if (!result || dt <= 60) return
  const parts = Object.entries(result.gains).slice(0, 4)
    .map(([id, amount]) => `${resourceName(id)}+${Math.round(amount)}`)
  E.pushLog(state, `挂机 ${Math.round(dt)} 秒${parts.length ? '，' + parts.join('，') : ''}`, 'info')
}

function onHide() {
  if (document.visibilityState === 'hidden') saveNow()
}

function onBeforeUnload() {
  saveNow()
}

export function startLoop() {
  initializeGame()
  if (!runtime.start()) return
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('beforeunload', onBeforeUnload)
}

export function stopLoop() {
  runtime.stop()
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide)
  if (typeof window !== 'undefined') window.removeEventListener('beforeunload', onBeforeUnload)
}

export function saveNow() {
  return runtime.save()
}

/** 引擎动作已更新派生数据，这里只负责操作提示。 */
function afterAction(text, kind = 'good') {
  if (text) toast(text, kind)
}

let toastHandle = null

export function toast(text, kind = 'info') {
  if (toastHandle) clearTimeout(toastHandle)
  toastHandle = setTimeout(() => { ui.toast = null; toastHandle = null }, 4000)
  toastHandle.unref?.()
  ui.toast = { text, kind, at: Date.now() }
  ui.message = text
}

// ============================================================
// 对外动作
// ============================================================

export const actions = {
  setDebugResource(id, amount) {
    if (!ui.debug) return false
    if (ui.saveLoadError) {
      toast('存档读取失败，请先在设置中导入有效备份', 'bad')
      return false
    }
    const meta = RESOURCES.find(r => r.id === id)
    if (!meta || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) {
      toast('数量必须是非负有限数字，且不超过安全整数上限', 'bad')
      return false
    }
    const value = meta.integer ? Math.floor(amount) : amount
    state.resources[id] = value
    if (id === 'karma' || id === 'dao') state[id] = value
    if (value > 0) state.seen[id] = true
    E.trackPeak(state)
    E.recompute(state, derived)
    const saved = saveNow()
    toast(saved ? `${meta.name}已修改并保存` : `${meta.name}已修改，但保存失败`, saved ? 'good' : 'bad')
    return true
  },
  closeDebug() {
    ui.debug = false
    ui.debugPage = false
  },
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
    E.clearJobs(state, derived)
    afterAction('所有弟子回家歇着了', 'info')
  },
  assignDisciples(ids, roleId) {
    if (!E.assignDisciples(state, derived, ids, roleId)) return false
    afterAction('所选弟子的岗位已调整', 'good')
    return true
  },
  breakthroughDisciples(ids) {
    const result = E.breakthroughDisciples(state, derived, ids)
    afterAction(`突破成功 ${result.success} 人，失败 ${result.failed} 人${result.insufficient ? '；材料不足，已停止' : ''}`, result.insufficient ? 'bad' : 'info')
    return result
  },
  dismissDisciples(ids) {
    const preview = E.discipleDismissalPreview(state, ids)
    if (!preview.count) return { dismissed: 0 }
    if (!preview.affordable) {
      toast('灵气不足，无法逐出所选弟子', 'bad')
      return { dismissed: 0 }
    }
    const member = preview.count === 1 ? state.disciples.members.find(member => member.id === preview.ids[0]) : null
    if (!window.confirm(`确定将${member ? member.name : '所选 ' + preview.count + ' 名弟子'}逐出师门？\n需支付灵气 ${preview.cost.qi.toLocaleString('zh-CN')}（累计消耗×（已满年数＋1），每人向上取整）。\n逐出后移除个人成长与岗位，无法撤回。`)) return { dismissed: 0 }
    const result = E.dismissDisciples(state, derived, preview.ids, preview)
    if (result.dismissed) {
      afterAction(`已逐出 ${result.dismissed} 人，支付灵气 ${result.cost.qi}`, 'info')
      saveNow()
    } else toast(result.reason === 'changed' ? '逐出费用或人数已变化，请重新确认' : '灵气不足，未逐出弟子', 'bad')
    return result
  },
  research(id) {
    const ok = E.research(state, derived, id)
    afterAction(ok ? `参悟《${E.UPGRADE_MAP[id]?.name}》` : '', ok ? 'good' : '')
    return ok
  },
  /** 手动制作即时扣料与出货，自动加工单独遵守工位节拍。 */
  craft(id, { times = 1 } = {}) {
    const made = Number.isSafeInteger(times) && times > 0 ? E.craft(state, derived, id, { times }) : 0
    if (made > 0) afterAction(`制作完成 ×${made}`, 'good')
    else toast('材料不足或仓储已满', 'bad')
  },

  /** 按当前材料与仓容比例立即制作。 */
  craftBatch(id, frac = 1) {
    const made = E.craftBatch(state, derived, id, frac)
    if (made > 0) afterAction(`制作完成 ×${made}`, 'good')
    else toast('材料不足或仓储已满', 'bad')
  },

  manageCraftOrder(id, action) {
    if (!E.manageCraftOrder(state, derived, id, action)) return false
    afterAction(action === 'cancel' ? '已取消未完成订单' : action === 'pause' ? '订单已暂停' : '订单已恢复', 'good')
    return true
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
  setAllAutoCraft(enabled) {
    if (!E.setAllAutoCraft(state, derived, enabled)) {
      toast('需参悟《心有灵犀》或取得首颗道果', 'bad')
      return false
    }
    E.recompute(state, derived)
    saveNow()
    return true
  },
  breakthrough(options = {}) {
    const deaths = state.stats.breakthroughDeaths || 0
    const ok = E.breakthrough(state, derived, options)
    if (ok) toast(`突破成功：${REALMS[state.realm].name}`, 'good')
    else toast((state.stats.breakthroughDeaths || 0) > deaths ? '身死道消，仙缘减半，已重开' : '突破未成，请查看宗门纪事', 'bad')
    saveNow()
    return ok
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
    E.recompute(state, derived)
    afterAction('', '')
    saveNow()
    return true
  },
  triggerEvent() {
    if (!ui.debug) return false
    E.fireEvent(state, derived)
    E.recompute(state, derived)
    afterAction('', '')
  },
  save() {
    const saved = saveNow()
    toast(saved ? '已存档' : '存档失败', saved ? 'good' : 'bad')
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
    ui.saveRecoveryNotice = next.__recoveryNotice || ''
    game.replaceState(next)
    runtime.resetClock()
    ui.offlineReport = null
    ui.highlight = { need: [], lack: [] }
    const recovering = !!ui.saveLoadError
    repository.allowRecovery()
    ui.saveLoadError = ''
    saveNow()
    if (recovering) startLoop()
    toast(ui.saveRecoveryNotice || '读档成功', 'good')
    return true
  },
  resetGame() {
    if (!repository.clear()) return false
    const recovering = !!ui.saveLoadError
    ui.saveLoadError = ''
    game.reset()
    runtime.resetClock()
    ui.saveRecoveryNotice = ''
    saveNow()
    if (recovering) startLoop()
    ui.offlineReport = null
    toast('已重新开山立派', 'good')
  },
  setSetting(key, value) {
    if (key === 'autoCraftSpeeds' || key === 'autoCraftSpeed' || key === 'craftWeights' || key === 'processingModes') return false
    state.settings[key] = value
    saveNow()
  },
  setAutoCraftSpeed(recipeId, speed) {
    if (!E.setAutoCraftSpeed(state, derived, recipeId, speed)) return false
    saveNow()
    toast(`${CRAFT_MAP[recipeId].name}自动速度 ×${speed}`, 'good')
    return true
  },
  setCraftWeight(recipeId, weight) {
    if (!E.setCraftWeight(state, derived, recipeId, Number(weight))) return false
    saveNow()
    return true
  },
  setProcessingMode(stationId, mode) {
    if (!E.setProcessingMode(state, derived, stationId, mode)) return false
    saveNow()
    return true
  },
  toggleUpkeepUpgrade(id) {
    if (!E.toggleUpkeepUpgrade(state, derived, id)) return false
    saveNow()
    return true
  },
  toggleQuickCraft(id) {
    if (typeof id !== 'string' || !Object.hasOwn(CRAFT_MAP, id) || !E.isCraftUnlocked(state, CRAFT_MAP[id])) return false
    const ids = normalizeQuickCrafts(state.settings.quickCrafts)
    if (ids.includes(id)) actions.setSetting('quickCrafts', ids.filter(item => item !== id))
    else {
      actions.setSetting('quickCrafts', [...ids, id])
    }
    return true
  },
  setTab(tab) {
    if (tab === 'debug') {
      if (ui.debug) ui.debugPage = true
      return
    }
    ui.debugPage = false
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

if (import.meta.hot) {
  // 游戏模块拥有状态和计时器，局部替换会让已挂载组件与新 store 脱节。
  // 保存后让 Vite 完整重载，重新经过 main 的初始化、挂载和启动入口。
  import.meta.hot.accept(() => {
    import.meta.hot.invalidate('游戏模块更新，需要重新启动主循环')
  })
  import.meta.hot.dispose(() => {
    if (initialized) saveNow()
    stopLoop()
    if (toastHandle) clearTimeout(toastHandle)
  })
}
