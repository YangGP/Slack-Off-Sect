/**
 * 全局数值配置 —— 所有平衡性常量集中在此，方便调参。
 * 包含时间步进、资源生产与价格递增等修仙宗门规则。
 */
export const CONFIG = {
  // 仅削减宗门全局生产奖励，个人修炼与加工节拍沿用独立系数。
  REALM_PRODUCTION_BONUS_RATIO: 0.5,
  // 金丹后加工速度按境界倍率的平方根提升，保留加工设施的增产价值。
  CRAFT_SPEED_REALM_BASE: 2,
  AUTO_CRAFT_SPEEDS: [1, 2, 5, 10],
  // 主循环每 100ms 跑一次，所有速率都以「每秒」为单位
  TICK_MS: 100,
  // 自动存档间隔
  AUTOSAVE_MS: 20000,
  // 单次离线收益最多结算多少小时（可被修真提升）
  OFFLINE_CAP_HOURS: 8,
  // 每名弟子每秒消耗的灵气（4.8：提高基准，使供养成为更实质的持续压力）
  DISCIPLE_UPKEEP: 0.3,
  // 宗门规模成本：前20人不加费，此后每增加一人使全体口粮增加0.5%，额外最多100%。
  POPULATION_UPKEEP_FREE: 20,
  POPULATION_UPKEEP_PER_DISCIPLE: 0.005,
  POPULATION_UPKEEP_EXTRA_CAP: 1,
  /**
   * 弟子口粮随境界上涨的指数：实际每人每秒 = DISCIPLE_UPKEEP × realmMult^这个值。
   *
   * 取 1 ＝ 与境界倍率同倍上涨。**为什么不保持常数**：产出被 realmMult 一路放大，
   * 而口粮是常数时，一名阵徒的「毛产出 ÷ 口粮」会从凡体的 2.4:1 一路涨到渡劫期的 48:1 ——
   * 弟子越到后期越接近免费，人口只剩下「盖房子」这一道闸门
   * 指数取1让基准口粮与宗门境界倍率同倍增长；实际负担还取决于人口规模、
   * 个体境界、岗位分工、减耗与生产增益，不能将42%当成实际总产出的固定占比。
   *
   * 调小（如 0.5）＝温和版；调大（如 1.5）＝后期养人更贵。
   */
  DISCIPLE_UPKEEP_REALM_EXP: 1,
  /** 每点仙缘的全局产出加成（转世/飞升带走的永久加成） */
  KARMA_BONUS_PER_POINT: 0.01,
  /**
   * 仙缘加成的**软上限**（每点 +1%、上限 +200%）：
   * 前 75% 不打折，剩下的渐近到上限 —— 也就是最多 +200%（这里 limit = 2）。
   * 取软上限而不是硬上限，是为了让「多刷几轮」永远还有一点点收益，但不会线性膨胀把后期压平。
   * 转世弧线（三转参考）：一转约 120 点 = +120%（60% 上限），二转边际约 +32%，三转后被动饱和、
   * 由仙缘修持（karmaShop）接棒。见 docs/DESIGN.md §8.4。
   */
  KARMA_BONUS_CAP: 2,
  /** 仙缘仓储：每点 +0.05%，只作用于有限仓储；不改变产出倍率。 */
  KARMA_STORAGE_PER_POINT: 0.0005,
  /**
   * 仙缘仓储的软上限（+50%）：仓储经「灵机入库受仓容截断 → sqrt 结算」与仙缘所得形成反馈环，
   * 必须与产出侧一样封顶，否则产出砍半后仓储会反客为主成为主膨胀通道。
   */
  KARMA_STORAGE_CAP: 0.5,
  /** 4.3：每卷道论提供的临时灵机仓容；总加成不超过基础上限的 100%。 */
  DAOTREATISE_INSIGHT_CAP: 2000,
  /** 每颗道果的全局产出加成（道果是飞升才给的更高一层货币） */
  DAO_PRODUCTION_BONUS: 0.05,
  /** 每颗道果对「转世/飞升时能拿多少仙缘」的加成 —— 上层反哺下层 */
  DAO_KARMA_GAIN_BONUS: 0.1,
  /**
   * 首次主动转世的仙缘结算倍率（4.6）：只对“一次都没转世”时的转世结算生效。
   * 首转实测只有 21～22 点，累计首飞比直飞慢；提高这一次的结算，让首转真正值得。
   * 不改变飞升结算，也不随转世次数重复生效。
   */
  FIRST_REINCARNATION_KARMA_MULT: 2,
  /**
   * 转世的参考次数（**不是飞升门槛**，只是界面上的参照）。
   *
   * 飞升的唯一条件是渡劫期 —— 转世是达成飞升的**正常游玩途路**：
   * 每一世带着仙缘重来、跑得更快，几世之后冲渡劫期最省力；
   * 但玩家愿意一世硬磨到渡劫期，同样可以飞升。详见 docs/DESIGN.md §8.2~§8.4。
   */
  ASCEND_TURNS_REFERENCE: 3,

  /**
   * 第二种驱动（阴阳分灵 → 湮灭 → 灵能）。
   *
   * 灵能每秒逸散 0.5%，灵能枢另按供给消耗灵能。
   * 无其他消耗时，稳态库存约为实际产出÷逸散率；实际产出包含境界与专业倍率，
   * 不能直接把炉的基础产量当成最终收入。规则见 docs/DESIGN.md §11.3。
   */
  QI_ENERGY_DECAY: 0.005,
  // 法宝祭炼：每级效果 +30%，花费按 1.7 倍递增
  // （不设等级上限：指数成本自己封顶 —— 16 件法宝各炼到 10 级，累计需求约全树灵机总价的 57 倍）
  TREASURE_REFINE_STEP: 0.3,
  TREASURE_REFINE_RATIO: 1.7,
  // 手动「吸取天地灵气」：每次点击的基础灵气。
  // 每座已建聚灵阵再按其每秒基础产出叠加点击收益（与建筑数据同源，改产出即同步改加成）。
  CLICK_QI_BASE: 2.5,
  // 默认自动来人：有空房就每这么多秒自己来一名（可被《广开山门》缩短）；主动礼聘为可选模式
  DISCIPLE_ARRIVAL_SECONDS: 15,
  // 宜居度是点数；只限制产量倍率，不限制宜居度本身。
  HABITABILITY_BASE: 20,
  HABITABILITY_LOSS_PER_POINT: 0.01,
  HABITABILITY_GAIN_PER_POINT: 0.0025,
  HABITABILITY_GLOBAL_CAP: 0.5,
  HABITABILITY_BONUS_MARGIN: 20,
  HABITABILITY_JOB_MARGIN: 20,
  HABITABILITY_LEAVE_MARGIN: 50,
  HABITABILITY_LEAVE_INTERVAL: 60,
  HABITABILITY_LEAVE_CHANCE_PER_POINT: 0.02,
  HABITABILITY_LEAVE_CHANCE_CAP: 0.5,
  // 宜居度减耗：独立于阵法减耗（consumeRatio）的一条生活线，只减不加。
  HABITABILITY_UPKEEP_PER_POINT: 0.002,
  HABITABILITY_UPKEEP_CAP: 0.2,
  // 灵气断供时每秒钟掉多少宜居度，以及恢复时的回升速度
  HABITABILITY_STARVE_RATE: 6,
  HABITABILITY_RECOVER_RATE: 2,
  // 长期断供独立导致弟子流失：每多少秒走一人
  LEAVE_INTERVAL: 25,
  // 隐藏成就/随机奇遇的检查间隔（秒）
  EVENT_MIN_GAP: 150,
  EVENT_MAX_GAP: 420,
  // 单次事件每种资源的奖励上限，先限奖励额度，再按剩余仓储结算。
  EVENT_REWARD_STORAGE_SHARE: 0.2,
  // 凝灵诀：每逢节气（15 天 = 45 秒），灵气满仓时把仓内这个比例的灵气凝成灵液
  AUTO_CONDENSE_RATIO: 0.5,
  // 日志上限
  LOG_LIMIT: 220,
  // 建筑、研究、技艺、法宝与配方渐进露出：每种费用资源的峰值均须达到基础费用的这个比例。
  BUILDING_UNLOCK_RATIO: 0.3,
  // 维护费供给迭代的收敛上限（防死循环）；供给不足时按实际比例缩放
  SUPPLY_ITERATION_MAX: 40,
  // 弟子口粮的耗料减免合计上限；灾损减免合计上限（对应提示里的「合计上限」）
  UPKEEP_REDUCTION_CAP: 0.85,
  DISASTER_GUARD_CAP: 0.8,
  // 阵基冷却容量 = 全部工位容量之和的这个比例（晶核阵另加）
  PROCESSING_COOLING_CAPACITY_RATIO: 0.25,
  // 时间推进：切片步长。短时长（在线补算、短暂离开）保持逐秒精确，与主循环逐 tick
  // 的结果完全一致：不超过 OFFLINE_EXACT_AFTER_SECONDS 的补算全部逐秒结算，
  // 其中无弟子、维护、加工和灵能逸散的稳定生产可用到 MAX_SLICE_SECONDS，
  // 并在历法、增益与事务边界切步。
  TICK_SLICE_MS: 1000,
  MAX_SLICE_SECONDS: 10,
  /**
   * 逐秒精确与有界近似的分界（秒）。
   *
   * 超过这个时长的离线改走「有界近似」：总时长等分为至多 OFFLINE_MAX_SEGMENTS 段，
   * 每段按段首状态与该段时长估算供给后一次结算。**计算量与离线时长脱钩**，
   * 代价是段内供给变化、加工重启与季节轮转按加权平均近似，
   * 收益可能与在线挂机不同（见 docs/ENGINEERING.md「离线结算」）。
   */
  OFFLINE_EXACT_AFTER_SECONDS: 60,
  /** 长离线的基础分段上限；另有初始有效增益的到期边界，步数上界与离线秒数无关。 */
  OFFLINE_MAX_SEGMENTS: 64,
  /**
   * 每个离线分段内允许的「工位/配方扫描」轮数上限。
   * 一轮 = 冻结一次工位分配、按可用加工时间与燃料预算批量结算；空出的工位在下一轮或下一段再分配。
   * 禁止按预计成品份数循环。
   */
  OFFLINE_INDUSTRY_ROUNDS: 2,
  MAX_STEP_SECONDS: 60,
  // 旧版订单兼容：单个配方未完成订单的份数上限
  CRAFT_ORDER_CAP: 1000000,
}
