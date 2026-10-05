import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT } from '../../src/envelope/index.js';
import { clearRegisteredTools, runPortal } from '../../src/portal/index.js';
import { registerWorkspaceTools } from '../../src/workspace/index.js';
import { skipFilePath } from '../../src/workspace/skip-file.js';

const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../fixtures/workspace');

function nullIo() {
    return {
        write: () => true,
    } as unknown as NodeJS.WritableStream;
}

describe('ww wt workspace tools (WW-126)', () => {
    beforeEach(() => {
        vi.stubEnv('WW_WORKSPACE_ROOT', fixtureRoot);
        registerWorkspaceTools();
    });

    afterEach(() => {
        clearRegisteredTools();
        vi.unstubAllEnvs();
    });

    it('list --json envelope', async () => {
        const result = await runPortal({
            argv: ['wt', 'list', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        expect(result.meta.command).toBe('ww wt list');
        const data = result.data as { workspaceRoot: string; tools: Array<{ id: string }> };
        expect(data.workspaceRoot).toBe(fixtureRoot);
        expect(data.tools.map((t) => t.id)).toEqual(['pull', 'push', 'bump-sdk', 'remote', 'cloc']);
    });

    it('run pull --json envelope and script exit 0', async () => {
        const result = await runPortal({
            argv: ['wt', 'run', 'pull', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        expect(result.meta.exit_code).toBe(EXIT.OK);
    });

    it('run unknown tool exit 127', async () => {
        const result = await runPortal({
            argv: ['wt', 'run', 'nope', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(false);
        expect(result.meta.exit_code).toBe(EXIT.NOT_FOUND);
        expect(result.error?.message).toBe('未知工具');
    });

    it('push script failure exit 1', async () => {
        const result = await runPortal({
            argv: ['wt', 'push', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(false);
        expect(result.meta.exit_code).toBe(1);
    });

    it('skip list --json', async () => {
        const result = await runPortal({
            argv: ['wt', 'skip', 'list', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        const data = result.data as { path: string; repos: string[] };
        expect(data.path).toBe(skipFilePath(fixtureRoot));
        expect(Array.isArray(data.repos)).toBe(true);
    });

    it('skip add mutates skip file', async () => {
        const add = await runPortal({
            argv: ['wt', 'skip', 'add', 'demo-repo', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(add.ok).toBe(true);
        const list = await runPortal({
            argv: ['wt', 'skip', 'list', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        const repos = (list.data as { repos: string[] }).repos;
        expect(repos).toContain('demo-repo');
        await runPortal({
            argv: ['wt', 'skip', 'remove', 'demo-repo', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
    });

    it('no args non-TTY refuses interactive menu exit 2', async () => {
        const result = await runPortal({
            argv: ['wt'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.meta.exit_code).toBe(EXIT.USAGE);
        expect(result.error?.code).toBe('NO_TTY');
    });

    it('run --json passes NO_COLOR to script output (no ANSI)', async () => {
        const stdout: string[] = [];
        const stderr: string[] = [];
        await runPortal({
            argv: ['wt', 'run', 'pull', '--json'],
            noExit: true,
            stdout: { write: (s: string) => stdout.push(s) } as NodeJS.WritableStream,
            stderr: { write: (s: string) => stderr.push(s) } as NodeJS.WritableStream,
        });
        const combined = [...stdout, ...stderr].join('');
        const esc = String.fromCharCode(27);
        expect(combined.includes(`${esc}[`)).toBe(false);
    });
});
