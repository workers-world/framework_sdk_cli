import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { EXIT } from '../envelope/index.js';
import type { CommandHandler, PortalContext } from '../portal/types.js';
import { workspaceExtraRootStarts } from './config.js';
import { discoverWorkspaceRepos } from './discover-repos.js';
import type { WtPortalExtension } from './extensions.js';
import { requireWorkspaceRoot } from './root.js';
import { wtErr, wtOk } from './wt-envelope.js';
import { wtWriteStderr, wtWriteStdout } from './wt-io.js';

const MAX_UNPUSHED_SUBJECTS = 5;

function rootOpts() {
    return { extraStarts: workspaceExtraRootStarts() };
}

function git(args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string } {
    try {
        const stdout = execFileSync('git', args, {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { ok: true, stdout: stdout.trim(), stderr: '' };
    } catch (e) {
        const err = e as { stdout?: string; stderr?: string };
        return {
            ok: false,
            stdout: (err.stdout ?? '').trim(),
            stderr: (err.stderr ?? '').trim(),
        };
    }
}

function resolveRepoRoot(cwd: string): string | null {
    const r = git(['rev-parse', '--show-toplevel'], cwd);
    if (!r.ok || !r.stdout) {
        return null;
    }
    return r.stdout;
}

function currentBranch(repoRoot: string): string | null {
    const r = git(['branch', '--show-current'], repoRoot);
    if (!r.ok || !r.stdout) {
        return null;
    }
    return r.stdout;
}

interface BranchSync {
    branch: string;
    /** 跟踪的远端分支（origin/xxx）；无 upstream 且本地也找不到 origin/<branch> 时为 null */
    upstream: string | null;
    /** pseudo=true 表示无 upstream 但本地有 origin/<branch>，用它近似 */
    pseudoUpstream: boolean;
    /** ahead/behind 未知（无任何远端参照）时为 null */
    ahead: number | null;
    behind: number | null;
    unpushedSubjects: string[];
}

/** 分支的远端参照：优先 @{u}，退回 origin/<branch>（未跟踪但远端存在）。 */
function upstreamRef(repoRoot: string, branch: string): { ref: string; pseudo: boolean } | null {
    const tracked = git(
        ['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{u}`],
        repoRoot,
    );
    if (tracked.ok && tracked.stdout) {
        return { ref: tracked.stdout, pseudo: false };
    }
    const pseudo = git(['rev-parse', '--verify', '--quiet', `origin/${branch}`], repoRoot);
    if (pseudo.ok && pseudo.stdout) {
        return { ref: `origin/${branch}`, pseudo: true };
    }
    return null;
}

function inspectBranch(repoRoot: string, branch: string): BranchSync {
    const sync: BranchSync = {
        branch,
        upstream: null,
        pseudoUpstream: false,
        ahead: null,
        behind: null,
        unpushedSubjects: [],
    };
    const upstream = upstreamRef(repoRoot, branch);
    if (!upstream) {
        return sync;
    }
    sync.upstream = upstream.ref;
    sync.pseudoUpstream = upstream.pseudo;
    const count = git(
        ['rev-list', '--left-right', '--count', `${branch}...${upstream.ref}`],
        repoRoot,
    );
    if (count.ok) {
        const [left, right] = count.stdout.split(/\s+/);
        sync.ahead = Number(left) || 0;
        sync.behind = Number(right) || 0;
    }
    if (sync.ahead && sync.ahead > 0) {
        const log = git(
            ['log', '--format=%s', `-n${MAX_UNPUSHED_SUBJECTS}`, `${upstream.ref}..${branch}`],
            repoRoot,
        );
        if (log.ok && log.stdout) {
            sync.unpushedSubjects = log.stdout.split('\n').filter(Boolean);
        }
    }
    return sync;
}

/** @{-1}：切换到当前分支前所在的分支（"前一分支"）；非本地分支/无切换历史时为 null。 */
function previousBranch(repoRoot: string): string | null {
    const r = git(['rev-parse', '--symbolic-full-name', '--quiet', '@{-1}'], repoRoot);
    if (!r.ok || !r.stdout.startsWith('refs/heads/')) {
        return null;
    }
    return r.stdout.replace(/^refs\/heads\//, '');
}

interface RepoSync {
    repo: string;
    root: string;
    dirtyCount: number;
    branch: BranchSync | null;
    prev: BranchSync | null;
    issues: string[];
    synced: boolean;
}

const ISSUE_LABELS: Record<string, string> = {
    dirty: '未提交改动',
    ahead: '未推送 commit',
    behind: '落后远端',
    no_upstream: '无远端参照',
    prev_ahead: '前一分支未推送 commit',
    prev_behind: '前一分支落后远端',
    prev_no_upstream: '前一分支无远端参照',
};

function issueLabel(issue: string): string {
    return ISSUE_LABELS[issue] ?? issue;
}

function inspectRepo(dir: string, label: string): RepoSync {
    const repo: RepoSync = {
        repo: label,
        root: dir,
        dirtyCount: 0,
        branch: null,
        prev: null,
        issues: [],
        synced: false,
    };
    const status = git(['status', '--porcelain'], dir);
    repo.dirtyCount =
        status.ok && status.stdout ? status.stdout.split('\n').filter(Boolean).length : 0;

    const branch = currentBranch(dir);
    if (branch) {
        repo.branch = inspectBranch(dir, branch);
        if (!repo.branch.upstream) {
            repo.issues.push('no_upstream');
        } else {
            if ((repo.branch.ahead ?? 0) > 0) {
                repo.issues.push('ahead');
            }
            if ((repo.branch.behind ?? 0) > 0) {
                repo.issues.push('behind');
            }
        }
    }

    const prevName = previousBranch(dir);
    if (prevName && prevName !== branch) {
        const prev = inspectBranch(dir, prevName);
        repo.prev = prev;
        if (!prev.upstream) {
            repo.issues.push('prev_no_upstream');
        } else {
            if ((prev.ahead ?? 0) > 0) {
                repo.issues.push('prev_ahead');
            }
            if ((prev.behind ?? 0) > 0) {
                repo.issues.push('prev_behind');
            }
        }
    }

    if (repo.dirtyCount > 0) {
        repo.issues.push('dirty');
    }
    repo.synced = repo.issues.length === 0;
    return repo;
}

function fetchRepo(dir: string): boolean {
    return git(['fetch', '--quiet', 'origin'], dir).ok;
}

function parseSyncArgv(argv: string[]): {
    here: boolean;
    fetch: boolean;
    gate: boolean;
    exclude: string[];
    help: boolean;
} {
    let here = false;
    let fetch = false;
    let gate = false;
    let help = false;
    const exclude: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--here') {
            here = true;
        } else if (a === '--fetch') {
            fetch = true;
        } else if (a === '--gate') {
            gate = true;
        } else if (a === '--exclude' && argv[i + 1]) {
            i += 1;
            exclude.push(argv[i] ?? '');
        } else if (a === '-h' || a === '--help') {
            help = true;
        }
    }
    return { here, fetch, gate, exclude, help };
}

function helpText(): string {
    return [
        'sync — 检查各仓是否已与远程同步（只读，不 push / 不改 remote）',
        '',
        '默认扫 workspace 各仓：当前分支 + 前一分支（@{-1}）的 ahead/behind/未推送 commit、',
        '工作区未提交改动、无远端参照的本地分支。开新版本前跑一次，绿色再继续。',
        '要推未同步的仓：单仓 ww wt here-push，批量 ww wt push。',
        '',
        '  --here          只查 cwd 所在仓',
        '  --fetch          先 fetch origin 再比对（默认用上次 fetch 的本地状态，快）',
        '  --exclude name   排除目录（可重复）',
        '  --gate           有未同步项时 exit 非 0（可当开新版本前的硬闸）',
        '',
        'examples:',
        '  ww wt sync',
        '  ww wt sync --here',
        '  ww wt sync --gate --fetch --json',
    ].join('\n');
}

function printBranchLine(
    ctx: PortalContext,
    tag: string,
    name: string,
    b: BranchSync | null,
): void {
    if (!b) {
        return;
    }
    const parts: string[] = [];
    if (!b.upstream) {
        parts.push('无远端参照');
    } else {
        if ((b.ahead ?? 0) > 0) {
            parts.push(`ahead ${b.ahead}`);
        }
        if ((b.behind ?? 0) > 0) {
            parts.push(`behind ${b.behind}`);
        }
        if (parts.length === 0) {
            parts.push(`= ${b.upstream}`);
        } else {
            parts.push(`vs ${b.upstream}${b.pseudoUpstream ? '（未跟踪，近似）' : ''}`);
        }
    }
    wtWriteStdout(ctx, `  ${tag} ${name}: ${parts.join(', ')}\n`);
    for (const subject of b.unpushedSubjects) {
        wtWriteStdout(ctx, `    ↑ ${subject}\n`);
    }
}

function printRepoLine(ctx: PortalContext, r: RepoSync): void {
    const status = r.synced ? 'OK  ' : 'WARN';
    const branch = r.branch?.branch ?? '(detached)';
    const dirty = r.dirtyCount > 0 ? ` 脏${r.dirtyCount}` : '';
    const issues = r.issues.map(issueLabel).join('、');
    wtWriteStdout(ctx, `${status} ${r.repo}  ${branch}${dirty}${issues ? `（${issues}）` : ''}\n`);
    printBranchLine(ctx, '当前', branch, r.branch);
    if (r.prev) {
        printBranchLine(ctx, '前一', r.prev.branch, r.prev);
    }
}

export const handleWtSync: CommandHandler = async (argv, ctx) => {
    const sub = 'sync';
    const { here, fetch, gate, exclude, help } = parseSyncArgv(argv);

    if (help) {
        wtWriteStdout(ctx, `${helpText()}\n`);
        return wtOk(ctx, sub, { help: helpText() });
    }

    let repos: Array<{ label: string; dir: string }>;
    if (here) {
        const repoRoot = resolveRepoRoot(process.cwd());
        if (!repoRoot) {
            return wtErr(ctx, sub, EXIT.USAGE, {
                code: 'NOT_A_GIT_REPO',
                message: '当前目录不在 git 仓库内（cwd 向上找不到 .git）',
            });
        }
        repos = [{ label: path.basename(repoRoot), dir: repoRoot }];
    } else {
        let root: string;
        try {
            root = requireWorkspaceRoot(rootOpts());
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return wtErr(ctx, sub, EXIT.UNKNOWN, { code: 'NO_WORKSPACE_ROOT', message });
        }
        repos = discoverWorkspaceRepos(root, exclude);
        if (exclude.length > 0) {
            const excluded = new Set(exclude);
            repos = repos.filter((r) => !excluded.has(r.label));
        }
    }

    const results: RepoSync[] = [];
    for (const { label, dir } of repos) {
        if (fetch) {
            fetchRepo(dir);
        }
        results.push(inspectRepo(dir, label));
    }

    const unsynced = results.filter((r) => !r.synced);
    const summary = {
        here,
        fetched: fetch,
        gate,
        total: results.length,
        synced: results.length - unsynced.length,
        unsynced: unsynced.length,
    };

    if (!ctx.json) {
        for (const r of results) {
            printRepoLine(ctx, r);
        }
        if (unsynced.length === 0) {
            wtWriteStdout(ctx, `sync: ${summary.total}/${summary.total} 仓已同步\n`);
        } else {
            const names = unsynced.map((r) => r.repo).join(' ');
            wtWriteStdout(
                ctx,
                `sync: ${summary.synced}/${summary.total} 已同步，未同步 ${unsynced.length}：${names}\n`,
            );
            wtWriteStderr(ctx, 'NOTE: 推送走 ww wt here-push（单仓）或 ww wt push（批量）\n');
        }
    }

    if (gate && unsynced.length > 0) {
        const names = unsynced.map((r) => r.repo).join(' ');
        return wtErr(
            ctx,
            sub,
            EXIT.UNKNOWN,
            { code: 'UNSYNCED', message: `未同步仓：${names}` },
            { ...summary, repos: results },
        );
    }
    return wtOk(ctx, sub, { ...summary, repos: results });
};

export const syncExtension: WtPortalExtension = {
    id: 'sync',
    title: '同步体检',
    summary: '只读检查各仓当前/前一分支与远程的同步状态（ahead/behind/脏区）',
    examples: [
        'ww wt sync',
        'ww wt sync --here',
        'ww wt sync --gate --json',
        'ww wt sync --fetch --exclude cloudflare-docs',
    ],
    handler: handleWtSync,
};
