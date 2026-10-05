import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceFixture = join(fileURLToPath(new URL('.', import.meta.url)), 'workspace');

export function isolatedWorkspaceFixture(): { root: string; cleanup: () => void } {
    const root = mkdtempSync(join(tmpdir(), 'ww-wt-fixture-'));
    cpSync(sourceFixture, root, { recursive: true });
    return {
        root,
        cleanup: () => {
            rmSync(root, { recursive: true, force: true });
        },
    };
}
