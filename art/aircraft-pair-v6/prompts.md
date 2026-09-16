# 独立剖面图与外观图样稿 v6

本目录保存新版飞机绘制规则的首架样稿。运行候选资源使用原创通用名 `light-single-1p`；Diamond DA40 只用于单发低翼、长泡形座舱盖、T 尾、固定前三点起落架与细长复合材料机身等通用结构研究。未复制品牌标志、注册号、现实涂装、照片或技术图纸。

DA40通用结构核对使用Diamond Aircraft官方[机型介绍](https://www.diamondaircraft.com/en/private-owners/aircraft/da40/overview/)与[技术规格](https://www.diamondaircraft.com/en/private-owners/aircraft/da40/tech-specs/)，只提取上述非品牌化结构特征。

## 容量和阶段边界

- 游戏化基础容量：1 客、0 货。
- 剖面图只画一个空客位，不画货舱、座椅、人物、行李或货物；真实家具和订单仍由 UI 按核心快照投影。
- 本轮只确认绘制规范与一架美术样稿，未接入机型目录，未修改经营数值、存档或结算。

## Imagegen 提示词

使用内置 `imagegen`，以现有 `art/aircraft-capacity-v5/starter-swift-source.png` 作为画风、蓝白金配色和双图排版参考，不作为编辑目标。核心提示词如下：

> Create one entirely original compact single-engine piston airplane inspired only by the general structural proportions of a Diamond DA40: slender composite fuselage, nose-mounted three-blade propeller, long panoramic bubble canopy, low wing, fixed tricycle landing gear, and T-tail. It must face left. Do not copy any manufacturer logo, registration, trademark, exact real-world livery, photograph, or technical drawing. Draw exactly two complete depictions of the same airplane: a complete cutaway view above and a complete closed exterior view below. Both use the same silhouette, scale, camera, lighting and fictional blue-white-gold livery. The cutaway has exactly one empty passenger placement bay and no cargo bay. No seat, person, baggage, freight, text, logo or watermark. Genuine transparent alpha outside both sprites.

生成器原始图保存为 `light-single-1p-imagegen-source-v1.png`。原图包含两架完整飞机，但下方外观飞机的水平尾翼越过了生成画面的两图分隔区。`node scripts/prepare-aircraft-pair.mjs` 先按透明间隙分区，再只保留与各自主飞机连通的完整主体，清除跨区尾翼残片和孤立噪点，最后统一可见宽度与基线并导出两张 1536×590 RGBA PNG；没有重绘机体或引入新依赖：

- `aircraft-light-single-1p-cutaway-v1.png`
- `aircraft-light-single-1p-exterior-v1.png`

## 新绘制规则

以后每个新机型直接绘制同一飞机的完整剖面图与完整外观图，不再绘制“剖面底图 + 近侧蒙皮遮罩”，也不由两层合成外观。两图必须同向、同造型、同尺度、同视角、同基线、同涂装和同光照；外观模式切换整张图。完整规范以 `docs/UNIFIED-AIRCRAFT-CANVAS.md` 为准。
