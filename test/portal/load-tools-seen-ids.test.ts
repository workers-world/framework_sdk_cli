import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { clearDiscoverState, loadTools } from '../../src/portal/discover.js';

function writeFixtureTool(dir: string, fileName: string, id: string): string {
    const rel = `./${fileName}`;
    writeFileSync(
        join(dir, fileName),
        `export const manifest = {
  apiVersion: 'ww.tool/v1',
  id: ${JSON.stringify(id)},
  title: 'Fixture',
  summary: 'fixture tool',
  version: '1.0.0',
  sdkRange: '^0.2.0',
  commands: [{ name: 'ping', summary: 'ping', examples: ['ww ${id} ping'], sideEffects: 'none' }],
};
export function register() {}
`,
    );
    return rel;
}

function writePortalRoot(tools: string[]): string {
    const portalRoot = mkdtempSync(join(tmpdir(), 'ww-portal-seenids-'));
    writeFileSync(
        join(portalRoot, 'package.json'),
        JSON.stringify({
            name: 'fixture-portal-seenids',
            ww: { tools },
        }),
    );
    return portalRoot;
}

describe('loadTools seenIds lifecycle', () => {
    afterEach(() => {
        clearDiscoverState();
    });

    it('does not treat the same tool as DUPLICATE_ID across successive loadTools calls', async () => {
        const portalRoot = writePortalRoot([]);
        const spec = writeFixtureTool(portalRoot, 'tool-a.mjs', 'fixture-a');
        writeFileSync(
            join(portalRoot, 'package.json'),
            JSON.stringify({
                name: 'fixture-portal-seenids',
                ww: { tools: [spec] },
            }),
        );

        const first = await loadTools({ portalRoot });
        expect(first.skipped).toEqual([]);
        expect(first.loaded).toEqual(['fixture-a']);

        // Without clearing at the start of loadTools, this would skip as DUPLICATE_ID.
        const second = await loadTools({ portalRoot });
        expect(second.skipped).toEqual([]);
        expect(second.loaded).toEqual(['fixture-a']);
    });

    it('still rejects duplicate ids within a single loadTools call', async () => {
        const portalRoot = writePortalRoot([]);
        const a = writeFixtureTool(portalRoot, 'tool-a.mjs', 'same-id');
        const b = writeFixtureTool(portalRoot, 'tool-b.mjs', 'same-id');
        writeFileSync(
            join(portalRoot, 'package.json'),
            JSON.stringify({
                name: 'fixture-portal-seenids',
                ww: { tools: [a, b] },
            }),
        );

        const result = await loadTools({ portalRoot });
        expect(result.loaded).toEqual(['same-id']);
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0]?.code).toBe('DUPLICATE_ID');
        expect(result.skipped[0]?.toolPath).toBe(b);
    });
});
