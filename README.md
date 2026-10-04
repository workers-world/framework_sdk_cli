# framework_sdk_cli

Workers-World **Agent CLI 基建**（库，无产品 bin）。

| 子包 | 职责 |
|------|------|
| `envelope/` | 进程信封 + exit 码 |
| `argv/` | `--confirm` / `--json` / 命名参数 |
| `http/` | Bearer fetch、WorkerIo→进程信封、env |
| `portal/` | `registerTool` / `runPortal` |
| `search/` | 门户级 `searchTools` |

根 `src/index.ts` 只做聚合导出；也可 `import … from 'framework_sdk_cli/portal'`。  
业务命令（如 `pgreq`）**不要**放进本仓——在 [ww](https://github.com/workers-world/ww) 登记。

```bash
npm install
npm run check && npm test && npm run build
```

本地消费者：`file:../framework_sdk_cli` + `npm install --no-package-lock`。入仓用 `npm:@workers-world/framework_sdk_cli@x`。

### `.env`

`loadDotEnv` / `ensureDotEnvLoaded`（`framework_sdk_cli/http`）：用 Node 原生 `util.parseEnv` + `process.loadEnvFile`；从 cwd 向上找 `.env`，或 `WW_ENV_FILE` / `DOTENV_PATH`；不覆盖已有 `process.env`。`requireEnv` / `resolveDeployTrackerBase` / `runPortal` 会自动 `ensure`。需 Node ≥20.12。仓内 `.env` 已 gitignore，模板见 `.env.example`。

## CI / 发版

对齐 `framework_sdk_ui`：`dev_*` → sync-lock + verify；合入 `master` → publish `@workers-world/framework_sdk_cli` + `v*` tag → GitHub Release。
