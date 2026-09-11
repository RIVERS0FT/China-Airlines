# 中华航空

中文、横屏、2D、单机航空运输经营 Web/PWA。以《中华铁路》的场景布局与装载操作为复刻参照，铁路对象航空化，使用原创航空矢量素材。

## 当前设计迭代 v0.2

机场装载、全幅航网和飞行场景；真实旅客/货物队列；逐单装卸、同目的地装载、座位/吨位限制；手动经停和换机中转；最终目的地单次结算；依赖真实供给的自动往返；v1存档迁移和本地保存。

仍有12座机场、3种虚构客货机、16架飞机上限、4项任务。纯客/货机分类、改装、多段预设计划和完整原版数值尚未实现，本版本不是完整一比一复刻。

开发前阅读 [AGENTS.md](AGENTS.md)、[设计](docs/DESIGN.md)和相关代码。[游玩指南](docs/PLAYING.md) · [交付约定](docs/DELIVERY.md)。

## 运行与检查

Node.js >=22.12，依赖沿用已锁定版本。

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

React负责操作，PixiJS负责航网，本地SVG负责机场/飞机；独立TypeScript核心负责订单与时间，Dexie/IndexedDB负责主存档和备份，PWA负责离线缓存。不连接业务后端、账号、外部地图、在线字体或遥测。

生产输出 dist/ 可通过HTTPS静态托管或本地HTTP服务访问；不能以双击HTML作为发布方式。BASE_PATH=/China-Airlines/可构建项目子路径。GitHub Pages工作流在main合并后进行完整验证，再发布已测试产物；需要仓库已有可用Pages配置。源码合并不等于网站上线。

所有机型、数值、地图位置均为游戏配置，不用于航空导航或真实调度，与现实航空公司无关联。
