# 原创飞机分层资源 v4

2026-09-15–16，内置 image_gen 生成。先提交初航号预览，用户“实施修改”后展开剩余机型；按后续确认删除历史机型及兼容支持，只交付现役13种。

每个 `*-source.png` 是1536×1024原始透明图集。第一行0..590为剖面机身，第二行590..1024为近侧蒙皮、机翼/发动机。`scripts/extract-aircraft-layers.ps1`只裁切和按坐标合成，不替代绘画或将一个机体换色冒充另一机型。每机型三张运行PNG共39张：cutaway、near与由前两层合成的exterior。两层注册位置在 `src/ui/aircraft-layer-layouts.json`；runtime场景使用相同坐标。

初航号和雨燕为小型螺旋桨、苍鹭为尾置喷气、信天翁为双发、极光为四发示意；各客/货/混合型有独立舱壁、舷窗、舱门、尾翼标记与发动机细节，均朝左。未宣称对应真实机型或精确结构。

透明处理要求：移除背景棋盘格及光晕，输出真实alpha通道，保留飞机与蒙皮实心；不完整输出经image_gen再次修复，最终原稿与运行图均做透明度检查。源文件保留在本目录；生成服务原文件保留在generated_images。

## starter-swift

本地源：`starter-swift-source.png`。

生成提示词：

Production sprite atlas for ONE original game aircraft, STARTER SWIFT. Use approved sheet as design reference: cute thick blue/white/gold left-facing small turboprop. Output 1536x1024 TRANSPARENT RGBA two-row registered layer atlas. NO titles text numbers ground shadows or scenery. Each row is an identical 1536x512 local canvas; do not crop frames differently.
TOP ROW base layer: whole left-facing aircraft from x30 to1500. Nose x30..260, tail x1270..1500, body roof y90, belly y415, wheels to y490, low tail y20. Central cutaway opening x270..1250 y100..410, rounded corners. It is a TALL TWO-DECK aircraft; upper passenger room occupies y100..285, lower cargo room y285..410. Show empty ivory upper wall with windows, empty grey lower wall and a floor beam. NO SEATS, NO PALLETS, NO PEOPLE, NO BOXES (dynamic game sprites will go here). Cutaway body frame and far-side wing/gear only; absolutely no near-side engine or wing crossing the opening.
BOTTOM ROW near-side overlay ONLY: use same local canvas coordinates but add y512. Opaque near-side body skin EXACTLY spanning local x255..1270 y90..420, following the base opening border. White top, blue lower cargo belly, gold line; upper oval windows with opaque glass; lower small cargo door. Include the near-side swept wing and ONE turboprop engine projected outward at local x690..1040 y330..480. Omit nose before x255, tail after x1270, far wing and landing wheels: they stay on base. Blank outside near-side skin/wing/engine must be true alpha zero. It must overlay the top row directly when translated upward512px. Same scale, camera, dimensions, lighting. Small vintage-looking rounded starter, short nose, compact low tail with a gold tip, cream fairings.
Crucial: two aligned layers of ONE plane, not two separate complete aircraft; no baked furniture; keep skin fully opaque across both cabin rows.

透明原稿：`exec-05a45a6e-b6a7-4571-a801-dd88b56abb00.png`。

## swift-p

本地源：`swift-p-source.png`。

生成提示词：

