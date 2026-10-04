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
        expect(e.meta.exit_code).toBe(EXIT.USAGE);
        expect(e.data).toEqual({ preview: { title: 't' } });
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

    it('errorEnvelope unknown is not retryable', () => {
        const e = errorEnvelope('ww', EXIT.UNKNOWN, { code: 'X', message: 'y' });
        expect(e.meta.retryable).toBe(false);
        expect(e.meta.side_effects).toBe('unknown');
    });
});
