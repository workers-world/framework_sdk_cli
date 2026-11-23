# framework_sdk_cli

Workers-World **Agent CLI 基建**（库，无产品 bin）。

| 子包 | 职责 |
|------|------|
| `envelope/` | 进程信封 + exit 码 |
| `argv/` | `--confirm` / `--json` / 命名参数 |
| `http/` | Bearer fetch、WorkerIo→进程信封、env |
| `portal/` | `registerTool` / `runPortal` / `registerPortalVersion`（`ww version` 原语） |
| `search/` | 门户级 `searchTools` |
| `workspace/` | `registerWorkspaceTools()`（WW-126，`ww wt`）；可选 `extensions` 注册门户扩展（WW-125，如 `ww wt bench`） |
| `check/` / `update/` | `ww doctor`、被动自检、`createGitUpdateCheck`、`safePull`（WW-127） |

门户四准则：**[docs/portal-guidelines.md](docs/portal-guidelines.md)**（`loadTools` / `ww.tools` manifest 发现）。

根 `src/index.ts` 只做聚合导出；也可 `import … from 'framework_sdk_cli/portal'`。  
业务命令（如 `pgreq`）**不要**放进本仓——在 [ww](https://github.com/workers-world/ww) 登记。

`registerWorkspaceTools({ extensions: WtPortalExtension[] })` 让 ww 把 `bench` 等子命令挂进 `ww wt list` / `help` / `run` / 交互菜单与 direct 子命令；扩展 id 不得与 catalog（pull/push/…）或保留子命令（list/help/run/skip）冲突。扩展 handler 收到与内置工具相同的 `PortalContext`（含 `--json` 时的 `ctx.json`），argv 中也会保留 `--json`。

```bash
npm install
npm run check && npm test && npm run build
```

本地消费者：`file:../framework_sdk_cli` + `npm install --no-package-lock`。入仓用 `npm:@workers-world/framework_sdk_cli@x`。

### `.env`

`loadDotEnv` / `ensureDotEnvLoaded`（`framework_sdk_cli/http`）：用 Node 原生 `util.parseEnv` + `process.loadEnvFile`；从 cwd 向上找 `.env`，或 `WW_ENV_FILE` / `DOTENV_PATH`；不覆盖已有 `process.env`。`requireEnv` / `resolveDeployTrackerBase` / `runPortal` 会自动 `ensure`。需 Node ≥20.12。仓内 `.env` 已 gitignore，模板见 `.env.example`。

## CI / 发版

对齐 `framework_sdk_ui`：`dev_*` → sync-lock + verify；合入 **master** → 按 `package.json` `version` publish `@workers-world/framework_sdk_cli` + `v*` tag → GitHub Release（未 bump 则跳过）。

### 版本语义（对齐 SDK / worker-actions / ww）

**版本权威 = [`package.json`](../package.json) `version`**：在 Release PR（`dev_*` → `master`）里**本地 bump**（patch/minor/major 人工定），随 PR 评审；合入 master 后既有 `ci-publish` 发 GitHub Packages、`sync-package-to-r2` 同步 R2；**未 bump**（该版本已在 Packages 上）→ publish/tag 自动跳过。**无 bot 反应式 bump**：旧 `auto-version-bump.yml`（ww#47，Release 合入后 bot patch+1 写回 `package.json`）已删除。

新发 SDK 成功后 `ci-publish` 会向 **ww** 发 `repository_dispatch`（`framework-sdk-published`），由 ww 开 **pin-only** bot PR（升 `framework_sdk_cli` pin + 刷 lock，**不动 ww 版本**，随 ww 下一次 Release PR 发布）。跨仓 dispatch 需 org 级 **`WORKERS_WORLD_GHA_TOKEN`**（或等效 PAT，`repo` + 触发 ww workflow）；仅 `GITHUB_TOKEN` 时可能无法 dispatch 到 ww。

**不发 npmjs.com**；registry 仍为 `publishConfig` 中的 GitHub Packages。

**R2 旁路（与 ww 同票）**：[`registry_package` `published`](.github/workflows/sync-package-to-r2.yml) 独立 workflow 从 GitHub Packages 拉 tarball 写 R2 + `manifest.json`；**不**改 `ci-publish.yml`。Secrets/变量见 [ww README 制品分发](https://github.com/workers-world/ww#制品分发agent--本机--开发)。
