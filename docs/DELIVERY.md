# 开发、验收与发布

## 可复现环境

Node.js 22（至少 22.12），npm，仓库内的 package-lock.json。使用 `npm ci`，不要在 CI 中重新生成依赖锁文件。仓库无需任何业务后端或运行时密钥。

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

缺少依赖下载或浏览器环境时，应记录未完成的检查，不能把未运行视为通过。可使用 GitHub Actions 的实际报告完成验证。

## 自动验收与压缩包

`Verify and package` 在功能分支和 PR 上运行，也供主分支发布工作流复用。依次执行全量依赖审计、类型检查、核心与存档测试、根路径生产构建和浏览器测试、`/China-Airlines/` 子路径构建和浏览器测试。浏览器重试为零。

测试成功后保存经过验证的 Pages 构建，不为部署重新构建另一个未经验证的版本。交付 artifact 包含源码 ZIP、通用静态 ZIP、SHA256SUMS.txt、源提交标识、单元测试与两套浏览器 JSON 报告、截图和依赖审计结果。自动生成的 PNG 图标会进入静态包，不需要作为源文件提交。

源码 ZIP 不包含 node_modules、个人存档、密钥或构建缓存。静态 ZIP 解压后的内容可放在普通 HTTPS 静态站点根目录；也可先运行本地 HTTP 服务检验，不能直接双击 HTML 验收 PWA。

## 合并与部署

开发分支通过 PR squash 合并到 main。主分支的 `Deploy GitHub Pages` 首先调用相同完整验收流程，成功后才将其 Pages artifact 交给 deploy-pages。发布任务仅允许 main，使用受限的 Pages 权限。

工作流要求仓库已有可用的 Pages 站点配置与权限。站点未启用、套餐不支持、环境审批未通过或权限不足时，部署会停止；代码、测试报告和静态包仍可交付。失败日志是状态依据，不得把「有部署工作流」写成「已上线」。不自动变更仓库可见性，不购买套餐，不上传密钥。

应用更新保持提示模式：只有用户确认并成功保存后才更新页面。存档结构变化必须先修改 DESIGN.md，提供版本迁移与对应测试。

## 验收边界

自动浏览器流程使用 Linux/Chromium，包含桌面、模拟手机横屏与竖屏、派航结算、自动往返和停止、刷新不重复结算、购机、导入导出、拒绝坏文件、备份恢复、离线重载和并发写保护。它们不等于 iOS Safari 或真实手机认证；未测试的平台不得宣称已经通过。
