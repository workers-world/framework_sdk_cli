import {
    EXIT,
    errorEnvelope,
    okEnvelope,
    type ProcessEnvelope,
    type SideEffects,
} from '../envelope/index.js';
import type { PortalContext } from '../portal/types.js';

const WT_META_BASE = { suppress_tty_status: true, retryable: false } as const;

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
        meta: { exit_code: exitCode, ...WT_META_BASE },
    });
}

export function wtErr(
    ctx: PortalContext,
    sub: string,
    exitCode: number,
    error: { code: string; message: string },
    data?: unknown,
    sideEffects?: SideEffects,
): ProcessEnvelope {
    return errorEnvelope(wtCommand(ctx, sub), exitCode as (typeof EXIT)[keyof typeof EXIT], error, {
        data,
        meta: {
            ...WT_META_BASE,
            ...(sideEffects != null ? { side_effects: sideEffects } : {}),
        },
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
