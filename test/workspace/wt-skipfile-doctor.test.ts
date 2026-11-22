import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWtChecks } from '../../src/workspace/wt-checks.js';

/** doctor wt.skipfile：坏文件须判 fail（回归：此前 loadSkipFile 误传 path，坏文件测不出来） */
describe('wt doctor wt.skipfile', () => {
    const dirs: string[] = [];

    afterEach(() => {
        vi.unstubAllEnvs();
        for (const d of dirs.splice(0)) {
            rmSync(d, { recursive: true, force: true });
        }
    });

    function makeWorkspace(skipContent?: string): string {
        const root = mkdtempSync(join(tmpdir(), 'ww-wt-skipfile-'));
        dirs.push(root);
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, 'bulk-pull-repos.sh'), '#!/bin/bash\n');
        if (skipContent !== undefined) {
            writeFileSync(join(root, '.ww-workspace-skip.json'), skipContent);
        }
        vi.stubEnv('WW_WORKSPACE_ROOT', root);
        return root;
    }

    function runSkipfileCheck(): { status: string; message: string } {
        const check = createWtChecks().find((c) => c.id === 'wt.skipfile');
        if (!check) {
            throw new Error('wt.skipfile check missing');
        }
        return check.run({ env: process.env, json: true });
    }

    it('坏 JSON → fail', () => {
        makeWorkspace('{ broken json');
        const r = runSkipfileCheck();
        expect(r.status).toBe('fail');
    });

    it('合法 JSON → ok', () => {
        makeWorkspace('{ "skip": { "push": ["cpt1"] } }');
        expect(runSkipfileCheck().status).toBe('ok');
    });

    it('skip 文件不存在 → ok（可选）', () => {
        makeWorkspace(undefined);
        expect(runSkipfileCheck().status).toBe('ok');
    });
});
