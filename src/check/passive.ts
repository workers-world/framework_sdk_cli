import { hintLine } from '../cli/color.js';
import { runChecks } from './run.js';
import type { CheckContext, CheckRunItem, SelfCheck } from './types.js';

const SKIP_COMMANDS = new Set([
    'update',
    'install',
    'uninstall',
    'version',
    'doctor',
    '--version',
    '-v',
]);

function truthyEnv(v: string | undefined): boolean {
    return v != null && v !== '' && v !== '0' && v.toLowerCase() !== 'false';
}

export function shouldRunPassiveNotify(options: {
    argv: string[];
    env: NodeJS.ProcessEnv;
    stdout: { isTTY?: boolean };
    stderr: { isTTY?: boolean };
}): boolean {
    const { argv, env, stdout, stderr } = options;
    if (truthyEnv(env.WW_NO_UPDATE_CHECK) || truthyEnv(env.NO_UPDATE_NOTIFIER)) {
        return false;
    }
    if (truthyEnv(env.CI)) {
        return false;
    }
    if (argv.some((a) => a === '--json' || a.startsWith('--json='))) {
        return false;
    }
    if (!stdout.isTTY || !stderr.isTTY) {
        return false;
    }
    if (argv[0] && SKIP_COMMANDS.has(argv[0])) {
        return false;
    }
    return true;
}

export interface PassiveNotifyResult {
    ran: boolean;
    line?: string;
}

export async function passiveNotify(options: {
    argv: string[];
    checks: SelfCheck[];
    ctx: CheckContext;
    stdout?: NodeJS.WritableStream;
    stderr?: NodeJS.WritableStream;
    env?: NodeJS.ProcessEnv;
    budgetMs?: number;
}): Promise<PassiveNotifyResult> {
    const env = options.env ?? process.env;
    const stdout = options.stdout ?? process.stdout;
    const stderr = options.stderr ?? process.stderr;
    if (
        !shouldRunPassiveNotify({
            argv: options.argv,
            env,
            stdout: stdout as { isTTY?: boolean },
            stderr: stderr as { isTTY?: boolean },
        })
    ) {
        return { ran: false };
    }

    const localChecks = options.checks.filter((c) => c.cost === 'local');
    const networkChecks = options.checks.filter((c) => c.cost === 'network');
    const budgetMs = options.budgetMs ?? 50;

    let localItems: CheckRunItem[] = [];
    try {
        localItems = await runChecks(localChecks, options.ctx, { timeoutMs: budgetMs });
    } catch {
        return { ran: true };
    }

    let networkItems: CheckRunItem[] = [];
    if (networkChecks.length > 0) {
        try {
            networkItems = await runChecks(networkChecks, options.ctx, { timeoutMs: budgetMs });
        } catch {
            /* cache-only; skip */
        }
    }

    const items = [...localItems, ...networkItems].filter((c) => c.status === 'fail');
    if (items.length === 0) {
        return { ran: true };
    }

    const labels = items.map((c) => c.message).slice(0, 3);
    const fixCmds = [
        ...new Set(items.map((c) => c.fix?.command).filter(Boolean) as string[]),
    ].slice(0, 2);
    const fixPart = fixCmds.length > 0 ? `，运行 ${fixCmds.join(' / ')}` : '';
    const line = `ww: ${items.length} 项需要处理（${labels.join('、')}）${fixPart}\n`;
    stderr.write(hintLine(line, stderr, { json: false }));
    return { ran: true, line };
}
