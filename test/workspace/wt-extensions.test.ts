import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT } from '../../src/envelope/index.js';
import { clearRegisteredTools, runPortal } from '../../src/portal/index.js';
import type { PortalContext } from '../../src/portal/types.js';
import { handleWtList } from '../../src/workspace/handlers.js';
import { registerWorkspaceTools, type WtPortalExtension } from '../../src/workspace/index.js';
import { usageText } from '../../src/workspace/usage.js';
import { wtOk } from '../../src/workspace/wt-envelope.js';
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

function benchExtension(handler?: WtPortalExtension['handler']): WtPortalExtension {
    return {
        id: 'bench',
        title: '基准测试',
        summary: 'ww wt bench 门户扩展',
        examples: ['ww wt bench --json'],
        handler:
            handler ??
            ((argv, ctx) =>
                wtOk(ctx, 'bench', {
                    argv,
                    json: ctx.json,
                })),
    };
}

/** 无 ww 侧 extensions 时的 usage / list 基线（含内置 squash-bumps）。 */
function baselineUsage(skipPath: string) {
    return usageText(skipPath);
}

describe('ww wt portal extensions (WW-125)', () => {
    let workspace: ReturnType<typeof isolatedWorkspaceFixture>;

    beforeEach(() => {
        workspace = isolatedWorkspaceFixture();
        vi.stubEnv('WW_WORKSPACE_ROOT', workspace.root);
    });

    afterEach(() => {
        clearRegisteredTools();
        vi.unstubAllEnvs();
        workspace.cleanup();
    });

    it('无 ww extensions 时 list --json 含内置 squash-bumps', async () => {
        registerWorkspaceTools();
        expect(usageText(`${workspace.root}/.ww-workspace-skip.json`)).toBe(
            baselineUsage(`${workspace.root}/.ww-workspace-skip.json`),
        );

        const result = await runPortal({
            argv: ['wt', 'list', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        const data = result.data as Array<{ id: string; kind?: string }>;
        expect(data.map((t) => t.id)).toEqual([
            'pull',
            'push',
            'bump-sdk',
            'remote',
            'cloc',
            'squash-bumps',
        ]);
        expect(data.find((t) => t.id === 'squash-bumps')?.kind).toBe('portal');
    });

    it('list --json 包含 portal 扩展 kind', async () => {
        registerWorkspaceTools({ extensions: [benchExtension()] });
        const result = await runPortal({
            argv: ['wt', 'list', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        const data = result.data as Array<{ id: string; kind?: string; title: string }>;
        const bench = data.find((t) => t.id === 'bench');
        expect(bench).toMatchObject({
            id: 'bench',
            title: '基准测试',
            kind: 'portal',
        });
        expect(data.map((t) => t.id)).toContain('bench');
    });

    it('list 人类输出标注 [portal]', async () => {
        registerWorkspaceTools({ extensions: [benchExtension()] });
        const out = captureIo();
        const ctx: PortalContext = { json: false, portal: 'ww', stdout: out.stream };
        await handleWtList([], ctx);
        const text = out.text();
        expect(text).toContain('bench');
        expect(text).toContain('[portal]');
        expect(text).toContain('ww wt bench 门户扩展');
    });

    it('help <id> 委托扩展 handler', async () => {
        const helpHandler = vi.fn((argv, ctx) => wtOk(ctx, 'bench help', { argv, json: ctx.json }));
        registerWorkspaceTools({
            extensions: [benchExtension(helpHandler)],
        });
        await runPortal({
            argv: ['wt', 'help', 'bench', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(helpHandler).toHaveBeenCalled();
        const [argv, ctx] = helpHandler.mock.calls[0] ?? [];
        expect(argv).toEqual(['--help']);
        expect(ctx.json).toBe(true);
    });

    it('run <id> -- args 透传 argv', async () => {
        const runHandler = vi.fn((argv, ctx) => wtOk(ctx, 'bench', { argv }));
        registerWorkspaceTools({ extensions: [benchExtension(runHandler)] });
        await runPortal({
            argv: ['wt', 'run', 'bench', '--', 'a', 'b'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(runHandler).toHaveBeenCalledWith(
            ['a', 'b'],
            expect.objectContaining({ portal: 'ww' }),
        );
    });

    it('direct wt <id> 调用扩展', async () => {
        const directHandler = vi.fn((argv, ctx) => wtOk(ctx, 'bench', { argv }));
        registerWorkspaceTools({ extensions: [benchExtension(directHandler)] });
        const result = await runPortal({
            argv: ['wt', 'bench', 'x', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        expect(directHandler).toHaveBeenCalled();
        const [argv, ctx] = directHandler.mock.calls[0] ?? [];
        expect(argv).toEqual(['x', '--json']);
        expect(ctx.json).toBe(true);
    });

    it('run <id> --json 写入 ctx.json 并保留 argv', async () => {
        const runHandler = vi.fn((argv, ctx) => wtOk(ctx, 'bench', { argv, json: ctx.json }));
        registerWorkspaceTools({ extensions: [benchExtension(runHandler)] });
        const result = await runPortal({
            argv: ['wt', 'run', 'bench', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        const [argv, ctx] = runHandler.mock.calls[0] ?? [];
        expect(argv).toEqual(['--json']);
        expect(ctx.json).toBe(true);
        expect((result.data as { json: boolean }).json).toBe(true);
    });

    it('usage 文本列出扩展 id 与摘要', async () => {
        registerWorkspaceTools({ extensions: [benchExtension()] });
        const text = usageText(`${workspace.root}/.ww-workspace-skip.json`);
        expect(text).toContain('bench');
        expect(text).toContain('ww wt bench 门户扩展');
        expect(text).toMatch(/工具 id:.*bench/);
    });

    it('catalog id 冲突在注册时抛错', () => {
        expect(() =>
            registerWorkspaceTools({
                extensions: [
                    {
                        id: 'pull',
                        title: 'x',
                        summary: 'y',
                        handler: () => wtOk({ json: false, portal: 'ww' }, 'pull', {}),
                    },
                ],
            }),
        ).toThrow(/catalog/i);
    });

    it('保留子命令 id 冲突在注册时抛错', () => {
        expect(() =>
            registerWorkspaceTools({
                extensions: [
                    {
                        id: 'list',
                        title: 'x',
                        summary: 'y',
                        handler: () => wtOk({ json: false, portal: 'ww' }, 'list', {}),
                    },
                ],
            }),
        ).toThrow(/保留子命令/i);
    });

    it('重复 extension id 在注册时抛错', () => {
        const ext = benchExtension();
        expect(() => registerWorkspaceTools({ extensions: [ext, ext] })).toThrow(/重复/i);
    });

    it('help 未知工具 exit 2', async () => {
        registerWorkspaceTools({ extensions: [benchExtension()] });
        const result = await runPortal({
            argv: ['wt', 'help', 'nosuch', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(false);
        expect(result.meta.exit_code).toBe(EXIT.USAGE);
    });
});