Production sprite atlas for ONE original game aircraft, MODEL swift-p. Use approved sheet as design reference: cute thick blue/white/gold left-facing small turboprop. Output 1536x1024 TRANSPARENT RGBA two-row registered layer atlas. NO titles text numbers ground shadows or scenery. Each row is an identical 1536x512 local canvas; do not crop frames differently.
TOP ROW base layer: whole left-facing aircraft from x30 to1500. Nose x30..260, tail x1270..1500, body roof y90, belly y415, wheels to y490, low tail y20. Central cutaway opening x270..1250 y100..410, rounded corners. It is a TALL TWO-DECK aircraft; upper passenger room occupies y100..285, lower cargo room y285..410. Show empty ivory upper wall with windows, empty grey lower wall and a floor beam. NO SEATS, NO PALLETS, NO PEOPLE, NO BOXES (dynamic game sprites will go here). Cutaway body frame and far-side wing/gear only; absolutely no near-side engine or wing crossing the opening.
BOTTOM ROW near-side overlay ONLY: use same local canvas coordinates but add y512. Opaque near-side body skin EXACTLY spanning local x255..1270 y90..420, following the base opening border. White top, blue lower cargo belly, gold line; upper oval windows with opaque glass; lower small cargo door. Include the near-side swept wing and ONE turboprop engine projected outward at local x690..1040 y330..480. Omit nose before x255, tail after x1270, far wing and landing wheels: they stay on base. Blank outside near-side skin/wing/engine must be true alpha zero. It must overlay the top row directly when translated upward512px. Same scale, camera, dimensions, lighting. Swift passenger variant. Compact rounded twin turboprop, elegant pointed tail with two thin gold bands, blue-white fuselage, small circular windows. One FULL HEIGHT passenger cabin, no cargo deck or cargo door. Near shell has a row of oval passenger windows and a small entry door.
Crucial: two aligned layers of ONE plane, not two separate complete aircraft; no baked furniture; keep skin fully opaque across both cabin rows.
OVERRIDING MODEL DESIGN: Swift passenger variant. Compact rounded twin turboprop, elegant pointed tail with two thin gold bands, blue-white fuselage, small circular windows. One FULL HEIGHT passenger cabin, no cargo deck or cargo door. Near shell has a row of oval passenger windows and a small entry door.
Keep same top-base/bottom-removable-overlay atlas layout as reference, with no labels. Each model MUST have its own distinctive silhouette and paint details.

透明原稿：`exec-0622c985-67b4-4c79-83dc-c92e755616b2.png`。

## swift-f

本地源：`swift-f-source.png`。

生成提示词：

Production sprite atlas for ONE original game aircraft, MODEL swift-f. Use approved sheet as design reference: cute thick blue/white/gold left-facing small turboprop. Output 1536x1024 TRANSPARENT RGBA two-row registered layer atlas. NO titles text numbers ground shadows or scenery. Each row is an identical 1536x512 local canvas; do not crop frames differently.
TOP ROW base layer: whole left-facing aircraft from x30 to1500. Nose x30..260, tail x1270..1500, body roof y90, belly y415, wheels to y490, low tail y20. Central cutaway opening x270..1250 y100..410, rounded corners. It is a TALL TWO-DECK aircraft; upper passenger room occupies y100..285, lower cargo room y285..410. Show empty ivory upper wall with windows, empty grey lower wall and a floor beam. NO SEATS, NO PALLETS, NO PEOPLE, NO BOXES (dynamic game sprites will go here). Cutaway body frame and far-side wing/gear only; absolutely no near-side engine or wing crossing the opening.
BOTTOM ROW near-side overlay ONLY: use same local canvas coordinates but add y512. Opaque near-side body skin EXACTLY spanning local x255..1270 y90..420, following the base opening border. White top, blue lower cargo belly, gold line; upper oval windows with opaque glass; lower small cargo door. Include the near-side swept wing and ONE turboprop engine projected outward at local x690..1040 y330..480. Omit nose before x255, tail after x1270, far wing and landing wheels: they stay on base. Blank outside near-side skin/wing/engine must be true alpha zero. It must overlay the top row directly when translated upward512px. Same scale, camera, dimensions, lighting. Swift cargo variant. Compact boxier utility turboprop, squarer nose, taller squared tail with a broad gold diagonal, white and steel-blue. One FULL HEIGHT cargo hold without windows; shell is windowless with a large rectangular freight hatch. Distinct short broad near wing and single turboprop.
Crucial: two aligned layers of ONE plane, not two separate complete aircraft; no baked furniture; keep skin fully opaque across both cabin rows.
OVERRIDING MODEL DESIGN: Swift cargo variant. Compact boxier utility turboprop, squarer nose, taller squared tail with a broad gold diagonal, white and steel-blue. One FULL HEIGHT cargo hold without windows; shell is windowless with a large rectangular freight hatch. Distinct short broad near wing and single turboprop.
Keep same top-base/bottom-removable-overlay atlas layout as reference, with no labels. Each model MUST have its own distinctive silhouette and paint details.

