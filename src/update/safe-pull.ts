import { git } from './git-cache.js';

export interface SafePullResult {
    level: 'OK' | 'warn' | 'FAIL';
    message: string;
    pulled: boolean;
    changed: boolean;
}

export function safePull(repo: string, branch: string, env: NodeJS.ProcessEnv): SafePullResult {
    if (!git(repo, ['rev-parse', '--is-inside-work-tree'], { env }).ok) {
        return {
            level: 'warn',
            message: '不是 git 仓库，跳过 pull',
            pulled: false,
            changed: false,
        };
    }
    const cur = git(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { env });
    if (!cur.ok) {
        return {
            level: 'warn',
            message: `处于 detached HEAD，跳过 pull（需要在 ${branch} 上）`,
            pulled: false,
            changed: false,
        };
    }
    if (cur.stdout !== branch) {
        return {
            level: 'warn',
            message: `当前分支是 ${cur.stdout}，不是 ${branch}，跳过 pull`,
            pulled: false,
            changed: false,
        };
    }
    const status = git(repo, ['status', '--porcelain', '--untracked-files=no'], { env, raw: true });
    if (!status.ok) {
        return {
            level: 'warn',
            message: `git status 失败，跳过 pull：${status.stderr}`,
            pulled: false,
            changed: false,
        };
    }
    const dirtyLines = status.stdout.split('\n').filter((l) => l.length > 3);
    if (dirtyLines.length > 0) {
        const files = dirtyLines.map((l) => l.slice(3));
        const onlyLock = files.every((f) => f === 'package-lock.json');
        const hint = onlyLock
            ? '只有 package-lock.json 有改动'
            : `改动：${files.slice(0, 5).join(', ')}`;
        return {
            level: 'warn',
            message: `工作区有未提交改动，跳过 pull。${hint}`,
            pulled: false,
            changed: false,
        };
    }
    if (
        !git(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { env }).ok
    ) {
        return {
            level: 'warn',
            message: `${branch} 没有上游分支，跳过 pull`,
            pulled: false,
            changed: false,
        };
    }
    const before = git(repo, ['rev-parse', '--short', 'HEAD'], { env }).stdout;
    const pull = git(repo, ['pull', '--ff-only', '--quiet', '--no-rebase'], {
        env,
        timeout: 120_000,
    });
    if (!pull.ok) {
        return {
            level: 'warn',
            message: `git pull --ff-only 失败：${pull.stderr.split('\n')[0]}`,
            pulled: false,
            changed: false,
        };
    }
    const after = git(repo, ['rev-parse', '--short', 'HEAD'], { env }).stdout;
    const changed = before !== after;
    return {
        level: 'OK',
        message: changed ? `已更新 ${before} → ${after}` : `已是最新（${after}）`,
        pulled: true,
        changed,
    };
}
