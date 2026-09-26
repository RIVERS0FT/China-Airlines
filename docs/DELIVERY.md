# 开发、验收与发布

## 可复现环境

使用 Node.js 22.12 或更高版本和锁定依赖。核心检查命令：

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e
```

根路径和 `BASE_PATH=/china-airlines/` 子路径必须分别构建并运行浏览器流程。生产输出为 `dist/`，需要 HTTP/HTTPS 静态托管；双击 HTML 不属于支持的运行方式。

Playwright 本地默认使用 2 个 worker，CI 每台 Runner 使用 1 个 worker，避免软件 WebGL 渲染争抢资源；单文件内用例仍按顺序运行，失败不自动重试。PR 根路径和子路径各分为 4 个独立 Runner，使用 Playwright 原生 `--shard=N/4` 覆盖完整浏览器集，8 组全部通过才允许合并。生产验收在实际 main 提交上执行子路径全部 4 组，只有第 1 组打包，部署必须等待 4 组均成功；产物按提交 SHA 和 workflow run ID 绑定，单独重跑其他分组仍可引用同一份已验收包；重跑第 1 组会重新校验并替换同一次运行的包。CI 任一测试失败立即结束该组并上传证据，其他组继续完成；失败或未执行的用例不得计为通过。机舱几何测试用 4 组代表性视口与缩放组合覆盖 3 种布局尺寸和 75/100/125/150% 四档，缩放行为由 `display-scaling.spec.ts` 单独覆盖全部档位，所有机型仍逐一验收。

分层目录、快速检查命令及断言规则见 [TESTING.md](TESTING.md)。完整浏览器验收包含真实新开局流程、功能专项和展示交互回归。

## 验收边界

自动流程覆盖核心经济、真实订单、装卸、路线计划、自动值勤、到达去重、能量、人员、生产、存档主备份、并发写保护、桌面横屏、两种手机横屏、竖屏提示、刷新、导入导出和离线启动。

每项检查必须记录实际执行结果。测试定义、一次重启、静态文件存在或未认证的 HTTP 响应都不能代替真实通过回执。浏览器模拟视口不等于真实 iOS Safari 或 Android 设备认证；未执行的平台必须明确说明。

## 合并与部署

在功能分支开发，通过 PR squash 合并并遵守分支保护。日常修改由本仓库 `Deploy China Airlines production` 工作流从 `main` 构建并发布到 `https://riversoft.top/china-airlines/`；它先在托管 Runner 完整验证，再由本仓库现有自建 Runner 使用受限 SSH 命令交给 `game-hk` 校验包并切换不可变版本，失败恢复旧版本。生产机不增加 Runner。RIVERSOFT 主站工作流保留该路径且不再发布游戏。停止 GitHub Pages 自动发布，不重复生成源码 ZIP 或静态 ZIP；只有用户明确要求离线交付包时才打包。

首次启用需要把 `deploy/receive-release.sh` 与 `deploy/production-release.sh` 安装为 `game-hk` 上 root 所有、模式 `0755` 的 `/usr/local/libexec/china-airlines-receive` 与 `/usr/local/libexec/china-airlines-production-release`，并把游戏专用公钥以 `command="/usr/local/libexec/china-airlines-receive",restrict` 写入 `deploy` 的 `authorized_keys`。私钥只放在本仓库 `production` Environment 的 `CHINA_AIRLINES_DEPLOY_KEY`；仓库固定的 `deploy/known_hosts` 钉住生产 SSH 主机公钥。发布目录 `/var/www/riversoft-games/{incoming,releases}` 由 `deploy` 所有；主站仅保留 `/var/www/riversoft/china-airlines` 链接。变更固定接收脚本时应同步更新生产机上的 root 所有副本并核对哈希。`RIVERSOFT_TOKEN` 是创作者令牌，不参与游戏发布。

源码修改完成、生产构建成功、PR 合并和站点部署是不同状态。只有部署工作流成功并验证目标站点提供预期产物后才能宣称上线。权限、套餐或外部服务不足时如实报告，不改变仓库可见性，也不购买服务。

## 当前格式规则

当前只支持存档 `version: 13` 和数据库结构版本 1。规则或格式变更必须同步更新 [DESIGN.md](DESIGN.md)、严格验证器、单元测试和浏览器流程。仓库不保留旧格式迁移器、历史夹具或旧版验收文档。
