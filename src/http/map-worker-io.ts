import {
    EXIT,
    type ExitCode,
    errorEnvelope,
    okEnvelope,
    type ProcessEnvelope,
} from '../envelope/index.js';
import type { FetchBearerResult } from './bearer.js';

function mapHttpStatusToExit(status: number): ExitCode {
    if (status === 401 || status === 403) {
        return EXIT.AUTH;
    }
    if (status >= 500) {
        return EXIT.RETRYABLE;
    }
    if (status >= 400) {
        return EXIT.CONFLICT;
    }
    return EXIT.UNKNOWN;
}

/**
 * 将 HTTP + WorkerIoEnvelope 映射为进程信封。
 * ok ← 无 wwerror 且 HTTP 2xx；data ← 网络 data；血缘 traceparent → meta。
 */
export function mapWorkerIoToProcess(
    command: string,
    result: FetchBearerResult,
    opts?: {
        /** 若 HTTP 400 且 type 匹配，当作 NEED_CONFIRM（exit 2） */
        previewType?: string;
        forceExit?: ExitCode;
    },
): ProcessEnvelope {
    const env = result.envelope;
    const data = env?.data ?? null;
    const traceparent = typeof env?.traceparent === 'string' ? env.traceparent : undefined;

    if (
        opts?.previewType &&
        result.status === 400 &&
        env?.type === opts.previewType &&
        !env.wwerror
    ) {
        return errorEnvelope(
            command,
            EXIT.USAGE,
            {
                code: 'NEED_CONFIRM',
                message: env.wwsummary ?? 'confirm required',
            },
            { data, meta: { traceparent, worker_type: env.type } },
        );
    }

    if (result.status >= 200 && result.status < 300 && env && !env.wwerror) {
        return okEnvelope(command, data, {
            meta: { traceparent, worker_type: env.type },
        });
    }

    const code = opts?.forceExit ?? mapHttpStatusToExit(result.status);
    const errCode = env?.wwerror?.code ?? (result.status === 401 ? 'UNAUTHORIZED' : 'HTTP_ERROR');
    const message =
        env?.wwerror?.message ??
        env?.wwsummary ??
        (result.rawText ? result.rawText.slice(0, 200) : `HTTP ${result.status}`);
    return errorEnvelope(
        command,
        code,
        { code: errCode, message, details: env?.wwerror?.details },
        { data, meta: { traceparent, http_status: result.status, worker_type: env?.type } },
    );
}
