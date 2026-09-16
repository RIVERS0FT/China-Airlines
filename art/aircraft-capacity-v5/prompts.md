# 容量化飞机剖面全机队 v5（历史运行兼容）

> 本目录记录现役13架v5资源的既有生成过程，仅用于复现和兼容，不再是新飞机绘制规则。新稿必须按 `docs/UNIFIED-AIRCRAFT-CANVAS.md` 直接绘制一张完整剖面图和一张完整外观图，不再生成近侧蒙皮层或合成外观。

信天翁客货型样机通过后，本轮使用内置 `imagegen` 对13架现役飞机逐架执行精确编辑。每张图都以对应的 `art/aircraft-layers-v4/{id}-source.png` 为唯一编辑目标，生成结果保存在本目录，不共用机身或内部空间。

## 参考边界

- 机型分类与通用结构参考 Virtual Aircraft Museum：<https://www.aviastar.org/index2.html>。
- 只提取机头、尾翼、发动机位置、机身比例和货舱结构等通用特征，不复制网站图片、商标、航空公司涂装或三视图线稿。
- 窗位与货舱分段按本仓库游戏化基础容量绘制，不宣称对应现实机型；经营数值仍以 `src/core/career-catalog.ts` 为准。
- 生成器可能输出RGB或带低透明光晕的RGBA；构建时统一解码，并复用该机v4源图的alpha轮廓。遮罩只恢复透明度，内部颜色和结构来自v5源图。

## 容量请求集合

| 源图 | 客舱请求 | 货舱请求 |
| --- | ---: | ---: |
| `starter-swift-source.png` | 3 | 2 |
| `swift-p-source.png` | 4 | 0 |
| `swift-f-source.png` | 0 | 3 |
| `swift-m-source.png` | 2 | 2 |
| `heron-p-source.png` | 8 | 0 |
| `heron-f-source.png` | 0 | 6 |
| `heron-m-source.png` | 4 | 3 |
| `albatross-p-source.png` | 12 | 0 |
| `albatross-f-source.png` | 0 | 9 |
| `albatross-m-source.png` | 6 | 5 |
| `aurora-p-source.png` | 18 | 0 |
| `aurora-f-source.png` | 0 | 14 |
| `aurora-m-source.png` | 9 | 7 |

## 共享完整提示词

每架飞机使用下列提示词，`CAPACITY REQUEST` 替换为表中对应的单舱或上下层精确数量：

> Use case: precise-object-edit.
> Asset type: production 2D aircraft sprite atlas for a Chinese airline management game.
> Input image: Image 1 is the only edit target, a registered 1536x1024 two-row aircraft atlas.
> Primary request: Change only the empty internal space so the visual rhythm exactly matches the game capacity. CAPACITY REQUEST.
> Style: preserve the target's own cute polished softly painted 2D/3D hybrid style.
> Invariants: Preserve the exact left-facing airplane silhouette, nose, cockpit, landing gear, tail, wing and engine positions, blue-white-gold livery, lighting, camera, scale, canvas placement, cutaway frame, detached near-side body skin, near wing, near engine, both rows, and their registration.
> Interior constraints: keep every bay empty; no seats, pallets, people, cargo, labels, numbers, text, logos, airline trademarks, or extra decks. Use only windows, structural posts, tie-down rails, and floor segmentation to make the exact bay count unmistakable.
> Output constraints: preserve the exact 1536x1024 two-row atlas composition; genuine transparent alpha outside sprites; no background, checkerboard, glow, or watermark.

单舱客机的替换句为：

> Redesign the single passenger cabin with exactly N clearly separated passenger placement bays/windows across the usable interior. Do not add a cargo deck.

单舱货机的替换句为：

> Redesign the single cargo hold with exactly N clearly separated cargo floor bays across the usable interior. Do not add a passenger deck.

客货机与初航号的替换句为：

> Redesign the upper passenger cabin with exactly N clearly separated passenger placement bays/windows and the lower hold with exactly M clearly separated cargo floor bays.

## 运行资源

`scripts/prepare-aircraft-art.mjs` 为每架飞机生成以下三张 `1536×590` RGBA运行图，共39张：

- `public/art/aircraft-{id}-cutaway-v5.png`
- `public/art/aircraft-{id}-near-v5.png`
- `public/art/aircraft-{id}-exterior-v5.png`
