import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT } from '../../src/envelope/index.js';
import { clearRegisteredTools, runPortal } from '../../src/portal/index.js';
import { registerWorkspaceTools } from '../../src/workspace/index.js';
import { isolatedWorkspaceFixture } from '../fixtures/isolated-workspace.js';

function nullIo() {
    return {
        write: () => true,
    } as unknown as NodeJS.WritableStream;
}

describe('ww wt workspace tools (WW-126)', () => {
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

    it('list --json envelope matches catalog', async () => {
        const result = await runPortal({
            argv: ['wt', 'list', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        expect(result.meta.command).toBe('ww wt list');
        const data = result.data as Array<{ id: string; title: string }>;
        expect(Array.isArray(data)).toBe(true);
        expect(data.map((t) => t.id)).toEqual(['pull', 'push', 'bump-sdk', 'remote', 'cloc']);
        expect(data[0]?.title).toBe('批量拉取');
    });

    it('ww list marks bulk repo tools mutating', async () => {
        const result = await runPortal({
            argv: ['list', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        const tools = (
            result.data as {
                tools: Array<{ id: string; commands: Array<{ name: string; mutating: boolean }> }>;
            }
        ).tools;
        const wt = tools.find((t) => t.id === 'wt');
        expect(wt).toBeDefined();
        const pull = wt?.commands.find((c) => c.name === 'pull');
        const push = wt?.commands.find((c) => c.name === 'push');
        const bump = wt?.commands.find((c) => c.name === 'bump-sdk');
        const remote = wt?.commands.find((c) => c.name === 'remote');
        const cloc = wt?.commands.find((c) => c.name === 'cloc');
        expect(pull?.mutating).toBe(true);
        expect(push?.mutating).toBe(true);
        expect(bump?.mutating).toBe(true);
        expect(remote?.mutating).toBe(false);
        expect(cloc?.mutating).toBe(false);
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
        const data = result.data as { id: string; exitCode: number; skip: string[] };
        expect(data.id).toBe('pull');
        expect(data.exitCode).toBe(0);
        expect(Array.isArray(data.skip)).toBe(true);
    });

    it('run unknown tool exit 2', async () => {
        const result = await runPortal({
            argv: ['wt', 'run', 'nope', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(false);
        expect(result.meta.exit_code).toBe(EXIT.USAGE);
        expect(result.error?.message).toContain('未知工具');
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

    it('skip list --json full skip object', async () => {
        const result = await runPortal({
            argv: ['wt', 'skip', 'list', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        const data = result.data as { skip: Record<string, string[]> };
        expect(data.skip).toBeDefined();
    });

    it('skip add push repo', async () => {
        const add = await runPortal({
            argv: ['wt', 'skip', 'add', 'push', 'scripts', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(add.ok).toBe(true);
        const data = add.data as { id: string; skip: string[] };
        expect(data.id).toBe('push');
        expect(data.skip).toContain('scripts');
        await runPortal({
            argv: ['wt', 'skip', 'rm', 'push', 'scripts', '--json'],
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
    });

    it('run --json stdout is only envelope (no script lines)', async () => {
        const stdout: string[] = [];
        await runPortal({
            argv: ['wt', 'run', 'pull', '--json'],
            noExit: true,
            stdout: { write: (s: string) => stdout.push(s) } as NodeJS.WritableStream,
            stderr: nullIo(),
        });
        expect(stdout).toHaveLength(1);
        expect(stdout[0]?.startsWith('{')).toBe(true);
        expect(stdout[0]).not.toContain('OK pull');
    });
});
