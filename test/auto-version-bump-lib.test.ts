import { describe, expect, it } from 'vitest';
import {
    bumpSemver,
    parseSemver,
    resolveNextVersion,
    SKIP_VERSION_BUMP_MARKER,
    shouldSkipVersionBump,
} from '../.github/scripts/auto-version-bump-lib.mjs';

describe('auto-version-bump-lib (framework_sdk_cli)', () => {
    it('skip marker matches release-actions-bundle subject convention', () => {
        expect(SKIP_VERSION_BUMP_MARKER).toBe('[skip version-bump]');
        expect(shouldSkipVersionBump(`chore: bump ${SKIP_VERSION_BUMP_MARKER}`)).toBe(true);
        expect(shouldSkipVersionBump('feat: user-visible change')).toBe(false);
    });

    it('default patch bump from package version', () => {
        expect(bumpSemver('0.2.2', 'patch')).toBe('0.2.3');
        expect(bumpSemver('0.2.2', 'minor')).toBe('0.3.0');
        expect(bumpSemver('0.2.2', 'major')).toBe('1.0.0');
    });

    it('resolveNextVersion skips when package already ahead of published', () => {
        const r = resolveNextVersion({
            packageVersion: '0.2.3',
            publishedVersion: '0.2.2',
        });
        expect(r.next).toBeNull();
    });

    it('resolveNextVersion patch+1 when equal to published', () => {
        const r = resolveNextVersion({
            packageVersion: '0.2.2',
            publishedVersion: '0.2.2',
        });
        expect(r.next).toBe('0.2.3');
    });

    it('resolveNextVersion honors explicit workflow_dispatch version', () => {
        const r = resolveNextVersion({
            packageVersion: '0.2.2',
            publishedVersion: '0.2.2',
            explicitVersion: '1.0.0',
        });
        expect(r.next).toBe('1.0.0');
    });

    it('parseSemver rejects invalid', () => {
        expect(() => parseSemver('0.2')).toThrow(/X\.Y\.Z/);
    });
});
