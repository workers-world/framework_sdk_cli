import { EXIT, errorEnvelope, okEnvelope, type ProcessEnvelope } from '../envelope/index.js';
import type { PortalContext } from '../portal/types.js';

const WT_META = { suppress_tty_status: true } as const;

export function wtCommand(ctx: PortalContext, sub: string): string {
    return `${ctx.portal} wt${sub ? ` ${sub}` : ''}`;
}

export function wtOk<T>(
    ctx: PortalContext,
    sub: string,
    data: T,
    exitCode = EXIT.OK,
): ProcessEnvelope<T> {
    return okEnvelope(wtCommand(ctx, sub), data, {
        meta: { exit_code: exitCode, ...WT_META },
    });
}

export function wtErr(
    ctx: PortalContext,
    sub: string,
    exitCode: number,
    error: { code: string; message: string },
    data?: unknown,
): ProcessEnvelope {
    return errorEnvelope(wtCommand(ctx, sub), exitCode as (typeof EXIT)[keyof typeof EXIT], error, {
        data,
        meta: WT_META,
    });
}

export function runJsonData(
    id: string,
    exitCode: number,
    argv: string[],
    skip: string[],
    extra?: { signal?: string; error?: string },
): Record<string, unknown> {
    return {
        ok: exitCode === 0,
        id,
        exitCode,
        argv,
        skip,
        ...extra,
    };
}
