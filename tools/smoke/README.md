# 引擎冒烟测试

运行 `npm run smoke`。构建方式、退出码和最终通过／失败汇总保持不变。

## 组织方式

- `../smoke.mjs`：运行入口，只执行清单、架构检查和最终汇总。
- `checks.mjs`：显式登记执行顺序，保留拆分前的顺序。
- `../lib/checks.mjs`：每次运行独立的 `ok`、`close`、`section` 和统计汇总。
- `fixtures.mjs`：新档、已开山存档和强制成功突破的公共夹具。
- 其余文件：按功能保存用例。数值和格式在 `numbers`；建筑及开局在 `buildings`、`startup`；经济和仓储在 `economy`、`storage`；研究与破境在 `research`、`progression`；炼制在 `crafting`、`automation`、`materials`、`power`；事件、猎杀、弟子和存档分别放在同名文件。
- `extensions.mjs`：连接已有的工业、弟子和离线专项检查，不复制其实现。

## 新增用例

1. 在对应功能文件中导出一个测试函数，按需接收 `{ ok, close, section }`；异步检查使用 `async` 函数。
2. 在 `checks.mjs` 中登记该函数，选择明确的执行位置。
3. 用例自行创建状态，需要公共场景时引用 `fixtures.mjs`；不要依赖其他用例留下的状态，也不要在模块导入时执行测试。
4. 运行 `npm run smoke`，确认断言汇总和退出码。

`../industry-check.mjs`、`../disciple-check.mjs`、`../offline-check.mjs` 等专项工具继续复用。新用例放入对应功能文件，不再向入口或清单中堆入测试主体。
