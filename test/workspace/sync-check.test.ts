import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
        // 非 TTY 时 portal 强制 JSON 模式；人类输出断言需伪造 isTTY
        isTTY: true,
        write: (chunk: string | Uint8Array) => {
            chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
            return true;
        },
    } as unknown as NodeJS.WritableStream;
    return { stream, text: () => chunks.join('') };
}

function g(cwd: string, ...args: string[]): void {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
}

/** bare origin + 工作仓：dev_00_01_00 已 push，dev_00_02_00 本地新建未 push，最后切回 dev_00_01_00 */
function initRepoScenario(workspaceRoot: string): { repo: string } {
    const origin = join(workspaceRoot, 'origin.git');
    execFileSync('git', ['init', '--bare', '-b', 'dev_00_01_00', origin]);
    const repo = join(workspaceRoot, 'demo');
    execFileSync('git', ['init', '-b', 'dev_00_01_00', repo]);
    g(repo, 'config', 'user.email', 'test@example.com');
    g(repo, 'config', 'user.name', 'test');
    // 本机全局 commit.gpgsign=true 会让 git commit 走 gpg 签名（慢、易超时），测试内关闭
    g(repo, 'config', 'commit.gpgsign', 'false');
    writeFileSync(join(repo, 'README.md'), 'hello\n');
    g(repo, 'add', '.');
    g(repo, 'commit', '-m', 'init');
    g(repo, 'remote', 'add', 'origin', origin);
    g(repo, 'push', '-u', 'origin', 'dev_00_01_00');
    g(repo, 'checkout', '-b', 'dev_00_02_00');
    writeFileSync(join(repo, 'new.md'), 'unpushed\n');
    g(repo, 'add', '.');
    g(repo, 'commit', '-m', 'feat: previous version work');
    g(repo, 'checkout', 'dev_00_01_00');
    return { repo };
}

