import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SelfCheck } from '../check/types.js';
import {
    readSdkVersionFromPackage,
    sdkRangeSatisfied,
    type ToolManifest,
    validateManifest,
} from './manifest.js';
import type { ToolRegistration } from './types.js';

export interface DiscoverIssue {
    toolPath: string;
    code: string;
    message: string;
}

export interface LoadToolsResult {
    loaded: string[];
    skipped: DiscoverIssue[];
    checks: SelfCheck[];
}

export interface ToolModuleShape {
    manifest?: ToolManifest;
    register?: (opts?: Record<string, unknown>) => void;
    checks?: SelfCheck[];
    default?: {
        manifest?: ToolManifest;
        register?: (opts?: Record<string, unknown>) => void;
        checks?: SelfCheck[];
    };
}

function readPortalTools(portalRoot: string): string[] {
    const pkgPath = join(portalRoot, 'package.json');
    const raw = JSON.parse(readFileSync(pkgPath, 'utf8')) as { ww?: { tools?: string[] } };
    const tools = raw.ww?.tools;
    if (!Array.isArray(tools)) {
        return [];
    }
    return tools.filter((t): t is string => typeof t === 'string' && t.length > 0);
}

function resolveToolSpecifier(portalRoot: string, spec: string): string {
    if (spec.startsWith('file:') || spec.startsWith('.') || spec.startsWith('/')) {
        const rel = spec.startsWith('file:') ? spec.slice(5) : spec;
        const abs = join(portalRoot, rel);
        return pathToFileURL(abs).href;
    }
    return spec;
}

const seenIds = new Map<string, string>();

export function clearDiscoverState(): void {
    seenIds.clear();
}

export async function loadTools(options: {
    portalRoot: string;
    registerOpts?: Record<string, unknown>;
}): Promise<LoadToolsResult> {
    // Each load owns its own duplicate-ID window; do not leak across calls.
    clearDiscoverState();

    const portalRoot = options.portalRoot;
    const specs = readPortalTools(portalRoot);
    const loaded: string[] = [];
    const skipped: DiscoverIssue[] = [];
    const checks: SelfCheck[] = [];
    const sdkVersion = readSdkVersionFromPackage();

    for (const spec of specs) {
        const href = resolveToolSpecifier(portalRoot, spec);
        let mod: ToolModuleShape;
        try {
            mod = (await import(href)) as ToolModuleShape;
        } catch (e) {
            skipped.push({
                toolPath: spec,
                code: 'IMPORT',
                message: e instanceof Error ? e.message : String(e),
            });
            continue;
        }
        const bundle = mod.default ?? mod;
        const manifest = bundle.manifest ?? mod.manifest;
        const registerFn = bundle.register ?? mod.register;
        const toolChecks = bundle.checks ?? mod.checks ?? [];

        const validated = validateManifest(manifest);
        if (!validated.ok || !validated.manifest) {
            for (const issue of validated.issues) {
                skipped.push({
                    toolPath: spec,
                    code: issue.code,
                    message: issue.message,
                });
            }
            continue;
        }
        const m = validated.manifest;
        if (!sdkRangeSatisfied(m.sdkRange, sdkVersion)) {
            skipped.push({
                toolPath: spec,
                code: 'SDK_RANGE',
                message: `sdkRange ${m.sdkRange} incompatible with framework_sdk_cli ${sdkVersion}`,
            });
            continue;
        }
        const prev = seenIds.get(m.id);
        if (prev) {
            skipped.push({
                toolPath: spec,
                code: 'DUPLICATE_ID',
                message: `tool id "${m.id}" already loaded from ${prev}`,
            });
            continue;
        }
        seenIds.set(m.id, spec);

        if (typeof registerFn !== 'function') {
            skipped.push({
                toolPath: spec,
                code: 'NO_REGISTER',
                message: 'module must export register()',
            });
            continue;
        }
        try {
            registerFn(options.registerOpts ?? {});
        } catch (e) {
            skipped.push({
                toolPath: spec,
                code: 'REGISTER_CRASH',
                message: e instanceof Error ? e.message : String(e),
            });
            continue;
        }
        loaded.push(m.id);
        checks.push(...toolChecks);
    }

    return { loaded, skipped, checks };
}

/** Apply manifest metadata onto an already-built ToolRegistration (mutating / sideEffects). */
export function applyManifestToRegistration(
    tool: ToolRegistration,
    manifest: ToolManifest,
): ToolRegistration {
    const byName = new Map(manifest.commands.map((c) => [c.name, c]));
    return {
        ...tool,
        delegateToolHelpToHelpCommand: manifest.delegateToolHelpToHelpCommand,
        delegateCommandHelpToHandler: manifest.delegateCommandHelpToHandler,
        commands: tool.commands.map((c) => {
            const meta = byName.get(c.name);
            if (!meta) {
                return c;
            }
            return {
                ...c,
                mutating: meta.sideEffects !== 'none',
                sideEffects: meta.sideEffects,
                confirmFlag: meta.confirmFlag,
                usage: c.usage ?? meta.usage,
                flags: c.flags ?? meta.flags,
            };
        }),
    };
}
