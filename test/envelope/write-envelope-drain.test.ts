import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { okEnvelope, writeEnvelope } from '../../src/envelope/index.js';

/** writeEnvelope 背压：write 返回 false 时须等待 drain 再返回（大信封经管道不被截断） */
describe('writeEnvelope drain (WW-126 regression)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function backpressureStream() {
        const stream = new EventEmitter() as EventEmitter & {
            isTTY: boolean;
            write: (s: string) => boolean;
            chunks: string[];
        };
        stream.isTTY = false;
        stream.chunks = [];
        let buffered = false;
        stream.write = (s: string) => {
            stream.chunks.push(s);
            buffered = true;
            return false; // 模拟管道背压
        };
        return { stream, flush: () => (buffered = false) };
    }

    it('write 返回 false → 等待 drain 后才 resolve', async () => {
        const { stream, flush } = backpressureStream();
        const env = okEnvelope('ww list', { big: 'x'.repeat(10_000) });
        const p = writeEnvelope(env, { json: true, stdout: stream, stderr: stream });
        let resolved = false;
        void p.then(() => {
            resolved = true;
        });

        // write 已同步发生，但未 drain 前 promise 未 resolve
        expect(stream.chunks).toHaveLength(1);
        await Promise.resolve();
        await new Promise((r) => setImmediate(r));
        expect(resolved).toBe(false);

        flush(); // 模拟缓冲区排空
        stream.emit('drain');
        await p;
        expect(resolved).toBe(true);
    });

    it('write 返回 true → 直接 resolve，不等 drain 事件', async () => {
        const env = okEnvelope('ww list', { tools: [] });
        const chunks: string[] = [];
        const stream = {
            isTTY: false,
            write: (s: string) => {
                chunks.push(s);
                return true;
            },
        } as unknown as NodeJS.WritableStream;
        await writeEnvelope(env, { json: true, stdout: stream, stderr: stream });
        expect(chunks).toEqual([`${JSON.stringify(env)}\n`]);
    });
});
