import { once } from 'node:events';
import { colorizeStatusLine } from '../cli/color.js';
import { stripTrailingAsciiWhitespace } from '../strings/strip-trailing-ascii-whitespace.js';
import {
    EXIT,
    type ExitCode,
    retryableForExit,
    type SideEffects,
    sideEffectsForExit,
} from './exit.js';

/** 机器可读修复提示（additive；--json 消费者可忽略未知字段）。 */
export interface ProcessErrorFix {
    kind: 'path' | 'flag' | 'rerun' | 'env';
    path?: string;
    flag?: string;
    command?: string;
    env?: string[];
}

export interface ProcessError {
    code: string;
    message: string;
    details?: unknown;
    fix?: ProcessErrorFix;
}

/** 进程信封（CLI Agent Spec ResponseEnvelope 子集）。stdout 唯一结构化出口。 */
export interface ProcessEnvelope<TData = unknown> {
    ok: boolean;
    data: TData | null;
    error: ProcessError | null;
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
    error: ProcessError,
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
    opts?: { rerun?: string },
): ProcessEnvelope {
    const rerun = (opts?.rerun ?? `${command} --confirm --json`).trim();
    const base = message.includes('--confirm --json')
        ? message
        : `${stripTrailingAsciiWhitespace(message)} Re-run: ${rerun}`;
    return errorEnvelope(
        command,
        EXIT.USAGE,
        {
            code: 'NEED_CONFIRM',
            message: base,
            fix: { kind: 'rerun', command: rerun, flag: 'confirm' },
        },
        { data },
    );
}

/** 写入并在背压时等待 drain，避免大信封经管道时被同步 exit 截断。 */
async function writeDrained(stream: NodeJS.WritableStream, chunk: string): Promise<void> {
    const flushed = stream.write(chunk);
    if (!flushed) {
        await once(stream as NodeJS.EventEmitter, 'drain');
    }
}

export async function writeEnvelope(
    env: ProcessEnvelope,
    opts: { json: boolean; stdout?: NodeJS.WritableStream; stderr?: NodeJS.WritableStream },
): Promise<void> {
    const out = opts.stdout ?? process.stdout;
    const err = opts.stderr ?? process.stderr;
    if (opts.json || !(out as NodeJS.WriteStream & { isTTY?: boolean }).isTTY) {
        await writeDrained(out, `${JSON.stringify(env)}\n`);
        return;
    }
    if (env.meta.suppress_tty_status) {
        return;
    }
    if (env.ok) {
        const okLine = colorizeStatusLine(`${env.meta.command}: ok`, err, false);
        await writeDrained(err, `${okLine}\n`);
        if (env.data != null) {
            await writeDrained(out, `${JSON.stringify(env.data, null, 2)}\n`);
        }
        return;
    }
    const errLine = colorizeStatusLine(
        `${env.meta.command}: ${env.error?.code ?? 'ERROR'}: ${env.error?.message ?? 'failed'}`,
        err,
        false,
    );
    await writeDrained(err, `${errLine}\n`);
    if (env.data != null) {
        await writeDrained(out, `${JSON.stringify(env.data, null, 2)}\n`);
    }
}