透明原稿：`exec-3eda5054-1cb6-4cf2-86f5-3e7a0ef5db82.png`。

## swift-m

本地源：`swift-m-source.png`。

生成提示词：

Production sprite atlas for ONE original game aircraft, MODEL swift-m. Use approved sheet as design reference: cute thick blue/white/gold left-facing small turboprop. Output 1536x1024 TRANSPARENT RGBA two-row registered layer atlas. NO titles text numbers ground shadows or scenery. Each row is an identical 1536x512 local canvas; do not crop frames differently.
TOP ROW base layer: whole left-facing aircraft from x30 to1500. Nose x30..260, tail x1270..1500, body roof y90, belly y415, wheels to y490, low tail y20. Central cutaway opening x270..1250 y100..410, rounded corners. It is a TALL TWO-DECK aircraft; upper passenger room occupies y100..285, lower cargo room y285..410. Show empty ivory upper wall with windows, empty grey lower wall and a floor beam. NO SEATS, NO PALLETS, NO PEOPLE, NO BOXES (dynamic game sprites will go here). Cutaway body frame and far-side wing/gear only; absolutely no near-side engine or wing crossing the opening.
BOTTOM ROW near-side overlay ONLY: use same local canvas coordinates but add y512. Opaque near-side body skin EXACTLY spanning local x255..1270 y90..420, following the base opening border. White top, blue lower cargo belly, gold line; upper oval windows with opaque glass; lower small cargo door. Include the near-side swept wing and ONE turboprop engine projected outward at local x690..1040 y330..480. Omit nose before x255, tail after x1270, far wing and landing wheels: they stay on base. Blank outside near-side skin/wing/engine must be true alpha zero. It must overlay the top row directly when translated upward512px. Same scale, camera, dimensions, lighting. Swift mixed variant. Compact high-wing turboprop, rounded high tail with gold fin cap, azure belly, narrow gold double cheatline. TWO DECKS, upper passenger room 60 percent height and lower cargo40 percent. Shell has upper small windows and a lower freight door. Distinct fuller bulbous nose than the starter.
Crucial: two aligned layers of ONE plane, not two separate complete aircraft; no baked furniture; keep skin fully opaque across both cabin rows.
OVERRIDING MODEL DESIGN: Swift mixed variant. Compact high-wing turboprop, rounded high tail with gold fin cap, azure belly, narrow gold double cheatline. TWO DECKS, upper passenger room 60 percent height and lower cargo40 percent. Shell has upper small windows and a lower freight door. Distinct fuller bulbous nose than the starter.
Keep same top-base/bottom-removable-overlay atlas layout as reference, with no labels. Each model MUST have its own distinctive silhouette and paint details.

透明原稿：`exec-830317d4-cef7-4624-bfd2-ba56c8a68245.png`。

## heron-p

本地源：`heron-p-source.png`。

生成提示词：

