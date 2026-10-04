# framework_sdk_cli

Workers-World **Agent CLI 基建**（库，无产品 bin）。

- 进程信封 `{ ok, data, error, warnings, meta }`（≠ Worker `WorkerIoEnvelope`）
- `registerTool` / `runPortal`（门户由 [ww](https://github.com/workers-world/ww) 仓提供）
- `fetchBearer` + `mapWorkerIoToProcess`
- `--confirm` 守闸；`searchTools`（门户 `ww search`）

业务命令（如 `pgreq`）**不要**放进本仓。

```bash
npm install
npm run check && npm test && npm run build
```

本地消费者：`file:../framework_sdk_cli` + `npm install --no-package-lock`。入仓用 `npm:@workers-world/framework_sdk_cli@x`。

## CI / 发版

对齐 `framework_sdk_ui`：`dev_*` → sync-lock + verify；合入 `master` → publish `@workers-world/framework_sdk_cli` + `v*` tag → GitHub Release。
