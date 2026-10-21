/** 单个小数经济回归：node tools/fractional-check.mjs <resources|craft|automatic|save|modules|hunting> */
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const deadline = setTimeout(() => { console.error('快速验证超过 5 秒'); process.exit(1) }, 4500)
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const E = await server.ssrLoadModule('/tools/engine-fixture.mjs')
  const { createInitialState, normalizeState, resetForAscension } = await server.ssrLoadModule('/src/game/state.js')
  const { exportSave, parseImport } = await server.ssrLoadModule('/src/game/save.js')
  const { fmtCost, fmtStock, fmtAmount } = await server.ssrLoadModule('/src/game/format.js')
  const fresh = () => {
    const state = createInitialState(1000000), derived = E.createDerived()
    E.recompute(state, derived)
    return { state, derived }
  }
  const crystal = () => {
    const f = fresh(), s = f.state
    s.realm = 5
    Object.assign(s.upgrades, { crystalCraft: true, qiLiquid: true, liquidArt: true, intuition: true })
    s.buildings.talismanHall = { count: 1, on: true }
    Object.assign(s.resources, { qi: E.money(10000), spiritLiquid: E.money(100), mithril: E.money('0.02') })
    E.recompute(s, f.derived)
    return f
  }
  const cases = {
    resources() {
      const { state: s, derived: d } = fresh()
      assert.equal(E.scaleCost({ stone: 3 }, '1.1').stone.toString(), '3.3')
      E.addResource(s, 'stone', '0.25')
      E.payCost(s, { stone: '0.01' })
      assert.equal(s.resources.stone.toString(), '0.24')
      assert.equal(fmtCost('0.01'), '0.01')
      assert.equal(fmtStock('17.9'), '17.9')
      assert.equal(fmtAmount('2.75'), '2.75')
      s.karma = E.money(1)
      E.recompute(s, d)
      assert.equal(d.max.stone.isInteger(), false)
    },
    craft() {
      const { state: s, derived: d } = crystal()
      assert.equal(E.craft(s, d, 'condenseCrystal').toString(), '1.05')
      assert.equal(s.resources.mithril.toString(), '0.01')
      assert.equal(s.resources.spiritLiquid.toString(), '97')
      assert.equal(Object.keys(s.craftProgress).length, 0)
      E.craft(s, d, 'condenseCrystal')
      assert.equal(E.craft(s, d, 'condenseCrystal').toString(), '0')
      assert.match(E.autoCraftStatus(s, d, 'condenseCrystal').reason, /秘银/)
    },
    automatic() {
      const { state: s, derived: d } = crystal()
      s.autoCraft.condenseCrystal = true
      s.settings.craftReserves.mithril = E.money('0.02')
      E.recompute(s, d)
      assert.ok(d.processingCapacity.condensation > 0 && d.autoCraftUnlocked)
      E.runAutoCraft(s, d, 10)
      assert.equal(s.resources.mithril.toString(), '0.02')
      assert.equal(s.resources.crystal.toString(), '0')
      s.settings.craftReserves.mithril = E.money('0.01')
      E.runIndustrialCraftBatch(s, d, 10)
      assert.equal(s.resources.mithril.toString(), '0.01')
      assert.equal(s.resources.crystal.toString(), '1.05')
    },
    save() {
      const { state: s } = fresh()
      s.resources.stone = E.money('17.9')
      s.dao = s.resources.dao = E.money('2.5')
      s.craftTargets.sawPlank = E.money('3.25')
      s.craftProgress.sawPlank = E.money('0.25')
      s.hunting.yieldRemainders.beastHide = E.money('0.5')
      s.catalystProgress = { condenseCrystal: 99 }
      const back = parseImport(exportSave(s))
      assert.equal(back.resources.stone.toString(), '17.9')
      assert.equal(back.dao.toString(), '2.5')
      assert.equal(back.craftTargets.sawPlank.toString(), '3.25')
      assert.equal(back.resources.plank.toString(), '0.25')
      assert.equal(back.stats.crafted.plank.toString(), '0.25')
      assert.equal(back.resources.beastHide.toString(), '0.5')
      assert.equal(back.catalystProgress, undefined)
      const again = parseImport(exportSave(back))
      assert.equal(again.resources.plank.toString(), '0.25')
      assert.equal(again.resources.beastHide.toString(), '0.5')
      resetForAscension(again, E.ZERO)
      assert.equal(again.dao.toString(), '3.5')
    },
    hunting() {
      const { state: s, derived: d } = fresh()
      s.realm = 3
      s.upgrades.wildHunting = true
      s.buildings.huntingCamp = { count: 1, on: true }
      s.disciples.total = 1
      s.resources.warrant = E.money(200)
      E.recompute(s, d)
      const member = s.disciples.members[0]
      member.talents = [{ id: 'huntYield_tian', level: 1 }]
      d.huntCostReduction = 0.1234
      assert.equal(E.huntCost(d).toString(), '87.66')
      assert.ok(E.departHunt(s, d, { teamIds: [member.id] }).ok)
      assert.equal(s.resources.warrant.toString(), '112.34')
      assert.ok(!s.resources.beastHide.isInteger() && s.resources.beastHide.gt(0))
      assert.deepEqual(s.hunting.yieldRemainders, {})
    },
    modules() {
      const { state: s, derived: d } = fresh()
      s.realm = 3
      s.settings.modules = { hunting: false, diplomacy: false }
      Object.assign(s.upgrades, { neighborContacts: true, wildHunting: true })
      s.buildings.huntingCamp = { count: 1, on: true }
      E.recompute(s, d)
      assert.equal(E.isDiplomacyUnlocked(s), true)
      assert.equal(E.isHuntUnlocked(s, 'foothills'), true)
      assert.deepEqual(normalizeState(s).settings.modules, { hunting: true, diplomacy: true })
    },
  }
  const name = process.argv[2]
  assert.ok(Object.hasOwn(cases, name), '必须指定一个用例')
  cases[name]()
  console.log(`PASS ${name}`)
} finally {
  await server.close()
  clearTimeout(deadline)
}
