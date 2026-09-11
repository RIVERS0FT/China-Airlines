# 中华航空

中文、横屏、2D 的单机航空运输经营 Web/PWA。React 管理经营界面，PixiJS 8 绘制原创航网，独立 TypeScript 核心负责时间事件与经济，Dexie/IndexedDB 保存进度。

开始开发前阅读 [AGENTS.md](AGENTS.md) 与 [设计文档](docs/DESIGN.md)。游玩步骤见 [上手指南](docs/PLAYING.md)，验证和交付约定见 [发布文档](docs/DELIVERY.md)。

## 首版内容

12 座可解锁机场，3 种虚构客货机，购机与机场升级，双向航线，手动派航/自动往返，客货收入与运营成本，4 个发展任务，最多 8 小时离线补算。本地自动保存、上一份备份、JSON 导入/导出与并发写入保护。无账号、业务后端、外部地图、在线字体或遥测。

## 本地运行

需要 Node.js 22.12 或更新版本。锁文件已存在时使用 `npm ci`；首次初始化尚无锁文件时使用 `npm install` 并提交生成的 `package-lock.json`。

```sh
npm ci
npm run dev
```

开发地址由 Vite 在终端输出。首次游戏在北京开通到上海的航线，再点击“派遣航班”。开通航线和派遣是两个不同操作；默认启用自动往返。资金是游戏币，不是真实货币。

## 验证

```sh
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

子路径验证（两个命令使用同一 `BASE_PATH`）：

```sh
BASE_PATH=/China-Airlines/ npm run build
BASE_PATH=/China-Airlines/ npm run test:e2e
```

Playwright 自动启动生产预览服务器。浏览器截图位于 `artifacts/`，失败轨迹在 `test-results/`，HTML 报告在 `playwright-report/`。

## 静态发布与离线

`npm run build` 输出 `dist/`，默认相对资源路径，适合普通 HTTPS 静态主机。`npm run preview` 可在本地验证。不要直接以 `file://` 打开 HTML。

`.github/workflows/ci.yml` 执行测试、根目录与项目子路径验证、生成源码 ZIP 与通用静态 ZIP。依赖锁文件已提交，CI 使用只读仓库权限和 `npm ci`；浏览器验收禁用自动重试，同时检查开发及运行时依赖审计。`.github/workflows/deploy.yml` 在 main 更新后复用全部验收流程，再部署已通过测试的构建到已启用的 GitHub Pages；站点未配置或权限不足时会失败，不会把私有仓库变成公开仓库。

离线运行需要首次成功加载并缓存资源。缓存就绪会显示状态；应用更新先提示，手动确认后保存再刷新。

## 存档注意

进度保存在当前浏览器当前站点（不同域名之间不共享），定期导出 JSON。清理站点数据、隐私模式或存储回收可能丢失进度。导入先严格校验，失败不会覆盖原数据。主存档与备份均不可读时不会自动新建覆盖。多个标签页出现并发写入时，旧窗口停止写入并提示重新载入。

纯单机模式不实施反作弊。机场坐标和机型参数仅用于玩法，地图不是导航资料。本作不代表或关联任何真实航空公司。

## 目录

```text
src/core/          配置、唯一经营核心、严格存档校验
src/persistence/   Dexie 事务、备份和 revision 冲突检测
src/runtime.ts     命令队列、时钟、持久化与 Zustand 快照
src/ui/            横屏 React 界面、PixiJS 航线地图
src/pwa.ts         离线注册、保存后更新
scripts/icons.mjs  无外部依赖的原创 PWA 图标生成
tests/            领域逻辑和存档数据库测试
e2e/              生产构建的浏览器验收
```
