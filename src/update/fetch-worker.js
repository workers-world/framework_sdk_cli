#!/usr/bin/env node
/**
 * Detached worker: refresh git behind cache for repos (argv: cacheFile repo1 repo2 …).
 */
import { refreshRepos } from './git-cache.js';

const [, , file, ...repos] = process.argv;
if (!file || repos.length === 0) {
    process.exit(0);
}
try {
    refreshRepos({ repos, file, fetch: 'auto', env: process.env });
} catch {
    /* ignore */
}
