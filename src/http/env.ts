import { readCredentials } from './credentials.js';
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

export function resolveKey1Base(): string {
    ensureDotEnvLoaded();
    const v = process.env.KEY1_BASE?.trim() || process.env.KEY1_URL?.trim();
    if (!v) {
        throw Object.assign(new Error('KEY1_BASE or KEY1_URL required'), {
            code: 'MISSING_ENV',
        });
    }
    return v.replace(/\/+$/, '');
}

/** Bot 优先 KEY1_API_TOKEN / WW_API_TOKEN；人机回退 RULES_ADMIN_TOKEN，再回退凭证文件。 */
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
    const file = readCredentials();
    if (file?.token) {
        if (file.expires_at && Date.parse(file.expires_at) <= Date.now()) {
            throw Object.assign(new Error('credentials file expired; run ww auth login'), {
                code: 'NOT_LOGGED_IN',
            });
        }
        return file.token;
    }
    throw Object.assign(
        new Error(
            'KEY1_API_TOKEN (or WW_API_TOKEN) required for bots; humans may set RULES_ADMIN_TOKEN or run ww auth login',
        ),
        { code: 'NOT_LOGGED_IN' },
    );
}
