import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'envelope/index': 'src/envelope/index.ts',
        'argv/index': 'src/argv/index.ts',
        'http/index': 'src/http/index.ts',
        'portal/index': 'src/portal/index.ts',
        'search/index': 'src/search/index.ts',
        'workspace/index': 'src/workspace/index.ts',
        'workspace/portal-entry': 'src/workspace/portal-entry.ts',
        'check/index': 'src/check/index.ts',
        'update/index': 'src/update/index.ts',
        // 后台刷新 worker（git-update-check.ts spawn 的就是 dist/update/fetch-worker.js）：
        // 必须进 entry 让 esbuild 打包（fetch-worker import './git-cache.js'，裸 copy 会丢依赖）。
        'update/fetch-worker': 'src/update/fetch-worker.js',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    // Share portal/registry (and peers) across entry points — portal-entry must not get a private Map (#34).
    splitting: true,
    treeshake: true,
    target: 'node20',
});
