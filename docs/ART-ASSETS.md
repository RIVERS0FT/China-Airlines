> 2026-09-13 更新：本文件下方保留历史美术记录。当前规则和新增范围以 [OFFLINE-CAREER.md](OFFLINE-CAREER.md) 与 [APK-EVIDENCE.md](APK-EVIDENCE.md) 为准。

## 单机经营扩展美术（v0.7.0）

新增14张原创透明PNG，运行时清单共42项。两张原始图均以纯绿背景生成，再抠除背景、修正绿边并输出RGBA；没有使用参考APK中的美术。提示词见 `art/prompt-career.txt`，源图位于 `art/source/aircraft-career-green.png` 和 `art/source/career-props-green.png`，处理脚本为 `scripts/prepare-career-art.py`。

| 成品 | 数量与规格 | 接入位置 |
| --- | --- | --- |
| `aircraft-{light,regional,heavy}-{passenger,cargo}-v2.png` | 6张，1000×450 | 主机场地面飞机、机库、飞机商店和机体工坊 |
| `cargo-{express,cold,industrial}-v2.png` | 3张，256×256 | 候运区真实快件、冷链与工业货物 |
| `facility-{warehouse,factory,design,research,trade}-v2.png` | 5张，384×320 | 物流园五座可点击建筑，带实际设施等级和升级操作 |

所有图片走本地BASE_URL和PWA预缓存。洲际与远程共享大型剪影，混合机沿用客机剪影；空中飞行继续采用已有通用机体。并未绘制原作全部载具、活动图或独立逐机型飞行动画。

# 美术资源 · 第一、二批

## 客货候运地面补充（第五批交付）

新增 `public/art/apron-platform-v1.jpg`（1536×1024，RGB），用于全宽客货区背景，累计28项运行时成品。使用内置imagegen原创生成空站台铺装、安全线、路缘灯与深色地面，不含人物、货箱或文字。原图 `art/source/apron-platform-v1.png`，提示词 `art/prompt-apron-platform.txt`；运行 `python scripts/prepare-platform.py` 编码JPEG并更新清单。该背景为不透明图片，不需绿底抠图；既有透明人物、飞机和图标仍沿用绿底生成后抠图的成品。背景通过BASE_URL读取并纳入PWA离线缓存。

后续页面调整见 [AIRPORT-REFERENCE.md](AIRPORT-REFERENCE.md)：人物和货箱直接置于地面，机体载荷叠层始终显示，已移除开关。成品仍沿用本文件27项资源；第三批交付是布局与按钮修复，未新增位图。

2026-09-12 使用内置 imagegen 生成，参照用户给出的明亮卡通航空经营视觉方向；不裁取参考图、不使用真实航空公司商标。素材是原创生成的游戏化示意，不代表真实机场或真实机型，也不表示整套界面已完成参考效果。

| 成品 | 规格 | 当前用途 |
| --- | --- | --- |
| `public/art/airport-day-v1.jpg` | 1536×1024，不透明 | 通用地面机场背景；机场名称仅在顶部状态区显示 |
| `public/art/passenger-01-v1.png` 至 `passenger-06-v1.png` | 各256×320，RGBA | 6位独立旅客，候机与机上订单卡共用 |
| `public/art/cargo-v1.png` | 256×256，RGBA | 普通货物订单 |
| `public/art/aircraft-v1.png` | 1408×640，RGBA | 主场景地面机体，第二批已接入，叠加真实载荷示意 |

旅客外观仅为装饰，与票价、职业或其他经营属性无关；旧聚合订单继续保留真实数量说明。未增加快件、冷链、特殊货物等尚无核心规则支持的货种，也未把参考图中的货币和功能按钮加入游戏。

`art/source/` 保存4张生成原图。角色图集、货箱、飞机按不透明 `#00FF00` 纯绿背景提示生成；模型输出的绿色有少量色值偏差，因此先将背景区统一为精确 `#00FF00`，保存为 `*-green-solid.png`，再执行抠图；主体边缘保留过渡像素供羽化处理。`art/prompts.json` 保存本批全部完整提示词。`*-keyed.png` 是去背景后的原分辨率中间文件，`art/manifest.json` 记录成品尺寸、文件大小与透明度检查结果。

复现处理：安装 Python 与 Pillow 12.2.0 后执行 `python scripts/prepare-art.py`。脚本按绿色相对红蓝的溢出量抠背景，对边缘羽化及去绿，裁出图集的3×2独立角色，再按统一画布尺寸输出；PNG保留透明通道。这个流程要求主体没有绿色配色，后续绿色服装或物品需另用遮罩，不能直接套用本脚本。生成模型不属于本地构建依赖，正常 `npm run build` 直接使用已保存的成品。

`art/review/sprites-light-dark.jpg` 展示同一透明层在浅色与深色底上的边缘。实际页面的飞机使用位图、装载状态使用只读SVG叠层；飞行中继续使用云层场景。Vite资源路径通过 `BASE_URL` 支持根路径与现有 `/China-Airlines/` 部署路径，所有成品纳入PWA预缓存。

本批只交付本地功能分支和ZIP；没有执行提交、PR合并或部署。第一批检查结果见 `art/VALIDATION.md`，第二批见 `art/VALIDATION-v2.md`。

## 第二批：按钮、地勤与飞机替换

新增18张透明PNG，累计27个成品。均使用内置imagegen；完整提示词在`art/prompts-v2.json`、绿底纠正提示在`art/prompts-v2-corrections.json`，飞行机体提示在`art/prompt-aircraft-flight.txt`。原始不合格黑底输出另存为`*-rejected-background.png`供追溯，不进入运行时；经imagegen改为绿底后再标准化、抠图。

| 成品 | 规格 | 页面用途 |
| --- | --- | --- |
| `icon-airport/map/directory/plane/shop/task-v1.png` | 各256×256 | 机场装载、航线地图、机场目录、机队管理、飞机商店、运营任务；飞机图标也用于起飞 |
| `icon-coin/trophy/save/help/maintenance/energy-v1.png` | 各256×256 | 资金、完成航班、存档、帮助、机库改装、补能 |
| `pilot-avatar-v1.png` | 320×320 | 左上品牌头像 |
| `tug/baggage-trailer/ground-crew/cones-v1.png` | 各384×320 | 地面场景装饰层，不表示订单装卸进度或真实地勤结算 |
| `aircraft-flight-v1.png` | 1408×640 | 起落架收起的飞行状态机体 |

图标居中留白，配色使用蓝、白、金，帮助问号和确认勾等语义清晰。按钮沿用中文名称、键盘焦点、禁用状态与点击区域。确认勾、旋转提示等简洁通用符号仍使用SVG；不为当前不存在的功能增加按钮。大型机、货机暂共用主场景机体示意，以真实机型名称、客货数量和容量叠层为准，不声称已完成逐机型外形。商店的机型分类示意仍保留既有实现。

处理脚本记录导航/工具3×2图集的切片顺序与地勤图集实际分界线；地勤员头盔跨过数学中线，按空白间隔`440/1024`切割，防止拖车或地勤员被错误裁切。成品纳入同一PWA预缓存，所有图片由新增离线解码回归逐张验证。无新增动效或在线依赖。
