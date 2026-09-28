# 自建 Runner 的浏览器验收

公司组织增量玩法执行一次相对路径构建与一次完整浏览器测试；不再拆根路径/子路径或4分片重复验收，保留零重试及既有部署门槛。浏览器准备统一由 `node scripts/prepare-browser.mjs` 执行，不在普通 Runner 作业中请求 sudo。

Playwright 版本来自锁定依赖。安装 `chromium --no-shell`，测试和冒烟启动统一选择 `channel: chromium`，使用同一版本的完整 Chromium 新无头模式，不再重复下载另一个 headless shell。不能改用系统中任意版本的浏览器，也不能因准备失败跳过浏览器测试。

系统依赖、fontconfig 和中文字体由 Runner 预先配置。准备脚本检查中文字体，并实际启动浏览器读取中文页面；缺少依赖时显式失败。首次安装有30分钟上限；已缓存的对应版本直接复用，不反复下载。渲染测试保留既有软件 WebGL 参数。

2026-09-28 的旧分支验收已完成类型检查、572项 Node 测试与根路径生产构建，但浏览器准备因重复下载 full Chromium 和 headless shell，达到作业40分钟上限而取消；该记录不是界面通过记录。修正后必须重新执行真实浏览器检查，不使用旧截图或仅冒烟启动代替完整断言。

官方行为依据：https://playwright.dev/docs/browsers#chromium-new-headless-mode
