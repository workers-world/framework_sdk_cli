import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT } from '../../src/envelope/index.js';
import { clearRegisteredTools, runPortal } from '../../src/portal/index.js';
import { registerWorkspaceTools } from '../../src/workspace/index.js';
import { usageText } from '../../src/workspace/usage.js';
import { wtErr } from '../../src/workspace/wt-envelope.js';

const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../fixtures/workspace');

function nullIo() {
    return { write: () => true } as unknown as NodeJS.WritableStream;
}

describe('ww wt portal fixes (WW-126 e2e)', () => {
    beforeEach(() => {
        vi.stubEnv('WW_WORKSPACE_ROOT', fixtureRoot);
        registerWorkspaceTools();
    });

    afterEach(() => {
        clearRegisteredTools();
        vi.unstubAllEnvs();
    });

    it('ww wt help uses wt handler not generic tool help', async () => {
        const result = await runPortal({
            argv: ['wt', 'help', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        const help = (result.data as { help: string }).help;
        expect(help).toContain('用法: ww wt');
        expect(help).not.toContain('Agent: write ops need --confirm');
    });

    it('ww wt help pull prints tool help', async () => {
        const result = await runPortal({
            argv: ['wt', 'help', 'pull', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        expect(result.meta.exit_code).toBe(EXIT.OK);
        expect(String((result.data as { id: string }).id)).toBe('pull');
    });

    it('ww wt help skip matches skip usage', async () => {
        const result = await runPortal({
            argv: ['wt', 'help', 'skip', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        const help = (result.data as { help: string }).help;
        expect(help).toContain('ww wt skip —');
    });

    it('ww wt help nosuch exits 2', async () => {
        const result = await runPortal({
            argv: ['wt', 'help', 'nosuch', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(false);
        expect(result.meta.exit_code).toBe(EXIT.USAGE);
    });

    it('ww wt --help exits 0 with usage', async () => {
        const result = await runPortal({
            argv: ['wt', '--help', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        expect(result.meta.exit_code).toBe(EXIT.OK);
        expect((result.data as { help: string }).help).toBe(usageText('.'));
    });

    it('ww wt -h exits 0 with usage', async () => {
        const result = await runPortal({
            argv: ['wt', '-h', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        expect(result.meta.exit_code).toBe(EXIT.OK);
    });

    it('json mode stdout is single envelope for skip add', async () => {
        const stdout: string[] = [];
        await runPortal({
            argv: ['wt', 'skip', 'add', 'push', 'scripts', '--json'],
            noExit: true,
            stdout: { write: (s: string) => stdout.push(s) } as NodeJS.WritableStream,
            stderr: nullIo(),
        });
        expect(stdout).toHaveLength(1);
        expect(stdout[0]?.startsWith('{')).toBe(true);
        expect(stdout[0]).not.toContain('用法:');
    });

    it('json mode forwards script output to stderr only', async () => {
        const stdout: string[] = [];
        const stderr: string[] = [];
        await runPortal({
            argv: ['wt', 'run', 'push', '--json'],
            noExit: true,
            stdout: { write: (s: string) => stdout.push(s) } as NodeJS.WritableStream,
            stderr: { write: (s: string) => stderr.push(s) } as NodeJS.WritableStream,
        });
        expect(stdout).toHaveLength(1);
        expect(stderr.join('')).toContain('FAIL push');
    });

    it('script exit 5 is not retryable in envelope', async () => {
        const ctx = { json: true, portal: 'ww' };
        const env = wtErr(
            ctx,
            'push',
            5,
            { code: 'SCRIPT_FAILED', message: 'exit 5' },
            undefined,
            'unknown',
        );
        expect(env.meta.retryable).toBe(false);
        expect(env.meta.exit_code).toBe(5);
        expect(env.meta.side_effects).toBe('unknown');
    });

    it('push script exit sets side_effects unknown', async () => {
        const result = await runPortal({
            argv: ['wt', 'push', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.meta.side_effects).toBe('unknown');
    });
});