Production sprite atlas for ONE original game aircraft, STARTER SWIFT. Use approved sheet as design reference: cute thick blue/white/gold left-facing small turboprop. Output 1536x1024 TRANSPARENT RGBA two-row registered layer atlas. NO titles text numbers ground shadows or scenery. Each row is an identical 1536x512 local canvas; do not crop frames differently.
TOP ROW base layer: whole left-facing aircraft from x30 to1500. Nose x30..260, tail x1270..1500, body roof y90, belly y415, wheels to y490, low tail y20. Central cutaway opening x270..1250 y100..410, rounded corners. It is a TALL TWO-DECK aircraft; upper passenger room occupies y100..285, lower cargo room y285..410. Show empty ivory upper wall with windows, empty grey lower wall and a floor beam. NO SEATS, NO PALLETS, NO PEOPLE, NO BOXES (dynamic game sprites will go here). Cutaway body frame and far-side wing/gear only; absolutely no near-side engine or wing crossing the opening.
BOTTOM ROW near-side overlay ONLY: use same local canvas coordinates but add y512. Opaque near-side body skin EXACTLY spanning local x255..1270 y90..420, following the base opening border. White top, blue lower cargo belly, gold line; upper oval windows with opaque glass; lower small cargo door. Include the near-side swept wing and ONE turboprop engine projected outward at local x690..1040 y330..480. Omit nose before x255, tail after x1270, far wing and landing wheels: they stay on base. Blank outside near-side skin/wing/engine must be true alpha zero. It must overlay the top row directly when translated upward512px. Same scale, camera, dimensions, lighting. Small vintage-looking rounded starter, short nose, compact low tail with a gold tip, cream fairings.
Crucial: two aligned layers of ONE plane, not two separate complete aircraft; no baked furniture; keep skin fully opaque across both cabin rows.
MODEL OVERRIDE (takes precedence over ALL starter/propeller/two-deck wording above): HERON passenger regional JET, distinctly unlike the small propeller reference: pointed sleek nose, a tall swept T tail, BLUE BELLY with gold pinstripe and teal tail accent, TWO REAR-MOUNTED small TURBOFAN jet engines (near engine appears in overlay, far engine on base), NO PROPELLERS. Short swept main wing with a small upward winglet. Single full-height passenger room with windows, no deck separator, no cargo hatch.
Keep all main image components in same positions as reference. TOP aircraft ends beforey585, BOTTOM shell fromy635..990. Truly transparent alpha outside shapes. No printed checkerboard.

透明原稿：`exec-19742c5f-b0b8-49a9-8218-4aa067b811df.png`。

## heron-f

本地源：`heron-f-source.png`。

生成提示词：

Production sprite atlas for ONE original game aircraft, STARTER SWIFT. Use approved sheet as design reference: cute thick blue/white/gold left-facing small turboprop. Output 1536x1024 TRANSPARENT RGBA two-row registered layer atlas. NO titles text numbers ground shadows or scenery. Each row is an identical 1536x512 local canvas; do not crop frames differently.
TOP ROW base layer: whole left-facing aircraft from x30 to1500. Nose x30..260, tail x1270..1500, body roof y90, belly y415, wheels to y490, low tail y20. Central cutaway opening x270..1250 y100..410, rounded corners. It is a TALL TWO-DECK aircraft; upper passenger room occupies y100..285, lower cargo room y285..410. Show empty ivory upper wall with windows, empty grey lower wall and a floor beam. NO SEATS, NO PALLETS, NO PEOPLE, NO BOXES (dynamic game sprites will go here). Cutaway body frame and far-side wing/gear only; absolutely no near-side engine or wing crossing the opening.
BOTTOM ROW near-side overlay ONLY: use same local canvas coordinates but add y512. Opaque near-side body skin EXACTLY spanning local x255..1270 y90..420, following the base opening border. White top, blue lower cargo belly, gold line; upper oval windows with opaque glass; lower small cargo door. Include the near-side swept wing and ONE turboprop engine projected outward at local x690..1040 y330..480. Omit nose before x255, tail after x1270, far wing and landing wheels: they stay on base. Blank outside near-side skin/wing/engine must be true alpha zero. It must overlay the top row directly when translated upward512px. Same scale, camera, dimensions, lighting. Small vintage-looking rounded starter, short nose, compact low tail with a gold tip, cream fairings.
Crucial: two aligned layers of ONE plane, not two separate complete aircraft; no baked furniture; keep skin fully opaque across both cabin rows.
MODEL OVERRIDE (takes precedence over ALL starter/propeller/two-deck wording above): HERON freighter regional JET, distinctly unlike the small propeller reference: pointed sleek nose, a tall swept T tail, BLUE BELLY with wide silver stripe and navy tail hatch, TWO REAR-MOUNTED small TURBOFAN jet engines (near engine appears in overlay, far engine on base), NO PROPELLERS. Short swept main wing with a small upward winglet. Single full-height windowless grey cargo room, no deck separator; a large square freight door on overlay, no passenger windows.
Keep all main image components in same positions as reference. TOP aircraft ends beforey585, BOTTOM shell fromy635..990. Truly transparent alpha outside shapes. No printed checkerboard.

