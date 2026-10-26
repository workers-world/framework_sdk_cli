import { describe, expect, it } from 'vitest';
import { EXIT, errorEnvelope, needConfirmEnvelope, okEnvelope } from '../../src/envelope/index.js';
import { mapWorkerIoToProcess } from '../../src/http/index.js';

describe('process envelope', () => {
    it('okEnvelope sets exit 0', () => {
        const e = okEnvelope('ww list', { tools: [] });
        expect(e.ok).toBe(true);
        expect(e.meta.exit_code).toBe(EXIT.OK);
        expect(e.meta.side_effects).toBe('complete');
    });

    it('needConfirmEnvelope exit 2', () => {
        const e = needConfirmEnvelope('ww pgreq issue', { preview: { title: 't' } });
        expect(e.ok).toBe(false);
        expect(e.error?.code).toBe('NEED_CONFIRM');
        expect(e.error?.message).toContain('--confirm --json');
        expect(e.meta.exit_code).toBe(EXIT.USAGE);
        expect(e.data).toEqual({ preview: { title: 't' } });
        expect(e.error?.fix).toEqual({
            kind: 'rerun',
            command: 'ww pgreq issue --confirm --json',
            flag: 'confirm',
        });
    });

    it('mapWorkerIo maps preview type to NEED_CONFIRM', () => {
        const e = mapWorkerIoToProcess(
            'ww pgreq issue',
            {
                status: 400,
                envelope: {
                    type: 'workers-world.planning.github_issue_preview',
                    data: { preview: { title: 'x' } },
                    wwsummary: 'preview x',
                },
                rawText: '',
            },
            { previewType: 'workers-world.planning.github_issue_preview' },
        );
        expect(e.ok).toBe(false);
        expect(e.error?.code).toBe('NEED_CONFIRM');
        expect(e.meta.exit_code).toBe(EXIT.USAGE);
    });

    it('mapWorkerIo maps 401 to AUTH', () => {
        const e = mapWorkerIoToProcess('ww pgreq show', {
            status: 401,
            envelope: { wwerror: { code: 'UNAUTHORIZED', message: 'no' } },
            rawText: '',
        });
        expect(e.meta.exit_code).toBe(EXIT.AUTH);
    });

    it('mapWorkerIo omits HTML from error.message when envelope is empty', () => {
        const e = mapWorkerIoToProcess('ww desk drafts list', {
            status: 403,
            envelope: null,
            rawText: '<!DOCTYPE html><html><body>Cloudflare Access</body></html>',
        });
        expect(e.error?.message?.toLowerCase()).not.toContain('<html');
        expect(e.error?.message).toContain('non-JSON body omitted');
    });

    it('mapWorkerIo treats Access login HTML via host URL, not path substring', () => {
        const withHost = mapWorkerIoToProcess('ww desk drafts list', {
            status: 403,
            envelope: null,
            rawText: '{"err":"see https://team.cloudflareaccess.com/cdn-cgi/access/login"}',
        });
        expect(withHost.error?.message).toContain('non-JSON body omitted');

        const pathOnly = mapWorkerIoToProcess('ww desk drafts list', {
            status: 403,
            envelope: { wwerror: { code: 'X', message: 'evil.com/cloudflareaccess.com/foo' } },
            rawText: '',
        });
        expect(pathOnly.error?.message).toBe('evil.com/cloudflareaccess.com/foo');
    });

    it('errorEnvelope unknown is not retryable', () => {
        const e = errorEnvelope('ww', EXIT.UNKNOWN, { code: 'X', message: 'y' });
        expect(e.meta.retryable).toBe(false);
        expect(e.meta.side_effects).toBe('unknown');
    });
});
