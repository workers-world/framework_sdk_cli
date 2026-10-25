import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SDK_API_VERSION = '0.2.4';

export const PORTAL_RESERVED_TOOL_IDS = new Set([
    'list',
    'help',
    'search',
    'doctor',
    'update',
    'version',
    'install',
    'uninstall',
    'schema',
]);

export type ManifestSideEffects = 'none' | 'local' | 'remote';
export type ManifestConfirmFlag = '--confirm' | '--apply';

export interface ManifestCommand {
    name: string;
    summary: string;
    examples: string[];
    sideEffects: ManifestSideEffects;
    confirmFlag?: ManifestConfirmFlag;
    usage?: string;
    flags?: {
        name: string;
        description: string;
        kind?: 'option' | 'boolean';
        required?: boolean;
    }[];
}

export interface ToolManifest {
    apiVersion: 'ww.tool/v1';
    id: string;
    title: string;
    summary: string;
    keywords?: string[];
    version: string;
    sdkRange: string;
    commands: ManifestCommand[];
    /** Tool `help` owns `ww <tool> --help` */
    delegateToolHelpToHelpCommand?: boolean;
    /** Command `--help` goes to handler instead of generic schema help */
    delegateCommandHelpToHandler?: boolean;
}

export interface ManifestValidationIssue {
    code: string;
    message: string;
}

const ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function validateManifest(raw: unknown): {
    ok: boolean;
    manifest?: ToolManifest;
    issues: ManifestValidationIssue[];
} {
    const issues: ManifestValidationIssue[] = [];
    if (!raw || typeof raw !== 'object') {
        return { ok: false, issues: [{ code: 'INVALID', message: 'manifest must be an object' }] };
    }
    const m = raw as Record<string, unknown>;
    if (m.apiVersion !== 'ww.tool/v1') {
        issues.push({ code: 'API_VERSION', message: 'apiVersion must be ww.tool/v1' });
    }
    const id = typeof m.id === 'string' ? m.id.trim() : '';
    if (!ID_RE.test(id)) {
        issues.push({ code: 'ID', message: 'id must be kebab-case' });
    }
    if (PORTAL_RESERVED_TOOL_IDS.has(id)) {
        issues.push({ code: 'RESERVED', message: `id "${id}" is reserved` });
    }
    if (typeof m.title !== 'string' || !m.title.trim()) {
        issues.push({ code: 'TITLE', message: 'title is required' });
    }
    if (typeof m.summary !== 'string' || !m.summary.trim()) {
        issues.push({ code: 'SUMMARY', message: 'summary is required' });
    }
    if (typeof m.version !== 'string' || !m.version.trim()) {
        issues.push({ code: 'VERSION', message: 'version is required' });
    }
    if (typeof m.sdkRange !== 'string' || !m.sdkRange.trim()) {
        issues.push({ code: 'SDK_RANGE', message: 'sdkRange is required' });
    }
    const commands = m.commands;
    if (!Array.isArray(commands) || commands.length === 0) {
        issues.push({ code: 'COMMANDS', message: 'commands must be a non-empty array' });
    } else {
        for (const c of commands) {
            if (!c || typeof c !== 'object') {
                issues.push({ code: 'COMMAND', message: 'invalid command entry' });
                continue;
            }
            const cmd = c as Record<string, unknown>;
            if (typeof cmd.name !== 'string' || !cmd.name.trim()) {
                issues.push({ code: 'COMMAND_NAME', message: 'command name required' });
            }
            if (typeof cmd.summary !== 'string' || !cmd.summary.trim()) {
                issues.push({ code: 'COMMAND_SUMMARY', message: 'command summary required' });
            }
            if (!Array.isArray(cmd.examples) || cmd.examples.length === 0) {
                issues.push({
                    code: 'COMMAND_EXAMPLES',
                    message: `command ${cmd.name}: examples required`,
                });
            }
            const se = cmd.sideEffects;
            if (se !== 'none' && se !== 'local' && se !== 'remote') {
                issues.push({
                    code: 'COMMAND_SIDE_EFFECTS',
                    message: `command ${cmd.name}: sideEffects required`,
                });
            } else if (
                se !== 'none' &&
                cmd.confirmFlag !== '--confirm' &&
                cmd.confirmFlag !== '--apply'
            ) {
                issues.push({
                    code: 'COMMAND_CONFIRM',
                    message: `command ${cmd.name}: confirmFlag required when sideEffects≠none`,
                });
            }
        }
    }
    if (issues.length > 0) {
        return { ok: false, issues };
    }
    return { ok: true, manifest: raw as ToolManifest, issues: [] };
}

/** Minimal semver range: `^x.y.z`, exact, `>=a.b.c` */
export function sdkRangeSatisfied(range: string, version: string): boolean {
    const v = parseSemver(version);
    if (!v) {
        return false;
    }
    const r = range.trim();
    if (r.startsWith('^')) {
        const base = parseSemver(r.slice(1));
        if (!base) {
            return false;
        }
        if (v.major !== base.major) {
            return false;
        }
        return compareSemver(v, base) >= 0;
    }
    if (r.startsWith('>=')) {
        const base = parseSemver(r.slice(2).trim());
        if (!base) {
            return false;
        }
        return compareSemver(v, base) >= 0;
    }
    const exact = parseSemver(r);
    return exact != null && compareSemver(v, exact) === 0;
}

interface SemVer {
    major: number;
    minor: number;
    patch: number;
}

function parseSemver(s: string): SemVer | null {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(s.trim());
    if (!m) {
        return null;
    }
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function compareSemver(a: SemVer, b: SemVer): number {
    if (a.major !== b.major) {
        return a.major - b.major;
    }
    if (a.minor !== b.minor) {
        return a.minor - b.minor;
    }
    return a.patch - b.patch;
}

export function readSdkVersionFromPackage(): string {
    try {
        const here = dirname(fileURLToPath(import.meta.url));
        const pkg = JSON.parse(readFileSync(join(here, '../../package.json'), 'utf8')) as {
            version?: string;
        };
        return pkg.version ?? SDK_API_VERSION;
    } catch {
        return SDK_API_VERSION;
    }
}

export function manifestCommandMutating(cmd: ManifestCommand): boolean {
    return cmd.sideEffects !== 'none';
}