透明原稿：`exec-5a7230af-9ab8-4c87-b28d-cffbd80ea171.png`。

## heron-m

本地源：`heron-m-source.png`。

生成提示词：

Production sprite atlas for ONE original game aircraft, STARTER SWIFT. Use approved sheet as design reference: cute thick blue/white/gold left-facing small turboprop. Output 1536x1024 TRANSPARENT RGBA two-row registered layer atlas. NO titles text numbers ground shadows or scenery. Each row is an identical 1536x512 local canvas; do not crop frames differently.
TOP ROW base layer: whole left-facing aircraft from x30 to1500. Nose x30..260, tail x1270..1500, body roof y90, belly y415, wheels to y490, low tail y20. Central cutaway opening x270..1250 y100..410, rounded corners. It is a TALL TWO-DECK aircraft; upper passenger room occupies y100..285, lower cargo room y285..410. Show empty ivory upper wall with windows, empty grey lower wall and a floor beam. NO SEATS, NO PALLETS, NO PEOPLE, NO BOXES (dynamic game sprites will go here). Cutaway body frame and far-side wing/gear only; absolutely no near-side engine or wing crossing the opening.
BOTTOM ROW near-side overlay ONLY: use same local canvas coordinates but add y512. Opaque near-side body skin EXACTLY spanning local x255..1270 y90..420, following the base opening border. White top, blue lower cargo belly, gold line; upper oval windows with opaque glass; lower small cargo door. Include the near-side swept wing and ONE turboprop engine projected outward at local x690..1040 y330..480. Omit nose before x255, tail after x1270, far wing and landing wheels: they stay on base. Blank outside near-side skin/wing/engine must be true alpha zero. It must overlay the top row directly when translated upward512px. Same scale, camera, dimensions, lighting. Small vintage-looking rounded starter, short nose, compact low tail with a gold tip, cream fairings.
Crucial: two aligned layers of ONE plane, not two separate complete aircraft; no baked furniture; keep skin fully opaque across both cabin rows.
MODEL OVERRIDE (takes precedence over ALL starter/propeller/two-deck wording above): HERON mixed regional JET, distinctly unlike the small propeller reference: pointed sleek nose, a tall swept T tail, BLUE BELLY with two gold stripes and triangular cyan tail inlay, TWO REAR-MOUNTED small TURBOFAN jet engines (near engine appears in overlay, far engine on base), NO PROPELLERS. Short swept main wing with a small upward winglet. Two floors with passenger upper and cargo lower; upper windows and lower cargo hatch.
Keep all main image components in same positions as reference. TOP aircraft ends beforey585, BOTTOM shell fromy635..990. Truly transparent alpha outside shapes. No printed checkerboard.

透明原稿：`exec-80fc3dbf-5b65-4185-87e7-2132889462f6.png`。

## albatross-p

本地源：`albatross-p-source.png`。

生成提示词：

Create TWO separated layers of ONE new aircraft for a Chinese airline management game. Use reference only for cute pixel-painted ORIGINAL blue/white style, NOT the same airframe silhouette. ALBATROSS passenger widebody TWIN TURBOFAN airliner. Unique bigger broad rounded nose, broad LOW trapezoid tail with teal triangular inlay, strong cobalt belly and gold trim. Two large UNDERWING jet engines, far one belongs in base at lower edge and near one belongs ONLY in detached overlay. NO propellers or rear mounted engines. ONE full-height passenger cabin, no floor division, opaque window glass in shell.
Output transparent RGBA 1536x1024. The top 590px row contains WHOLE aircraft left facing, nose around x20 y330, tail at x1300..1510 y50..400, gear to y565. The cutaway opening occupies x280..1280 y175..470. Empty interior only no chairs people boxes pallets. Far side details only, near wing and engine must not obscure opening.
The bottom region y630..1000 is only a DETACHED near-side body SKIN panel and near wing/engine, no nose before x260, NO tail beyond x1290. Opaque skin covers x265..1280 y645..907. The lower detached panel must be a continuous opaque white and blue sidewall with trim, including opaque window glass where applicable; it is used to conceal the full open cabin. Near wing and engine hang below and may extend up to x1450. No duplicate whole aircraft, no labels, no shadows or checkerboard. Both are separately crop-able sprites; matching perspective, side cutaway with shallow top view, not rotate whole fuselage. Preserve alpha zero background.

