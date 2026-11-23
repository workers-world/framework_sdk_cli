import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 只拦截 renameSync / writeFileSync（保持真实实现），验证 saveSkipFile 的 tmp+rename 原子写路径
vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs')>();
    return {
        ...actual,
        writeFileSync: vi.fn((...args: Parameters<typeof actual.writeFileSync>) =>
            actual.writeFileSync(...args),
        ),
        renameSync: vi.fn((...args: Parameters<typeof actual.renameSync>) =>
            actual.renameSync(...args),
        ),
    };
});

import { renameSync, writeFileSync } from 'node:fs';
import { saveSkipFile, skipFilePath } from '../../src/workspace/skip-file.js';

describe('saveSkipFile 原子写（tmp+rename）', () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'ww-skip-atomic-'));
        mkdirSync(root, { recursive: true });
    });

    afterEach(() => {
        vi.clearAllMocks();
        rmSync(root, { recursive: true, force: true });
    });

    it('先写 .tmp 临时文件再 rename 到最终路径，成功后无残留 tmp', () => {
        saveSkipFile(root, { skip: { push: ['cpt1', 'sch1'] } });

        expect(renameSync).toHaveBeenCalledTimes(1);
        const calls = vi.mocked(renameSync).mock.calls[0] ?? [];
        const [tmpPath, destPath] = calls as unknown as [string, string];
        expect(destPath).toBe(skipFilePath(root));
        // 临时文件与目标同目录、带 .tmp 后缀（含 pid），与 git-cache.ts 同模式
        expect(tmpPath).toContain(root);
        expect(tmpPath).toMatch(/\.tmp$/);
        expect(tmpPath).not.toBe(destPath);

        // writeFileSync 的目标必须是 tmp 路径，而不是最终路径（否则非原子）
        const writeTarget = vi.mocked(writeFileSync).mock.calls.at(-1)?.[0];
        expect(writeTarget).toBe(tmpPath);

        // rename 真实生效：最终文件内容正确，tmp 无残留
        expect(JSON.parse(readFileSync(destPath, 'utf8'))).toEqual({
            skip: { push: ['cpt1', 'sch1'] },
        });
        expect(existsSync(tmpPath)).toBe(false);
    });

    it('模拟中断（rename 抛错）不留坏文件：旧内容保留、tmp 可清理', () => {
        // 先成功写一次旧内容
        saveSkipFile(root, { skip: { push: ['old1'] } });
        const dest = skipFilePath(root);

        // 下一次 rename 中途失败
        vi.mocked(renameSync).mockImplementationOnce(() => {
            throw new Error('simulated crash during rename');
        });
        expect(() => saveSkipFile(root, { skip: { push: ['new1'] } })).toThrow(
            /simulated crash during rename/,
        );

        // 最终文件仍是旧内容（半截坏 JSON 不会出现在 dest）
        expect(JSON.parse(readFileSync(dest, 'utf8'))).toEqual({ skip: { push: ['old1'] } });

        // 恢复后（走 vi.mock 工厂里的默认实现）可正常写入新内容
        saveSkipFile(root, { skip: { push: ['new1'] } });
        expect(JSON.parse(readFileSync(dest, 'utf8'))).toEqual({ skip: { push: ['new1'] } });
    });
});
