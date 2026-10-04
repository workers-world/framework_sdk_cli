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