透明原稿：`exec-e50a21ce-136b-4109-8601-21251a300058.png`。

## albatross-f

本地源：`albatross-f-source.png`。

生成提示词：

Create TWO separated layers of ONE new aircraft for a Chinese airline management game. Use reference only for cute pixel-painted ORIGINAL blue/white style, NOT the same airframe silhouette. ALBATROSS freighter widebody TWIN TURBOFAN airliner. Unique bigger broad rounded nose, broad LOW trapezoid tail with navy square inlay, strong cobalt belly and silver trim. Two large UNDERWING jet engines, far one belongs in base at lower edge and near one belongs ONLY in detached overlay. NO propellers or rear mounted engines. ONE full-height cargo cabin, no floor division, windowless shell with broad cargo hatch.
Output transparent RGBA 1536x1024. The top 590px row contains WHOLE aircraft left facing, nose around x20 y330, tail at x1300..1510 y50..400, gear to y565. The cutaway opening occupies x280..1280 y175..470. Empty interior only no chairs people boxes pallets. Far side details only, near wing and engine must not obscure opening.
The bottom region y630..1000 is only a DETACHED near-side body SKIN panel and near wing/engine, no nose before x260, NO tail beyond x1290. Opaque skin covers x265..1280 y645..907. The lower detached panel must be a continuous opaque white and blue sidewall with trim, including opaque window glass where applicable; it is used to conceal the full open cabin. Near wing and engine hang below and may extend up to x1450. No duplicate whole aircraft, no labels, no shadows or checkerboard. Both are separately crop-able sprites; matching perspective, side cutaway with shallow top view, not rotate whole fuselage. Preserve alpha zero background.

透明原稿：`exec-54b52715-3edb-44fc-9aa7-a808807328e0.png`。

## albatross-m

本地源：`albatross-m-source.png`。

生成提示词：

Create TWO separated layers of ONE new aircraft for a Chinese airline management game. Use reference only for cute pixel-painted ORIGINAL blue/white style, NOT the same airframe silhouette. ALBATROSS mixed widebody TWIN TURBOFAN airliner. Unique bigger broad rounded nose, broad LOW trapezoid tail with cyan double inlay, strong cobalt belly and gold trim. Two large UNDERWING jet engines, far one belongs in base at lower edge and near one belongs ONLY in detached overlay. NO propellers or rear mounted engines. Two floors: upper passenger and lower cargo, shell upper windows and lower cargo hatch.
Output transparent RGBA 1536x1024. The top 590px row contains WHOLE aircraft left facing, nose around x20 y330, tail at x1300..1510 y50..400, gear to y565. The cutaway opening occupies x280..1280 y175..470. Empty interior only no chairs people boxes pallets. Far side details only, near wing and engine must not obscure opening.
The bottom region y630..1000 is only a DETACHED near-side body SKIN panel and near wing/engine, no nose before x260, NO tail beyond x1290. Opaque skin covers x265..1280 y645..907. The lower detached panel must be a continuous opaque white and blue sidewall with trim, including opaque window glass where applicable; it is used to conceal the full open cabin. Near wing and engine hang below and may extend up to x1450. No duplicate whole aircraft, no labels, no shadows or checkerboard. Both are separately crop-able sprites; matching perspective, side cutaway with shallow top view, not rotate whole fuselage. Preserve alpha zero background.

透明原稿：`exec-041f9397-bc61-4eb6-92e1-891e3b51235b.png`。

## aurora-p

本地源：`aurora-p-source.png`。

生成提示词：

