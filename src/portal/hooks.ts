import type { SelfCheck } from '../check/types.js';
import type { ProcessEnvelope } from '../envelope/index.js';
import type { PortalContext } from './types.js';

export interface PortalHooks {
    prerun?: (ctx: { argv: string[]; portal: string }) => Promise<void> | void;
    postrun?: (ctx: { argv: string[]; result: ProcessEnvelope }) => Promise<void> | void;
    finally?: (ctx: { argv: string[] }) => Promise<void> | void;
}

let hooks: PortalHooks = {};
let extraChecks: SelfCheck[] = [];

export function registerPortalHooks(next: PortalHooks): void {
    hooks = { ...hooks, ...next };
}

export function clearPortalHooks(): void {
    hooks = {};
}

export function getPortalHooks(): PortalHooks {
    return hooks;
}

export function registerExtraChecks(checks: SelfCheck[]): void {
    extraChecks = [...checks];
}

export function clearExtraChecks(): void {
    extraChecks = [];
}

export function getExtraChecks(): SelfCheck[] {
    return extraChecks;
}

export type UpdateHandler = (
    argv: string[],
    ctx: PortalContext,
) => Promise<ProcessEnvelope> | ProcessEnvelope;

let updateHandler: UpdateHandler | null = null;

export function registerPortalUpdate(handler: UpdateHandler): void {
    updateHandler = handler;
}

export function clearPortalUpdate(): void {
    updateHandler = null;
}

export function getPortalUpdateHandler(): UpdateHandler | null {
    return updateHandler;
}
