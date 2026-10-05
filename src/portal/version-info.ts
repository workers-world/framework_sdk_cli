import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
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
    /** 本地 git 仓根（file: 或 sibling 开发）；省略则只解析 node_modules */
    gitRoot?: string;
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

function gitShortHash(repoRoot: string | undefined): string | null {
    if (!repoRoot) {
        return null;
    }
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

function resolveDependencyRoot(
    portalPackageRoot: string,
    dependencyName: string,
    gitRootHint?: string,
): { installPath: string; gitRoot: string | null } | null {
    const pkgPath = join(portalPackageRoot, 'package.json');
    let depSpec: string | undefined;
    try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
            dependencies?: Record<string, string>;
        };
        depSpec = pkg.dependencies?.[dependencyName];
    } catch {
        depSpec = undefined;
    }

    if (typeof depSpec === 'string' && depSpec.startsWith('file:')) {
        const rel = depSpec.slice('file:'.length);
        const abs = join(portalPackageRoot, rel);
        const installPath = resolveRealPath(abs);
        const gitRoot =
            gitRootHint && gitShortHash(gitRootHint)
                ? gitRootHint
                : gitShortHash(installPath)
                  ? installPath
                  : null;
        return { installPath, gitRoot };
    }

    try {
        const req = createRequire(join(portalPackageRoot, 'package.json'));
        const resolved = req.resolve(`${dependencyName}/package.json`);
        const installPath = resolveRealPath(dirname(resolved));
        const gitFromHint = gitRootHint && gitShortHash(gitRootHint) ? gitRootHint : null;
        const gitFromInstall = gitShortHash(installPath) ? installPath : null;
        return { installPath, gitRoot: gitFromHint ?? gitFromInstall };
    } catch {
        if (gitRootHint) {
            const installPath = resolveRealPath(gitRootHint);
            return { installPath, gitRoot: gitShortHash(gitRootHint) ? gitRootHint : null };
        }
        return null;
    }
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
    const portalGit = gitShortHash(portalRoot);

    const dependencies: VersionComponentInfo[] = [];
    for (const dep of opts.dependencies ?? []) {
        const resolved = resolveDependencyRoot(portalRoot, dep.dependencyName, dep.gitRoot);
        const version =
            (resolved ? readPackageVersion(resolved.installPath) : null) ??
            readPackageVersion(join(portalRoot, 'node_modules', dep.dependencyName)) ??
            'unknown';
        const gitRoot =
            resolved?.gitRoot ?? (dep.gitRoot && gitShortHash(dep.gitRoot) ? dep.gitRoot : null);
        const hash = gitRoot ? gitShortHash(gitRoot) : null;
        const entry: VersionComponentInfo = { name: dep.label, version };
        if (hash) {
            entry.gitShortHash = hash;
        }
        if (resolved?.installPath) {
            entry.installPath = resolved.installPath;
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
    if (!ctx.json) {
        (ctx.stderr ?? process.stderr).write(formatPortalVersionTerminal(info));
    }
    return env;
}

// re-export for tests that import from package root via portal subpath
export const portalVersionModulePath = fileURLToPath(import.meta.url);
