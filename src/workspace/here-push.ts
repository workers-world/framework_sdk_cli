import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EXIT } from '../envelope/index.js';
import type { CommandHandler } from '../portal/types.js';
import type { WtPortalExtension } from './extensions.js';
import { wtErr, wtOk } from './wt-envelope.js';
import { wtWriteStderr, wtWriteStdout } from './wt-io.js';

const TRANSIENT_RETRIES = 3;
const TRANSIENT_SLEEP_BASE_MS = 2000;

function sleepMs(ms: number): void {
    const sec = Math.max(0.001, ms / 1000);
    try {
        execFileSync('sleep', [String(sec)], { stdio: 'ignore' });
    } catch {
        // ignore sleep failures; retry immediately
    }
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

function isTransientPushError(stderr: string, stdout: string): boolean {
    const text = `${stderr}\n${stdout}`;
    return (
        /\b(502|503|504)\b/.test(text) ||
        /Bad Gateway|Service Unavailable|Gateway Timeout/i.test(text)
    );
}

function pushOriginHead(repoRoot: string): {
    ok: boolean;
    stdout: string;
    stderr: string;
    attempts: number;
} {
    let last = { ok: false, stdout: '', stderr: '' };
    let attempts = 0;
    for (let i = 1; i <= TRANSIENT_RETRIES; i++) {
        attempts = i;
        last = git(['push', '-u', 'origin', 'HEAD'], repoRoot);
        if (last.ok) {
            return { ...last, attempts };
        }
        if (!isTransientPushError(last.stderr, last.stdout) || i === TRANSIENT_RETRIES) {
            return { ...last, attempts };
        }
        sleepMs(TRANSIENT_SLEEP_BASE_MS * i);
    }
    return { ...last, attempts };
}

interface PackageScripts {
    check?: boolean;
    test?: boolean;
}

function readNpmScripts(repoRoot: string): PackageScripts {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (!existsSync(pkgPath)) {
        return {};
    }
    try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
            scripts?: Record<string, string>;
        };
        const scripts = pkg.scripts ?? {};
        return {
            check: typeof scripts.check === 'string',
            test: typeof scripts.test === 'string',
        };
    } catch {
        return {};
    }
}

function runNpm(
    repoRoot: string,
    args: string[],
    inherit: boolean,
): { ok: boolean; status: number | null; stdout: string; stderr: string } {
    const r = spawnSync('npm', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
        env: process.env,
    });
    return {
        ok: r.status === 0,
        status: r.status,
        stdout: typeof r.stdout === 'string' ? r.stdout : '',
        stderr: typeof r.stderr === 'string' ? r.stderr : '',
    };
}

function parseHerePushArgv(argv: string[]): {
    dryRun: boolean;
    noTest: boolean;
    help: boolean;
} {
    let dryRun = false;
    let noTest = false;
    let help = false;
    for (const a of argv) {
        if (a === '--dry-run') {
            dryRun = true;
        } else if (a === '--no-test') {
            noTest = true;
        } else if (a === '-h' || a === '--help') {
            help = true;
        }
    }
    return { dryRun, noTest, help };
}

function helpText(): string {
    return [
        'here-push — 对 cwd 所在 git 仓 push 当前分支（无需手写分支名）',
        '',
        '默认：先跑本地检查（有则 npm run check，再 npm test），再 git push -u origin HEAD。',
        '  --dry-run    只打印将 push 的仓/分支与将跑的脚本，不执行',
        '  --no-test    跳过 check/test，直接 push',
        '  --json       进程信封输出',
        '',
        '替换日常：git push origin <dev_xx> → ww wt here-push',
        '',
        'examples:',
        '  ww wt here-push',
        '  ww wt here-push --no-test',
        '  ww wt here-push --dry-run --json',
    ].join('\n');
}

