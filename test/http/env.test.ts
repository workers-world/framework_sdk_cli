import { afterEach, describe, expect, it } from 'vitest';
import { resolveDeployTrackerBase } from '../../src/http/env.js';

describe('resolveDeployTrackerBase', () => {
    afterEach(() => {
        delete process.env.DEPLOY_TRACKER_BASE;
        delete process.env.DEPLOY_TRACKER_URL;
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
