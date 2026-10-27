import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../..');
const workflow = readFileSync(join(root, '.github/workflows/sync-package-to-r2.yml'), 'utf8');
const scriptsPkg = JSON.parse(readFileSync(join(root, '.github/scripts/package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
};

describe('sync-package-to-r2 workflow (R2 AWS SDK install)', () => {
    it('does not use npx to load @aws-sdk/client-s3 (no bin / not on ESM path)', () => {
        // Ignore YAML comments; only reject a real shell/npx invocation.
        const runnable = workflow
            .split('\n')
            .filter((line) => !/^\s*#/.test(line))
            .join('\n');
        expect(runnable).not.toMatch(/\bnpx\b[^\n]*@aws-sdk\/client-s3/);
    });

    it('installs deps beside the sync script from .github/scripts/package.json', () => {
        expect(workflow).toMatch(/npm install --prefix \.github\/scripts/);
        expect(scriptsPkg.dependencies?.['@aws-sdk/client-s3']).toBe('3.758.0');
    });
});
