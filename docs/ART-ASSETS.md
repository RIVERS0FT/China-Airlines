# 当前美术资源

运行资源均保存在本地并进入 PWA 缓存。素材采用原创蓝白金航空风格，不复制参考游戏或现实航空公司的商标、注册号、涂装、照片、线稿和音效。

## 飞机与机舱

当前目录的 10 架飞机各有一张独立的完整外观图：`public/art/aircraft-{id}-exterior-v8.png`，尺寸为 1536×590 透明 RGBA。源文件与机型、原型、容量清单位于 `art/aircraft-exteriors-v8/`。运行目录通过 `src/ui/aircraft-cabin-layouts.json` 读取外观文件和程序化机舱布局。外观修订号仅用于资源缓存，不是存档版本。

机舱壁、窗、地板、座椅和货盘由 UI 绘制，不使用剖面或家具底图。乘客和货物使用本地图集，按真实订单和容量锚点摆放。

标题起飞图同步重绘为 `aircraft-flight-v2.png`；教程教练半身像为 `tutorial-guide-v1.png`（640×800）。均使用内置 image_gen 生成，透明边缘整理后进入离线缓存。提示词和逐机原型记录见 [aircraft-redraw-v8.json](../art/aircraft-redraw-v8.json) 与 [人物提示词](../art/prompt-tutorial-guide.txt)。旧版飞机外观、初航机与失效目录资源已清理。

## 其他资源

- `flight-cloudscape-v1.png`：1536×1024 原创晴空云海背景，完整不透明画面；运行时将镜像对连续拼接，整片背景向右移动，避免静态云海掩盖飞行速度感。
- `flight-cloud-bank-v1.png`：1536×1024 原创透明云团，保留柔和 alpha 边缘，用于远近两层连续移动。与背景一起由内置 image_gen 生成，直接保留生成 PNG，无后处理；提示词及来源见 [flight-backgrounds-v1.json](../art/flight-backgrounds-v1.json)。两张合计约3 MiB，进入既有 PWA 图片预缓存。

- `passenger-standing-seated-v2.png`：6 位原创人物的站姿与坐姿。
- `cargo-food-atlas-v1.png`、`cargo-everyday-atlas-v1.png`、`cargo-special-atlas-v1.png`：货物图集。
- `airport-day-v1.jpg`、`apron-platform-v1.jpg`：机场与候运地面。
- `employee-portraits-v1.png`：公司组织员工头像。
- `aircraft-map.glb`：球面地图统一 3D 飞机；位图回退使用对应完整外观图。

构建时检查外观源文件、运行文件、尺寸和透明四角。浏览器验证机舱/外观切换、装卸、不同容量、横屏尺寸、UI 缩放与离线解码。视图切换不得改变容量、订单、收益、存档或结算。
