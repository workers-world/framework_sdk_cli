import { ensureDotEnvLoaded } from './load-dotenv.js';

export function requireEnv(name: string): string {
    ensureDotEnvLoaded();
    const v = process.env[name]?.trim();
    if (!v) {
        throw Object.assign(new Error(`${name} required`), { code: 'MISSING_ENV' });
    }
    return v;
}

export function resolveDeployTrackerBase(): string {
    ensureDotEnvLoaded();
    const v = process.env.DEPLOY_TRACKER_BASE?.trim() || process.env.DEPLOY_TRACKER_URL?.trim();
    if (!v) {
        throw Object.assign(new Error('DEPLOY_TRACKER_BASE or DEPLOY_TRACKER_URL required'), {
            code: 'MISSING_ENV',
        });
    }
    return v;
}

export function resolveRulesAdminToken(): string {
    return requireEnv('RULES_ADMIN_TOKEN');
}

/** Bot 优先 KEY1_API_TOKEN / WW_API_TOKEN；人机仍可回退 RULES_ADMIN_TOKEN。 */
export function resolveMachineToken(): string {
    ensureDotEnvLoaded();
    const scoped = process.env.KEY1_API_TOKEN?.trim() || process.env.WW_API_TOKEN?.trim();
    if (scoped) {
        return scoped;
    }
    const admin = process.env.RULES_ADMIN_TOKEN?.trim();
    if (admin) {
        return admin;
    }
    throw Object.assign(
        new Error(
            'KEY1_API_TOKEN (or WW_API_TOKEN) required for bots; humans may set RULES_ADMIN_TOKEN',
        ),
        { code: 'MISSING_ENV' },
    );
}
