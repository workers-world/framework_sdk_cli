#!/usr/bin/env node
/**
 * 从 GitHub Packages 拉取已发布 tarball，写入 R2，并合并 manifest.json。
 * 坐标解析与 workers-world/ww 同源；本仓固定同步 @workers-world/framework_sdk_cli。
 *
 * 环境变量（必填）：
 *   PACKAGE_NAME          如 @workers-world/framework_sdk_cli
 *   PACKAGE_VERSION       semver
 *   NODE_AUTH_TOKEN       packages:read
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET
 * 可选：
 *   R2_KEY_PREFIX         对象键前缀（无尾斜杠）
 *   SYNC_ON_MISSING       skip | fail（默认 fail）。skip 时重试后仍 404 则退出 0，不改 manifest。
 */
import { spawnSync } from 'node:child_process';
import { createWriteStream, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const REGISTRY = 'https://npm.pkg.github.com';
const SDK_PACKAGE_NAME = '@workers-world/framework_sdk_cli';
const NPM_VIEW_ATTEMPTS = 6;
const NPM_VIEW_RETRY_MS = 4000;

/**
 * registry_package.name 对 scoped npm 包有时只是短名，scope 在 namespace。
 * @param {string | undefined} name
 * @param {string | undefined} namespace
 */
export function scopeRegistryPackageName(name, namespace) {
    const raw = (name ?? '').trim();
    const ns = (namespace ?? '').trim();
    if (!raw) {
        return '';
    }
    if (raw.startsWith('@')) {
        return raw;
    }
    if (!ns) {
        return raw;
    }
    return `@${ns}/${raw}`;
}

/**
 * 版本在 package_version.version；部分 payload 只填 package_version.name。
 * 顶层 registry_package.version 不存在。
 * @param {string | undefined} version
 * @param {string | undefined} versionName
 */
export function registryPackageVersion(version, versionName) {
    return (version ?? '').trim() || (versionName ?? '').trim();
}

/**
 * @param {{
 *   eventName: string,
 *   inputPackageName?: string,
 *   inputPackageVersion?: string,
 *   registryPackageName?: string,
 *   registryPackageNamespace?: string,
 *   registryPackageVersion?: string,
 *   registryPackageVersionName?: string,
 *   packageJsonVersion?: string,
 *   publishJobSucceeded?: boolean,
 * }} input
 * @returns {{ skip: boolean, name: string, version: string, onMissing: 'skip' | 'fail', reason: string }}
 */
export function resolveSyncTarget(input) {
    const eventName = input.eventName;
    if (eventName === 'workflow_dispatch') {
        const name = (input.inputPackageName ?? '').trim();
        const version = (input.inputPackageVersion ?? '').trim();
        if (!name || !version) {
            throw new Error('workflow_dispatch requires package_name and package_version');
        }
        return { skip: false, name, version, onMissing: 'fail', reason: '' };
    }
    if (eventName === 'registry_package') {
        const name = scopeRegistryPackageName(input.registryPackageName, input.registryPackageNamespace);
        const version = registryPackageVersion(input.registryPackageVersion, input.registryPackageVersionName);
        if (!name || !version) {
            throw new Error('registry_package payload missing name or version');
        }
        if (name !== SDK_PACKAGE_NAME) {
            return {
                skip: true,
                name,
                version,
                onMissing: 'fail',
                reason: `registry_package ${name} is not ${SDK_PACKAGE_NAME}`,
            };
        }
        return { skip: false, name, version, onMissing: 'fail', reason: '' };
    }
    if (eventName === 'workflow_run') {
        if (!input.publishJobSucceeded) {
            return {
                skip: true,
                name: SDK_PACKAGE_NAME,
                version: '',
                onMissing: 'skip',
                reason: 'CI and Publish job "publish" did not succeed',
            };
        }
        const version = (input.packageJsonVersion ?? '').trim();
        if (!version) {
            throw new Error('workflow_run could not read package.json version');
        }
        return { skip: false, name: SDK_PACKAGE_NAME, version, onMissing: 'skip', reason: '' };
    }
    throw new Error(`unexpected event ${eventName || '(empty)'}`);
}

function req(name) {
    const v = process.env[name]?.trim();
    if (!v) {
        console.error(`::error::missing env ${name}`);
        process.exit(1);
    }
    return v;
}

function r2TarballKey(packageName, version, keyPrefix) {
    const base = packageName.startsWith('@') ? packageName.slice(1) : packageName;
    const short = base.includes('/') ? base.split('/')[1] : base;
    const key = `${packageName}/-/${short}-${version}.tgz`;
    if (!keyPrefix) {
        return key;
    }
    return `${keyPrefix.replace(/\/+$/, '')}/${key}`;
}

function sleepMs(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isPackageMissing(text) {
    return /404|E404|not found|No match found/i.test(text);
}

function npmViewTarballUrl(pkg, version, token) {
    let last = '';
    for (let attempt = 1; attempt <= NPM_VIEW_ATTEMPTS; attempt++) {
        const r = spawnSync(
            'npm',
            ['view', `${pkg}@${version}`, 'dist.tarball', '--registry', REGISTRY],
            {
                encoding: 'utf8',
                env: { ...process.env, NODE_AUTH_TOKEN: token, npm_config_registry: REGISTRY },
            },
        );
        if (r.status === 0) {
            const url = r.stdout.trim().split('\n').pop()?.trim();
            if (!url) {
                console.error('::error::empty dist.tarball from npm view');
                process.exit(1);
            }
            return url;
        }
        last = (r.stderr || r.stdout || '').trim();
        const missing = isPackageMissing(last);
        if (!missing || attempt === NPM_VIEW_ATTEMPTS) {
            if (missing && process.env.SYNC_ON_MISSING === 'skip') {
                console.log(
                    `Skip sync: ${pkg}@${version} is not on GitHub Packages (${last.split('\n')[0] || 'not found'})`,
                );
                process.exit(0);
            }
            console.error(`::error::npm view failed: ${last}`);
            process.exit(1);
        }
        console.log(`npm view ${pkg}@${version} not visible yet (${attempt}/${NPM_VIEW_ATTEMPTS})`);
        sleepMs(NPM_VIEW_RETRY_MS);
    }
    console.error(`::error::npm view failed: ${last}`);
    process.exit(1);
}

async function download(url, dest, token) {
    const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/octet-stream' },
    });
    if (!res.ok) {
        console.error(`::error::download ${res.status} ${url}`);
        process.exit(1);
    }
    if (!res.body) {
        console.error('::error::empty tarball body');
        process.exit(1);
    }
    await pipeline(res.body, createWriteStream(dest));
}