describe('ww wt sync', () => {
    let workspace: ReturnType<typeof isolatedWorkspaceFixture>;
    let realRoot: string;
    let repo: string;
    let prevCwd: string;

    beforeEach(() => {
        workspace = isolatedWorkspaceFixture();
        // macOS 的 /var/folders 是 /private/var/folders symlink；git toplevel 返回真实路径，
        // discoverWorkspaceRepos 的 isStandaloneGitRepo 比较 top === dir，须用 realpath
        realRoot = realpathSync(workspace.root);
        repo = initRepoScenario(realRoot).repo;
        prevCwd = process.cwd();
        vi.stubEnv('WW_WORKSPACE_ROOT', realRoot);
        registerWorkspaceTools();
    });

    afterEach(() => {
        process.chdir(prevCwd);
        clearRegisteredTools();
        vi.unstubAllEnvs();
        workspace.cleanup();
    });

    it('help 说明含只读定位与关键 flag', async () => {
        const out = captureIo();
        const result = await runPortal({
            argv: ['wt', 'sync', '--help'],
            noExit: true,
            stdout: out.stream,
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        expect(out.text()).toContain('只读');
        expect(out.text()).toContain('--gate');
        expect(out.text()).toContain('--here');
    });

    it('workspace 扫描能发现前一分支未推送（无远端参照）', async () => {
        const result = await runPortal({
            argv: ['wt', 'sync', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        const data = result.data as {
            total: number;
            unsynced: number;
            repos: Array<{
                repo: string;
                synced: boolean;
                issues: string[];
                branch: { branch: string; ahead: number; upstream: string | null } | null;
                prev: { branch: string; upstream: string | null } | null;
            }>;
        };
        expect(data.total).toBe(1);
        const demo = data.repos[0];
        expect(demo.repo).toBe('demo');
        expect(demo.synced).toBe(false);
        expect(demo.issues).toContain('prev_no_upstream');
        expect(demo.branch?.branch).toBe('dev_00_01_00');
        expect(demo.branch?.ahead).toBe(0);
        expect(demo.prev?.branch).toBe('dev_00_02_00');
        expect(demo.prev?.upstream).toBeNull();
    });

    it('push 前一分支后 gate 通过', async () => {
        g(repo, 'checkout', 'dev_00_02_00');
        g(repo, 'push', '-u', 'origin', 'dev_00_02_00');
        g(repo, 'checkout', 'dev_00_01_00');

        const result = await runPortal({
            argv: ['wt', 'sync', '--gate', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        const data = result.data as { unsynced: number; repos: Array<{ synced: boolean }> };
        expect(data.unsynced).toBe(0);
        expect(data.repos[0].synced).toBe(true);
    });

    it('未同步时 --gate 返回 UNSYNCED 非 0', async () => {
        const result = await runPortal({
            argv: ['wt', 'sync', '--gate', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(false);
        expect(result.meta?.exit_code).toBe(EXIT.UNKNOWN);
        expect((result.error as { code?: string })?.code).toBe('UNSYNCED');
    });

    it('前一分支有 upstream 且 ahead 时报告未推送 commit 主题', async () => {
        g(repo, 'checkout', 'dev_00_02_00');
        g(repo, 'push', '-u', 'origin', 'dev_00_02_00');
        writeFileSync(join(repo, 'more.md'), 'x\n');
        g(repo, 'add', '.');
        g(repo, 'commit', '-m', 'feat: one more unpushed');
        g(repo, 'checkout', 'dev_00_01_00');

        const result = await runPortal({
            argv: ['wt', 'sync', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        const data = result.data as {
            repos: Array<{
                issues: string[];
                prev: {
                    branch: string;
                    upstream: string;
                    ahead: number;
                    unpushedSubjects: string[];
                } | null;
            }>;
        };
        const demo = data.repos[0];
        expect(demo.issues).toContain('prev_ahead');
        expect(demo.prev?.upstream).toBe('origin/dev_00_02_00');
        expect(demo.prev?.ahead).toBe(1);
        expect(demo.prev?.unpushedSubjects).toContain('feat: one more unpushed');
    });

    it('--here 在 git 仓内返回单仓结果', async () => {
        process.chdir(repo);
        try {
            const result = await runPortal({
                argv: ['wt', 'sync', '--here', '--json'],
                noExit: true,
                stdout: nullIo(),
                stderr: nullIo(),
            });
            expect(result.ok).toBe(true);
            const data = result.data as {
                here: boolean;
                total: number;
                repos: Array<{ repo: string; prev: { branch: string } | null }>;
            };
            expect(data.here).toBe(true);
            expect(data.total).toBe(1);
            expect(data.repos[0].repo).toBe('demo');
            expect(data.repos[0].prev?.branch).toBe('dev_00_02_00');
        } finally {
            process.chdir(prevCwd);
        }
    });

    it('--here 非 git 目录返回 USAGE', async () => {
        const empty = mkdtempSync(join(tmpdir(), 'ww-sync-nongit-'));
        process.chdir(empty);
        try {
            const result = await runPortal({
                argv: ['wt', 'sync', '--here', '--json'],
                noExit: true,
                stdout: nullIo(),
                stderr: nullIo(),
            });
            expect(result.ok).toBe(false);
            expect(result.meta?.exit_code).toBe(EXIT.USAGE);
            expect((result.error as { code?: string })?.code).toBe('NOT_A_GIT_REPO');
        } finally {
            process.chdir(prevCwd);
            rmSync(empty, { recursive: true, force: true });
        }
    });

    it('ahead 时人类输出列出未推送 commit 主题', async () => {
        g(repo, 'checkout', 'dev_00_02_00');
        g(repo, 'push', '-u', 'origin', 'dev_00_02_00');
        writeFileSync(join(repo, 'more.md'), 'x\n');
        g(repo, 'add', '.');
        g(repo, 'commit', '-m', 'feat: one more unpushed');
        g(repo, 'checkout', 'dev_00_01_00');

        const out = captureIo();
        await runPortal({
            argv: ['wt', 'sync'],
            noExit: true,
            stdout: out.stream,
            stderr: nullIo(),
        });
        expect(out.text()).toContain('feat: one more unpushed');
        expect(out.text()).toContain('demo  dev_00_01_00');
    });
});
