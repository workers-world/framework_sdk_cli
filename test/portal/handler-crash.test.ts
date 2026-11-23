import { afterEach, describe, expect, it } from 'vitest';
import { EXIT, okEnvelope } from '../../src/envelope/index.js';
import { clearRegisteredTools, registerTool, runPortal } from '../../src/portal/index.js';

function captureStdout() {
    const chunks: string[] = [];
    const stream = {
        write: (s: string) => {
            chunks.push(s);
            return true;
        },
    } as unknown as NodeJS.WritableStream;
    return { stream, text: () => chunks.join('') };
}

/** handler 运行时兜底：抛错转 HANDLER_CRASH 信封，--json 输出仍是合法信封（不裸崩） */
describe('runPortal handler crash guard', () => {
    afterEach(() => {
        clearRegisteredTools();
    });

    it('同步抛错 handler → HANDLER_CRASH 信封（exit UNKNOWN）', async () => {
        registerTool({
            id: 'boom',
            title: '炸',
            summary: 'handler throws',
            commands: [
                {
                    name: 'go',
                    summary: 'throw',
                    handler: async () => {
                        throw new Error('boom-xyz');
                    },
                },
            ],
        });
        const out = captureStdout();
        const result = await runPortal({
            argv: ['boom', 'go', '--json'],
            noExit: true,
            stdout: out.stream,
            stderr: { write: () => true } as unknown as NodeJS.WritableStream,
        });
        expect(result.ok).toBe(false);
        expect(result.meta.exit_code).toBe(EXIT.UNKNOWN);
        expect(result.error?.code).toBe('HANDLER_CRASH');
        expect(result.error?.message).toContain('boom-xyz');
        // stdout 仍是合法 JSON 信封
        const parsed = JSON.parse(out.text()) as { ok: boolean; error: { code: string } };
        expect(parsed.ok).toBe(false);
        expect(parsed.error.code).toBe('HANDLER_CRASH');
    });

    it('update handler 抛错同样兜底', async () => {
        const { registerPortalHooks, clearPortalHooks } = await import('../../src/portal/hooks.js');
        registerPortalHooks({
            prerun: async () => {},
        });
        const { registerPortalUpdate } = await import('../../src/portal/hooks.js');
        registerPortalUpdate(() => {
            throw new Error('update-crash-abc');
        });
        try {
            const result = await runPortal({
                argv: ['update', '--json'],
                noExit: true,
                stdout: captureStdout().stream,
                stderr: { write: () => true } as unknown as NodeJS.WritableStream,
            });
            expect(result.error?.code).toBe('HANDLER_CRASH');
            expect(result.error?.message).toContain('update-crash-abc');
            expect(result.meta.exit_code).toBe(EXIT.UNKNOWN);
        } finally {
            clearPortalHooks();
            (await import('../../src/portal/hooks.js')).clearPortalUpdate();
        }
    });

    it('okEnvelope 正常路径不受影响', async () => {
        registerTool({
            id: 'fine',
            title: '好',
            summary: 'normal',
            commands: [
                {
                    name: 'go',
                    summary: 'ok',
                    handler: async () => okEnvelope('ww fine go', { v: 1 }),
                },
            ],
        });
        const result = await runPortal({
            argv: ['fine', 'go', '--json'],
            noExit: true,
            stdout: captureStdout().stream,
            stderr: { write: () => true } as unknown as NodeJS.WritableStream,
        });
        expect(result.ok).toBe(true);
        expect((result.data as { v: number }).v).toBe(1);
    });
});
