import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT } from '../../src/envelope/index.js';
import { clearRegisteredTools, runPortal } from '../../src/portal/index.js';
import { registerWorkspaceTools } from '../../src/workspace/index.js';
import { isolatedWorkspaceFixture } from '../fixtures/isolated-workspace.js';

function nullIo() {
    return { write: () => true } as unknown as NodeJS.WritableStream;
}

describe('ww wt squash-bumps portal', () => {
    let workspace: ReturnType<typeof isolatedWorkspaceFixture>;

    beforeEach(() => {
        workspace = isolatedWorkspaceFixture();
        vi.stubEnv('WW_WORKSPACE_ROOT', workspace.root);
        registerWorkspaceTools();
    });

    afterEach(() => {
        clearRegisteredTools();
        vi.unstubAllEnvs();
        workspace.cleanup();
    });

    it('list --json includes squash-bumps extension', async () => {
        const result = await runPortal({
            argv: ['wt', 'list', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        const data = result.data as Array<{ id: string; kind?: string }>;
        expect(data.some((t) => t.id === 'squash-bumps' && t.kind === 'portal')).toBe(true);
    });

    it('help squash-bumps prints usage', async () => {
        const { stream, text } = captureStdout();
        const result = await runPortal({
            argv: ['wt', 'squash-bumps', '--help'],
            noExit: true,
            stdout: stream,
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        expect(text()).toContain('--apply');
        expect(text()).toContain('--dry-run');
    });

    it('existing pull still works with fixture', async () => {
        const result = await runPortal({
            argv: ['wt', 'run', 'pull', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.meta.exit_code).toBe(EXIT.OK);
    });
});

function captureStdout() {
    const chunks: string[] = [];
    const stream = {
        write: (chunk: string | Uint8Array) => {
            chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
            return true;
        },
    } as unknown as NodeJS.WritableStream;
    return { stream, text: () => chunks.join('') };
}
