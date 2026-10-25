import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SelfCheck } from '../check/types.js';
import { WORKSPACE_CATALOG } from './catalog.js';
import { workspaceExtraRootStarts } from './config.js';
import { resolveWorkspaceRoot } from './root.js';
import { loadSkipFile, skipFilePath } from './skip-file.js';

export function createWtChecks(): SelfCheck[] {
    return [
        {
            id: 'wt.root',
            title: '工作区根目录',
            cost: 'local',
            run() {
                const root = resolveWorkspaceRoot({ extraStarts: workspaceExtraRootStarts() });
                if (!root) {
                    return {
                        status: 'fail',
                        message: '未找到 cloudflare_work 工作区根（设置 WW_WORKSPACE_ROOT）',
                        fix: {
                            command: 'export WW_WORKSPACE_ROOT=/path/to/cloudflare_work',
                            sideEffects: 'none',
                        },
                    };
                }
                return { status: 'ok', message: `工作区根 ${root}` };
            },
        },
        {
            id: 'wt.scripts',
            title: 'workspace-tools 脚本',
            cost: 'local',
            run() {
                const root = resolveWorkspaceRoot({ extraStarts: workspaceExtraRootStarts() });
                if (!root) {
                    return { status: 'skip', message: '无工作区根' };
                }
                const missing = WORKSPACE_CATALOG.filter(
                    (t) => !existsSync(join(root, t.script)),
                ).map((t) => t.script);
                if (missing.length > 0) {
                    return {
                        status: 'fail',
                        message: `缺少脚本：${missing.join(', ')}`,
                    };
                }
                return { status: 'ok', message: 'catalog 脚本齐全' };
            },
        },
        {
            id: 'wt.skipfile',
            title: 'skip 文件可解析',
            cost: 'local',
            run() {
                const root = resolveWorkspaceRoot({ extraStarts: workspaceExtraRootStarts() });
                if (!root) {
                    return { status: 'skip', message: '无工作区根' };
                }
                const path = skipFilePath(root);
                if (!existsSync(path)) {
                    return { status: 'ok', message: 'skip 文件不存在（可选）' };
                }
                try {
                    loadSkipFile(path);
                    return { status: 'ok', message: 'skip 文件可解析' };
                } catch {
                    return { status: 'fail', message: 'skip 文件解析失败' };
                }
            },
        },
    ];
}
