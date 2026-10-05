import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

const MARKER = 'bulk-pull-repos.sh';

export interface ResolveWorkspaceRootOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    /** 额外起点（如 ww 安装目录），在 cwd 链之后尝试 */
    extraStarts?: string[];
}

function isWorkspaceRoot(dir: string): boolean {
    try {
        accessSync(join(dir, MARKER), constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

function walkUp(start: string): string | undefined {
    let dir = start;
    for (;;) {
        if (isWorkspaceRoot(dir)) {
            return dir;
        }
        const parent = join(dir, '..');
        if (parent === dir) {
            return undefined;
        }
        dir = parent;
    }
}

/**
 * 解析 cloudflare_work 工作区根目录。
 * 1. `WW_WORKSPACE_ROOT`（须含 bulk-pull-repos.sh）
 * 2. 从 cwd 向上 walk
 * 3. `extraStarts` 各点向上 walk
 */
export function resolveWorkspaceRoot(opts: ResolveWorkspaceRootOptions = {}): string | undefined {
    const env = opts.env ?? process.env;
    const override = env.WW_WORKSPACE_ROOT?.trim();
    if (override) {
        return isWorkspaceRoot(override) ? override : undefined;
    }
    const cwd = opts.cwd ?? process.cwd();
    const fromCwd = walkUp(cwd);
    if (fromCwd) {
        return fromCwd;
    }
    for (const start of opts.extraStarts ?? []) {
        const found = walkUp(start);
        if (found) {
            return found;
        }
    }
    return undefined;
}

export function requireWorkspaceRoot(opts: ResolveWorkspaceRootOptions = {}): string {
    const root = resolveWorkspaceRoot(opts);
    if (!root) {
        throw new Error(
            '找不到工作区根（需 bulk-pull-repos.sh）；设置 WW_WORKSPACE_ROOT 或在 cloudflare_work  checkout 内运行',
        );
    }
    return root;
}
