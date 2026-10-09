import { EXIT } from '../envelope/index.js';
import type { CommandHandler, PortalContext } from '../portal/types.js';
import { workspaceExtraRootStarts } from './config.js';
import { discoverWorkspaceRepos } from './discover-repos.js';
import type { WtPortalExtension } from './extensions.js';
import { applySquashPlan, planSquashForRepo } from './git-bump.js';
import { requireWorkspaceRoot, resolveWorkspaceRoot } from './root.js';
import { wtErr, wtOk } from './wt-envelope.js';
import { wtWriteStderr, wtWriteStdout } from './wt-io.js';

function rootOpts() {
    return { extraStarts: workspaceExtraRootStarts() };
}

function parseSquashArgv(argv: string[]): { apply: boolean; exclude: string[]; help: boolean } {
    let apply = false;
    let help = false;
    const exclude: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') {
            apply = true;
        } else if (a === '--dry-run') {
            apply = false;
        } else if (a === '--exclude' && argv[i + 1]) {
            i += 1;
            exclude.push(argv[i] ?? '');
        } else if (a === '-h' || a === '--help') {
            help = true;
        }
    }
    return { apply, exclude, help };
}

function helpText(): string {
    return [
        'squash-bumps — 压缩 workspace 各仓 tip 上未 push 的连续 bump commit',
        '',
        '默认 --dry-run：只列出可压缩的仓与 commit 主题，不改写历史。',
        '  --apply          执行 git reset --soft 压成 1 条（不 force-push）',
        '  --exclude name   排除目录（可重复）',
        '',
        '硬闸：仅未 push tip；遇 merge / 非 bump / 业务 commit / 脏工作区则跳过该仓。',
        'Bump 白名单：chore(deps): bump …、chore(ci): bump worker-actions …、',
        '  未 push 的「CI action 自动刷新 package-lock…」。',
        '',
        'examples:',
        '  ww wt squash-bumps',
        '  ww wt squash-bumps --apply',
        '  ww wt squash-bumps --exclude graft --json',
    ].join('\n');
}

export const handleWtSquashBumps: CommandHandler = async (argv, ctx) => {
    const sub = 'squash-bumps';
    const { apply, exclude, help } = parseSquashArgv(argv);

    if (help) {
        wtWriteStdout(ctx, `${helpText()}\n`);
        return wtOk(ctx, sub, { help: helpText() });
    }

    let root: string;
    try {
        root = requireWorkspaceRoot(rootOpts());
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return wtErr(ctx, sub, EXIT.UNKNOWN, { code: 'NO_WORKSPACE_ROOT', message });
    }

    const repos = discoverWorkspaceRepos(root, exclude);
    const results: Array<{
        repo: string;
        action: 'squash' | 'skip';
        commits?: string[];
        message?: string;
        reason?: string;
    }> = [];

    let squashed = 0;
    let skipped = 0;

    for (const { label, dir } of repos) {
        const { plan, skipReason } = planSquashForRepo(dir, label);
        if (!plan) {
            skipped += 1;
            results.push({ repo: label, action: 'skip', reason: skipReason });
            continue;
        }

        if (!apply) {
            squashed += 1;
            results.push({
                repo: label,
                action: 'squash',
                commits: plan.commits.map((c) => c.subject),
                message: plan.message,
            });
            continue;
        }

        const applied = applySquashPlan(dir, plan);
        if (!applied.ok) {
            skipped += 1;
            results.push({
                repo: label,
                action: 'skip',
                reason: applied.stderr || applied.stdout || 'git rewrite failed',
            });
            wtWriteStderr(
                ctx,
                `FAIL ${label}: ${applied.stderr || applied.stdout || 'git rewrite failed'}\n`,
            );
            continue;
        }

        squashed += 1;
        results.push({
            repo: label,
            action: 'squash',
            commits: plan.commits.map((c) => c.subject),
            message: plan.message,
        });
        wtWriteStdout(ctx, `OK ${label}: squashed ${plan.commits.length} → ${plan.message}\n`);
    }

    const summary = {
        dryRun: !apply,
        repos: repos.length,
        wouldSquash: results.filter((r) => r.action === 'squash').length,
        skipped,
        results,
    };

    if (ctx.json) {
        return wtOk(ctx, sub, summary);
    }

    if (!apply) {
        wtWriteStdout(ctx, `squash-bumps (dry-run): ${repos.length} repo(s) scanned\n`);
        for (const r of results) {
            if (r.action === 'squash') {
                wtWriteStdout(
                    ctx,
                    `  WOULD ${r.repo}: ${r.commits?.length ?? 0} commit(s) → ${r.message}\n`,
                );
                for (const s of r.commits ?? []) {
                    wtWriteStdout(ctx, `    - ${s}\n`);
                }
            } else {
                wtWriteStdout(ctx, `  SKIP ${r.repo}: ${r.reason}\n`);
            }
        }
    } else {
        wtWriteStdout(ctx, `squash-bumps: applied ${squashed} repo(s), skipped ${skipped}\n`);
    }

    return wtOk(ctx, sub, summary);
};

export const squashBumpsExtension: WtPortalExtension = {
    id: 'squash-bumps',
    title: '压缩 bump commit',
    summary: '未 push tip 上连续 bump commit 压成 1 条（默认 dry-run）',
    examples: ['ww wt squash-bumps', 'ww wt squash-bumps --apply', 'ww wt squash-bumps --json'],
    handler: handleWtSquashBumps,
};

/** 供 register 校验 workspace 根是否存在（list 时标记 MISSING 不适用 portal） */
export function squashBumpsAvailable(_ctx: PortalContext): boolean {
    return Boolean(resolveWorkspaceRoot(rootOpts()));
}
