import { reactive, computed, toRaw, nextTick } from 'vue'
import { CONFIG } from '@/data/config'
import { CRAFT_MAP, normalizeQuickCrafts } from '@/data/crafts'
import { RESOURCES, RESOURCE_MAP, VISIBLE_RESOURCES, RESOURCE_GROUPS, resourceName } from '@/data/resources'
import { JOBS } from '@/data/jobs'
import { BUILDINGS } from '@/data/buildings'
import { CULTIVATION, ALL_UPGRADES } from '@/data/upgrades'
import { TECHNIQUES } from '@/data/techniques'
import { ACHIEVEMENTS } from '@/data/achievements'
import { MODULE_MAP, isModuleEnabled } from '@/data/modules'
import { REALMS, ASCEND_REALM_INDEX, REINCARNATE_REALM_INDEX } from '@/data/realms'
import { createInitialState, resetForAscension, resetForReincarnation } from './state'
import * as E from './engine'
import { atLeast } from './numbers'
import { ZERO, floorMoney, money, moneyFinite, moneyIsPositive, moneyNonNegative, moneySum } from './decimal'
import { fmtAmount, fmtCost, fmtInt } from './format'
import { cloneRuntime } from './clone'
import { createSaveRepository, exportSave, parseImport } from './save'
import { createGame, createRuntime } from './runtime'
import * as analytics from '@/analytics/collector'
import { deactivateModule } from './moduleRegistry'

// ============================================================
// 单例状态
// ============================================================

let restored = null
let initialized = false
let initializing = null
let loopRequested = false
let offlineController = null
const ANALYTICS_CONSENT_KEY = 'slack-off-sect.analytics.consent.v1'
export const state = reactive(createInitialState())
export const derived = reactive(E.createDerived())

/** 临时 UI 状态（不存档） */
export const ui = reactive({
  saveLoadError: '',
  saveRecoveryNotice: '',
  // D7：只存在旧代存档时的阻断提示（不加载、不结算、不覆盖）。
  rulesetBlock: null,
  analyticsConsent: 'unknown',
  analyticsStatus: 'disabled',
  analyticsFailureReason: '',
  analyticsFailureOpen: false,
  debug: false,
  debugPage: false,
  offlineReport: null,
  offlineLoading: false,
  offlineProgress: { completedSeconds: 0, totalSeconds: 0, percent: 0 },
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

// 同意选择属于当前浏览器，导入游戏存档或重开不能代替玩家授权。
function applyAnalyticsConsent() {
  state.settings.analyticsEnabled = ui.analyticsConsent === 'granted'
}

function handleAnalyticsStatus({ status, reason }) {
  if (status === 'failed') {
    // 开启失败要真正退回关闭状态，不能只弹提示而留下已勾选的设置。
    state.settings.analyticsEnabled = false
    ui.analyticsConsent = 'denied'
    try { localStorage.setItem(ANALYTICS_CONSENT_KEY, 'denied') } catch {}
    analytics.setAnalyticsEnabled(false)
    saveNow()
    ui.analyticsFailureOpen = true
  }
  // 关闭传输会同步回调 disabled，最后保留原来的失败原因供弹窗显示。
  ui.analyticsStatus = status
  ui.analyticsFailureReason = reason
}

const game = createGame({ state, derived,
  // 运行时快照必须保留 Decimal 金额：JSON 往返会把金额变成字符串，structuredClone 会丢掉原型。
  snapshotState: value => cloneRuntime(toRaw(value)),
})
const repository = createSaveRepository()
const runtime = createRuntime({ game, repository,
  onSaved: at => { ui.lastSavedAt = at },
  onAdvance: reportAdvance,
  deferAdvance: withOfflineLoading,
})

/** 明确启动入口；导入 store 不读取存档、不结算离线、不注册浏览器事件。 */
export function initializeGame() {
  if (initialized) return initializing
  initialized = true
  // 采集偏好属于浏览器，必须先于旧代分支读取；读取偏好本身不启动采集。
  try {
    const consent = localStorage.getItem(ANALYTICS_CONSENT_KEY)
    if (consent === 'granted' || consent === 'denied') ui.analyticsConsent = consent
  } catch {}
  // D7：只有旧代存档时进入独立的大版本提示；确认前不读档、不结算、不写新键。
  if (repository.legacyOnly()) {
    ui.rulesetBlock = { legacy: repository.legacyPayload() || '' }
    return null
  }
  restored = runtime.load()
  applyAnalyticsConsent()
  // 采集在离线结算之前初始化：离线成功结算的秒数要计入本世时钟。
  analytics.initAnalytics({ state, derived, restored: !!restored, debug: ui.debug === true,
    onStatus: handleAnalyticsStatus })
  ui.saveLoadError = repository.loadError
  ui.saveRecoveryNotice = restored?.__recoveryNotice || ''
  ui.lastSavedAt = restored?.lastSaveAt || 0
  initializing = applyOfflineProgress()
  if (initializing) initializing = initializing.finally(() => {
    runtime.resetClock()
    initializing = null
  })
  else runtime.resetClock()
  // 控制台执行 DEBUG 开启本次页面的调试入口；刷新后恢复隐藏，不写入存档。
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'DEBUG', {
      configurable: true,
      get() {
        ui.debug = true
        ui.debugPage = true
        // 本世一旦用过调试入口就永久标 debug：关闭调试不能把样本洗白。
        analytics.markDebug()
        return '调试模式已开启'
      },
    })
  }
  return initializing
}

