import { describe, expect, it } from 'vitest';
import { fetchBearer } from '../../src/http/bearer.js';

/** fetchBearer：默认 30s AbortSignal 超时（fetch 本身无超时会把 CLI 挂死） */
describe('fetchBearer timeout', () => {
    it('默认请求带 AbortSignal（30s）', async () => {
        let captured: RequestInit | undefined;
        const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
            captured = init;
            return new Response('{"specversion":"1.0"}', { status: 200 });
        }) as unknown as typeof fetch;
        const res = await fetchBearer({
            baseUrl: 'https://example.test',
            token: 't',
            path: '/v1',
            fetchImpl,
        });
        expect(res.status).toBe(200);
        expect(captured?.signal).toBeInstanceOf(AbortSignal);
    });

    it('timeoutMs 超时后中断挂死的请求', async () => {
        const fetchImpl = ((_url: string | URL, init?: RequestInit) =>
            new Promise<Response>((_, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    const e = new Error('The operation was aborted');
                    e.name = 'AbortError';
                    reject(e);
                });
            })) as unknown as typeof fetch;
        await expect(
            fetchBearer({
                baseUrl: 'https://example.test',
                token: 't',
                path: '/v1',
                timeoutMs: 20,
                fetchImpl,
            }),
        ).rejects.toThrow(/abort/i);
    });
});
