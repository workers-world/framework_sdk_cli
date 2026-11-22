import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceTool } from '../../src/workspace/catalog.js';
import { runWorkspaceTool } from '../../src/workspace/exec-script.js';

// 拦截 spawn：返回可控的假子进程，用于精确构造跨 chunk 边界的多字节输出。
// 假 stdout 模拟真实流：只有当被调用 setEncoding 后才按 StringDecoder 整流解码出字符串，
// 否则原样发 Buffer（老代码按 chunk toString('utf8') 会把多字节字符截断成乱码）。
vi.mock('node:child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:child_process')>();
    const { EventEmitter } = await import('node:events');
    const { StringDecoder } = await import('node:string_decoder');
    const makeStream = () => {
        const stream = new EventEmitter();
        let decoder: StringDecoder | null = null;
        (stream as { setEncoding: (enc: string) => void }).setEncoding = (enc: string) => {
            decoder = new StringDecoder(enc);
        };
        return { stream, emit: (b: Buffer) => stream.emit('data', decoder ? decoder.write(b) : b) };
    };
    const out = makeStream();
    const errOut = makeStream();
    const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        emitStdout: (b: Buffer) => void;
        emitStderr: (b: Buffer) => void;
        close: () => void;
    };
    child.stdout = out.stream;
    child.stderr = errOut.stream;
    child.emitStdout = out.emit;
    child.emitStderr = errOut.emit;
    child.close = () => child.emit('close', 0, null);
    return {
        ...actual,
        spawn: vi.fn(() => child),
    };
});

import { spawn } from 'node:child_process';

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

/** exec-script：流式输出须整流解码，跨 chunk 的多字节字符不得被 toString('utf8') 截断成乱码 */
describe('runWorkspaceTool utf8 流式解码', () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'ww-exec-utf8-'));
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, 'x.mjs'), 'export {}\n');
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
        vi.clearAllMocks();
    });

    const tool: WorkspaceTool = {
        id: 'x',
        title: 'x',
        summary: 's',
        script: 'x.mjs',
        examples: [],
    };

    it('中文输出跨 chunk 边界保持完整（json 模式走 stderr）', async () => {
        const text = `中文断言${'甲'.repeat(200)}乙丙`;
        const buf = Buffer.from(text, 'utf8');
        // 在「甲」字符的 3 字节中间切开（offset 3 起为第二个字符，切在 5）
        const a = buf.subarray(0, 5);
        const b = buf.subarray(5);
        expect(a.toString('utf8')).toContain('\uFFFD'); // 切口确实落在字符内部

        const errOut = captureIo();
        const runPromise = runWorkspaceTool(tool, [], root, {
            json: true,
            io: { stdout: captureIo().stream, stderr: errOut.stream },
        });

        const child = vi.mocked(spawn).mock.results[0]?.value as unknown as {
            emitStdout: (b: Buffer) => void;
            close: () => void;
        };
        child.emitStdout(a);
        child.emitStdout(b);
        child.close();

        const result = await runPromise;
        expect(result.exitCode).toBe(0);
        expect(errOut.text()).toBe(text);
    });
});
