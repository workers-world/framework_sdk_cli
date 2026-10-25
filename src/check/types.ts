export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface CheckFix {
    command: string;
    sideEffects: 'none' | 'local' | 'remote';
}

export interface CheckResult {
    status: CheckStatus;
    message: string;
    fix?: CheckFix;
    details?: unknown;
}

export interface CheckContext {
    portalRoot?: string;
    env: NodeJS.ProcessEnv;
    json: boolean;
}

export interface SelfCheck {
    id: string;
    title: string;
    cost: 'local' | 'network';
    run: (ctx: CheckContext) => CheckResult | Promise<CheckResult>;
}

export interface CheckRunItem {
    id: string;
    title: string;
    status: CheckStatus;
    message: string;
    fix?: CheckFix;
    details?: unknown;
    crashed?: boolean;
}
