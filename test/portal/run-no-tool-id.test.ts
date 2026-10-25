import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('runPortal has no concrete tool id branches', () => {
    it('grep run.ts for tool.id ===', () => {
        const src = readFileSync(join(import.meta.dirname, '../../src/portal/run.ts'), 'utf8');
        expect(src).not.toMatch(/tool\.id\s*===\s*['"]/);
    });
});
