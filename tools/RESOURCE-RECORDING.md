# 资源测定记录

完整飞升测定已统一到 `npm run balance:track`，默认开启本记录器；命令、输出表和统计边界见 [完整飞升测定](BALANCE-TRACKING.md)。下文保留 P1 成对测量入口，二者复用同一模拟器与 schema 7 记录器。

记录以整体节奏为目标：普通动作与配置请求不写日志、不记调用次数；资源收支与阻塞时长按默认30游戏分钟的窗口合成一条 `window`，共用一个 `seq`。全部资源／来源／用途放在 `flows`，缺料、仓容不足、满仓、加工和缺供累计时长放在 `pacing`；不落盘5秒状态切换。研究、首次设施、突破、重置、解锁和异常保留节点。schema 3／4／5／6旧流水可重建，但旧检查点不能续跑新源码；既有记录仍保留。`recording-check --case=compact` 检查动作省略与真实收支，`ledger` 检查多资源合包，`pacing-window` 检查360个5秒观察段压缩为一条窗口且时长与就绪时间正确；`resume-offline` 检查暂停恢复前后阶段时长统计一致。

在原有成对测量参数后加 `--record=true` 即可开启。正常游戏和未开启的模拟没有记录文件，不改玩法数值或玩家存档。

```powershell
node tools/run.mjs breakthrough-time-audit --paired --hours=1008 --seed=1 --faith=growth --visits=waking --decision-seconds=150 --batch-actions=12 --reserve=ready --details=decisions --record=true --wall-seconds=7200
```

这是正式长跑示例，本轮未执行。每个样本的累计计算预算最多 7200 秒；预算结束表示测量暂停，不代表游戏不可达。汇总结果仍在 `.smoke-breakthrough-time/`，资源原始记录在 `.resource-records/<runId>/`，不由工具构建清理。

记录内容包括：分窗口的实际资源增加／减少、用途和手动／自动加工产量、事件与重置收支；每30分钟的库存、仓容和产消率快照；破境缺料、仓容不足、满仓、加工与缺供累计时长，以及少量关键节点。`blockers.csv` 的 `sampled_fraction` 是单项时长除以所属阶段观察时长，重叠项不能相加为总等待。突破和重置有前后快照，研究与首次设施仅记节点；不保存普通动作轨迹、完整加工计划或反复变化的可购买状态。金额使用 Decimal 字符串，无上限仓容单独标记。缺料时长仍按原观察边界统计，降低落盘频率不降低内存中的收支观察频率。

连续结算保留实际净变化；毛产出、维护量属于引擎模型，分别标注，不虚构实际同时收支。离线结算沿用游戏的有界近似，能量逸散与截断无法分开的近似段会明确合并标记。报表按世次、境界访问和在线状态分组，不能把回退或重生后的重复境界混为同一阶段。

流水默认按约 4 MiB 分块，记录预算为 1 GiB 软上限，到达后在安全边界停止并保存检查点。单次离线结算和收尾可能超过软上限。记录写入错误会中止测量，保留上一份有效检查点，不将不完整结果报告为成功。

## 暂停与恢复

在该样本的记录目录创建名为 `STOP` 的空文件，会在下一个安全边界停止。同步计算期间信号处理可能延后，优先使用 STOP 文件。强制结束进程后只能恢复到最近检查点，最多回退六个游戏小时；境界变化也会保存检查点。

删除 STOP 文件后，用原来的已编译 bundle 恢复：

```powershell
node .smoke-breakthrough-time/breakthrough-time-audit.js --paired --resume=".resource-records/<runId>/checkpoint.json"
```

不要在恢复前重新构建或改动源码。恢复会检查 Node 版本、完整源码／bundle 指纹、检查点与分块校验和，恢复完整模拟状态、决策计时器和两路随机流。检查点之后的多余分块会保留为 `.orphan-*`，不计入恢复后的账本。损坏的最新检查点可尝试同目录的 `checkpoint.previous.json`。已到达目标或时间上限的测量不允许继续恢复。

预算是累计值。若之前使用了较小预算，可在恢复命令后加 `--wall-seconds=7200` 提高累计上限；只允许改这项运行预算，不允许改种子、数值或策略。到达 7200 秒的样本不再继续计算。

## 重建报告与检查

```powershell
node tools/run.mjs resource-report ".resource-records/<runId>"
node tools/run.mjs recording-check --case=resume
```

第一条只读取已落盘流水并生成 `report.rebuilt.json`，不会重跑游戏。它检查分块与序号，独立计算“期初＋流水＝期末”；缺少期末记录、损坏或不平账都会报错。`report.json` 是运行完成时自动生成的报告，含资源去向、加工产量、分阶段缺料与仓容时长。

第二条运行单个短回归用例，执行进程限时五秒。其他关键用例为 `ledger`、`missing`、`actions`、`auto`、`energy`、`approximate`、`reset`、`seal`、`breakthrough`、`equivalent`、`resume-offline`、`resume-realm`、`budget`、`corruption`。历史测量没有这些流水，无法事后补成完整账本；新样本也只代表选定策略，其他路线仍需独立样本。
