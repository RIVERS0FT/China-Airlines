# 同母版飞机资源流程

规则以 `docs/UNIFIED-AIRCRAFT-CANVAS.md` 为准。`prompts.md` 是历史生成记录，其中512行描述不是裁切依据；历史图集实际上按 `src/ui/aircraft-canvas.json` 的590/434行提取。

新机型或重画先锁定机身轮廓、舱口、机翼根部和发动机连接点，在同一母版内制作剖面与近侧蒙皮。两层必须以1536×590完整透明画布导出，不自动裁边，不单独缩放，也不独立生成第三张外观。将仓库内路径写入该机型配置的 `master.cutaway` 与 `master.near`，即可跳过历史图集注册。

`npm run art:verify` 按同一配置提取/注册/合成资源，输出 `artifacts/aircraft-registration.json` 的来源与哈希，以及 `artifacts/aircraft-registration/` 叠合检查图。商店与机场外观均使用同一对图层合成的图片。运行时只整体等比缩放。

`npm test` 检查39张资源尺寸、透明角、每款剖面舱口覆盖及逐像素合成一致性；Playwright检查实际图层边界、纵横比、原剖面直排、装卸、分页和外观切换。叠合检查仍须人工查看轮廓、接缝和透视；统一坐标不能自动纠正历史原画本身的结构差异。
