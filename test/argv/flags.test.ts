import { describe, expect, it } from 'vitest';
import { mapConfirmToApplyArgv } from '../../src/argv/flags.js';

describe('mapConfirmToApplyArgv', () => {
    it('maps --confirm to --apply', () => {
        expect(mapConfirmToApplyArgv(['cursor', '--confirm', '--yes'])).toEqual([
            'cursor',
            '--apply',
            '--yes',
        ]);
    });

    it('drops --confirm when --apply already present', () => {
        expect(mapConfirmToApplyArgv(['--apply', '--confirm'])).toEqual(['--apply']);
    });
});
