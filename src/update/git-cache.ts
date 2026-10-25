import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { wwUpdateCacheFile } from './cache-dir.js';

export const CACHE_VERSION = 1;
export const FETCH_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const FETCH_RETRY_MS = 60 * 60 * 1000;
export const RECOUNT_RETRY_MS = 60 * 1000;
export const FETCH_TIMEOUT_MS = 20_000;

export interface RepoCache {
    head: string | null;
    behind: number | null;
    fetchedAt?: number;
    attemptedAt?: number;
    countedAt?: number;
}

export interface UpdateCache {
    version: number;
    repos: Record<string, RepoCache>;
}

export function readCache(file: string): UpdateCache {
    try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as UpdateCache;
        if (parsed?.version === CACHE_VERSION && parsed.repos && typeof parsed.repos === 'object') {
            return parsed;
        }
    } catch {
        /* empty */
    }
    return { version: CACHE_VERSION, repos: {} };
}

export function updateCache(file: string, patch: Record<string, Partial<RepoCache>>): UpdateCache {
    const cur = readCache(file);
    for (const [repo, entry] of Object.entries(patch)) {
        cur.repos[repo] = { ...(cur.repos[repo] ?? { head: null, behind: null }), ...entry };
    }
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(cur, null, 2)}\n`);
    renameSync(tmp, file);
    return cur;
}

function readText(p: string): string | null {
    try {
        return readFileSync(p, 'utf8');
    } catch {
        return null;
    }
}

function gitDirs(repo: string): { gitDir: string; commonDir: string } | null {
    const dotGit = join(repo, '.git');
    let gitDir: string;
    try {
        const m = /^gitdir:\s*(.+)\s*$/m.exec(readFileSync(dotGit, 'utf8'));
        if (!m) {
            return null;
        }
        gitDir = isAbsolute(m[1]) ? m[1] : resolve(repo, m[1]);
    } catch (err) {
        if (err && typeof err === 'object' && (err as NodeJS.ErrnoException).code === 'EISDIR') {
            gitDir = dotGit;
        } else {
            return null;
        }
    }
    const common = readText(join(gitDir, 'commondir'))?.trim();
    const commonDir = common ? (isAbsolute(common) ? common : resolve(gitDir, common)) : gitDir;
    return { gitDir, commonDir };
}

export function readGitHead(repo: string): { sha: string; branch: string | null } | null {
    const dirs = gitDirs(repo);
    if (!dirs) {
        return null;
    }
    const head = readText(join(dirs.gitDir, 'HEAD'))?.trim();
    if (!head) {
        return null;
    }
    if (/^[0-9a-f]{40,64}$/.test(head)) {
        return { sha: head, branch: null };
    }
    const m = /^ref:\s*(\S+)$/.exec(head);
    if (!m) {
        return null;
    }
    const ref = m[1];
    const branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null;
    for (const dir of [dirs.gitDir, dirs.commonDir]) {
        const loose = readText(join(dir, ref))?.trim();
        if (loose && /^[0-9a-f]{40,64}$/.test(loose)) {
            return { sha: loose, branch };
        }
    }
    const packed = readText(join(dirs.commonDir, 'packed-refs'));
    if (packed) {
        for (const line of packed.split('\n')) {
            const [sha, name] = line.trim().split(' ');
            if (name === ref && /^[0-9a-f]{40,64}$/.test(sha)) {
                return { sha, branch };
            }
        }
    }
    return null;
}

export function git(
    repo: string,
    args: string[],
    opts: { timeout?: number; env?: NodeJS.ProcessEnv; raw?: boolean } = {},
): { ok: boolean; stdout: string; stderr: string } {
    const env: NodeJS.ProcessEnv = { ...(opts.env ?? process.env), GIT_TERMINAL_PROMPT: '0' };
    if (!env.GIT_SSH_COMMAND) {
        env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes';
    }
    const r = spawnSync('git', ['-C', repo, ...args], {
        encoding: 'utf8',
        timeout: opts.timeout ?? 10_000,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
    });
    return {
        ok: r.status === 0 && !r.error,
        stdout: opts.raw ? (r.stdout ?? '') : (r.stdout ?? '').trim(),
        stderr: (r.stderr ?? '').trim() || (r.error ? String(r.error.message) : ''),
    };
}

export function refreshRepos(options: {
    repos: string[];
    file?: string;
    fetch: 'auto' | 'always' | 'never';
    markFetched?: boolean;
    now?: number;
    env?: NodeJS.ProcessEnv;
}): UpdateCache {
    const file = options.file ?? wwUpdateCacheFile(options.env);
    const now = options.now ?? Date.now();
    const env = options.env;
    const cache = readCache(file);
    updateCache(file, Object.fromEntries(options.repos.map((r) => [r, { attemptedAt: now }])));
    const patch: Record<string, Partial<RepoCache>> = {};
    for (const repo of options.repos) {
        const prev = cache.repos[repo];
        const fetchDue =
            options.fetch === 'always' ||
            (options.fetch === 'auto' && now - (prev?.fetchedAt ?? 0) >= FETCH_INTERVAL_MS);
        const entry: Partial<RepoCache> = { countedAt: now };
        if (fetchDue) {
            const f = git(repo, ['fetch', '--quiet', '--no-tags', '--no-recurse-submodules'], {
                timeout: FETCH_TIMEOUT_MS,
                env,
            });
            if (f.ok) {
                entry.fetchedAt = now;
            }
        } else if (options.markFetched) {
            entry.fetchedAt = now;
        }
        const head = git(repo, ['rev-parse', 'HEAD'], { env });
        entry.head = head.ok ? head.stdout : null;
        const behind = git(repo, ['rev-list', '--count', 'HEAD..@{upstream}'], { env });
        entry.behind = behind.ok && /^\d+$/.test(behind.stdout) ? Number(behind.stdout) : null;
        patch[repo] = entry;
    }
    return updateCache(file, patch);
}