/** 悬停某个花费时高亮对应资源；cost 形如 { qi: 100, wood: 20 }（金额可以是 Decimal 或数据层 Number） */
export function highlightCost(cost) {
  const need = Object.keys(cost || {})
  ui.highlight = {
    need,
    lack: need.filter((res) => !atLeast(state.resources[res] ?? ZERO, cost[res])),
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
  return withOfflineLoading(async options => {
    const result = await game.simulateOfflineAsync(seconds, { ...options, startAt: restored.lastSaveAt })
    /**
     * 时间戳分两个口径，不能混用：
     * - **已模拟到的游戏时刻**是 `state.lastTickAt`（= 存档时刻 + 实际结算时长）；
     * - **本次已消费的现实窗口**是 [lastSaveAt, lastSaveAt + seconds]。
     * 超出收益上限的现实时间不产出，但现实到期的增益与威胁仍要收尾 —— 与 advanceAsync 同一套语义。
     */
    const now = Date.now()
    state.buffs = state.buffs.filter(buff => (buff.until || 0) > now)
    E.settleExpiredThreat(state, derived)
    E.recompute(state, derived)
    const gains = Object.entries(result.gains)
      .map(([id, amount]) => ({
        id,
        name: resourceName(id),
        // 报告里的数量是金额：保留 Decimal，界面按格式化函数显示。
        amount: money(amount),
      }))
      .sort((a, b) => b.amount.cmp(a.amount))
    ui.offlineReport = {
      awaySeconds: elapsed,
      simulatedSeconds: seconds,
      capped: elapsed > capSeconds,
      // 长离线走有界近似：收益是估算值，界面需要如实说明，避免与在线挂机对不上号。
      estimated: result.approximate === true,
      gains,
      disciples: result.disciples || 0,
    }
    if (gains.length) {
      state.stats.offlineGains = moneySum(gains.map(gain => gain.amount), state.stats.offlineGains)
    }
    const extra = result.disciples > 0 ? `，另有 ${result.disciples} 名弟子慕名而来` : ''
    E.pushLog(
      state,
      `闭关 ${E.clamp(Math.floor(elapsed / 60), 0, 999999)} 分钟，弟子们替你干活${
        gains.length ? '，收获见离线报告' : '，这次没有净增的库存'
      }${extra}`,
      'event',
    )
    E.recompute(state, derived)
    analytics.noteOfflineSettled(seconds)
    // 已消费的窗口立刻落盘：此后再次读档不会重复领取同一段离线收益，
    // 恢复在线后的运行时钟也不会因为结算耗时立刻形成第二次长补算。
    runtime.save()
  })
}

async function withOfflineLoading(run) {
  const controller = new AbortController()
  offlineController = controller
  ui.offlineLoading = true
  ui.offlineProgress = { completedSeconds: 0, totalSeconds: 0, percent: 0 }
  // 离线/长间隔追赶期间暂停前台计时与卡点采样，完成后再重设基准。
  analytics.pauseSampling()
  try {
    await nextTick()
    // 先绘制进度条；随后引擎按时间预算分批结算，每批之间让出主线程。
    await new Promise(resolve => {
      if (typeof requestAnimationFrame === 'function' && document.visibilityState !== 'hidden') {
        const fallback = setTimeout(resolve, 100)
        requestAnimationFrame(() => requestAnimationFrame(() => {
          clearTimeout(fallback)
          resolve()
        }))
      } else setTimeout(resolve, 0)
    })
    return await run({ signal: controller.signal,
      onProgress: progress => { if (offlineController === controller) ui.offlineProgress = progress } })
  } catch (error) {
    if (error.name !== 'AbortError') throw error
  } finally {
    if (offlineController === controller) {
      offlineController = null
      ui.offlineLoading = false
    }
    analytics.resumeSampling()
  }
}

function cancelOfflineProgress() {
  offlineController?.abort()
  offlineController = null
  ui.offlineLoading = false
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
  // 长间隔走离线/追赶分支（引擎返回实际结算秒数），短步长是在线推进；两者互斥，不重复累计。
  analytics.noteAdvance(Number.isFinite(result?.seconds) ? result.seconds : dt, !!result)
  if (!result || dt <= 60) return
  const parts = Object.entries(result.gains).slice(0, 4)
    .map(([id, amount]) => `${resourceName(id)}+${fmtAmount(amount)}`)
  E.pushLog(state, `挂机 ${Math.round(dt)} 秒${parts.length ? '，' + parts.join('，') : ''}`, 'info')
}

function onHide() {
  if (document.visibilityState === 'hidden') saveNow()
}

function onBeforeUnload() {
  saveNow()
}

export function startLoop() {
  loopRequested = true
  const ready = initializeGame()
  if (ui.rulesetBlock) return
  // 离线结算失败也必须启动主循环：否则 error 分支会吞掉后续启动，页面永久卡住。
  if (ready) {
    // 用 then(ok, err) 而非 catch().then()：少一个微任务跳，离线 Promise 一落定即启动循环，
    // 与「初始离线结束后才启动在线循环」的对外时序一致（initializeGame 一 resolve 就已在跑）。
    return ready.then(
      () => { if (loopRequested) startLoop() },
      (error) => {
        console.warn('[摸鱼宗门] 离线结算失败', error)
        if (loopRequested) startLoop()
      },
    )
  }
  // 首次选择之前不推进游戏，也不加载统计，避免先采集后询问。
  if (ui.analyticsConsent === 'unknown') return
  if (!runtime.start()) return
  // 主循环真正跑起来后才启用前台计时与卡点采样（读档失败时游戏没在跑，不能采集）。
  analytics.markReady()
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('beforeunload', onBeforeUnload)
}

export function stopLoop() {
  loopRequested = false
  cancelOfflineProgress()
  runtime.stop()
  analytics.stopAnalytics()
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide)
  if (typeof window !== 'undefined') window.removeEventListener('beforeunload', onBeforeUnload)
}

