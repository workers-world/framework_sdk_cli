# 门户四准则（WW-127）

Workers-World `ww` 门户与 `framework_sdk_cli` 的契约。验收以本文 MUST 为准。

## 1. 自注册

- **MUST**：工具通过 `ToolManifest`（`apiVersion: ww.tool/v1`）描述元数据；handler 与 manifest 同模块导出。
- **MUST**：门户 `package.json` 的 `ww.tools` 数组声明加载路径；不得改 `bin/ww.mjs` / `runPortal` 增工具。
- **MUST**：`ww list` / `help` / `search` / 写闸从 manifest 生成；保留字不可占用。
- **MUST**：`sdkRange` 不兼容或 manifest 非法时跳过加载，`ww doctor` 报 fail。

## 2. 自检查

- **MUST**：`SelfCheck` + `runChecks`；`ww doctor [--json] [--list-checks] [id…]`。
- **MUST**：被动提示（prerun）仅 TTY、非 `--json`、非 CI、无 `WW_NO_UPDATE_CHECK`；最多一行。
- **MUST**：检查只读；network 检查用缓存 + detached 后台刷新（默认 24h）。

## 3. 门户统一

- **MUST**：PATH 仅 `ww`；保留动词 `list help search doctor update version install uninstall` 元数据进 list。
- **MUST**：`--json` 或非 TTY → stdout 仅进程信封；ANSI 仅 `cli/color.ts`（`NO_COLOR` / `WW_NO_COLOR` / `TERM=dumb`）。
- **MUST**：`runPortal` 无具体业务 tool id 分支。

## 4. 门户简单

- 用户记 `ww`、`ww doctor`、`ww update`；发现用 `ww search` / `ww help`。
- 被动自检预算约 50ms；不阻塞网络。

详见 Linear WW-127 与 `framework_sdk_cli` 源码 `src/portal/manifest.ts`。
