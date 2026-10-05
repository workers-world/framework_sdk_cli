import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { okEnvelope, type ProcessEnvelope } from '../envelope/index.js';
import { registerTool } from './registry.js';
import type { PortalContext } from './types.js';

export interface VersionDependencySpec {
    /** package.json dependencies 键名，如 framework_sdk_cli */
    dependencyName: string;
    /** 终端 / JSON 展示名 */
    label: string;
}

export interface PortalVersionRegistration {
    /** 门户包根目录（含 package.json），如 ww 仓根 */
    portalPackageRoot: string;
    /** 门户在 package.json 的 name，省略则从 portalPackageRoot/package.json 读取 */
    portalPackageName?: string;
    /** 额外依赖（门户自身版本始终包含） */
    dependencies?: VersionDependencySpec[];
}

let registration: PortalVersionRegistration | null = null;

export function getPortalVersionRegistration(): PortalVersionRegistration | null {
    return registration;
}

export function clearPortalVersionRegistration(): void {
    registration = null;
}

function readPackageVersion(packageRoot: string): string | null {
    try {
        const raw = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
            version?: string;
        };
        const v = raw.version;
        return typeof v === 'string' && v.length > 0 ? v : null;
    } catch {
        return null;
    }
}

function readPackageName(packageRoot: string): string | null {
    try {
        const raw = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
            name?: string;
        };
        const n = raw.name;
        return typeof n === 'string' && n.length > 0 ? n : null;
    } catch {
        return null;
    }
}

function resolveRealPath(p: string): string {
    try {
        return realpathSync(p);
    } catch {
        return p;
    }
}

function gitShortHash(repoRoot: string): string | null {
    try {
        const out = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--short', 'HEAD'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return out.length > 0 ? out : null;
    } catch {
        return null;
    }
}

