# framework_sdk_cli

Workers-World **Agent CLI 基建**（库，无产品 bin）。

| 子包 | 职责 |
|------|------|
| `envelope/` | 进程信封 + exit 码 |
| `argv/` | `--confirm` / `--json` / 命名参数 |
| `http/` | Bearer fetch、WorkerIo→进程信封、env |
| `portal/` | `registerTool` / `runPortal` / `registerPortalVersion`（`ww version` 原语） |
| `search/` | 门户级 `searchTools`（默认 top-5、`--limit`、意图加权、`suggested`） |
| `workspace/` | `registerWorkspaceTools()`（WW-126，`ww wt`）；可选 `extensions` 注册门户扩展（WW-125，如 `ww wt bench`） |

根 `src/index.ts` 只做聚合导出；也可 `import … from 'framework_sdk_cli/portal'`。  
业务命令（如 `pgreq`）**不要**放进本仓——在 [ww](https://github.com/workers-world/ww) 登记。

OpenAPI 单源（ww#41）：生成器产出 `ToolCommand` 的 `name` / `summary` / `usage` / `flags` / `mutating` 片段；ww 在启动时用 `registerTool` 合并手写 handler 与 overlay（`--confirm` 写闸，非 `--force`）。`commandSchema` / `buildCommandHelp` 消费合并后的形状，无需改 portal 渲染。

Agent 发现路径：**search → help → schema / list --json**（子命令 `--help --json` 为 exit 0；缺参仍为 USAGE exit 2）。

`registerWorkspaceTools({ extensions: WtPortalExtension[] })` 让 ww 把 `bench` 等子命令挂进 `ww wt list` / `help` / `run` / 交互菜单与 direct 子命令；扩展 id 不得与 catalog（pull/push/…）或保留子命令（list/help/run/skip）冲突。扩展 handler 收到与内置工具相同的 `PortalContext`（含 `--json` 时的 `ctx.json`），argv 中也会保留 `--json`。

```bash
npm install
npm run check && npm test && npm run build
```

本地消费者：`file:../framework_sdk_cli` + `npm install --no-package-lock`。入仓用 `npm:@workers-world/framework_sdk_cli@x`。

### `.env`

`loadDotEnv` / `ensureDotEnvLoaded`（`framework_sdk_cli/http`）：用 Node 原生 `util.parseEnv` + `process.loadEnvFile`；从 cwd 向上找 `.env`，或 `WW_ENV_FILE` / `DOTENV_PATH`；不覆盖已有 `process.env`。`requireEnv` / `resolveDeployTrackerBase` / `runPortal` 会自动 `ensure`。需 Node ≥20.12。仓内 `.env` 已 gitignore，模板见 `.env.example`。

## CI / 发版

对齐 `framework_sdk_ui`：`dev_*` → sync-lock + verify；合入 `master` → publish `@workers-world/framework_sdk_cli` + `v*` tag → GitHub Release。
