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
