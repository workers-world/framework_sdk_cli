import {
    EXIT,
    type ExitCode,
    errorEnvelope,
    okEnvelope,
    type ProcessEnvelope,
} from '../envelope/index.js';
import type { PortalContext } from '../portal/types.js';
import { safePull } from './safe-pull.js';

export interface RunSelfUpdateStep {
    level: 'OK' | 'warn' | 'FAIL';
    message: string;
}

export interface RunSelfUpdateOptions {
    argv: string[];
    repos: Array<{ label: string; path: string; branch: string }>;
    env?: NodeJS.ProcessEnv;
    skipPull?: boolean;
}

export function runSelfUpdateSourceMode(options: RunSelfUpdateOptions): {
    steps: RunSelfUpdateStep[];
    exitCode: ExitCode;
} {
    const env = options.env ?? process.env;
    const steps: RunSelfUpdateStep[] = [];
    if (!options.skipPull) {
        for (const repo of options.repos) {
            const r = safePull(repo.path, repo.branch, env);
            steps.push({
                level: r.level === 'FAIL' ? 'FAIL' : r.level,
                message: `${repo.label}: ${r.message}`,
            });
        }
    }
    const fail = steps.some((s) => s.level === 'FAIL');
    return { steps, exitCode: fail ? EXIT.UNKNOWN : EXIT.OK };
}

export function envelopeFromSelfUpdate(
    portal: string,
    steps: RunSelfUpdateStep[],
    exitCode: ExitCode,
): ProcessEnvelope {
    if (exitCode === EXIT.OK) {
        return okEnvelope(`${portal} update`, { steps });
    }
    return errorEnvelope(
        `${portal} update`,
        exitCode,
        { code: 'UPDATE_FAILED', message: 'update had failures' },
        { data: { steps } },
    );
}

export function runPortalUpdateJson(
    portal: string,
    argv: string[],
    _ctx: PortalContext,
    run: (argv: string[]) => Promise<{ steps: RunSelfUpdateStep[]; exitCode: ExitCode }>,
): Promise<ProcessEnvelope> {
    if (argv.some((a) => a === '--help' || a === '-h')) {
        return Promise.resolve(
            okEnvelope(`${portal} update`, {
                help: 'usage: ww update [--no-pull] [--json]',
            }),
        );
    }
    const unknown = argv.filter(
        (a) => a !== '--no-pull' && a !== '--json' && !a.startsWith('--json='),
    );
    if (unknown.length > 0) {
        return Promise.resolve(
            errorEnvelope(`${portal} update`, EXIT.USAGE, {
                code: 'USAGE',
                message: `unknown arguments: ${unknown.join(' ')}`,
            }),
        );
    }
    return run(argv).then(({ steps, exitCode }) => envelopeFromSelfUpdate(portal, steps, exitCode));
}
