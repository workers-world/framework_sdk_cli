import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorEnvelope, okEnvelope, writeEnvelope } from '../../src/envelope/index.js';

function captureWrite(): { chunks: string[]; stream: NodeJS.WritableStream } {
    const chunks: string[] = [];
    const stream = {
        isTTY: false,
        write(s: string) {
            chunks.push(s);
            return true;
        },
    } as unknown as NodeJS.WritableStream;
    return { chunks, stream };
}

describe('writeEnvelope regression (WW-126)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('non-TTY json path matches legacy bytes', () => {
        const env = okEnvelope('ww list', { tools: [] });
        const { chunks, stream } = captureWrite();
        writeEnvelope(env, { json: true, stdout: stream, stderr: stream });
        expect(chunks.join('')).toBe(`${JSON.stringify(env)}\n`);
    });

    it('non-TTY via process.stdout.isTTY false matches legacy bytes', () => {
        const stdoutDesc = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
        Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
        try {
            const env = errorEnvelope('ww', 2, {
                code: 'UNKNOWN_TOOL',
                message: 'unknown tool "x"',
            });
            const { chunks, stream } = captureWrite();
            writeEnvelope(env, { json: false, stdout: stream, stderr: stream });
            expect(chunks.join('')).toBe(`${JSON.stringify(env)}\n`);
        } finally {
            if (stdoutDesc) {
                Object.defineProperty(process.stdout, 'isTTY', stdoutDesc);
            } else {
                delete (process.stdout as { isTTY?: boolean }).isTTY;
            }
        }
    });

    it('explicit --json error envelope unchanged shape', () => {
        const env = okEnvelope('ww pgreq create', { id: '1' });
        const stdout: string[] = [];
        const stderr: string[] = [];
        writeEnvelope(env, {
            json: true,
            stdout: { write: (s: string) => stdout.push(s) } as NodeJS.WritableStream,
            stderr: { write: (s: string) => stderr.push(s) } as NodeJS.WritableStream,
        });
        expect(stdout).toEqual([`${JSON.stringify(env)}\n`]);
        expect(stderr).toEqual([]);
    });
});
