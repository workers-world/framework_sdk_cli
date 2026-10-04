import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';
import { parseEnv } from 'node:util';

export type LoadDotEnvOptions = {
    /** 搜索起点；默认 process.cwd() */
    cwd?: string;
    /** 显式文件路径（优先于 cwd 搜索）；也可设 env WW_ENV_FILE / DOTENV_PATH */
    path?: string;
    /** 向上查找层数上限（含 cwd）；默认 8 */
    maxDepth?: number;
};

export type LoadDotEnvResult = {
    path: string | null;
    keys: string[];
};

let ensured = false;

/** 测试用：重置 ensureDotEnvLoaded 的 once 状态 */
export function resetDotEnvLoadedForTests(): void {
    ensured = false;
}

/** 解析 .env 文本（Node `util.parseEnv`） */
export function parseDotEnv(text: string): Record<string, string> {
    const parsed = parseEnv(text);
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed)) {
        if (val !== undefined) {
            out[key] = val;
        }
    }
    return out;
}

function resolveEnvFilePath(opts: LoadDotEnvOptions = {}): string | null {
    const explicit =
        opts.path?.trim() || process.env.WW_ENV_FILE?.trim() || process.env.DOTENV_PATH?.trim();
    if (explicit) {
        return explicit;
    }
    const start = opts.cwd?.trim() || process.cwd();
    const maxDepth = opts.maxDepth ?? 8;
    let dir = start;
    for (let i = 0; i < maxDepth; i++) {
        const candidate = join(dir, '.env');
        if (existsSync(candidate)) {
            return candidate;
        }
        const parent = dirname(dir);
        if (parent === dir || parsePath(dir).root === dir) {
            break;
        }
        dir = parent;
    }
    return null;
}

/**
 * 从 .env 填入尚未设置的 process.env（`process.loadEnvFile`，不覆盖已有变量）。
 * 文件不存在则静默跳过。
 */
export function loadDotEnv(opts: LoadDotEnvOptions = {}): LoadDotEnvResult {
    const filePath = resolveEnvFilePath(opts);
    if (!filePath || !existsSync(filePath)) {
        return { path: null, keys: [] };
    }
    let text: string;
    try {
        text = readFileSync(filePath, 'utf8');
    } catch {
        return { path: null, keys: [] };
    }
    const parsed = parseDotEnv(text);
    const keys = Object.keys(parsed).filter((key) => process.env[key] === undefined);
    process.loadEnvFile(filePath);
    return { path: filePath, keys };
}

/** 进程内只加载一次（供 requireEnv / runPortal 调用） */
export function ensureDotEnvLoaded(): void {
    if (ensured) {
        return;
    }
    ensured = true;
    loadDotEnv();
}
