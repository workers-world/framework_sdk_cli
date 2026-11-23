import { afterEach, describe, expect, it } from 'vitest';
import { okEnvelope } from '../../src/envelope/index.js';
import { clearRegisteredTools, registerTool, runPortal } from '../../src/portal/index.js';

function nullIo() {
    return { write: () => true } as unknown as NodeJS.WritableStream;
}

/** runPortal 尾参切片：重复 token（具名值与 head/命令同名）时按位置参数下标切，不用 argv.indexOf */
describe('runPortal tail slicing with repeated tokens', () => {
    afterEach(() => {
        clearRegisteredTools();
    });

    it('search：具名值与 search 同名时 query 不吞多余 token', async () => {
        registerTool({
            id: 'food',
            title: 'Food',
            summary: 'food keyword tool',
            keywords: ['foo'],
            commands: [{ name: 'go', summary: 's', handler: async () => okEnvelope('x', {}) }],
        });
        const result = await runPortal({
            argv: ['--tag', 'search', 'search', 'foo', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        const data = result.data as { query: string };
        // 旧逻辑 argv.indexOf('search') 命中具名值 → query 误为 'search foo'
        expect(data.query).toBe('foo');
    });

    it('命令 rest：具名值与命令同名时不多传假参数', async () => {
        registerTool({
            id: 'tok',
            title: 'Tok',
            summary: 'echo rest',
            commands: [
                {
                    name: 'c',
                    summary: 's',
                    handler: async (rest) => okEnvelope('ww tok c', { rest }),
                },
            ],
        });
        const result = await runPortal({
            argv: ['tok', '--tag', 'c', 'c', 'real', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        // 旧逻辑 indexOf('c') 命中具名值 → rest 多带一个 'c'；handler 的 rest 含门户级 --json（既有语义）
        expect((result.data as { rest: string[] }).rest).toEqual(['real', '--json']);
    });

    it('常规命令 rest 不受影响（flag 在命令后）', async () => {
        registerTool({
            id: 'tok',
            title: 'Tok',
            summary: 'echo rest',
            commands: [
                {
                    name: 'c',
                    summary: 's',
                    handler: async (rest) => okEnvelope('ww tok c', { rest }),
                },
            ],
        });
        const result = await runPortal({
            argv: ['tok', 'c', '--tag', 'c', 'x', '--json'],
            noExit: true,
            stdout: nullIo(),
            stderr: nullIo(),
        });
        expect(result.ok).toBe(true);
        // handler 收到的 rest 含门户级 --json（既有语义：handler 自行解析 --json）
        expect((result.data as { rest: string[] }).rest).toEqual(['--tag', 'c', 'x', '--json']);
    });
});
