import { describe, expect, it } from 'vitest';
import { PORTAL_RESERVED_TOOL_IDS, validateManifest } from '../../src/portal/manifest.js';

describe('validateManifest', () => {
    it('rejects reserved id', () => {
        const r = validateManifest({
            apiVersion: 'ww.tool/v1',
            id: 'doctor',
            title: 'x',
            summary: 'y',
            version: '1.0.0',
            sdkRange: '^0.2.0',
            commands: [
                {
                    name: 'run',
                    summary: 's',
                    examples: ['ww x run'],
                    sideEffects: 'none',
                },
            ],
        });
        expect(r.ok).toBe(false);
        expect(r.issues.some((i) => i.code === 'RESERVED')).toBe(true);
    });

    it('accepts minimal valid manifest', () => {
        const r = validateManifest({
            apiVersion: 'ww.tool/v1',
            id: 'demo',
            title: 'Demo',
            summary: 'demo tool',
            version: '1.0.0',
            sdkRange: '^0.2.0',
            commands: [
                {
                    name: 'ping',
                    summary: 'ping',
                    examples: ['ww demo ping'],
                    sideEffects: 'none',
                },
            ],
        });
        expect(r.ok).toBe(true);
    });
});

describe('PORTAL_RESERVED_TOOL_IDS', () => {
    it('includes doctor and update', () => {
        expect(PORTAL_RESERVED_TOOL_IDS.has('doctor')).toBe(true);
        expect(PORTAL_RESERVED_TOOL_IDS.has('update')).toBe(true);
    });
});
