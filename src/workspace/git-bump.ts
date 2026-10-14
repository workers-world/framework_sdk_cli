import { execFileSync } from 'node:child_process';
import { composeSquashCommitMessage, isBumpCommitSubject } from './bump-messages.js';

export interface GitRunResult {
    ok: boolean;
    stdout: string;
    stderr: string;
}

function git(args: string[], cwd: string): GitRunResult {
    try {
        const stdout = execFileSync('git', args, {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { ok: true, stdout: stdout.trim(), stderr: '' };
    } catch (e) {
        const err = e as { stdout?: string; stderr?: string; status?: number };
        return {
            ok: false,
            stdout: (err.stdout ?? '').trim(),
            stderr: (err.stderr ?? '').trim(),
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

/** commit 是否已在 upstream 历史中（含等于 upstream tip） */
export function gitCommitIsOnUpstream(dir: string, commit: string): boolean {
    const upstream = gitUpstreamRef(dir);
    if (!upstream) {
        return false;
    }
    const r = git(['merge-base', '--is-ancestor', commit, upstream], dir);
    return r.ok;
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

        if (upstream && gitCommitIsOnUpstream(dir, hash)) {
            if (commits.length === 0) {
                return { commits: [], stopReason: 'tip bump already on upstream' };
            }
            break;
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
    if (gitCommitIsOnUpstream(dir, 'HEAD')) {
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
