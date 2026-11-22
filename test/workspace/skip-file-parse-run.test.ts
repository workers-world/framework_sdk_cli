import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRegisteredTools, runPortal } from '../../src/portal/index.js';
import { registerWorkspaceTools } from '../../src/workspace/index.js';
import { isolatedWorkspaceFixture } from '../fixtures/isolated-workspace.js';

function nullIo() {
    return { write: () => true } as unknown as NodeJS.WritableStream;
}

/** 坏 skip 文件不得让 run / 直达子命令裸崩：应转 SKIP_FILE 结构化错误（exit 2） */
describe('corrupt skip file → SKIP_FILE envelope', () => {
    let workspace: ReturnType<typeof isolatedWorkspaceFixture>;

    beforeEach(() => {
        workspace = isolatedWorkspaceFixture();
        // 模拟写入中断留下的坏 JSON
        writeFileSync(join(workspace.root, '.ww-workspace-skip.json'), '{ "skip": { broken');
        vi.stubEnv('WW_WORKSPACE_ROOT', workspace.root);
        registerWorkspaceTools();
    });

    afterEach(() => {
        clearRegisteredTools();
        vi.unstubAllEnvs();
        workspace.cleanup();
    });

    it('ww wt run push --json → SKIP_FILE', async () => {
        const result = await runPortal({
            argv: ['wt', 'run', 'push', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(false);
        expect(result.meta.exit_code).toBe(2);
        expect(result.error?.code).toBe('SKIP_FILE');
        expect(result.error?.message).toContain('无法解析');
    });

    it('ww wt push --json（直达子命令）→ SKIP_FILE', async () => {
        const result = await runPortal({
            argv: ['wt', 'push', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('SKIP_FILE');
    });
});
