# 当前美术资源

所有运行资源保存在本地并进入 PWA 缓存，不从网络加载图片、字体或地图。素材使用原创蓝、白、金航空风格，不复制参考游戏或现实航空公司的商标、注册号、涂装、照片、线稿和音效。

## 飞机

当前 14 架飞机每架提供一张客货舱剖面图和一张完整外观图，均为 1536×590 透明 RGBA。文件遵循 `aircraft-{id}-cutaway-{revision}.png` 与 `aircraft-{id}-exterior-{revision}.png`；资源名中的 revision 只是美术修订号，不是存档或代码版本。

运行目录读取 `src/ui/aircraft-layer-layouts.json` 中的当前双图及容量布局。外观模式直接替换整图，不合成近侧蒙皮。生成母版、提示词、容量声明和处理脚本位于 `art/aircraft-pair-v7/`；实际运行成品位于 `public/art/`。

## 乘客、货物与场景

- `passenger-standing-seated-v2.png`：6 位原创人物的站姿和坐姿，订单 ID 稳定决定人物。
- `cargo-food-atlas-v1.png`、`cargo-everyday-atlas-v1.png`、`cargo-special-atlas-v1.png`：当前货物图集。
- `cabin-seat-v3.png`、`cabin-pallet-v3.png`：客舱座椅与货舱托盘。
- `airport-day-v1.jpg`、`apron-platform-v1.jpg`：机场与候运地面。
- `employee-portraits-v1.png`：公司组织员工头像。
- `aircraft-map.glb`：球面地图统一 3D 飞机；位图回退使用当前机型完整外观图。

资源文件名保留自身修订号以维持缓存和代码引用稳定。未被当前清单引用的生成中间件、被拒绝输出和验证截图不能进入运行时资源。

## 验收

构建时检查文件存在、尺寸、透明通道、双图基线和容量锚点。浏览器验证剖面/外观切换、站姿/坐姿、装卸后的稳定人物、货物裁切、地图模型、桌面及手机横屏、75%–150% UI 缩放和离线解码。美术切换不得改变容量、订单、收益、存档或结算。
