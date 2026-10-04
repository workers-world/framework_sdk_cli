import { afterEach, describe, expect, it } from 'vitest';
import { resolveDeployTrackerBase, resolveMachineToken } from '../../src/http/env.js';
import { resetDotEnvLoadedForTests } from '../../src/http/load-dotenv.js';

describe('resolveDeployTrackerBase', () => {
    afterEach(() => {
        delete process.env.DEPLOY_TRACKER_BASE;
        delete process.env.DEPLOY_TRACKER_URL;
        resetDotEnvLoadedForTests();
    });

    it('returns DEPLOY_TRACKER_BASE when set', () => {
        process.env.DEPLOY_TRACKER_BASE = ' https://tracker.example/ ';
        expect(resolveDeployTrackerBase()).toBe('https://tracker.example/');
    });

    it('falls back to DEPLOY_TRACKER_URL', () => {
        process.env.DEPLOY_TRACKER_URL = 'https://tracker.preview';
        expect(resolveDeployTrackerBase()).toBe('https://tracker.preview');
    });

    it('prefers DEPLOY_TRACKER_BASE over DEPLOY_TRACKER_URL', () => {
        process.env.DEPLOY_TRACKER_BASE = 'https://primary.example';
        process.env.DEPLOY_TRACKER_URL = 'https://secondary.example';
        expect(resolveDeployTrackerBase()).toBe('https://primary.example');
    });

    it('throws MISSING_ENV when neither is set', () => {
        expect(() => resolveDeployTrackerBase()).toThrowError(
            /DEPLOY_TRACKER_BASE or DEPLOY_TRACKER_URL required/,
        );
        try {
            resolveDeployTrackerBase();
        } catch (e) {
            expect(e).toMatchObject({ code: 'MISSING_ENV' });
        }
    });
});

describe('resolveMachineToken', () => {
    const prev = {
        KEY1_API_TOKEN: process.env.KEY1_API_TOKEN,
        WW_API_TOKEN: process.env.WW_API_TOKEN,
        RULES_ADMIN_TOKEN: process.env.RULES_ADMIN_TOKEN,
    };

    afterEach(() => {
        resetDotEnvLoadedForTests();
        for (const [k, v] of Object.entries(prev)) {
            if (v === undefined) {
                delete process.env[k];
            } else {
                process.env[k] = v;
            }
        }
    });

    it('prefers KEY1_API_TOKEN over RULES_ADMIN_TOKEN', () => {
        process.env.KEY1_API_TOKEN = 'key1_dev_bot';
        process.env.RULES_ADMIN_TOKEN = 'god';
        expect(resolveMachineToken()).toBe('key1_dev_bot');
    });

    it('falls back to RULES_ADMIN_TOKEN', () => {
        delete process.env.KEY1_API_TOKEN;
        delete process.env.WW_API_TOKEN;
        process.env.RULES_ADMIN_TOKEN = 'god';
        expect(resolveMachineToken()).toBe('god');
    });
});
