import { describe, expect, it } from 'vitest';
import { shouldRunPassiveNotify } from '../../src/check/passive.js';

const TTY = { isTTY: true };
const NOTTY = { isTTY: false };

describe('shouldRunPassiveNotify', () => {
    const base = {
        argv: ['list'],
        env: {} as NodeJS.ProcessEnv,
        stdout: TTY,
        stderr: TTY,
    };

    it('disabled for --json and CI', () => {
        expect(shouldRunPassiveNotify(base)).toBe(true);
        expect(shouldRunPassiveNotify({ ...base, argv: ['list', '--json'] })).toBe(false);
        expect(shouldRunPassiveNotify({ ...base, env: { CI: 'true' } })).toBe(false);
        expect(shouldRunPassiveNotify({ ...base, env: { WW_NO_UPDATE_CHECK: '1' } })).toBe(false);
        expect(shouldRunPassiveNotify({ ...base, stderr: NOTTY })).toBe(false);
    });
});
