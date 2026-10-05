import { afterEach, describe, expect, it } from 'vitest';
import { okEnvelope } from '../../src/envelope/index.js';
import { clearRegisteredTools, registerTool, runPortal } from '../../src/portal/index.js';
import { registerWorkspaceTools } from '../../src/workspace/index.js';

const pgreqLike = {
    id: 'pgreq',
    title: '规划闸 A',
    summary: 'PGREQ → GitHub Issue',
    commands: [
        {
            name: 'create',
            summary: '创建 PGREQ',
            handler: async () => okEnvelope('ww pgreq create', { id: 'PGREQ1' }),
        },
        {
            name: 'issue',
            summary: '闸 A 建 Issue',
            mutating: true,
            handler: async () => okEnvelope('ww pgreq issue', {}),
        },
    ],
};

function captureIo() {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return {
        stdout: { write: (s: string) => stdout.push(s) } as NodeJS.WritableStream,
        stderr: { write: (s: string) => stderr.push(s) } as NodeJS.WritableStream,
        stdoutChunks: stdout,
        stderrChunks: stderr,
    };
}

afterEach(() => {
    clearRegisteredTools();
});

describe('portal tool help regression (base dev_00_01_00)', () => {
    it('ww pgreq help variants match generic tool help bytes', async () => {
        registerTool(pgreqLike);
        const io1 = captureIo();
        const r1 = await runPortal({
            argv: ['pgreq', 'help'],
            noExit: true,
            ...io1,
        });
        expect(r1.meta.exit_code).toBe(0);
        expect(r1.ok).toBe(true);

        const io2 = captureIo();
        const r2 = await runPortal({
            argv: ['pgreq', 'help', '--json'],
            noExit: true,
            ...io2,
        });
        expect(r2.meta.exit_code).toBe(0);
        expect(io2.stdoutChunks).toHaveLength(1);
        expect(io2.stderrChunks.join('')).toBe('');

        const io3 = captureIo();
        const r3 = await runPortal({
            argv: ['pgreq', 'help', 'create'],
            noExit: true,
            ...io3,
        });
        expect(r3.meta.exit_code).toBe(0);

        expect(io1.stderrChunks.join('')).toBe(io3.stderrChunks.join(''));
        const env2 = JSON.parse(io2.stdoutChunks[0] ?? '');
        expect(env2.data.help).toBe((r1.data as { help: string }).help);
        expect((r1.data as { help: string }).help).toContain('ww pgreq create');
    });

    it('pgreq issue mutating flag unchanged in ww list', async () => {
        registerTool(pgreqLike);
        registerWorkspaceTools();
        const result = await runPortal({
            argv: ['list', '--json'],
            noExit: true,
            stdout: { write: () => true } as unknown as NodeJS.WritableStream,
            stderr: { write: () => true } as unknown as NodeJS.WritableStream,
        });
        const pgreq = (
            result.data as {
                tools: Array<{ id: string; commands: Array<{ name: string; mutating?: boolean }> }>;
            }
        ).tools.find((t) => t.id === 'pgreq');
        const issue = pgreq?.commands.find((c) => c.name === 'issue');
        expect(issue?.mutating).toBe(true);
        const create = pgreq?.commands.find((c) => c.name === 'create');
        expect(create?.mutating).toBeFalsy();
    });
});
