import { errorEnvelope, okEnvelope, type ProcessEnvelope } from './envelope.js';
import { EXIT, type ExitCode } from './exit.js';

export interface WorkerIoLike {
    id?: string;
    source?: string;
    type?: string;
    data?: unknown;
    wwerror?: { code?: string; message?: string; details?: unknown };
    wwsummary?: string;
    traceparent?: string;
}

export interface FetchBearerOptions {
    baseUrl: string;
    token: string;
    path: string;
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    fetchImpl?: typeof fetch;
}

export interface FetchBearerResult {
    status: number;
    envelope: WorkerIoLike | null;
    rawText: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === 'object' && !Array.isArray(v);
}

export function parseWorkerIo(raw: unknown): WorkerIoLike | null {
    if (!isRecord(raw)) {
        return null;
    }
    if (typeof raw.specversion === 'string' || typeof raw.type === 'string') {
        return raw as WorkerIoLike;
    }
    return null;
}

export async function fetchBearer(opts: FetchBearerOptions): Promise<FetchBearerResult> {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    const base = opts.baseUrl.replace(/\/+$/, '');
    const path = opts.path.startsWith('/') ? opts.path : `/${opts.path}`;
    const url = `${base}${path}`;
    const headers: Record<string, string> = {
        Authorization: `Bearer ${opts.token}`,
        Accept: 'application/cloudevents+json, application/json',
        ...opts.headers,
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.body);
    }
    const res = await fetchImpl(url, {
        method: opts.method ?? (body ? 'POST' : 'GET'),
        headers,
        body,
    });
    const rawText = await res.text();
    let parsed: unknown = null;
    try {
        parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
        parsed = null;
    }
    return {
        status: res.status,
        envelope: parseWorkerIo(parsed) ?? (isRecord(parsed) ? (parsed as WorkerIoLike) : null),
        rawText,
    };
}

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

export function requireEnv(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) {
        throw Object.assign(new Error(`${name} required`), { code: 'MISSING_ENV' });
    }
    return v;
}

export function resolveDeployTrackerBase(): string {
    return (
        process.env.DEPLOY_TRACKER_BASE?.trim() ||
        process.env.DEPLOY_TRACKER_URL?.trim() ||
        'https://deploy.mailworld.uk'
    );
}

export function resolveRulesAdminToken(): string {
    return requireEnv('RULES_ADMIN_TOKEN');
}
