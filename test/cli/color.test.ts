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

    it('summary with FAIL 0 stays uncolored', () => {
        const plain = colorizeLogLine('summary: OK 1 | SKIP 2 | FAIL 0', true);
        expect(plain).toBe('summary: OK 1 | SKIP 2 | FAIL 0');
    });

    it('summary with FAIL 1 is red', () => {
        const line = colorizeLogLine('summary: OK 0 | SKIP 0 | FAIL 1', true);
        expect(line).toContain('FAIL 1');
        expect(line).not.toBe('summary: OK 0 | SKIP 0 | FAIL 1');
    });

    it('错误: prefix is red', () => {
        const line = colorizeLogLine('错误: demo', true);
        expect(line).toContain('错误: demo');
        expect(line).not.toBe('错误: demo');
    });

    it('FORCE_COLOR=0 disables color on TTY', () => {
        const prev = process.env.FORCE_COLOR;
        process.env.FORCE_COLOR = '0';
        const stream = { isTTY: true } as NodeJS.WritableStream;
        expect(shouldColorStream(stream, { json: false })).toBe(false);
        process.env.FORCE_COLOR = prev;
    });
});
