import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '../..');
const distIndexPath = join(repoRoot, 'dist/index.js');

function ensureDistBuilt(): void {
    if (existsSync(distIndexPath)) {
        return;
    }
    execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
}

/**
 * Regression for dual-registry bundling: portal-entry must call registerTool on the
 * same Map that dist/index.js exports (issue #34).
 */
describe('loadTools + framework_sdk_cli/workspace/portal-entry', () => {
    type Sdk = typeof import('../../dist/index.js');

    let sdk: Sdk;

    beforeAll(async () => {
        ensureDistBuilt();
        sdk = await import(pathToFileURL(distIndexPath).href);
    }, 120_000);

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
