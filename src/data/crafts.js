/**
 * 制作配方（对应猫国的 craft 表：花资源换 1 个成品，可被 craftBonus 放大）。
 * 产出的小数部分会累计到 state.craftProgress，攒满就多给一个。
 *
 * `time` 是「连续」制作时每做一份要花多少秒：
 *   点「制作」是瞬发的（点一下立刻出一份，见 §7）；
 *   点「连续」则是下一个长期活儿 —— 按这个节奏一份一份出，直到材料或仓储用尽。
 */
export const CRAFTS = [
  {
    id: 'condenseStone',
    name: '凝气成石',
    out: 'stone',
    amount: 1,
    cost: { qi: 45 },
    time: 0.5,
    desc: '把稀薄灵气压成一枚灵石。宗门早期的硬通货全靠它。',
    unlocked: true,
  },
  {
    id: 'refinePill',
    name: '采药制丹',
    out: 'pill',
    amount: 1,
    cost: { herb: 25, qi: 60 },
    time: 2,
    desc: '灵草入炉，文武火各三遍，成丹一枚。',
    needs: { building: { id: 'alchemyRoom', count: 1 } },
  },
  {
    id: 'drawTalisman',
    name: '朱砂符箓',
    out: 'talisman',
    amount: 1,
    cost: { wood: 40, qi: 60 },
    time: 2,
    desc: '以灵木为纸、朱砂为墨，画一张能镇妖的符。',
    needs: { building: { id: 'talismanHall', count: 1 } },
  },
  {
    id: 'forgeArtifact',
    name: '淬炼法器',
    out: 'artifact',
    amount: 1,
    cost: { ore: 50, stone: 12 },
    time: 3,
    desc: '玄铁千锤，灵石点睛，始成一器。',
    needs: { building: { id: 'forge', count: 1 } },
  },
]

export const CRAFT_MAP = Object.fromEntries(CRAFTS.map((c) => [c.id, c]))

/** 配方的单件耗时（秒），缺省 1 秒 */
export function craftTime(recipe) {
  return recipe && recipe.time > 0 ? recipe.time : 1
}
