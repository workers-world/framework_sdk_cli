import { describe, expect, it, vi } from 'vitest';
import {
    findWorkflowRunJob,
    nextLinkFromHeader,
    publishJobSucceeded,
} from '../.github/scripts/resolve-r2-sync-target.mjs';

describe('nextLinkFromHeader', () => {
    it('returns null when header is missing', () => {
        expect(nextLinkFromHeader(null)).toBeNull();
    });

    it('extracts rel=next from a GitHub Link header', () => {
        const link =
            '<https://api.github.com/repos/o/r/actions/runs/1/jobs?page=2&per_page=2>; rel="next", ' +
            '<https://api.github.com/repos/o/r/actions/runs/1/jobs?page=5&per_page=2>; rel="last"';
        expect(nextLinkFromHeader(link)).toBe(
            'https://api.github.com/repos/o/r/actions/runs/1/jobs?page=2&per_page=2',
        );
    });
});

function jsonResponse(body: unknown, link?: string) {
    const headers = {
        get(name: string) {
            if (name.toLowerCase() === 'link') {
                return link ?? null;
            }
            return null;
        },
    };
    return {
        ok: true,
        headers,
        async json() {
            return body;
        },
        async text() {
            return JSON.stringify(body);
        },
    };
}

describe('findWorkflowRunJob pagination', () => {
    it('finds publish on a later page via Link rel=next', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse(
                    {
                        total_count: 3,
                        jobs: [
                            { name: 'sync-lock', conclusion: 'skipped' },
                            { name: 'verify', conclusion: 'skipped' },
                        ],
                    },
                    '<https://api.github.com/repos/o/r/actions/runs/9/jobs?page=2&per_page=2>; rel="next"',
                ),
            )
            .mockResolvedValueOnce(
                jsonResponse({
                    total_count: 3,
                    jobs: [{ name: 'publish', conclusion: 'success' }],
                }),
            );

        const job = await findWorkflowRunJob('o/r', '9', 'publish', {
            fetchImpl: fetchImpl as unknown as typeof fetch,
            perPage: 2,
        });

        expect(job?.name).toBe('publish');
        expect(job?.conclusion).toBe('success');
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
});

describe('publishJobSucceeded', () => {
    it('is true only when publish conclusion is success', async () => {
        const ok = vi.fn().mockResolvedValue(
            jsonResponse({
                total_count: 1,
                jobs: [{ name: 'publish', conclusion: 'success' }],
            }),
        );
        await expect(
            publishJobSucceeded('o/r', '1', { fetchImpl: ok as unknown as typeof fetch }),
        ).resolves.toBe(true);
    });
});
