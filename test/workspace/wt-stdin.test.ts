import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareStdinForChildScript } from '../../src/workspace/wt-stdin.js';

describe('prepareStdinForChildScript', () => {
    afterEach(() => {
        /* restore default stdin if replaced */
    });

    it('restores cooked stdin before child script', () => {
        const stdin = new PassThrough() as PassThrough & {
            isTTY?: boolean;
            setRawMode?: (mode: boolean) => void;
        };
        stdin.isTTY = true;
        const modes: boolean[] = [];
        stdin.setRawMode = (mode: boolean) => {
            modes.push(mode);
        };
        const stdinBackup = process.stdin;
        Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
        const rl = createInterface({ input: stdin, output: new PassThrough() });
        try {
            prepareStdinForChildScript(rl);
            expect(modes).toContain(false);
        } finally {
            Object.defineProperty(process, 'stdin', { value: stdinBackup, configurable: true });
        }
    });
});
