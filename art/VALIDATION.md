# 本批验证记录

2026-09-12，Windows / Chromium，功能分支 `feat/airport-art-assets`。

| 检查 | 结果 |
| --- | --- |
| `npm ci --cache artifacts/npm-cache` | 完成，锁文件未改，审计395个包，0漏洞 |
| `npm run typecheck` | 通过 |
| `npm test -- --reporter=default --reporter=json --outputFile=artifacts/unit-tests.json` | 15个文件、294项通过 |
| 根路径 `npm run build` | 通过，PWA预缓存26项 |
| 根路径 `npm run test:e2e` | 87项通过，0重试，约2.1分钟 |
| `BASE_PATH=/China-Airlines/` 生产构建 | 通过 |
| `BASE_PATH=/China-Airlines/` 浏览器回归 | 87项通过，0重试，约2.1分钟 |
| `python scripts/prepare-art.py` | 9个成品，8张PNG均有0—255透明通道且四角透明 |
| 资源一致性 | 成品与两套构建内图片的SHA256全部一致，共1,457,598字节 |
| 纯绿背景 | 3张`*-green-solid.png`背景标准化为精确RGB(0,255,0)，保留原始生成图 |
| `git diff --check` | 通过 |

浏览器流程包括桌面1440×900、手机横屏844×390与667×375、竖屏提示、刷新恢复、导入/导出、拒绝坏档、装卸与收益回归、离线启动。新增用例逐一解码9张离线缓存图片并验证离线装载。截图保存在`art/review/`，已检查桌面、两种横屏和透明素材浅/深背景预览。

首次验证因未安装依赖而无法执行；初次安装受npm缓存和子进程权限限制，改用工作区缓存并获准启动安装脚本后解决。首次浏览器尝试在补齐Chromium前中止，不计入成功测试；安装所需Chromium后两套完整运行均通过。生产构建仍提示Pixi渲染包超过500kB，该提示不属于新增图片错误。

阶段边界：本批采用本地生成素材接入，主场景客机仍保留动态SVG载荷示意，客机PNG作为备用交付；手机极矮横屏延续现有场景裁切布局。未验证真实手机/iOS Safari，也未执行提交、PR、合并或部署，不表示已上线。所有ZIP打包当前工作区，包含本轮尚未提交的改动；`artifacts/delivery/SHA256SUMS.txt`记录压缩包校验值。
