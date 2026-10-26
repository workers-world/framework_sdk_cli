import { afterEach, describe, expect, it } from 'vitest';
import {
    checksHaveFailure,
    clearDiscoverIssues,
    discoverIssueChecks,
    runChecks,
    setDiscoverIssues,
} from '../../src/check/index.js';

describe('discoverIssueChecks', () => {
    afterEach(() => {
        clearDiscoverIssues();
    });

    it('maps discover skips to warn (not fail)', async () => {
        setDiscoverIssues([
            {
                toolPath: 'bad-tool',
                code: 'IMPORT',
                message: 'cannot import module',
            },
        ]);
        const checks = discoverIssueChecks();
        expect(checks).toHaveLength(1);
        expect(checks[0].id).toBe('discover.IMPORT.bad-tool');

        const items = await runChecks(checks, { env: {}, json: false });
        expect(items[0].status).toBe('warn');
        expect(checksHaveFailure(items)).toBe(false);
    });
});
