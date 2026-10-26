import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * Regression for dual-registry bundling: portal-entry must call registerTool on the
 * same Map that dist/index.js exports (issue #34).
 */
describe('loadTools + framework_sdk_cli/workspace/portal-entry', () => {
    type Sdk = typeof import('../../dist/index.js');

    let sdk: Sdk;

    beforeAll(async () => {
        const distIndex = pathToFileURL(join(import.meta.dirname, '../../dist/index.js')).href;
        sdk = await import(distIndex);
    });

    afterEach(() => {
        sdk.clearRegisteredTools();
        sdk.clearDiscoverState();
    });

    it('registers wt on the main package tool registry', async () => {
        const portalRoot = mkdtempSync(join(tmpdir(), 'ww-portal-loadtools-'));
        writeFileSync(
            join(portalRoot, 'package.json'),
            JSON.stringify({
                name: 'fixture-portal',
                ww: { tools: ['framework_sdk_cli/workspace/portal-entry'] },
            }),
        );

        const result = await sdk.loadTools({ portalRoot });

        expect(result.skipped).toEqual([]);
        expect(result.loaded).toContain('wt');
        expect(sdk.getRegisteredTool('wt')).toBeDefined();
        expect(sdk.listRegisteredTools().some((t) => t.id === 'wt')).toBe(true);
    });
});
