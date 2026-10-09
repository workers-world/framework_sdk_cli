import { describe, expect, it } from 'vitest';
import {
    composeMultiDepsBumpMessage,
    composeSquashCommitMessage,
    isBumpCommitSubject,
} from '../../src/workspace/bump-messages.js';

describe('bump-messages', () => {
    it('whitelist matches deps and ci bumps', () => {
        expect(isBumpCommitSubject('chore(deps): bump framework_sdk_worker to 0.1.0')).toBe(true);
        expect(
            isBumpCommitSubject('chore(ci): bump worker-actions bundle to actions/v0.2.25'),
        ).toBe(true);
        expect(isBumpCommitSubject('CI action 自动刷新 package-lock')).toBe(true);
        expect(isBumpCommitSubject('feat: real work')).toBe(false);
    });

    it('composeSquash merges deps + actions', () => {
        const msg = composeSquashCommitMessage([
            'chore(deps): bump framework_sdk_worker to 0.4.27',
            'chore(deps): bump framework_sdk_ui to 0.1.14',
            'chore(ci): bump worker-actions bundle to actions/v0.2.25',
        ]);
        expect(msg).toBe('chore(deps): bump framework_sdk_worker/ui + worker-actions');
    });

    it('composeMultiDepsBumpMessage single package', () => {
        expect(
            composeMultiDepsBumpMessage([{ sdk: 'framework_sdk_worker', version: '1.0.0' }]),
        ).toBe('chore(deps): bump framework_sdk_worker to 1.0.0');
    });
});
