import {
    EXIT,
    type ExitCode,
    errorEnvelope,
    okEnvelope,
    type ProcessEnvelope,
} from '../envelope/index.js';
import type { FetchBearerResult } from './bearer.js';

function hostIsCloudflareAccess(hostname: string): boolean {
    const host = hostname.toLowerCase();
    return host === 'cloudflareaccess.com' || host.endsWith('.cloudflareaccess.com');
}

/** True when text contains an absolute URL whose host is Cloudflare Access (not a path substring). */
function authorityHost(authorityPart: string): string {
    const authority = authorityPart.split('@').pop() ?? '';
    return authority.split(':')[0] ?? '';
}

function sampleReferencesCloudflareAccessHost(text: string): boolean {
    const urlRe = /https?:\/\/([^/?#\s]+)/gi;
    for (const match of text.matchAll(urlRe)) {
        if (hostIsCloudflareAccess(authorityHost(match[1]))) {
            return true;
        }
    }
    const schemeRelativeRe = /\/\/([^/?#\s]+)/g;
    for (const match of text.matchAll(schemeRelativeRe)) {
        if (hostIsCloudflareAccess(authorityHost(match[1]))) {
            return true;
        }
    }
    return false;
}

function looksLikeHtml(text: string): boolean {
    const sample = String(text ?? '')
        .trim()
        .slice(0, 800)
        .toLowerCase();
    if (!sample) {
        return false;
    }
    return (
        sample.startsWith('<!doctype') ||
        sample.startsWith('<html') ||
        sample.includes('<html') ||
        sampleReferencesCloudflareAccessHost(sample) ||
        sample.includes('cf-access-login')
    );
}

function safeMessageFromRaw(rawText: string | undefined, status: number): string {
    if (!rawText || !looksLikeHtml(rawText)) {
        return rawText ? rawText.slice(0, 200) : `HTTP ${status}`;
    }
    return `HTTP ${status} (non-JSON body omitted)`;
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
    const wwMsg = env?.wwerror?.message ?? env?.wwsummary;
    const message =
        typeof wwMsg === 'string' && wwMsg.trim() && !looksLikeHtml(wwMsg)
            ? wwMsg
            : safeMessageFromRaw(result.rawText, result.status);
    return errorEnvelope(
        command,
        code,
        { code: errCode, message, details: env?.wwerror?.details },
        { data, meta: { traceparent, http_status: result.status, worker_type: env?.type } },
    );
}
