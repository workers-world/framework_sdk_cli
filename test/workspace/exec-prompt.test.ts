import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceTool } from '../../src/workspace/catalog.js';
import { runWorkspaceTool } from '../../src/workspace/exec-script.js';

const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../fixtures/workspace');

const promptTool: WorkspaceTool = {
    id: 'remote',
    title: 't',
    script: 'prompt-part.sh',
    summary: 's',
    examples: [],
    passthrough: true,
};

describe('exec-script interactive prompt (WW-126)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('flushes read -p prompt before newline on TTY', async () => {
        const stdinDesc = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
        const stderrChunks: string[] = [];
        const stderr = {
            isTTY: true,
            write: (s: string) => {
                stderrChunks.push(s);
                return true;
            },
        } as unknown as NodeJS.WritableStream;
        const stdinBackup = process.stdin;
        const fakeIn = new PassThrough();
        Object.defineProperty(process, 'stdin', { value: fakeIn, configurable: true });

        const runPromise = runWorkspaceTool(promptTool, [], fixtureRoot, {
            json: false,
            io: { stdout: stderr, stderr },
        });
        fakeIn.write('\n');

        await vi.waitFor(() => {
            expect(stderrChunks.join('')).toContain('确认将以上 N 项写入 remote？');
        });
        await runPromise;
        Object.defineProperty(process, 'stdin', { value: stdinBackup, configurable: true });
        if (stdinDesc) {
            Object.defineProperty(process.stdin, 'isTTY', stdinDesc);
        }
    });
});