async function main() {
    const pkg = req('PACKAGE_NAME');
    const version = req('PACKAGE_VERSION');
    const token = req('NODE_AUTH_TOKEN');
    const accountId = req('R2_ACCOUNT_ID');
    const accessKey = req('R2_ACCESS_KEY_ID');
    const secretKey = req('R2_SECRET_ACCESS_KEY');
    const bucket = req('R2_BUCKET');
    const keyPrefix = process.env.R2_KEY_PREFIX?.trim() ?? '';

    const tarballUrl = npmViewTarballUrl(pkg, version, token);
    const tgzPath = join(tmpdir(), `sync-${version}-${process.pid}.tgz`);
    await download(tarballUrl, tgzPath, token);

    let S3Client;
    let PutObjectCommand;
    let GetObjectCommand;
    try {
        ({ S3Client, PutObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3'));
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(
            `::error::cannot load @aws-sdk/client-s3 (${detail}). ` +
                'Install beside this script first: npm install --prefix .github/scripts ' +
                '(see .github/scripts/package.json). Do not use npx — the package has no bin ' +
                "and is not placed on this script's ESM resolve path.",
        );
        process.exit(1);
    }
    const client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    const objectKey = r2TarballKey(pkg, version, keyPrefix);
    const body = readFileSync(tgzPath);
    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            Body: body,
            ContentType: 'application/gzip',
        }),
    );
    console.log(`Uploaded s3://${bucket}/${objectKey} (${body.length} bytes)`);

    const manifestKey = keyPrefix ? `${keyPrefix.replace(/\/+$/, '')}/manifest.json` : 'manifest.json';
    /** @type {{ packages: Record<string, string>, updatedAt?: string }} */
    let manifest = { packages: {} };
    try {
        const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: manifestKey }));
        const text = await got.Body?.transformToString();
        if (text) {
            manifest = JSON.parse(text);
            if (!manifest.packages || typeof manifest.packages !== 'object') {
                manifest.packages = {};
            }
        }
    } catch {
        /* new manifest */
    }
    manifest.packages[pkg] = version;
    manifest.updatedAt = new Date().toISOString();
    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: manifestKey,
            Body: JSON.stringify(manifest, null, 2),
            ContentType: 'application/json',
        }),
    );
    console.log(`Updated manifest ${manifestKey}: ${pkg}@${version}`);

    try {
        unlinkSync(tgzPath);
    } catch {
        /* ignore */
    }
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
    main().catch((e) => {
        console.error(`::error::${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
    });
}