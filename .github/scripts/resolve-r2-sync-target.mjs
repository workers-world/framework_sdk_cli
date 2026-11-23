#!/usr/bin/env node
/**
 * workflow 入口：根据事件解析要同步的包坐标，写入 GITHUB_OUTPUT。
 * 不下载 tarball。坐标规则在 sync-published-package-to-r2.mjs。
 *
 * workflow_run 时从触发 run 的 commit 读 package.json（API），
 * 不依赖 workspace 里 checkout 的版本——listener 在默认分支，发布提交在 master。
 */
import { appendFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolveSyncTarget } from './sync-published-package-to-r2.mjs';

const JOBS_PER_PAGE = 100;
/** Safety cap: 100 pages × 100 jobs (GitHub max per_page). */
const JOBS_PAGE_LIMIT = 100;

function fail(message) {
    console.error(`::error::${message}`);
    process.exit(1);
}

/**
 * @param {string} key
 * @param {string} value
 */
function writeOutput(key, value) {
    const output = process.env.GITHUB_OUTPUT;
    if (!output) {
        fail('GITHUB_OUTPUT is not set');
    }
    if (value.includes('\n')) {
        fail(`output ${key} contains a newline`);
    }
    appendFileSync(output, `${key}=${value}\n`);
}

function ghHeaders() {
    return {
        authorization: `Bearer ${process.env.GH_TOKEN ?? ''}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'framework-sdk-cli-sync-package-to-r2',
    };
}

/**
 * Parse GitHub Link header for rel="next".
 * @param {string | null} linkHeader
 * @returns {string | null}
 */
export function nextLinkFromHeader(linkHeader) {
    if (!linkHeader) {
        return null;
    }
    for (const part of linkHeader.split(',')) {
        const match = part.trim().match(/^<([^>]+)>\s*;\s*rel="next"$/i);
        if (match) {
            return match[1];
        }
    }
    return null;
}

/**
 * Walk Actions jobs pages until the named job is found (or pages are exhausted).
 *
 * @param {string} repo
 * @param {string} runId
 * @param {string} jobName
 * @param {{ fetchImpl?: typeof fetch, perPage?: number, pageLimit?: number }} [opts]
 * @returns {Promise<{ name?: string, conclusion?: string | null } | undefined>}
 */
export async function findWorkflowRunJob(repo, runId, jobName, opts = {}) {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    const perPage = opts.perPage ?? JOBS_PER_PAGE;
    const pageLimit = opts.pageLimit ?? JOBS_PAGE_LIMIT;
    let url =
        `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs` +
        `?per_page=${perPage}&page=1`;

    for (let page = 1; page <= pageLimit; page += 1) {
        const res = await fetchImpl(url, { headers: ghHeaders() });
        if (!res.ok) {
            const body = await res.text();
            fail(`list jobs failed ${res.status}: ${body.slice(0, 300)}`);
        }
        const data = await res.json();
        const jobs = Array.isArray(data.jobs) ? data.jobs : [];
        const found = jobs.find((job) => job && job.name === jobName);
        if (found) {
            return found;
        }

        const nextFromLink = nextLinkFromHeader(res.headers?.get?.('link') ?? null);
        if (nextFromLink) {
            url = nextFromLink;
            continue;
        }

        const total = typeof data.total_count === 'number' ? data.total_count : 0;
        if (jobs.length === 0 || jobs.length < perPage || page * perPage >= total) {
            return undefined;
        }
        url =
            `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs` +
            `?per_page=${perPage}&page=${page + 1}`;
    }

    fail(`list jobs exceeded ${pageLimit} pages without finding job ${jobName}`);
}

/**
 * @param {string} repo
 * @param {string} runId
 * @param {{ fetchImpl?: typeof fetch, perPage?: number, pageLimit?: number }} [opts]
 */
export async function publishJobSucceeded(repo, runId, opts = {}) {
    const publish = await findWorkflowRunJob(repo, runId, 'publish', opts);
    console.log(`publish job conclusion=${publish?.conclusion ?? 'missing'}`);
    return publish?.conclusion === 'success';
}

async function packageJsonVersionAt(repo, ref) {
    const url = `https://api.github.com/repos/${repo}/contents/package.json?ref=${encodeURIComponent(ref)}`;
    const res = await fetch(url, { headers: ghHeaders() });
    if (!res.ok) {
        const body = await res.text();
        fail(`read package.json@${ref} failed ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    if (data.encoding !== 'base64' || typeof data.content !== 'string') {
        fail(`package.json@${ref} response was not base64`);
    }
    const text = Buffer.from(data.content, 'base64').toString('utf8');
    const pkg = JSON.parse(text);
    return typeof pkg.version === 'string' ? pkg.version : '';
}

async function main() {
    const eventName = process.env.EVENT_NAME ?? '';
    const repo = process.env.REPO ?? '';
    let publishJobSucceededFlag = false;
    let packageJsonVersion = '';

    if (eventName === 'workflow_run') {
        const runId = process.env.WORKFLOW_RUN_ID ?? '';
        if (!repo || !runId) {
            fail('workflow_run is missing repository or run id');
        }
        publishJobSucceededFlag = await publishJobSucceeded(repo, runId);
        if (publishJobSucceededFlag) {
            const ref =
                process.env.WORKFLOW_RUN_EVENT === 'workflow_dispatch'
                    ? 'refs/heads/master'
                    : (process.env.WORKFLOW_RUN_HEAD_SHA ?? '');
            if (!ref) {
                fail('workflow_run is missing head sha');
            }
            packageJsonVersion = await packageJsonVersionAt(repo, ref);
            console.log(`package.json version ${packageJsonVersion} at ${ref}`);
        }
    }

    const target = resolveSyncTarget({
        eventName,
        inputPackageName: process.env.INPUT_PACKAGE_NAME,
        inputPackageVersion: process.env.INPUT_PACKAGE_VERSION,
        registryPackageName: process.env.REGISTRY_PACKAGE_NAME,
        registryPackageNamespace: process.env.REGISTRY_PACKAGE_NAMESPACE,
        registryPackageVersion: process.env.REGISTRY_PACKAGE_VERSION,
        registryPackageVersionName: process.env.REGISTRY_PACKAGE_VERSION_NAME,
        packageJsonVersion,
        publishJobSucceeded: publishJobSucceededFlag,
    });

    if (target.skip) {
        console.log(`Skip sync: ${target.reason}`);
    } else {
        console.log(`Sync ${target.name}@${target.version} (on missing: ${target.onMissing})`);
    }

    writeOutput('skip', target.skip ? 'true' : 'false');
    writeOutput('name', target.name);
    writeOutput('version', target.version);
    writeOutput('on_missing', target.onMissing);
}

function invokedDirectly() {
    const entry = process.argv[1];
    if (!entry) {
        return false;
    }
    try {
        return import.meta.url === pathToFileURL(realpathSync(entry)).href;
    } catch {
        return false;
    }
}

if (invokedDirectly()) {
    main().catch((err) => {
        fail(err instanceof Error ? err.message : String(err));
    });
}