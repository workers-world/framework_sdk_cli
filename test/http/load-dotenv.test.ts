import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveDeployTrackerBase } from '../../src/http/env.js';
import { loadDotEnv, parseDotEnv, resetDotEnvLoadedForTests } from '../../src/http/load-dotenv.js';

describe('parseDotEnv', () => {
    it('parses keys, comments, quotes, export via util.parseEnv', () => {
        const parsed = parseDotEnv(`
# comment
FOO=bar
export BAZ=qux
QUOTED="hello world"
SINGLE='x=y'
EMPTY=
`);
        expect(parsed).toEqual({
            FOO: 'bar',
            BAZ: 'qux',
            QUOTED: 'hello world',
            SINGLE: 'x=y',
            EMPTY: '',
        });
    });
});

describe('loadDotEnv', () => {
    const previous: Record<string, string | undefined> = {};

    afterEach(() => {
        for (const key of Object.keys(previous)) {
            if (previous[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = previous[key];
            }
            delete previous[key];
        }
        resetDotEnvLoadedForTests();
    });

    function stash(key: string) {
        if (!(key in previous)) {
            previous[key] = process.env[key];
        }
    }

    it('loads from cwd/.env without overriding existing env', () => {
        const dir = mkdtempSync(join(tmpdir(), 'cli-dotenv-'));
        writeFileSync(
            join(dir, '.env'),
            'DEPLOY_TRACKER_BASE=https://from-dotenv.example\nRULES_ADMIN_TOKEN=from-file\n',
        );
        stash('DEPLOY_TRACKER_BASE');
        stash('RULES_ADMIN_TOKEN');
        process.env.DEPLOY_TRACKER_BASE = 'https://already-set.example';
        delete process.env.RULES_ADMIN_TOKEN;

        const result = loadDotEnv({ cwd: dir, maxDepth: 1 });
        expect(result.path).toBe(join(dir, '.env'));
        expect(result.keys).toContain('RULES_ADMIN_TOKEN');
        expect(result.keys).not.toContain('DEPLOY_TRACKER_BASE');
        expect(process.env.DEPLOY_TRACKER_BASE).toBe('https://already-set.example');
        expect(process.env.RULES_ADMIN_TOKEN).toBe('from-file');
    });

    it('walks up to parent .env', () => {
        const root = mkdtempSync(join(tmpdir(), 'cli-dotenv-up-'));
        writeFileSync(join(root, '.env'), 'DEPLOY_TRACKER_BASE=https://parent.example\n');
        const child = join(root, 'nested');
        mkdirSync(child);
        stash('DEPLOY_TRACKER_BASE');
        delete process.env.DEPLOY_TRACKER_BASE;

        const result = loadDotEnv({ cwd: child, maxDepth: 3 });
        expect(result.path).toBe(join(root, '.env'));
        expect(process.env.DEPLOY_TRACKER_BASE).toBe('https://parent.example');
    });

    it('resolveDeployTrackerBase reads .env via ensureDotEnvLoaded', () => {
        const dir = mkdtempSync(join(tmpdir(), 'cli-dotenv-resolve-'));
        const envPath = join(dir, '.env');
        writeFileSync(envPath, 'DEPLOY_TRACKER_BASE=https://resolve.example\n');
        stash('DEPLOY_TRACKER_BASE');
        stash('WW_ENV_FILE');
        delete process.env.DEPLOY_TRACKER_BASE;
        process.env.WW_ENV_FILE = envPath;
        resetDotEnvLoadedForTests();

        expect(resolveDeployTrackerBase()).toBe('https://resolve.example');
    });
});
