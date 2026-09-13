# v0.7.0 单机经营扩展验收

日期：2026-09-13。分支 `feat/offline-career-expansion`，基于 `6322a7c8ddca9906bfdf8ef016e167b86ccdca73`，交付包含本地未提交改动。本轮没有提交、推送、合并或部署。

## 实现范围

- 不实现宝石，使用金币、点券、机体零件和生产物资；升级、进化、设施、人员的支出与来源均有可操作入口。
- 重读用户APK的273张静态表、33,196行；核对100级数值观察与包内数据完全一致。具体原版依据及航空化差异见 [APK-EVIDENCE.md](APK-EVIDENCE.md)。
- 4个系列、12种可购纯客/纯货/混合机及独立初航号；距离报价、满载奖励、成本、电力和强化曲线重新配置。
- 飞机封存、启用、拆解、组装、编队、进化、专业货舱；人员招募、岗位、工资、技能；任务、区域挑战、每日与七日奖励、投资、物资限购、展馆和成就。
- 仓库、工厂、设计、研究、贸易五类设施；当地采购、生产、组件调拨、物资装机、异地入库与日/周贸易。既有客货池仍是真实装载来源。
- 机场宣传、客源开关、手动刷新和安全关站；常用路线保存及反向发航。保留目的地站牌、地面客货、右下角制定路线和飞行时隐藏装载区。
- 新增14张绿底生成后抠图的原创RGBA素材，运行时共42项；源图、提示词和处理脚本可追溯。
- 存档格式7、数据库结构1；v1—v6先经冻结校验再迁移，保留历史机型、订单及在途收益。

具体机型表、费用、成长上限、产销配方及时间规则见 [OFFLINE-CAREER.md](OFFLINE-CAREER.md)。入口位于游戏顶部「经营中心」。

## 当前工作树的验证结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| TypeScript类型检查 | 通过 | `npm run typecheck`，两次生产构建亦执行类型检查 |
| 核心、存档与持久化测试 | 332/332通过，17个文件 | `artifacts/career-unit-results.json` |
| 根路径生产构建 | 通过 | 已保留在 `artifacts/root-build-v7/` |
| 根路径Chromium流程 | 101/101通过，零失败、零重试、零跳过 | `artifacts/browser-root.json` |
| `/China-Airlines/`生产构建 | 通过 | 最终 `dist/`，沿用仓库配置路径 |
| 子路径Chromium流程 | 101/101通过，零失败、零重试、零跳过 | `artifacts/browser-subpath.json` |
| 开发及生产依赖审计 | 两份报告均0漏洞 | `artifacts/npm-audit-career-{all,runtime}.json` |
| 美术文件与透明通道 | 42项解码有效，新增14项均为RGBA且透明度范围0—255 | `art/manifest.json`及浏览器离线图片测试 |
| APK复验 | 哈希、表行数及100级数字一致 | `artifacts/career-apk-verification.json` |
| 差异空白检查 | 通过 | `git diff --check` |

浏览器运行于Windows Chromium，覆盖1440×900、844×390和667×375横屏以及竖屏提示。验证实际购买、装卸、运输、结算、任务领取、岗位分配、生产跨城贸易，刷新恢复、导入导出、拒绝损坏存档、备份恢复、并发写保护和离线重载；新美术在离线模式下可用。浏览器物流流程实际生产4份餐食，装运3份到上海，再交付一次当地贸易，核对两地仓库余量和完成数。

核心测试另覆盖工资到期后停止新自动航班、空飞不刷奖励、午夜补能与在途预留、整段和分步推进等价、非法消费无部分扣减、随机奖励持久化、仓容预留、每日限购和刷新、专用货舱限制以及旧航班锁定金额不变。最后补充验证现代机型不能伪装为免能量历史航班，也不能在缺少人员记录时获得自动权限。

美术与布局证据保留在 `artifacts/desktop-airport.png`、`artifacts/career-logistics-1440.png`、`artifacts/career-logistics-844.png` 和 `artifacts/career-logistics-667.png`。已检查原创素材边界与窄横屏物流建筑的文字布局。

## 交付与边界

运行 `python scripts/package-career.py` 校验测试报告后生成：

- `artifacts/delivery/china-airlines-source-v7.zip`：当前工作树源码、测试、设计与原创素材，包含未提交内容。
- `artifacts/delivery/china-airlines-web-v7.zip`：已经通过根路径浏览器验收的便携静态构建。
- `artifacts/delivery/china-airlines-pages-v7.zip`：已经通过子路径浏览器验收的Pages构建。
- `artifacts/delivery/SHA256SUMS-v7.txt`、`BUILD-v7.json`：压缩包哈希、源文件树指纹、基准提交和验证范围。

打包脚本验证ZIP完整性，排除参考APK、反汇编、密钥、个人存档、node_modules、.git和测试缓存。原始APK不参与构建。静态包需要HTTP/HTTPS托管，PWA离线启动需先成功加载并缓存。

本轮完成上述单机操作链，没有原样移植原版759列车变体、全部201任务、11类9级特殊货运或在线活动奖池；区域挑战采用个人运输业绩，组装、进化及贸易使用航空版规则。洲际与远程共享大型机体素材，空中视图仍使用通用飞机；没有声称完整1:1复刻。长期数值平衡、真实Android/iOS设备与Safari未作实机验收。

构建仍提示PixiJS渲染分块超过500 kB（约532 kB），属于体积提示，生产构建和离线流程均成功。未触发远程CI或Pages发布，因此本地验收和交付包不代表网站已更新。
