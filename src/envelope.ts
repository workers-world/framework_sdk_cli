import {
    EXIT,
    type ExitCode,
    retryableForExit,
    type SideEffects,
    sideEffectsForExit,
} from './exit.js';

/** 进程信封（CLI Agent Spec ResponseEnvelope 子集）。stdout 唯一结构化出口。 */
export interface ProcessEnvelope<TData = unknown> {
    ok: boolean;
    data: TData | null;
    error: { code: string; message: string; details?: unknown } | null;
    warnings: string[];
    meta: {
        exit_code: ExitCode;
        command: string;
        retryable: boolean;
        side_effects: SideEffects;
        traceparent?: string;
        [key: string]: unknown;
    };
}

export function okEnvelope<TData>(
    command: string,
    data: TData,
    extras?: { warnings?: string[]; meta?: Record<string, unknown> },
): ProcessEnvelope<TData> {
    return {
        ok: true,
        data,
        error: null,
        warnings: extras?.warnings ?? [],
        meta: {
            exit_code: EXIT.OK,
            command,
            retryable: false,
            side_effects: sideEffectsForExit(EXIT.OK),
            ...extras?.meta,
        },
    };
}

export function errorEnvelope(
    command: string,
    code: ExitCode,
    error: { code: string; message: string; details?: unknown },
    opts?: { data?: unknown; warnings?: string[]; meta?: Record<string, unknown> },
): ProcessEnvelope {
    return {
        ok: false,
        data: (opts?.data ?? null) as unknown,
        error,
        warnings: opts?.warnings ?? [],
        meta: {
            exit_code: code,
            command,
            retryable: retryableForExit(code),
            side_effects: sideEffectsForExit(code),
            ...opts?.meta,
        },
    };
}

/** 缺 --confirm：exit 2 + NEED_CONFIRM，data 可含 preview */
export function needConfirmEnvelope(
    command: string,
    data: unknown,
    message = 'confirm required; re-run with --confirm after user approval',
): ProcessEnvelope {
    return errorEnvelope(command, EXIT.USAGE, { code: 'NEED_CONFIRM', message }, { data });
}

export function writeEnvelope(
    env: ProcessEnvelope,
    opts: { json: boolean; stdout?: NodeJS.WritableStream; stderr?: NodeJS.WritableStream },
): void {
    const out = opts.stdout ?? process.stdout;
    const err = opts.stderr ?? process.stderr;
    if (opts.json || !process.stdout.isTTY) {
        out.write(`${JSON.stringify(env)}\n`);
        return;
    }
    if (env.ok) {
        err.write(`${env.meta.command}: ok\n`);
        if (env.data != null) {
            out.write(`${JSON.stringify(env.data, null, 2)}\n`);
        }
        return;
    }
    err.write(
        `${env.meta.command}: ${env.error?.code ?? 'ERROR'}: ${env.error?.message ?? 'failed'}\n`,
    );
    if (env.data != null) {
        out.write(`${JSON.stringify(env.data, null, 2)}\n`);
    }
}
