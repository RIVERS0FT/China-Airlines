# 旧存档与测试清理

本次不改游戏存档格式、玩家数据库、经营数值或 v7/v8 迁移契约。

## 已删除的历史测试样本

- `tests/fixtures/v1-flying.json`
- `tests/fixtures/v2-flying.json`
- `tests/fixtures/v3-dispatching.json`
- `tests/fixtures/v4-energy-migration.json`
- `tests/fixtures/v4-ordered-route.json`
- `tests/fixtures/v5-flying.json`
- `tests/fixtures/v5-servicing.json`
- `tests/fixtures/v5-unit-flying.json`
- `tests/fixtures/v5-unit-servicing.json`

## 无引用的根级历史模块

- `src/core/catalog-v3.ts`
- `src/core/catalog-v6.ts`
- `src/core/energy-v6.ts`
- `src/core/management-v6.ts`
- `src/core/save-infrastructure-v6.ts`
- `src/core/save-v2.ts`
- `src/core/save-v3.ts`
- `src/core/save-v4.ts`
- `src/core/save-v5.ts`
- `src/core/save-v6.ts`
- `src/core/world-airports-v6.ts`

仅依据实际源码、测试及脚本的依赖图删除。当前目录、公共类型及 v7/v8 冻结迁移树仍保留，避免以清理名义破坏受支持存档。

## 测试调整

旧档拒绝和不可覆盖性集中到 `tests/save-compatibility.test.ts`、`tests/storage-compatibility.test.ts`。已移除下列依赖废弃样本或旧校验器的单例测试；当前业务断言不因此删除：

- `tests/career.test.ts`：rejects retired v6 flights without rewriting their energy
- `tests/career.test.ts`：never accepts expanded aircraft in an old schema
- `tests/energy.test.ts`：rejects retired flights without modifying their input
- `tests/fleet-plans.test.ts`：rejects retired v2 aircraft regardless of fleet size
- `tests/global-airports.test.ts`：rejects retired v5 data without changing it
- `tests/global-airports.test.ts`：rejects forged global v5 data and corrupt energy instead of laundering them into v6
- `tests/globe-integration.test.ts`：refuses retired v5 variants without migrating them
- `tests/management.test.ts`：rejects retired v3 automatic flights
- `tests/orders.test.ts`：rejects old v1 imports without mutating their data
- `tests/storage.test.ts`：rejects retired imports without changing either save slot or revision
- `tests/storage.test.ts`：recovers only a current backup and leaves unsupported disk records intact when no valid backup exists

## 验收边界

沿用既有类型检查、完整单元测试、根路径/子路径构建和四片零重试浏览器回归。验证结果以本次提交对应的 CI 为准；不减少工作流测试集合，不生成交付 ZIP，不在成功部署回执前宣称上线。
