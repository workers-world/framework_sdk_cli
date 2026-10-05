import { chmodSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type WwCredentialsFile = {
    credential_id: string;
    token: string;
    prefix: string;
    principal: string;
    scopes: string[];
    issued_at: string;
    expires_at: string | null;
    key1_base: string;
};

export function resolveWwConfigDir(env: NodeJS.ProcessEnv = process.env): string {
    const override = env.WW_CONFIG_DIR?.trim();
    if (override) {
        return override;
    }
    const xdg = env.XDG_CONFIG_HOME?.trim();
    if (xdg) {
        return join(xdg, 'ww');
    }
    return join(homedir(), '.config', 'ww');
}

export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
    return join(resolveWwConfigDir(env), 'credentials.json');
}

export function readCredentials(env: NodeJS.ProcessEnv = process.env): WwCredentialsFile | null {
    const p = credentialsPath(env);
    try {
        const raw = readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw) as WwCredentialsFile;
        if (!parsed || typeof parsed.token !== 'string' || !parsed.token) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function writeCredentials(
    file: WwCredentialsFile,
    env: NodeJS.ProcessEnv = process.env,
): string {
    const p = credentialsPath(env);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    try {
        chmodSync(p, 0o600);
    } catch {
        /* windows */
    }
    return p;
}

export function deleteCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
    const p = credentialsPath(env);
    try {
        unlinkSync(p);
        return true;
    } catch {
        return false;
    }
}
