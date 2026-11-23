import { execFileSync } from 'node:child_process';
import { composeSquashCommitMessage, isBumpCommitSubject } from './bump-messages.js';

export interface GitRunResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    /** 退出码（命令失败时；spawn 失败为 null/undefined） */
    status?: number | null;
}

function git(args: string[], cwd: string): GitRunResult {
    try {
        const stdout = execFileSync('git', args, {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { ok: true, stdout: stdout.trim(), stderr: '', status: 0 };
    } catch (e) {
        const err = e as { stdout?: string; stderr?: string; status?: number };
        return {
            ok: false,
            stdout: (err.stdout ?? '').trim(),
            stderr: (err.stderr ?? '').trim(),
            status: err.status ?? null,
        };
    }
}

export function gitIsRepo(dir: string): boolean {
    return git(['rev-parse', '--git-dir'], dir).ok;
}

export function gitWorktreeClean(dir: string): boolean {
    const r = git(['status', '--porcelain'], dir);
    return r.ok && r.stdout === '';
}

export function gitHeadSubject(dir: string): string | null {
    const r = git(['log', '-1', '--format=%s'], dir);
    if (!r.ok) {
        return null;
    }
    return r.stdout.split('\n')[0] ?? null;
}

export function gitUpstreamRef(dir: string): string | null {
    const r = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], dir);
    if (!r.ok) {
        return null;
    }
    return r.stdout.split('\n')[0] ?? null;
}

/** commit 与 upstream 的祖先关系三态：在 upstream 历史 / 不在 / 无法判定（shallow 等命令失败）。 */
export type UpstreamAncestry = 'on-upstream' | 'not-on-upstream' | 'unverifiable';

/**
 * commit 是否已在 upstream 历史中（含等于 upstream tip）。
 * 注意三态：merge-base 命令本身失败（shallow clone 缺对象、exit 128 等）返回 'unverifiable'，
 * 调用方必须保守处理（视为可能已 push，不要 rewrite）。
 */
export function gitCommitIsOnUpstream(dir: string, commit: string): UpstreamAncestry {
    const upstream = gitUpstreamRef(dir);
    if (!upstream) {
        // 无 upstream = 从未 push 过，非「无法判定」
        return 'not-on-upstream';
    }
    const r = git(['merge-base', '--is-ancestor', commit, upstream], dir);
    if (r.ok) {
        return 'on-upstream';
    }
    // exit 1 是 merge-base --is-ancestor 的正常否定（不是祖先）；其他退出码视为命令失败
    if (r.status === 1 && !r.stderr) {
        return 'not-on-upstream';
    }
    return 'unverifiable';
}

export function gitAheadCount(dir: string): number {
    const upstream = gitUpstreamRef(dir);
    if (!upstream) {
        const r = git(['rev-list', '--count', 'HEAD'], dir);
        return r.ok ? Number.parseInt(r.stdout, 10) || 0 : 0;
    }
    const r = git(['rev-list', '--count', `${upstream}..HEAD`], dir);
    if (!r.ok) {
        return 0;
    }
    return Number.parseInt(r.stdout, 10) || 0;
}

export function gitIsMergeCommit(dir: string, commit: string): boolean {
    const r = git(['rev-parse', '--verify', `${commit}^2`], dir);
    return r.ok;
}

export interface BumpCommitInfo {
    hash: string;
    subject: string;
}

/** 从 HEAD 向下连续 bump commit（遇 merge / 非 bump / 已在 upstream 上则停） */
export function collectUnpushedBumpChainFromHead(dir: string): {
    commits: BumpCommitInfo[];
    stopReason?: string;
} {
    const upstream = gitUpstreamRef(dir);
    const log = git(['log', '--format=%H %s', '-n', '50'], dir);
    if (!log.ok) {
        return { commits: [], stopReason: 'not a git repo or empty history' };
    }

    const commits: BumpCommitInfo[] = [];
    for (const line of log.stdout.split('\n')) {
        if (!line.trim()) {
            continue;
        }
        const sp = line.indexOf(' ');
        if (sp <= 0) {
            break;
        }
        const hash = line.slice(0, sp);
        const subject = line.slice(sp + 1);

        if (gitIsMergeCommit(dir, hash)) {
            if (commits.length === 0) {
                return { commits: [], stopReason: 'HEAD is merge commit' };
            }
            break;
        }

        if (upstream) {
            const ancestry = gitCommitIsOnUpstream(dir, hash);
            if (ancestry === 'on-upstream') {
                if (commits.length === 0) {
                    return { commits: [], stopReason: 'tip bump already on upstream' };
                }
                break;
            }
            if (ancestry === 'unverifiable') {
                // 无法判定（如 shallow clone 缺对象）：保守停链，绝不 rewrite 可能已 push 的 commit；
                // 已收集的 commits 均逐一验证过不在 upstream，重写它们是安全的。
                const stopReason = 'unverifiable (shallow/unreachable merge-base)';
                return { commits, stopReason };
            }
        }

        if (!isBumpCommitSubject(subject)) {
            if (commits.length === 0) {
                return { commits: [], stopReason: 'tip is not bump commit' };
            }
            break;
        }

        commits.push({ hash, subject });
    }

    return { commits };
}

export function headIsUnpushedBumpTip(dir: string): boolean {
    const subject = gitHeadSubject(dir);
    if (!subject || !isBumpCommitSubject(subject)) {
        return false;
    }
    if (gitCommitIsOnUpstream(dir, 'HEAD') !== 'not-on-upstream') {
        // on-upstream 或 unverifiable（shallow 等无法判定）→ 保守视为已 push
        return false;
    }
    return gitAheadCount(dir) > 0 || !gitUpstreamRef(dir);
}

export interface SquashPlan {
    repoLabel: string;
    commits: BumpCommitInfo[];
    message: string;
}

export function planSquashForRepo(
    dir: string,
    repoLabel: string,
): { plan: SquashPlan | null; skipReason?: string } {
    if (!gitIsRepo(dir)) {
        return { plan: null, skipReason: 'not a git repository' };
    }
    if (!gitWorktreeClean(dir)) {
        return { plan: null, skipReason: 'dirty worktree' };
    }

    const { commits, stopReason } = collectUnpushedBumpChainFromHead(dir);
    if (commits.length < 2) {
        return {
            plan: null,
            skipReason:
                commits.length === 0
                    ? (stopReason ?? 'no unpushed bump chain')
                    : 'only one unpushed bump commit',
        };
    }

    const message = composeSquashCommitMessage(commits.map((c) => c.subject));
    return { plan: { repoLabel, commits, message } };
}

export function applySquashPlan(dir: string, plan: SquashPlan): GitRunResult {
    const oldest = plan.commits.at(-1)?.hash;
    if (!oldest) {
        return { ok: false, stdout: '', stderr: 'empty squash plan' };
    }
    const parent = git(['rev-parse', `${oldest}^`], dir);
    if (!parent.ok) {
        return parent;
    }
    const reset = git(['reset', '--soft', parent.stdout], dir);
    if (!reset.ok) {
        return reset;
    }
    return git(['commit', '-m', plan.message], dir);
}
