# 中华航空

横屏、中文、2D、单机 Web/PWA。以《中华铁路》的场景布局、客货装载和载具经营为复刻参照，把铁路运输转换为航空运输，使用原创航空素材。

## 当前版本 0.3.0

机场装载 → 航网规划 → 起飞 → 逐站交付。真实客货订单，独立容量、卸载和换机中转，最终目的地单次付款。12座机场、9种机型（纯客/纯货/混合各3种）、4项三级改装、4至16个机库机位、最多5段运输计划，保留真实供给自动往返。最多8小时离线补算，本地事务存档/备份/导入导出，兼容v1/v2旧进度。

本轮不是完整一比一复刻。机型参数和改装倍率为航空化配置，原版全部数值、司机雇用、出售退役、联盟、像素级美术和新手分步教学未完成。

开发前阅读 [AGENTS.md](AGENTS.md)、[设计](docs/DESIGN.md)与相关代码。[游玩指南](docs/PLAYING.md) · [交付约定](docs/DELIVERY.md)。

## 运行与检查

Node.js >=22.12，使用已提交的锁文件。

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

React负责界面，PixiJS负责航网，本地SVG负责机场/飞机；独立TypeScript核心负责订单、飞机与时间，Dexie/IndexedDB负责主存档和备份，PWA负责离线缓存。无账号、业务后端、外部地图、字体或遥测。

生产输出dist/通过HTTPS静态托管或本地HTTP访问，不能双击HTML。BASE_PATH=/China-Airlines/构建项目子路径。main合并后工作流完整验证并尝试发布已测试产物；需已有可用Pages配置。源码合并不等于网站上线，不自动修改仓库可见性。

所有机型和数值均为游戏配置，不用于航空导航或实际运营，与现实航空公司无关联。
