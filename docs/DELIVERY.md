# 开发、验收与发布

## 一次提交交付

使用 Node.js 22.12 或以上、Git 和已认证的 GitHub CLI。从仓库根目录执行，文件参数必须是具体相对路径；现有暂存内容及未指定的修改不被一并提交。

```sh
npm run deliver -- --message "fix: 修复说明" -- src/example.ts tests/unit/example.test.ts
```

只有用户明确要求合并及部署时使用：

```sh
npm run deliver -- --message "fix: 修复说明" --auto-merge --deploy -- src/example.ts tests/unit/example.test.ts
```

已有提交可以不传文件，仅推送并登记交付。脚本验证仓库、分支、origin、认证与 main 祖先关系，提交指定文件、推送、创建/复用 PR，登记绑定当前 head SHA 的交付请求后立即返回。它不等待全量 CI。自动合并和部署均需要两个显式开关，不根据单独的“提交推送”推断授权。

## 验证与复用

本地只执行受影响的定向检查；产品代码变化先类型检查、对应路径构建，再跑相关浏览器用例。完整验证由 PR Verify 执行，统一报告 `delivery-ready`：

1. center 使用持久化 npm 下载缓存，按锁文件安装一次；无 GitHub npm 缓存上传/恢复。
2. 审计、类型检查、全部核心/持久化/资源与交付脚本测试各执行一次。
3. 一次相对路径构建及一次全部 Playwright；原 UI contracts 用例已全部包含。独立根路径验证已删除。
4. 成功后记录 PR/head/base/测试合并提交/源码树、Node/npm/平台/内核/Chromium描述/锁文件及单份 `artifacts/browser.json` 通过数量。

单 Runner 不再拆8个重复初始化的排队任务；CI保留1个浏览器 worker和零重试。不减少覆盖，不把未运行、失败或取消算成功。依赖与浏览器系统库仍由管理员预装，runner无sudo。所有任务使用 `china-airlines-center` 标签，不改用其他项目或生产机的 Runner。

生产只复用相同源码树、相同依赖/环境、1天内且经 GitHub 最新成功运行与唯一 `delivery-ready` 核验的回执；squash 后SHA变化由源码树比对处理。任何不匹配均重新一次完整验证；不回退到较旧的成功运行。生产始终重新构建实际main，保存发布包，并进行公开验收。

## 自动合并、部署与回报

`Automatic delivery` 在 Verify/生产工作流完成时触发，只 checkout 可信 main，不执行PR产物。它只接受具有仓库写权限人员登记的当前提交请求；额外检查、状态检查、最新head/base/main均须通过，缺失、跳过、失败、取消不能合并。通过后 squash，再显式 dispatch 生产，避免 GITHUB_TOKEN 合并不能触发push工作流的问题。已有生产运行不重复触发；重跑须人工明确执行。

当前私有仓库的规则集接口存在套餐限制，编排代码执行检查门槛，不绕过已有保护、不购买服务、不改变仓库可见性。事件工作流必须先在main存在；首次安装或验证回执版本变化时，交付脚本自动启动绑定当前提交的后台引导进程，并使用带版本的请求避免旧main误判。其余交付由服务器事件推进，不依赖助手长时间轮询。v2回执只接受一次完整相对路径验收，拒绝复用旧双路径回执。

生产通过 riversoft.top HTTPS 托管 API 发布：读取管理员发布身份和已配置子域名 → 从 center 恢复已验证静态包 → 生成逐文件 SHA-256 清单 → 分块上传 → 再查最新 main → 平台提交。`RIVERSOFT_TOKEN` 仅从 production Secret 注入。禁止 SSH/SCP/rsync 直传、服务器脚本和目录切换，也不使用 `official-deployments` 补登记旧文件。公开 URL 来自提交响应，传入文件哈希和 `playwright.production.config.ts` 验收；首页列表和项目详情必须指向本次平台部署 ID。

