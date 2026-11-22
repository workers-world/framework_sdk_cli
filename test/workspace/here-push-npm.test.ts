import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRegisteredTools, runPortal } from '../../src/portal/index.js';
import { registerWorkspaceTools } from '../../src/workspace/index.js';
import { isolatedWorkspaceFixture } from '../fixtures/isolated-workspace.js';

// 只拦截 spawnSync（npm 检查路径），execFileSync（git/sleep）保持真实实现
vi.mock('node:child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:child_process')>();
    return {
        ...actual,
        spawnSync: vi.fn(
            (
                file: string,
                args?: readonly string[],
                options?: Parameters<typeof actual.spawnSync>[2],
            ) => actual.spawnSync(file, args, options),
        ),
    };
});

import { spawnSync } from 'node:child_process';

function nullIo() {
    return { write: () => true } as unknown as NodeJS.WritableStream;
}

function captureIo() {
    const chunks: string[] = [];
    const stream = {
        write: (s: string) => {
            chunks.push(s);
            return true;
        },
    } as unknown as NodeJS.WritableStream;
    return { stream, text: () => chunks.join('') };
}

/** here-push：npm 检查失败时回显 stderr+stdout；spawnSync 须带 32MB maxBuffer */
describe('ww wt here-push npm check failure', () => {
    let workspace: ReturnType<typeof isolatedWorkspaceFixture>;
    let repo: string;
    let prevCwd: string;

    beforeEach(() => {
        workspace = isolatedWorkspaceFixture();
        repo = mkdtempSync(join(tmpdir(), 'ww-here-push-npm-'));
        execFileSync('git', ['init', '-b', 'dev_00_01_00'], { cwd: repo });
        execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
        execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
        // 本机全局 commit.gpgsign=true 会让 git commit 走 gpg 签名（慢、易超时），测试内关闭
        execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: repo });
        writeFileSync(
            join(repo, 'package.json'),
            JSON.stringify({ name: 'x', scripts: { check: 'node -e "process.exit(0)"' } }),
        );
        execFileSync('git', ['add', '.'], { cwd: repo });
        execFileSync('git', ['commit', '-m', 'init'], { cwd: repo });
        prevCwd = process.cwd();
        vi.stubEnv('WW_WORKSPACE_ROOT', workspace.root);
        registerWorkspaceTools();
        process.chdir(repo);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        clearRegisteredTools();
        vi.unstubAllEnvs();
        rmSync(repo, { recursive: true, force: true });
        workspace.cleanup();
        vi.clearAllMocks();
    });

    it('npm run check 失败：maxBuffer=32MB，stderr+stdout 都回显', async () => {
        vi.mocked(spawnSync).mockImplementationOnce(() => {
            return {
                status: 1,
                stdout: 'STDOUT-MARKER-9x7',
                stderr: 'STDERR-MARKER-3k2',
            } as ReturnType<typeof spawnSync>;
        });
        const errOut = captureIo();
        const result = await runPortal({
            argv: ['wt', 'here-push', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: errOut.stream,
        });
        expect(result.ok).toBe(false);
        expect((result.error as { code?: string })?.code).toBe('CHECK_FAILED');

        // maxBuffer 32MB（默认 1MB 会把长 vitest 输出误杀成 CHECK_FAILED）
        const call = vi.mocked(spawnSync).mock.calls[0];
        expect(call?.[0]).toBe('npm');
        const opts = call?.[2] as { maxBuffer?: number } | undefined;
        expect(opts?.maxBuffer).toBe(32 * 1024 * 1024);

        // 失败输出 stderr + stdout 拼接（此前只回显 stderr）
        expect(errOut.text()).toContain('STDERR-MARKER-3k2');
        expect(errOut.text()).toContain('STDOUT-MARKER-9x7');
    });
});
