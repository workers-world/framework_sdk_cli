import { describe, expect, it } from 'vitest';
import { colorizeLogLine, shouldColorStream } from '../../src/cli/color.js';

describe('cli color (WW-126)', () => {
    it('NO_COLOR disables coloring', () => {
        const prev = process.env.NO_COLOR;
        process.env.NO_COLOR = '1';
        const stream = { isTTY: true } as NodeJS.WritableStream;
        expect(shouldColorStream(stream, { json: false })).toBe(false);
        expect(colorizeLogLine('FAIL x', false)).toBe('FAIL x');
        process.env.NO_COLOR = prev;
    });

    it('--json disables coloring', () => {
        const stream = { isTTY: true } as NodeJS.WritableStream;
        expect(shouldColorStream(stream, { json: true })).toBe(false);
    });

    it('colors FAIL/OK/SKIP without changing text', () => {
        const red = colorizeLogLine('FAIL push', true);
        expect(red).toContain('FAIL push');
        expect(red).not.toBe('FAIL push');
        const ok = colorizeLogLine('line OK done', true);
        expect(ok).toContain('OK');
        const skip = colorizeLogLine('SKIP bump', true);
        expect(skip).toContain('SKIP bump');
    });

    it('未知工具 gets error color without prefix injection', () => {
        const line = colorizeLogLine('未知工具', true);
        expect(line).toContain('未知工具');
        expect(line).not.toMatch(/^error:/i);
    });
});