/** 仅当 installPath 本身是 git 仓根时才返回 hash */
function gitShortHashIfRepoRoot(installPath: string): string | null {
    try {
        const top = execFileSync('git', ['-C', installPath, 'rev-parse', '--show-toplevel'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (resolveRealPath(top) !== resolveRealPath(installPath)) {
            return null;
        }
        return gitShortHash(installPath);
    } catch {
        return null;
    }
}

function resolveInstalledPackageDir(
    portalPackageRoot: string,
    dependencyName: string,
): string | null {
    const linked = join(portalPackageRoot, 'node_modules', dependencyName);
    if (existsSync(linked)) {
        return resolveRealPath(linked);
    }
    try {
        const req = createRequire(join(portalPackageRoot, 'package.json'));
        const entry = req.resolve(dependencyName);
        let dir = dirname(entry);
        while (true) {
            const pkgPath = join(dir, 'package.json');
            if (existsSync(pkgPath)) {
                const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
                if (pkg.name === dependencyName) {
                    return resolveRealPath(dir);
                }
            }
            const parent = dirname(dir);
            if (parent === dir) {
                break;
            }
            dir = parent;
        }
    } catch {
        /* not installed */
    }
    return null;
}

export interface VersionComponentInfo {
    name: string;
    version: string;
    gitShortHash?: string;
    installPath?: string;
}

export interface PortalVersionInfo {
    portal: string;
    version: string;
    gitShortHash?: string;
    installPath?: string;
    node: string;
    dependencies: VersionComponentInfo[];
}

export function collectPortalVersionInfo(opts: PortalVersionRegistration): PortalVersionInfo {
    const portalRoot = resolveRealPath(opts.portalPackageRoot);
    const portalName =
        opts.portalPackageName ?? readPackageName(portalRoot) ?? basenameFallback(portalRoot);
    const portalVersion = readPackageVersion(portalRoot) ?? 'unknown';
    const portalGit = gitShortHashIfRepoRoot(portalRoot);

    const dependencies: VersionComponentInfo[] = [];
    for (const dep of opts.dependencies ?? []) {
        const installPath = resolveInstalledPackageDir(portalRoot, dep.dependencyName);
        const version = installPath ? (readPackageVersion(installPath) ?? 'unknown') : 'unknown';
        const entry: VersionComponentInfo = { name: dep.label, version };
        if (installPath) {
            entry.installPath = installPath;
            const hash = gitShortHashIfRepoRoot(installPath);
            if (hash) {
                entry.gitShortHash = hash;
            }
        }
        dependencies.push(entry);
    }

    const info: PortalVersionInfo = {
        portal: portalName,
        version: portalVersion,
        node: process.versions.node,
        dependencies,
    };
    if (portalGit) {
        info.gitShortHash = portalGit;
    }
    info.installPath = portalRoot;
    return info;
}

function basenameFallback(p: string): string {
    const parts = p.replace(/\/+$/, '').split(/[/\\]/);
    return parts[parts.length - 1] ?? 'portal';
}

/** 终端可读行（不含 installPath） */
export function formatPortalVersionTerminal(info: PortalVersionInfo): string {
    const lines: string[] = [];
    lines.push(formatLine(info.portal, info.version, info.gitShortHash));
    for (const d of info.dependencies) {
        lines.push(formatLine(d.name, d.version, d.gitShortHash));
    }
    lines.push(`node ${info.node}`);
    return `${lines.join('\n')}\n`;
}

function formatLine(name: string, version: string, hash?: string): string {
    if (hash) {
        return `${name} ${version} (${hash})`;
    }
    return `${name} ${version}`;
}

export function portalVersionEnvelope(
    portalLabel: string,
    info: PortalVersionInfo,
    includeInstallPaths: boolean,
): ProcessEnvelope {
    const data: Record<string, unknown> = {
        portal: info.portal,
        version: info.version,
        node: info.node,
        dependencies: info.dependencies.map((d) => {
            const row: Record<string, unknown> = { name: d.name, version: d.version };
            if (d.gitShortHash) {
                row.gitShortHash = d.gitShortHash;
            }
            if (includeInstallPaths && d.installPath) {
                row.installPath = d.installPath;
            }
            return row;
        }),
    };
    if (info.gitShortHash) {
        data.gitShortHash = info.gitShortHash;
    }
    if (includeInstallPaths && info.installPath) {
        data.installPath = info.installPath;
    }
    return okEnvelope(`${portalLabel} version`, data);
}

async function versionHandler(_argv: string[], ctx: PortalContext): Promise<ProcessEnvelope> {
    if (!registration) {
        throw new Error('registerPortalVersion was not called');
    }
    const info = collectPortalVersionInfo(registration);
    return portalVersionEnvelope(ctx.portal, info, ctx.json);
}

/**
 * 门户 version 原语：自注册 `version` 工具，并在 runPortal 中识别 `--version` / `-v`。
 */
export function registerPortalVersion(opts: PortalVersionRegistration): void {
    registration = opts;
    registerTool({
        id: 'version',
        title: '版本信息',
        summary: '输出门户、依赖与 Node 版本（只读本地，不联网）',
        keywords: ['version', '--version', '-v'],
        commands: [],
        defaultHandler: versionHandler,
    });
}

export function isPortalVersionArgv(argv: string[]): boolean {
    const head = argv[0];
    return head === 'version' || head === '--version' || head === '-v';
}

export async function runPortalVersionCommand(
    portalLabel: string,
    ctx: PortalContext,
): Promise<ProcessEnvelope> {
    if (!registration) {
        throw new Error('registerPortalVersion was not called');
    }
    const info = collectPortalVersionInfo(registration);
    const env = portalVersionEnvelope(portalLabel, info, ctx.json);
    const stdout = ctx.stdout ?? process.stdout;
    const isInteractiveTty = !ctx.json && Boolean((stdout as NodeJS.WriteStream).isTTY);
    if (isInteractiveTty) {
        stdout.write(formatPortalVersionTerminal(info));
        return { ...env, meta: { ...env.meta, suppress_tty_status: true } };
    }
    return env;
}

export const portalVersionModulePath = fileURLToPath(import.meta.url);
