/** 仅用于一次性旧档合并；不进入可建造目录。历史定额在所有比例加成之前记录。 */
export const STORAGE_MERGE_VERSION = 1
export const STORAGE_MERGE_GROUPS = {
  warehouse: ['warehouse', 'materialYard', 'depot', 'mysticVault', 'medicineVault'],
  grotto: ['grotto', 'grandStore'],
}
export const PRE_MERGE_STORAGE = {
  warehouse: { wood: 1000, stone: 500, rock: 600, ore: 400, herb: 500 },
  materialYard: { rock: 500, ore: 150, wood: 400, herb: 200, stone: 250 },
  depot: { wood: 5000, stone: 3000, rock: 3000, ore: 3000 },
  mysticVault: { qi: 15000, wood: 10000, rock: 10000, stone: 10000, ore: 10000, herb: 8000 },
  medicineVault: { herb: 6000 },
  grandStore: { insight: 12000, qi: 50000, wood: 50000, stone: 50000, rock: 50000, ore: 50000, faith: 50000, qiParticle: 50000, yangParticle: 50000, yinParticle: 50000, qiEnergy: 15000, immortalForce: 12000 },
  grotto: { insight: 15000, qi: 75000, wood: 75000, stone: 75000, rock: 75000, ore: 75000, faith: 75000, qiParticle: 75000, yangParticle: 75000, yinParticle: 75000, qiEnergy: 20000, immortalForce: 20000 },
}
export const PRE_MERGE_STORAGE_ALL = { grandStore: 4000, grotto: 12000 }
