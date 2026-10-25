import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SelfCheck } from '../check/types.js';
import { wwUpdateCacheFile } from './cache-dir.js';
import {
    FETCH_INTERVAL_MS,
    FETCH_RETRY_MS,
    RECOUNT_RETRY_MS,
    readCache,
    readGitHead,
} from './git-cache.js';

export interface GitUpdateCheckOptions {
    id: string;
    title: string;
    repoPath: string;
    label: string;
    branch: string;
}

export function createGitUpdateCheck(opts: GitUpdateCheckOptions): SelfCheck {
    return {
        id: opts.id,
        title: opts.title,
        cost: 'network',
        run(ctx) {
            const env = ctx.env;
            const file = wwUpdateCacheFile(env);
            const now = Date.now();
            const head = readGitHead(opts.repoPath);
            if (!head) {
                return { status: 'skip', message: `${opts.label}: 非 git 仓库` };
            }
            const cache = readCache(file);
            const entry = cache.repos[opts.repoPath];
            const attemptedAgo = now - (entry?.attemptedAt ?? 0);
            let stale = false;
            if (!entry) {
                stale = true;
            } else if (
                now - (entry.fetchedAt ?? 0) >= FETCH_INTERVAL_MS &&
                attemptedAgo >= FETCH_RETRY_MS
            ) {
                stale = true;
            } else if (entry.head !== head.sha && attemptedAgo >= RECOUNT_RETRY_MS) {
                stale = true;
            }
            if (stale) {
                spawnBackgroundRefresh({ file, repos: [opts.repoPath], env });
            }
            if (
                entry &&
                entry.head === head.sha &&
                typeof entry.behind === 'number' &&
                entry.behind > 0
            ) {
                return {
                    status: 'warn',
                    message: `${opts.label} 落后 origin ${entry.behind} 个提交`,
                    fix: { command: 'ww update', sideEffects: 'remote' },
                };
            }
            return { status: 'ok', message: `${opts.label} 已同步` };
        },
    };
}

function spawnBackgroundRefresh(options: {
    file: string;
    repos: string[];
    env: NodeJS.ProcessEnv;
}): void {
    const worker = join(dirname(fileURLToPath(import.meta.url)), 'fetch-worker.js');
    const child = spawn(process.execPath, [worker, options.file, ...options.repos], {
        detached: true,
        stdio: 'ignore',
        env: { ...options.env, WW_NO_UPDATE_CHECK: '1' },
    });
    child.on('error', () => {});
    child.unref();
}
