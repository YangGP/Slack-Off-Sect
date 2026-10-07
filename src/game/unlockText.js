/**
 * 「解锁清单」的推导（B 项）。
 *
 * 为什么需要它：修真节点的解锁信息在两个地方，而且**引擎只认其中一个**：
 *   ① 节点上声明的 `effects.unlockBuildings`（**只是注释** —— `isBuildingUnlocked` 不看它）
 *   ② 被解锁建筑自己的 `needs.upgrades`（**真正生效**的那一处）
 * 两边一旦不同步，玩家看到的说明就是假的。所以这里把两边**合起来推导**，
 * 并交给冒烟测试断言它们一致（见 tools/smoke.mjs 的「解锁声明与门槛一致」）。
 *
 * 除了建筑，还顺带推导：
 *   · 哪些修真 / 技艺 / 法宝条目需要这个节点（`needs.upgrades`）
 *   · 哪些**配方**经由它解锁的建筑开放（一跳）
 */
import { BUILDINGS, BUILDING_MAP } from '@/data/buildings'
import { ALL_UPGRADES, UPGRADE_MAP } from '@/data/upgrades'
import { CRAFTS, CRAFT_MAP } from '@/data/crafts'

/** 节点 id → { buildings:Set, upgrades:Set, crafts:Set } */
const TABLE = new Map()

function bucket(id) {
  if (!id) return null
  if (!TABLE.has(id)) TABLE.set(id, { buildings: new Set(), upgrades: new Set(), crafts: new Set() })
  return TABLE.get(id)
}

/** 一座建筑直接挂在哪些节点上（enforced 的那一侧） */
function buildingGates(buildingId) {
  const b = BUILDING_MAP[buildingId]
  if (!b) return []
  const list = [...(b.needs?.upgrades || [])]
  if (b.needs?.upgrade) list.push(b.needs.upgrade)
  return list
}

// ① 生效的一侧：建筑 -> 它要求的节点
for (const b of BUILDINGS) {
  for (const uid of buildingGates(b.id)) {
    const e = bucket(uid)
    if (e) e.buildings.add(b.id)
  }
}

// ② 声明的一侧：节点 -> 它声称解锁的建筑（与 ① 取并集；不一致由断言抓）
for (const u of ALL_UPGRADES) {
  for (const bid of u.effects?.unlockBuildings || []) {
    const e = bucket(u.id)
    if (e) e.buildings.add(bid)
  }
}

// ③ 需要这个节点的其它条目（修真 / 技艺 / 法宝）
for (const u of ALL_UPGRADES) {
  for (const dep of u.needs?.upgrades || []) {
    const e = bucket(dep)
    if (e) e.upgrades.add(u.id)
  }
  if (u.needs?.upgrade) {
    const e = bucket(u.needs.upgrade)
    if (e) e.upgrades.add(u.id)
  }
}

// ④ 配方：经由「解锁的建筑」开放（一跳）
for (const c of CRAFTS) {
  const gate = c.needs?.building?.id
  if (!gate) continue
  for (const uid of buildingGates(gate)) {
    const e = bucket(uid)
    if (e) e.crafts.add(c.id)
  }
}

const nameOf = (id) => BUILDING_MAP[id]?.name || UPGRADE_MAP[id]?.name || CRAFT_MAP[id]?.name || id

/** 结构化输出：{ buildings:[名], upgrades:[名], crafts:[名] } */
export function unlockGroups(id) {
  const e = TABLE.get(id)
  if (!e) return { buildings: [], upgrades: [], crafts: [] }
  return {
    buildings: [...e.buildings].map(nameOf),
    upgrades: [...e.upgrades].map(nameOf),
    crafts: [...e.crafts].map(nameOf),
  }
}

/** 一行文字，给参悟表的「效果」栏用；没有解锁任何东西时返回空串 */
export function unlockText(id) {
  const g = unlockGroups(id)
  const parts = []
  if (g.buildings.length) parts.push('解锁建筑：' + g.buildings.join('、'))
  if (g.crafts.length) parts.push('开放配方：' + g.crafts.join('、'))
  if (g.upgrades.length) parts.push('开启参悟：' + g.upgrades.join('、'))
  return parts.join('；')
}

/** 解锁清单的结构化版本：一行一类（解锁建筑 / 开放配方 / 开启参悟） */
export function unlockRows(id) {
  const g = unlockGroups(id)
  const rows = []
  if (g.buildings.length) rows.push({ label: '解锁建筑', value: g.buildings.join('、') })
  if (g.crafts.length) rows.push({ label: '开放配方', value: g.crafts.join('、') })
  if (g.upgrades.length) rows.push({ label: '开启参悟', value: g.upgrades.join('、') })
  return rows
}

/**
 * 悬停提示「效果」一节的行：**一个效果一行**（与宗门建筑的提示同构）。
 * 数值 / 规则效果直接沿用 describeEffects 的 { label, value, tone }，
 * 解锁清单用 unlockRows —— 于是每一行都只有一件事。
 */
export function effectRows(meta, describe) {
  const { unlockBuildings, ...numeric } = meta.effects || {}
  void unlockBuildings
  const rows = []
  if (describe) {
    for (const n of describe(numeric)) rows.push({ label: n.label || '参悟后', value: n.value || n.text, tone: n.tone })
  }
  for (const r of unlockRows(meta.id)) rows.push({ ...r, tone: 'good' })
  return rows
}

/**
 * 参悟表「效果」列的完整文本：**数值/规则效果** 与 **解锁清单** 各说一次。
 *
 * 这条函数是从组件里抽出来的，目的有两个：
 *   1. 界面上同一件事只说一遍（曾经因为 describeEffects、unlockText、手写 note 三处都渲染，
 *      出现"解锁建筑 灵脉井；解锁建筑：灵脉井；…；解锁建筑：灵脉井"）；
 *   2. 让冒烟测试能直接断言这段文本（见 tools/smoke.mjs 的「效果文本」一节）。
 */
export function effectLine(meta, describe) {
  const { unlockBuildings, ...numeric } = meta.effects || {}
  void unlockBuildings
  const parts = []
  if (describe) {
    const numericText = describe(numeric)
      .map((n) => n.text)
      .join('，')
    if (numericText) parts.push(numericText)
  }
  const unlocks = unlockText(meta.id)
  if (unlocks) parts.push(unlocks)
  return parts.join('；')
}

/**
 * 一致性检查（给断言用）：返回不一致的清单。
 * 规则：节点声明要解锁某建筑 ⟺ 那座建筑的门槛里列了这个节点。
 */
export function unlockMismatches() {
  const bad = []
  for (const u of ALL_UPGRADES) {
    for (const bid of u.effects?.unlockBuildings || []) {
      if (!buildingGates(bid).includes(u.id)) {
        bad.push(`${u.name} 声明解锁 ${nameOf(bid)}，但 ${nameOf(bid)} 的门槛里没有它`)
      }
    }
  }
  return bad
}
