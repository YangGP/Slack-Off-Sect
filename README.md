# 摸鱼宗门 · Slack Off Sect

以宗门飞升为轮回，以弟子成长为长期目标。以先飞升带动后飞升，最终达成人人飞升的目标。

**在线试玩**：[摸鱼宗门](https://YangGP.github.io/Slack-Off-Sect/)。当前代码版本 **v0.424 · 材料链扩充与小数结算**；页面右下角可查看更新日志，版本记录由 src/data/changelog.js 维护。

## 开发与检查

~~~bash
npm install
npm run dev          # 开发预览 http://127.0.0.1:5273
npm run check        # 日常检查：编码、8组核心引擎动作、SSR
npm run check:full   # 按需完整回归，含长模拟、审计、启动与DOM
npm run build        # 生产构建到 dist/
npm run preview      # 预览构建结果
npm run docs:tables  # 从数据文件重新生成全量表
npm run clean        # 删除构建、测试与审计产物
~~~

局部改动只运行对应检查，例如 `npm run smoke -- --group=saveSerialization`；用 `npm run smoke -- --list` 查看功能组。产业负荷与记录恢复测试按修改范围单独选择，不作为每次提交的附加必跑项。

## 玩法

每一世通过宗门建设与修真科技实现飞升，积累永久传承；每次轮回逐渐降低弟子培养难度，最终建立一个所有弟子都能飞升的宗门。

## 文档

完整分类与阅读顺序见 [文档导航](docs/README.md)。常用入口：

| 文档 | 用途 |
| --- | --- |
| [DESIGN](docs/DESIGN.md) | 当前系统规则、结算公式与存档 |
| [ENGINEERING](docs/ENGINEERING.md) | 工程分层、交互约定、扩展与工具命令 |
| [TABLES](docs/TABLES.md) | 从源码生成的全部条目、造价、前置与效果 |
| [ROADMAP](docs/ROADMAP.md) | 尚未实施、待评估的方向及专题入口 |

现行数值以源码和生成表为准；专题解释规则与兼容边界，后续工作在 ROADMAP 中维护。当前讨论中的[轮回与弟子长线重构](docs/REINCARNATION-REDESIGN.md)尚未实施。

## 目录与分析工具

src/data/ 定义资源、建筑、研究与配方；src/game/ 负责规则、状态、存档和格式化；src/components/ 与 src/styles/ 负责界面。tools/ 包含引擎、渲染与DOM检查，及共用 player-bot 的节奏和资源审计。

~~~bash
npm run audit:economy                      # 成品容量、基础需求与去向
npm run audit:crafts -- 24 0               # 加工链与边际增益
npm run audit:buildings                    # 前置、来源与容量可达性
npm run audit:breakthrough -- aided 2 72   # 满配护道的真实引擎节奏样本
npm run balance:track -- 0 12345          # 完整飞升测定、资源流水、阻塞与节奏报告
npm run balance -- 24 0                    # 固定时长的资源快照
npm run balance:events -- 24               # 固定种子事件对照
npm run balance:visits -- 24               # 持续操作与间歇上线
~~~

模拟结果依赖策略、操作频率和初始永久加成，不能当成真实玩家的通关时间。工具参数与统计口径见工程文档。

## 部署与产物

推送 main 或 dev1 后，GitHub Actions 分别检出这两个分支并检查、构建，将 main 放在站点根目录、dev1 放在 `/dev/`，合并为一个 Pages 产物后一次发布；任一分支检查或构建失败则不发布。正式地址为 https://YangGP.github.io/Slack-Off-Sect/ ，开发预览地址为 https://YangGP.github.io/Slack-Off-Sect/dev/ 。Vite使用相对路径，可在子目录部署。

首次启用：先将包含预览隔离代码和新版工作流的提交推送到 dev1，再把新版工作流同步到 main，确保后续两个分支都使用合并发布流程。在 Settings → Pages 中选择 GitHub Actions；Settings → Environments → github-pages 如限制部署分支，须允许 main、dev1。配置见 `.github/workflows/deploy-pages.yml`。

开发构建注入 `VITE_DEPLOY_CHANNEL=dev`，显示预览标识，存档与旧代备份键使用独立的 `slack-off-sect.dev.*` 前缀，不自动读取正式存档；统计采集强制关闭且不弹授权框。正式构建保持原存档键与授权流程。同代存档仍可由玩家主动导出／导入，独立存储不等于禁止手动复制进度。

npm run clean 清理 dist/、dist-ssr/、.smoke*/、.early/ 和 .vite/。本地依赖 node_modules/、源码和正式数据表保留。导出的存档由用户选择保管，清理脚本不扫描存档文件。

## 许可

[MIT](LICENSE) © 2026 YangGP。数据与文案为本项目原创；参考 [Kittens Game](https://github.com/nuclear-unicorn/kittensgame) 的玩法，未使用其代码或素材。
