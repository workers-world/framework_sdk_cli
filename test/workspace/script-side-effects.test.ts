import { describe, expect, it } from 'vitest';
import { sideEffectsForScriptExit } from '../../src/workspace/script-side-effects.js';

describe('script side_effects (WW-126)', () => {
    it('non-zero bulk exit is unknown', () => {
        expect(sideEffectsForScriptExit('push', [], 5)).toBe('unknown');
        expect(sideEffectsForScriptExit('push', [], 3)).toBe('unknown');
    });

    it('cloc non-zero stays none', () => {
        expect(sideEffectsForScriptExit('cloc', [], 1)).toBe('none');
    });

    it('remote dry-run non-zero stays none', () => {
        expect(sideEffectsForScriptExit('remote', ['cursor'], 1)).toBe('none');
    });

    it('remote --apply non-zero is unknown', () => {
        expect(sideEffectsForScriptExit('remote', ['cursor', '--apply'], 1)).toBe('unknown');
    });
});
