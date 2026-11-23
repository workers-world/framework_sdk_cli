import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { stripTrailingSlashes } from '../strings/strip-trailing-slashes.js';

/** 新跳过列表文件名（不读 `.wt-skip.json`；格式与旧 skip 对象相同）。 */
export const WORKSPACE_SKIP_FILENAME = '.ww-workspace-skip.json';

export interface WorkspaceSkipData {
    skip: Record<string, string[]>;
}

export function skipFilePath(workspaceRoot: string): string {
    return join(workspaceRoot, WORKSPACE_SKIP_FILENAME);
}

export function normalizeRepoName(raw: string): string {
    let s = String(raw ?? '').trim();
    if (!s) {
        return '';
    }
    s = stripTrailingSlashes(s);
    if (s === '.' || s === 'meta-root') {
        return 'meta-root';
    }
    return basename(s);
}

export function uniqueRepos(names: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of names) {
        const n = normalizeRepoName(raw);
        if (!n || seen.has(n)) {
            continue;
        }
        seen.add(n);
        out.push(n);
    }
    return out.sort();
}

export function loadSkipFile(workspaceRoot: string): WorkspaceSkipData {
    const path = skipFilePath(workspaceRoot);
    if (!existsSync(path)) {
        return { skip: {} };
    }
    try {
        const raw = JSON.parse(readFileSync(path, 'utf8')) as { skip?: Record<string, string[]> };
        const skip = raw && typeof raw.skip === 'object' && raw.skip ? raw.skip : {};
        const out: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(skip)) {
            if (!Array.isArray(v)) {
                continue;
            }
            out[k] = uniqueRepos(v);
        }
        return { skip: out };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new SkipFileParseError(path, message);
    }
}

export class SkipFileParseError extends Error {
    constructor(
        readonly filePath: string,
        detail: string,
    ) {
        super(`error: 无法解析 ${filePath}: ${detail}`);
        this.name = 'SkipFileParseError';
    }
}

export function saveSkipFile(workspaceRoot: string, data: WorkspaceSkipData): void {
    const path = skipFilePath(workspaceRoot);
    // 原子写（对齐 git-cache.ts 的 tmp+rename 模式）：先写临时文件再 rename，
    // 避免写入中途被打断留下半截坏 JSON（坏文件会让 loadSkipFile 抛 SkipFileParseError 连累 run）。
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ skip: data.skip }, null, 2)}\n`);
    renameSync(tmp, path);
}

export function skipsFor(workspaceRoot: string, id: string): string[] {
    return loadSkipFile(workspaceRoot).skip[id] ?? [];
}
