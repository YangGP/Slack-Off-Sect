import { createInitialState, resetForRebirth } from '../src/game/state.js'
import { exportSave, parseImport } from '../src/game/save.js'
import * as engine from '../src/game/engine.js'
import { CRAFT_MAP } from '../src/data/crafts.js'

export function runAlchemyMigrationChecks(E, ok) {
  E ||= engine
  const fresh = createInitialState(123)
  fresh.realm = 2
  fresh.upgrades.alchemyArt = true
  fresh.upgrades.alchemyCauldron = true
  fresh.buildings.alchemyRoom = { count: 1, on: true }
  const restored = parseImport(exportSave(fresh))
  ok('新档炼成九转丹炉后反复读档不免费补发丹道精微',
    !restored.upgrades.alchemyEssence && !parseImport(exportSave(restored)).upgrades.alchemyEssence)
  ok('丹道迁移标记经真实存档导出导入保留', restored.alchemyProgressionVersion === 1)

  const legacy = structuredClone(fresh)
  delete legacy.alchemyProgressionVersion
  const migrated = parseImport(exportSave(legacy))
  ok('无标记旧档已有九转丹炉时仍补发丹道精微', migrated.upgrades.alchemyEssence === true)
  const recipe = CRAFT_MAP.refineNineTurnPill
  migrated.realm = 5
  migrated.upgrades.intuition = true
  migrated.autoCraft.refineNineTurnPill = true
  migrated.resources.qi = 10000
  migrated.resources.wood = 100
  migrated.resources.condensePill = 100
  migrated.resources.immortalHerb = 50
  const d = E.createDerived()
  E.recompute(migrated, d)
  ok('元婴旧档无丹鼎仍保留九转炼丹资格且不赠送建筑',
    E.isCraftUnlocked(migrated, recipe) && !migrated.buildings.pillFurnace)
  ok('旧档手动九转炼丹仍正常扣料出货', E.craft(migrated, d, recipe.id) > 0 && migrated.resources.condensePill < 100)
  const beforeAuto = migrated.resources.nineTurnPill
  E.runAutoCraft(migrated, d, 60)
  ok('旧档已开启的自动九转炼丹继续加工', migrated.resources.nineTurnPill > beforeAuto)
  const reloaded = parseImport(exportSave(migrated))
  ok('旧档资格随反复保存读取保留', reloaded.legacyNineTurnPill === true && E.isCraftUnlocked(reloaded, recipe))
  ok('新档即使已炼成九转丹炉仍按新条件解锁', !E.isCraftUnlocked(restored, recipe) && !restored.legacyNineTurnPill)
  const modern = structuredClone(restored)
  modern.realm = 6
  modern.upgrades.alchemyEssence = true
  ok('新档已有研究仍须建丹鼎', !E.isCraftUnlocked(modern, recipe))
  modern.buildings.pillFurnace = { count: 1, on: true }
  ok('新档研究境界和丹鼎齐备后正常解锁', E.isCraftUnlocked(modern, recipe))
  const malformed = structuredClone(restored)
  malformed.legacyNineTurnPill = 'true'
  ok('非布尔旧档资格不生效', parseImport(exportSave(malformed)).legacyNineTurnPill === false)
  delete legacy.upgrades.alchemyCauldron
  const withoutCauldron = parseImport(exportSave(legacy))
  withoutCauldron.upgrades.alchemyCauldron = true
  ok('旧档首次迁移未获资格，后续炼炉读档不补发研究',
    !parseImport(exportSave(withoutCauldron)).upgrades.alchemyEssence)

  for (const kind of ['ascension', 'reincarnation', 'death']) {
    const reborn = structuredClone(migrated)
    resetForRebirth(reborn, 1, kind)
    reborn.upgrades.alchemyCauldron = true
    ok(`${kind} 重开后不再触发历史丹道补发`, !parseImport(exportSave(reborn)).upgrades.alchemyEssence)
    ok(`${kind} 重开后清空旧档九转炼丹资格`,
      !reborn.legacyNineTurnPill && !E.isCraftUnlocked(parseImport(exportSave(reborn)), recipe))
  }
}