Original cute airline management game production aircraft sprites, consistent blue/white painted style with reference, but a DISTINCT AURORA giant long-range FOUR ENGINE airliner. Wide bulbous double-deck nose, very tall swept tail with teal star original marking, cobalt blue belly gold stripe, four large underwing turbofans, no propellers. Passenger variant, one full height empty open cabin, white wall and many windows, no lower cargo row; near opaque skin has twin rows of windows.
Output 1536x1024 actual TRANSPARENT RGBA. TOP ROW y0..590: entire left-facing airplane x15..1515, talltailtop45, geartobottom560, central cutaway opening x275..1260 y175..470. EMPTY rooms no chairs people boxes pallets. ONLY far wings and two FAR ENGINES stay on top base, near wing/engines MUST NOT cross opening.
BOTTOM ROW y620..1000: detached near-side SKIN panel ONLY x260..1275 y640..900 plus NEAR wing with TWO visible turbofan engines beneath it, x650..1350 y850..985. No nose, no tail, no gear on this lower piece. Continuous fully opaque white-and-blue body skin covers whole upper/lower opening, glass opaque blue. Preserve matching side view and scale of both pieces. Background must be alpha0, NOT a painted checkerboard or glow. No text, no scenery, no shadows.

透明原稿：`exec-bc2d75a6-4778-4b3e-9be0-3b8eecd2ef72.png`。

## aurora-f

本地源：`aurora-f-source.png`。

生成提示词：

Original cute airline management game production aircraft sprites, consistent blue/white painted style with reference, but a DISTINCT AURORA giant long-range FOUR ENGINE airliner. Wide bulbous double-deck nose, very tall swept tail with navy chevron original marking, cobalt blue belly silver stripe, four large underwing turbofans, no propellers. Pure freighter, one tall windowless cargo room, square large hatch and silver stripe on opaque near skin.
Output 1536x1024 actual TRANSPARENT RGBA. TOP ROW y0..590: entire left-facing airplane x15..1515, talltailtop45, geartobottom560, central cutaway opening x275..1260 y175..470. EMPTY rooms no chairs people boxes pallets. ONLY far wings and two FAR ENGINES stay on top base, near wing/engines MUST NOT cross opening.
BOTTOM ROW y620..1000: detached near-side SKIN panel ONLY x260..1275 y640..900 plus NEAR wing with TWO visible turbofan engines beneath it, x650..1350 y850..985. No nose, no tail, no gear on this lower piece. Continuous fully opaque white-and-blue body skin covers whole upper/lower opening, glass opaque blue. Preserve matching side view and scale of both pieces. Background must be alpha0, NOT a painted checkerboard or glow. No text, no scenery, no shadows.

透明原稿：`exec-ffbbb1d1-240a-446b-bdac-d459f5caa912.png`。

## aurora-m

本地源：`aurora-m-source.png`。

生成提示词：

Original cute airline management game production aircraft sprites, consistent blue/white painted style with reference, but a DISTINCT AURORA giant long-range FOUR ENGINE airliner. Wide bulbous double-deck nose, very tall swept tail with cyan diagonal original marking, cobalt blue belly gold stripe, four large underwing turbofans, no propellers. Combi variant, upper passenger cabin and lower cargo room, horizontal deck floor separating them. Upper windows and lower hatch on opaque near skin.
Output 1536x1024 actual TRANSPARENT RGBA. TOP ROW y0..590: entire left-facing airplane x15..1515, talltailtop45, geartobottom560, central cutaway opening x275..1260 y175..470. EMPTY rooms no chairs people boxes pallets. ONLY far wings and two FAR ENGINES stay on top base, near wing/engines MUST NOT cross opening.
BOTTOM ROW y620..1000: detached near-side SKIN panel ONLY x260..1275 y640..900 plus NEAR wing with TWO visible turbofan engines beneath it, x650..1350 y850..985. No nose, no tail, no gear on this lower piece. Continuous fully opaque white-and-blue body skin covers whole upper/lower opening, glass opaque blue. Preserve matching side view and scale of both pieces. Background must be alpha0, NOT a painted checkerboard or glow. No text, no scenery, no shadows.

透明原稿：`exec-3aa8ce18-ae00-481c-8243-fd33857d66de.png`。
