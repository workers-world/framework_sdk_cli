import { describe, expect, it } from 'vitest';
import { okEnvelope, writeEnvelope } from '../../src/envelope/index.js';

describe('writeEnvelope TTY colors (WW-126)', () => {
    it('colors ok line on stderr when TTY', () => {
        const prevNoColor = process.env.NO_COLOR;
        delete process.env.NO_COLOR;
        const stderr: string[] = [];
        const errStream = {
            isTTY: true,
            write(s: string) {
                stderr.push(s);
                return true;
            },
        } as unknown as NodeJS.WritableStream;
        const stdout = { isTTY: true, write: () => true } as unknown as NodeJS.WritableStream;
        const prev = process.stdout.isTTY;
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
        try {
            writeEnvelope(okEnvelope('ww list', { tools: [] }), {
                json: false,
                stdout,
                stderr: errStream,
            });
        } finally {
            Object.defineProperty(process.stdout, 'isTTY', { value: prev, configurable: true });
            if (prevNoColor === undefined) {
                delete process.env.NO_COLOR;
            } else {
                process.env.NO_COLOR = prevNoColor;
            }
        }
        const esc = String.fromCharCode(27);
        expect(stderr.join('')).toContain(`${esc}[32m`);
        expect(stderr.join('')).toContain('ww list: ok');
    });
});
