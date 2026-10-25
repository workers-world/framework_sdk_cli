#!/usr/bin/env node
/**
 * 与 workers-world/ww 仓内同名脚本保持一致（Packages published → R2）。
 * @see https://github.com/workers-world/ww/blob/dev_00_01_00/.github/scripts/sync-published-package-to-r2.mjs
 */
import { spawnSync } from 'node:child_process';
import { createWriteStream, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const REGISTRY = 'https://npm.pkg.github.com';

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

function npmViewTarballUrl(pkg, version, token) {
    const r = spawnSync(
        'npm',
        ['view', `${pkg}@${version}`, 'dist.tarball', '--registry', REGISTRY],
        {
            encoding: 'utf8',
            env: { ...process.env, NODE_AUTH_TOKEN: token, npm_config_registry: REGISTRY },
        },
    );
    if (r.status !== 0) {
        console.error(`::error::npm view failed: ${(r.stderr || r.stdout).trim()}`);
        process.exit(1);
    }
    const url = r.stdout.trim().split('\n').pop()?.trim();
    if (!url) {
        console.error('::error::empty dist.tarball from npm view');
        process.exit(1);
    }
    return url;
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

    const { S3Client, PutObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');
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

main().catch((e) => {
    console.error(`::error::${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
});
