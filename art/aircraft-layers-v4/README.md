# 同母版分层资源 v4（历史运行兼容）

规则以 `docs/UNIFIED-AIRCRAFT-CANVAS.md` 为准。`prompts.md` 是历史生成记录，其中512行描述不是裁切依据；历史图集实际上按 `src/ui/aircraft-canvas.json` 的590/434行提取。

本目录不得再用于新机型或重画。其历史源图仍按 `src/ui/aircraft-canvas.json` 的590/434行和现有配置生成v5兼容运行图；新稿统一按 `docs/UNIFIED-AIRCRAFT-CANVAS.md` 直接绘制两张完整飞机图。

`npm run art:verify` 继续按同一配置提取/注册/合成现役v5兼容资源，输出 `artifacts/aircraft-registration.json` 的来源与哈希，以及 `artifacts/aircraft-registration/` 叠合检查图。该目录只用于尚未重画机型的历史运行兼容；新飞机不再使用近侧蒙皮或合成外观，必须按 `docs/UNIFIED-AIRCRAFT-CANVAS.md` 直接交付完整剖面图与完整外观图。

`npm test` 检查39张资源尺寸、透明角、每款剖面舱口覆盖及逐像素合成一致性；Playwright检查实际图层边界、纵横比、原剖面直排、装卸、分页和外观切换。叠合检查仍须人工查看轮廓、接缝和透视；统一坐标不能自动纠正历史原画本身的结构差异。
