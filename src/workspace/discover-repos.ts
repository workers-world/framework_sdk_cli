import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, type Stats, statSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_EXCLUDE = new Set(['cloudflare-docs']);

function isExcluded(name: string, extra: Set<string>): boolean {
    return DEFAULT_EXCLUDE.has(name) || extra.has(name);
}

function isStandaloneGitRepo(dir: string): boolean {
    try {
        const top = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
        return top === dir;
    } catch {
        return false;
    }
}

export interface WorkspaceRepo {
    /** workspace 相对名：meta-root 为 "." */
    label: string;
    dir: string;
}

/** 与 bulk-pull-repos.sh 发现逻辑对齐：maxdepth 2 的 .git + 可选 meta 根 */
export function discoverWorkspaceRepos(
    workspaceRoot: string,
    excludeNames: string[] = [],
): WorkspaceRepo[] {
    const extra = new Set(excludeNames);
    const repos: WorkspaceRepo[] = [];
    const seen = new Set<string>();

    const metaLabel = 'meta-root';
    if (!isExcluded(metaLabel, extra) && existsSync(join(workspaceRoot, '.git'))) {
        repos.push({ label: '.', dir: workspaceRoot });
        seen.add('.');
    }

    const findGit = execFileSync(
        'find',
        [workspaceRoot, '-maxdepth', '2', '-type', 'd', '-name', '.git'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
        .trim()
        .split('\n')
        .filter(Boolean)
        .sort();

    for (const gitdir of findGit) {
        const parent = gitdir.replace(/\/\.git$/, '');
        const label = parent === workspaceRoot ? '.' : (parent.split('/').pop() ?? parent);
        if (label === '.' && seen.has('.')) {
            continue;
        }
        if (isExcluded(label === '.' ? metaLabel : label, extra)) {
            continue;
        }
        if (!isStandaloneGitRepo(parent)) {
            continue;
        }
        const key = label;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        repos.push({ label: key, dir: parent });
    }

    return repos;
}

/** 仅独立 git 仓（含 package.json 的一级 worker 目录，供 bump 类脚本复用） */
export function discoverWorkerPackageRepos(workspaceRoot: string): string[] {
    const names: string[] = [];
    for (const name of readdirSync(workspaceRoot).sort()) {
        const dir = join(workspaceRoot, name);
        let st: Stats;
        try {
            st = statSync(dir);
        } catch {
            continue;
        }
        if (!st.isDirectory()) {
            continue;
        }
        if (!existsSync(join(dir, 'package.json'))) {
            continue;
        }
        if (!isStandaloneGitRepo(dir)) {
            continue;
        }
        names.push(name);
    }
    return names;
}