export const handleWtHerePush: CommandHandler = async (argv, ctx) => {
    const sub = 'here-push';
    const { dryRun, noTest, help } = parseHerePushArgv(argv);

    if (help) {
        wtWriteStdout(ctx, `${helpText()}\n`);
        return wtOk(ctx, sub, { help: helpText() });
    }

    const repoRoot = resolveRepoRoot(process.cwd());
    if (!repoRoot) {
        return wtErr(ctx, sub, EXIT.USAGE, {
            code: 'NOT_A_GIT_REPO',
            message: '当前目录不在 git 仓库内（cwd 向上找不到 .git）',
        });
    }

    const branch = currentBranch(repoRoot);
    if (!branch) {
        return wtErr(ctx, sub, EXIT.USAGE, {
            code: 'DETACHED_HEAD',
            message: '当前为 detached HEAD，无法自动选定分支；请先 checkout 到分支再 push',
        });
    }

    const label = path.basename(repoRoot);
    const scripts = readNpmScripts(repoRoot);
    const willCheck = !noTest && Boolean(scripts.check);
    const willTest = !noTest && Boolean(scripts.test);
    const dirty = git(['status', '--porcelain'], repoRoot).stdout !== '';

    const plan = {
        repo: label,
        root: repoRoot,
        branch,
        remote: 'origin',
        refspec: 'HEAD',
        dirty,
        runCheck: willCheck,
        runTest: willTest,
        skippedTests: noTest || (!willCheck && !willTest),
    };

    if (dryRun) {
        if (ctx.json) {
            return wtOk(ctx, sub, { dryRun: true, ...plan });
        }
        wtWriteStdout(
            ctx,
            `here-push (dry-run): ${label} → origin/${branch} (git push -u origin HEAD)\n`,
        );
        if (dirty) {
            wtWriteStderr(ctx, 'WARN: 工作区有未提交改动；push 仍只推已提交的 tip\n');
        }
        if (noTest) {
            wtWriteStdout(ctx, '  tests: skipped (--no-test)\n');
        } else if (!willCheck && !willTest) {
            wtWriteStdout(ctx, '  tests: none (no package.json check/test scripts)\n');
        } else {
            if (willCheck) {
                wtWriteStdout(ctx, '  would run: npm run check\n');
            }
            if (willTest) {
                wtWriteStdout(ctx, '  would run: npm test\n');
            }
        }
        return wtOk(ctx, sub, { dryRun: true, ...plan });
    }

    if (dirty) {
        wtWriteStderr(ctx, 'WARN: 工作区有未提交改动；push 仍只推已提交的 tip\n');
    }

    const inherit = !ctx.json;

    if (willCheck) {
        wtWriteStderr(ctx, `→ npm run check (${label})\n`);
        const check = runNpm(repoRoot, ['run', 'check'], inherit);
        if (!check.ok) {
            if (!inherit && check.stderr) {
                wtWriteStderr(ctx, check.stderr);
            }
            return wtErr(
                ctx,
                sub,
                EXIT.UNKNOWN,
                {
                    code: 'CHECK_FAILED',
                    message: `npm run check 失败 (exit ${check.status ?? 'null'})；已中止 push`,
                },
                { ...plan, phase: 'check' },
            );
        }
    }

    if (willTest) {
        wtWriteStderr(ctx, `→ npm test (${label})\n`);
        const test = runNpm(repoRoot, ['test'], inherit);
        if (!test.ok) {
            if (!inherit && test.stderr) {
                wtWriteStderr(ctx, test.stderr);
            }
            return wtErr(
                ctx,
                sub,
                EXIT.UNKNOWN,
                {
                    code: 'TEST_FAILED',
                    message: `npm test 失败 (exit ${test.status ?? 'null'})；已中止 push`,
                },
                { ...plan, phase: 'test' },
            );
        }
    }

    if (!willCheck && !willTest && !noTest) {
        wtWriteStderr(ctx, 'NOTE: 无 check/test 脚本，跳过本地检查\n');
    }

    wtWriteStderr(ctx, `→ git push -u origin HEAD (${label} @ ${branch})\n`);
    const pushed = pushOriginHead(repoRoot);
    if (!pushed.ok) {
        const detail = pushed.stderr || pushed.stdout || 'git push failed';
        wtWriteStderr(ctx, `${detail}\n`);
        const exitCode = isTransientPushError(pushed.stderr, pushed.stdout)
            ? EXIT.RETRYABLE
            : EXIT.UNKNOWN;
        return wtErr(
            ctx,
            sub,
            exitCode,
            {
                code: 'PUSH_FAILED',
                message:
                    detail.split('\n').filter(Boolean).slice(-3).join(' | ') || 'git push failed',
            },
            { ...plan, phase: 'push', attempts: pushed.attempts },
        );
    }

    if (pushed.stdout) {
        wtWriteStdout(ctx, `${pushed.stdout}\n`);
    }
    if (pushed.stderr) {
        // git often writes progress to stderr even on success
        wtWriteStderr(ctx, `${pushed.stderr}\n`);
    }

    const summary = {
        dryRun: false,
        ...plan,
        attempts: pushed.attempts,
        pushed: true,
    };
    if (!ctx.json) {
        wtWriteStdout(ctx, `OK ${label}: pushed ${branch} → origin/${branch}\n`);
    }
    return wtOk(ctx, sub, summary);
};

export const herePushExtension: WtPortalExtension = {
    id: 'here-push',
    title: '当前仓 push',
    summary: 'cwd 所在仓：当前分支自动 push（默认先 check/test）',
    examples: [
        'ww wt here-push',
        'ww wt here-push --no-test',
        'ww wt here-push --dry-run',
        'ww wt here-push --json',
    ],
    handler: handleWtHerePush,
};