同名 `china-airlines` 项目已迁入 riversoft.top 托管系统，首页目录记录的发布方式为 `upload`。旧 SSH 发布工作流保持停用，只有 HTTPS 流程进入 main 后才重新启用 `deploy-production.yml`。平台不支持时明确失败，不自动改名或回退到旧流程。普通兼容沙箱不满足本游戏离线与存档要求；如平台分配新 origin，旧存档需由用户在旧地址导出、到支持该格式的新地址导入。后置验收失败不伪称自动回滚。部门扩充后当前游戏只接受 v18，旧 v16 文件应保留用于旧版恢复。

结果更新同一条PR状态评论、Actions Summary及center JSON；失败附步骤、关键堆栈和完整任务日志链接，密钥和常见令牌脱敏。日志下载暂不可用时明确说明并保留链接。正常等待不调用模型；当前聊天若无回调能力，不承诺主动推送聊天消息。

恢复入口：

```sh
gh workflow run delivery.yml --ref main -f pr=14
gh run rerun <失败运行ID> --failed
```

只重新提交编排不会自动重跑失败的生产流程。若发布包超过1天，需要重跑整个生产运行的准备阶段。新提交必须重新登记当前SHA的交付请求。

## 相对路径与服务器边界

项目文件相对仓库或模块位置解析，浏览器测试通过 `page.goto('./')` 使用配置baseURL。Vite base 固定为 `./`，不接受部署子目录注入；同一份产物仅在通用 `__game_test__/` 挂载目录下验收一次。部署目录由 riversoft.top 决定，线上专项也可设置 `PLAYWRIGHT_BASE_URL` 指向本地预览，以同一组用例检查构建。

`deploy/targets.json` 只保留平台 API、项目元数据、center runner 与构件目录。项目传入相对文件路径，不指定主机 IP、SSH 密钥、web 根目录或游戏 URL；riversoft.top 决定部署位置并返回 URL。`scripts/publish-riversoft.mjs` 负责平台协议，服务器的旧接收脚本已从仓库移除，不修改主站仓库。

上传失败只尝试取消未提交上传；失败日志、平台错误及上传 ID 存入既有失败证据。平台提交后的目录或浏览器验证失败可能已切换公开版本，需在平台管理页核实并恢复；不再次上传、不隐式回滚。发布成功后由平台提交结果填写 Actions 环境 URL 与 Summary。

## center 构件与结果

构件根目录由管理员预置、git-runner所有、0700，独立于工作区与RUNNER_TEMP。目录内相对位置：

- `reports/<run>-<attempt>-<ci-full|production|deploy>/`：失败截图、trace、JSON及上下文，兼容旧分片目录。保留最新已完成失败attempt的全部分组，最长90天。
- `releases/<run>-<attempt>-<SHA>/`：tgz、SHA-256及身份清单。只允许main生产工作流读写，同运行/提交可复用较早准备任务的包，损坏不能回退；成功后清理，失败且结束的包1天后清理。
- `delivery/verification-<run>-<attempt>.json`：小型验证回执，2天后且运行结束才清理；超过1天已不可复用。
- `delivery/result-<run>-<attempt>.json`：交付状态及脱敏错误摘要，90天后且运行结束才清理。

所有记录原子写入，不覆盖同一身份，拒绝路径越界和符号链接。进行中、未知、损坏或无法查证的数据不删除。不上传密钥、node_modules或用户存档，不再使用GitHub Artifact。

定向测试：

```sh
node --test scripts/publish-riversoft.test.mjs .github/scripts/delivery.test.cjs .github/scripts/center-artifacts.test.cjs .github/scripts/artifact-retention.test.cjs
```

源码、CI通过、合并、发布和公开验收分别记录；只有生产工作流及目标站点验收通过才能宣称上线。浏览器模拟不等于真实iOS/Android设备认证。

## 当前格式规则

当前只支持存档 `version: 18` 和数据库结构版本 2。旧 `version: 17`、`version: 16` 与所有其他版本拒绝，不自动迁移且不覆盖旧主档或备份。规则或格式变更必须同步更新 [DESIGN.md](DESIGN.md)、严格验证器、单元测试和浏览器流程。仓库不保留旧格式迁移器、历史夹具或旧版验收文档。
