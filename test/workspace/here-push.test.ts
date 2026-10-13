import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT } from '../../src/envelope/index.js';
import { clearRegisteredTools, runPortal } from '../../src/portal/index.js';
import { registerWorkspaceTools } from '../../src/workspace/index.js';
import { isolatedWorkspaceFixture } from '../fixtures/isolated-workspace.js';

function nullIo() {
    return { write: () => true } as unknown as NodeJS.WritableStream;
}

function captureIo() {
    const chunks: string[] = [];
    const stream = {
        write: (chunk: string | Uint8Array) => {
            chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
            return true;
        },
    } as unknown as NodeJS.WritableStream;
    return { stream, text: () => chunks.join('') };
}

function initBareRepo(): { root: string; cleanup: () => void } {
    const root = mkdtempSync(join(tmpdir(), 'ww-here-push-'));
    execFileSync('git', ['init', '-b', 'dev_00_01_00'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: root });
    writeFileSync(join(root, 'README.md'), 'hello\n');
    writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
            name: 'here-push-fixture',
            scripts: { check: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' },
        }),
    );
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: root });
    return {
        root,
        cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
}

describe('ww wt here-push', () => {
    let workspace: ReturnType<typeof isolatedWorkspaceFixture>;
    let repo: ReturnType<typeof initBareRepo>;
    let prevCwd: string;

    beforeEach(() => {
        workspace = isolatedWorkspaceFixture();
        repo = initBareRepo();
        prevCwd = process.cwd();
        vi.stubEnv('WW_WORKSPACE_ROOT', workspace.root);
        registerWorkspaceTools();
        process.chdir(repo.root);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        clearRegisteredTools();
        vi.unstubAllEnvs();
        repo.cleanup();
        workspace.cleanup();
    });

    it('help 说明含当前分支与 check/test', async () => {
        const out = captureIo();
        const result = await runPortal({
            argv: ['wt', 'here-push', '--help'],
            noExit: true,
            stdout: out.stream,
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        expect(out.text()).toContain('git push -u origin HEAD');
        expect(out.text()).toContain('--no-test');
    });

    it('dry-run 自动用当前分支且不 push', async () => {
        const result = await runPortal({
            argv: ['wt', 'here-push', '--dry-run', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        const data = result.data as {
            dryRun: boolean;
            branch: string;
            runCheck: boolean;
            runTest: boolean;
            refspec: string;
        };
        expect(data.dryRun).toBe(true);
        expect(data.branch).toBe('dev_00_01_00');
        expect(data.refspec).toBe('HEAD');
        expect(data.runCheck).toBe(true);
        expect(data.runTest).toBe(true);
    });

    it('--no-test dry-run 跳过脚本', async () => {
        const result = await runPortal({
            argv: ['wt', 'here-push', '--dry-run', '--no-test', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        const data = result.data as { runCheck: boolean; runTest: boolean; skippedTests: boolean };
        expect(data.runCheck).toBe(false);
        expect(data.runTest).toBe(false);
        expect(data.skippedTests).toBe(true);
    });

    it('非 git 目录返回 USAGE', async () => {
        const empty = mkdtempSync(join(tmpdir(), 'ww-here-push-nongit-'));
        process.chdir(empty);
        try {
            const result = await runPortal({
                argv: ['wt', 'here-push', '--dry-run', '--json'],
                noExit: true,
                stdout: nullIo(),
                stderr: nullIo(),
            });
            expect(result.ok).toBe(false);
            expect(result.meta?.exit_code).toBe(EXIT.USAGE);
            expect((result.error as { code?: string })?.code).toBe('NOT_A_GIT_REPO');
        } finally {
            process.chdir(repo.root);
            rmSync(empty, { recursive: true, force: true });
        }
    });
});
