import { stripTrailingSlashes } from '../strings/strip-trailing-slashes.js';

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
    /** 请求超时毫秒数；默认 30_000（fetch 默认无超时，Worker 慢响应会把 CLI 挂死） */
    timeoutMs?: number;
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
    const base = stripTrailingSlashes(opts.baseUrl);
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
    // AbortSignal.timeout：超时由浏览器/Node 原生中断（默认 30s；timeoutMs 覆盖）
    const signal = AbortSignal.timeout(opts.timeoutMs ?? 30_000);
    const res = await fetchImpl(url, {
        method: opts.method ?? (body ? 'POST' : 'GET'),
        headers,
        body,
        signal,
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
