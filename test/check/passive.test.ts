import { describe, expect, it } from 'vitest';
import { passiveNotify, shouldRunPassiveNotify } from '../../src/check/passive.js';
import type { SelfCheck } from '../../src/check/types.js';

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

describe('passiveNotify', () => {
    const warnOnlyCheck: SelfCheck = {
        id: 'discover.IMPORT.bad-tool',
        title: '工具加载 bad-tool',
        cost: 'local',
        run() {
            return { status: 'warn', message: 'cannot import module' };
        },
    };

    const failCheck: SelfCheck = {
        id: 'test.fail',
        title: 'failing check',
        cost: 'local',
        run() {
            return { status: 'fail', message: 'something broke' };
        },
    };

    it('does not banner warn-only discover skips', async () => {
        const chunks: string[] = [];
        const stderr = {
            isTTY: true,
            write(s: string) {
                chunks.push(s);
                return true;
            },
        };
        const result = await passiveNotify({
            argv: ['list'],
            checks: [warnOnlyCheck],
            ctx: { env: {}, json: false },
            env: {},
            stdout: TTY,
            stderr,
        });
        expect(result.ran).toBe(true);
        expect(result.line).toBeUndefined();
        expect(chunks).toHaveLength(0);
    });

    it('banners fail items', async () => {
        const chunks: string[] = [];
        const stderr = {
            isTTY: true,
            write(s: string) {
                chunks.push(s);
                return true;
            },
        };
        const result = await passiveNotify({
            argv: ['list'],
            checks: [failCheck],
            ctx: { env: {}, json: false },
            env: {},
            stdout: TTY,
            stderr,
        });
        expect(result.line).toContain('1 项需要处理');
        expect(chunks.join('')).toContain('something broke');
    });
});