export function saveNow() {
  if (ui.rulesetBlock) return false
  if (ui.offlineLoading) return false
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
  /**
   * 调试：直接设定某资源存量。入参可以是 Number 或十进制字符串，
   * 但一律先构造为 Decimal 再写回 —— 资源存量是金额域，写进 Number 会污染整条经济链。
   * 上限沿用原来的安全整数口径，避免调试入口绕过存档校验写入难以表示的数量。
   */
  setDebugResource(id, amount) {
    if (!ui.debug) return false
    analytics.markDebug()
    if (ui.saveLoadError) {
      toast('存档读取失败，请先在设置中导入有效备份', 'bad')
      return false
    }
    const meta = RESOURCES.find(r => r.id === id)
    if (!meta) return false
    let value = null
    try {
      value = money(amount)
    } catch {
      value = null
    }
    if (value === null || !moneyFinite(value) || value.isNegative() || value.gt(Number.MAX_SAFE_INTEGER)) {
      toast('数量必须是非负有限数字，且不超过安全整数上限', 'bad')
      return false
    }
    if (meta.integer) value = floorMoney(value)
    state.resources[id] = value
    if (id === 'karma' || id === 'dao') state[id] = value
    if (moneyIsPositive(value)) state.seen[id] = true
    E.trackPeak(state)
    E.recompute(state, derived)
    const saved = saveNow()
    toast(saved ? `${meta.name}已修改并保存` : `${meta.name}已修改，但保存失败`, saved ? 'good' : 'bad')
    return true
  },
  setDebugProductionBoost(enabled) {
    if (!ui.debug || typeof enabled !== 'boolean') return false
    if (ui.saveLoadError || ui.rulesetBlock || ui.offlineLoading) return false
    if (enabled) analytics.markDebug()
    // 仅运行时使用；保存白名单不包含此字段，读档／刷新后自动取消。
    state.__debugProductionBoost = enabled
    E.recompute(state, derived)
    toast(enabled ? '调试全局产出 ×10 已开启' : '调试全局产出 ×10 已关闭', 'info')
    return true
  },
  closeDebug() {
    delete state.__debugProductionBoost
    E.recompute(state, derived)
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
    const n = E.maxAffordable(state, id, 500)
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
  setBuildingPower(id, mode) {
    if (!E.setBuildingPower(state, derived, id, mode)) {
      toast('尚不能接入灵能：需先参悟《灵能输配》', 'bad')
      return false
    }
    afterAction(`${E.BUILDING_MAP[id]?.name} 供能改为${mode === 'energy' ? '灵能高阶' : '灵气基础'}`, 'info')
    return true
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
  setMentored(ids, value) {
    const changed = E.setMentored(state, derived, ids, value)
    if (changed) afterAction(value ? `已开始传功 ${changed} 人` : `已停止传功 ${changed} 人`, 'info')
    return changed
  },
  applyDiscipleAid(ids) {
    const result = E.applyDiscipleAid(state, derived, ids)
    if (result.applied) afterAction(`已为 ${result.applied} 名弟子护道${result.insufficient ? '；材料不足，已停止' : ''}`, result.insufficient ? 'info' : 'good')
    else toast(result.insufficient ? '护道材料不足' : '所选弟子已护道或已至圆满', 'bad')
    return result
  },
  /** 切换招募模式（需《招贤纳士》）：'auto' 自动前来／'manual' 主动招募，二者互斥。 */
  setRecruitMode(mode) {
    if (!derived.recruitModeUnlocked || (mode !== 'auto' && mode !== 'manual')) return false
    if (state.settings.recruitMode === mode) return true
    state.settings.recruitMode = mode
    if (mode === 'manual') state.arrivalTimer = 0
    E.recompute(state, derived)
    saveNow()
    afterAction(mode === 'manual' ? '已改为主动招募，自动前来暂停' : '已改为自动前来', 'info')
    return true
  },
  /** 主动招募一名弟子：按礼聘档位扣料并立即入宗。 */
  recruitDisciple(tierId) {
    const result = E.recruitDisciple(state, derived, tierId)
    if (result.recruited) {
      afterAction(`礼聘招得 ${result.member.name}`, 'good')
      saveNow()
    } else {
      toast(result.reason === 'full' ? '居所已满，无法招募'
        : result.reason === 'risk' ? '宜居度不足，暂缓招募'
          : result.reason === 'insufficient' ? '资源不足' : '尚未解锁主动招募', 'bad')
    }
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
    if (!window.confirm(`确定将${member ? member.name : '所选 ' + preview.count + ' 名弟子'}逐出师门？\n需支付灵气 ${fmtCost(preview.cost.qi)}（当前每年基础口粮×（已满年数＋1），每人向上取整）。\n逐出后移除个人成长与岗位，无法撤回。`)) return { dismissed: 0 }
    const result = E.dismissDisciples(state, derived, preview.ids, preview)
    if (result.dismissed) {
      afterAction(`已逐出 ${result.dismissed} 人，支付灵气 ${fmtCost(result.cost.qi)}`, 'info')
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
    const made = Number.isSafeInteger(times) && times > 0 ? E.craft(state, derived, id, { times }) : ZERO
    if (made.gt(0)) afterAction(`制作完成 ×${fmtAmount(made)}`, 'good')
    else toast('材料不足或仓储已满', 'bad')
  },

  /** 按当前材料与仓容比例立即制作。 */
  craftBatch(id, frac = 1) {
    const made = E.craftBatch(state, derived, id, frac)
    if (made.gt(0)) afterAction(`制作完成 ×${fmtAmount(made)}`, 'good')
    else toast('材料不足或仓储已满', 'bad')
  },

  manageCraftOrder(id, action) {
    if (!E.manageCraftOrder(state, derived, id, action)) return false
    afterAction(action === 'cancel' ? '已取消未完成订单' : action === 'pause' ? '订单已暂停' : '订单已恢复', 'good')
    return true
  },

  /** 手动吸取天地灵气（开局唯一的灵气来源，对标猫国的采集猫薄荷）；返回本次吸到的总额（金额）。 */
  drawQi(times = 1) {
    let total = ZERO
    for (let i = 0; i < times; i++) total = total.plus(E.drawQi(state, derived))
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
    // 只有真实扣料后的判定才是一次尝试：资源不足/已达最高境界不发事件。
    const hasNext = state.realm + 1 < REALMS.length
    const preview = hasNext ? E.breakthroughPreview(state, derived, options) : null
    const attempt = !!preview && E.canAfford(state, preview.cost)
    const snapshot = attempt ? analytics.captureRun() : null
    const sourceRealm = state.realm
    // 判定可能改变境界：先把旧境界的卡点余量提交并重切采样基准。
    if (attempt) analytics.beforeRealmChange()
    const ok = E.breakthrough(state, derived, options)
    if (attempt) {
      const result = ok ? 'success'
        : (state.stats.breakthroughDeaths || 0) > deaths ? 'death'
          : state.realm < sourceRealm ? 'regression' : 'fail'
      const aids = preview.availableAids || []
      analytics.noteBreakthrough({
        sourceRealm,
        targetRealm: sourceRealm + 1,
        result,
        preview,
        aidCount: aids.filter(aid => options[aid.id] === true).length,
        aidMask: aids.map(aid => (options[aid.id] === true ? '1' : '0')).join(''),
      })
      if (result === "death") {
        // 身死属于旧世：先发旧世结果，再结束旧世并开新世。
        analytics.endRun(snapshot, { reason: 'death', karmaGain: preview.deathKarma, daoGain: 0 })
        analytics.beginRun('death', { debug: ui.debug === true })
      }
    }
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
    const snapshot = analytics.captureRun()
    analytics.beforeStateReplace()
    resetForReincarnation(state, gain)
    E.recompute(state, derived)
    analytics.endRun(snapshot, { reason: 'reincarnation', karmaGain: gain, daoGain: 0 })
    analytics.beginRun('reincarnation', { debug: ui.debug === true })
    E.pushLog(state, `自【${name}】转世重修，携仙缘 ${fmtInt(gain)} 点再入红尘`, 'realm')
    saveNow()
    toast(`转世成功，获得仙缘 ${fmtInt(gain)}`, 'good')
    return true
  },
  ascend() {
    if (!E.canAscend(state)) {
      toast('尚未到渡劫期，无法飞升', 'bad')
      return false
    }
    // 结算的仙缘是金额（Decimal）：跨世累加在 resetForAscension 里走 Decimal 加法。
    const gain = E.ascensionGain(state, derived)
    const name = REALMS[state.realm].name
    const snapshot = analytics.captureRun()
    analytics.beforeStateReplace()
    resetForAscension(state, gain)
    E.recompute(state, derived)
    // 飞升实际额外结一颗道果，与 resetForAscension 的结算一致。
    analytics.endRun(snapshot, { reason: 'ascension', karmaGain: gain, daoGain: 1 })
    analytics.beginRun('ascension', { debug: ui.debug === true })
    E.pushLog(state, `自【${name}】飞升，携仙缘 ${fmtInt(gain)} 点转世重修`, 'realm')
    saveNow()
    toast(`飞升成功，获得仙缘 ${fmtInt(gain)} 与 1 颗道果，道果统筹已开启`, 'good')
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
    analytics.markDebug()
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
    cancelOfflineProgress()
    ui.saveRecoveryNotice = next.__recoveryNotice || ''
    analytics.beforeStateReplace()
    game.replaceState(next)
    ui.rulesetBlock = null
    applyAnalyticsConsent()
    analytics.initAnalytics({ state, derived, restored: false, debug: ui.debug === true,
      onStatus: handleAnalyticsStatus })
    runtime.resetClock()
    // 回档不能复用旧的分析 run_id：换新世身份，本世标 partial，不补发 run_start。
    analytics.noteImport({ debug: ui.debug === true })
    ui.offlineReport = null
    ui.highlight = { need: [], lack: [] }
    const recovering = !!ui.saveLoadError
    repository.allowRecovery()
    ui.saveLoadError = ''
    saveNow()
    if (recovering || !runtime.running) startLoop()
    toast(ui.saveRecoveryNotice || '读档成功', 'good')
    return true
  },
  resetGame() {
    if (ui.rulesetBlock) return false
    if (!repository.clear()) return false
    cancelOfflineProgress()
    const recovering = !!ui.saveLoadError
    ui.saveLoadError = ''
    analytics.beforeStateReplace()
    game.reset()
    applyAnalyticsConsent()
    runtime.resetClock()
    analytics.initAnalytics({ state, derived, restored: false, debug: ui.debug === true,
      onStatus: handleAnalyticsStatus })
    analytics.startFreshSave({ debug: ui.debug === true })
    ui.saveRecoveryNotice = ''
    saveNow()
    if (recovering) startLoop()
    ui.offlineReport = null
    toast('已重新开山立派', 'good')
  },
  /** D7 大版本提示：导出原始旧档，不得导出内存里的空白新状态。 */
  exportLegacySave() {
    return ui.rulesetBlock?.legacy || ''
  },
  /** 确认开始新代：写真正空白的新代档，旧键保留为原始备份。 */
  startNewGeneration() {
    if (!ui.rulesetBlock) return false
    game.reset()
    ui.rulesetBlock = null
    applyAnalyticsConsent()
    runtime.resetClock()
    analytics.initAnalytics({ state, derived, restored: false, debug: ui.debug === true,
      onStatus: handleAnalyticsStatus })
    analytics.startFreshSave({ debug: ui.debug === true })
    repository.allowRecovery()
    saveNow()
    startLoop()
    return true
  },
  condenseVow(amount) {
    const result = E.condenseVow(state, amount)
    if (!result?.ok) { toast(result?.reason || '凝愿失败', 'bad'); return false }
    E.recompute(state, derived)
    saveNow()
    return true
  },
  attestDaoHeart(amount) {
    const result = E.attestDaoHeart(state, amount)
    if (!result?.ok) { toast(result?.reason || '证心失败', 'bad'); return false }
    E.recompute(state, derived)
    saveNow()
    return true
  },
  buyRitual(id) {
    if (!E.buyRitual(state, id)) return false
    E.recompute(state, derived)
    saveNow()
    return true
  },
  buyCultivation(id) {
    if (!E.buyCultivation(state, id)) return false
    E.recompute(state, derived)
    saveNow()
    return true
  },
  buyFaithUpgrade(id) {
    if (!E.buyFaithUpgrade(state, id)) return false
    E.recompute(state, derived)
    saveNow()
    return true
  },
  setSetting(key, value) {
    if (key === 'autoTalentJobs') {
      if (!derived.autoTalentJobsUnlocked || typeof value !== 'boolean') return false
      state.settings.autoTalentJobs = value
      if (value) E.autoAssignTalentJobs(state)
      E.recompute(state, derived)
      saveNow()
      return true
    }
    if (key === 'autoCraftSpeeds' || key === 'autoCraftSpeed' || key === 'craftWeights' || key === 'processingModes') return false
    if (key === 'craftReserves') {
      /**
       * 逐项材料保留量是金额：入参来自输入框，可能是字符串、Number 或 Decimal。
       * 统一按金额域宽容解码（损坏值与负值回退 0），不在这里做有界控制量的 Number 夹取。
       */
      const next = {}
      for (const [res, amount] of Object.entries(value || {})) next[res] = moneyNonNegative(amount)
      state.settings.craftReserves = next
      saveNow()
      return
    }
    if (key === 'analyticsEnabled') {
      const firstChoice = ui.analyticsConsent === 'unknown'
      ui.analyticsConsent = value === true ? 'granted' : 'denied'
      try { localStorage.setItem(ANALYTICS_CONSENT_KEY, ui.analyticsConsent) } catch {}
      ui.analyticsFailureOpen = false
      state.settings.analyticsEnabled = value === true
      // 新档尚未开始运行，玩家同意后才建立完整的第一世观测起点。
      if (firstChoice && value === true && !restored && !ui.saveLoadError) {
        analytics.startFreshSave({ debug: ui.debug === true })
      }
      analytics.setAnalyticsEnabled(value === true)
      saveNow()
      if (firstChoice && loopRequested) startLoop()
      return
    }
    state.settings[key] = value
    saveNow()
  },
  dismissAnalyticsFailure() {
    ui.analyticsFailureOpen = false
  },
  /** 开关可选模块：关闭时立即清理该模块状态（如召回出征弟子），并回退页面 */
  setModuleEnabled(id, enabled) {
    const meta = MODULE_MAP[id]
    if (!meta) return false
    state.settings.modules = { ...(state.settings.modules || {}), [id]: enabled === true }
    if (enabled !== true) {
      deactivateModule(state, id)
      if (meta.tabId && state.ui.tab === meta.tabId) state.ui.tab = 'sect'
    }
    E.recompute(state, derived)
    saveNow()
    return true
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
  huntDepart(fieldId, teamIds) {
    const result = E.departHunt(state, derived, { fieldId, teamIds })
    if (!result.ok) { toast(result.reason || '无法出征', 'bad'); return false }
    E.recompute(state, derived)
    saveNow()
    return true
  },
  huntCancel() {
    const result = E.cancelHunt(state, derived)
    if (!result.ok) return false
    E.recompute(state, derived)
    saveNow()
    toast('已召回，弟子归队', 'info')
    return true
  },
  huntSetField(fieldId) {
    if (!E.setHuntField(state, fieldId)) return false
    E.recompute(state, derived)
    saveNow()
    return true
  },
  huntSetTeam(ids) {
    E.setHuntTeam(state, ids)
    E.recompute(state, derived)
    saveNow()
    return true
  },
  huntSetAutoRepeat(value) {
    E.setHuntAutoRepeat(state, value)
    saveNow()
    return true
  },
  diplomacyTrade(sectId) {
    const result = E.tradeWithSect(state, derived, sectId)
    if (!result.ok) { toast(result.reason || '无法交易', 'bad'); return false }
    E.recompute(state, derived)
    saveNow()
    return true
  },
  toggleResourceGroup(id) {
    if (!RESOURCE_GROUPS.some(group => group.id === id)) return false
    const collapsed = { ...state.ui.collapsedResourceGroups }
    if (collapsed[id]) delete collapsed[id]
    else collapsed[id] = true
    state.ui.collapsedResourceGroups = collapsed
    saveNow()
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
      (id) => {
        const meta = RESOURCE_MAP[id]
        // 关闭的可选模块：其资源不在顶栏显示（存量保留在存档里）
        if (meta?.module && !isModuleEnabled(state, meta.module)) return false
        // 存量与历史峰值都是金额：用 Decimal 判断是否为正值，不能靠对象真假。
        return id === 'qi' || state.seen[id] ||
          moneyIsPositive(state.resources[id] ?? ZERO) || moneyIsPositive(state.peak?.[id] ?? ZERO)
      },
    ).map((id) => RESOURCES.find((r) => r.id === id)),
  ),
  idle: computed(() => E.idleDisciples(state)),
  huntMission: computed(() => isModuleEnabled(state, 'hunting') ? E.activeMission(state) : null),
  huntTeamIds: computed(() => isModuleEnabled(state, 'hunting') ? (state.hunting?.settings?.teamIds || []) : []),
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
    CULTIVATION.filter((u) => u.page !== 'faith' && !state.upgrades[u.id] && E.isUpgradeUnlocked(state, u)).map((u) => u.id),
  ),
  researchableSkills: computed(() =>
    TECHNIQUES.filter((u) => u.page !== 'faith' && !state.upgrades[u.id] && E.isUpgradeUnlocked(state, u)).map((u) => u.id),
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
