import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    clearPortalVersionRegistration,
    clearRegisteredTools,
    collectPortalVersionInfo,
    formatPortalVersionTerminal,
    registerPortalVersion,
    runPortal,
} from '../../src/portal/index.js';

function initGit(dir: string) {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(join(dir, 'readme'), 'x');
    execFileSync('git', ['add', 'readme'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir });
    return execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], {
        encoding: 'utf8',
    }).trim();
}

function captureIo() {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return {
        stdout: {
            isTTY: false,
            write(s: string) {
                stdout.push(s);
                return true;
            },
        } as unknown as NodeJS.WritableStream,
        stderr: {
            isTTY: false,
            write(s: string) {
                stderr.push(s);
                return true;
            },
        } as unknown as NodeJS.WritableStream,
        stdoutChunks: stdout,
        stderrChunks: stderr,
    };
}

describe('portal version (WW-128)', () => {
    let root: string;

    afterEach(() => {
        clearRegisteredTools();
        clearPortalVersionRegistration();
        vi.unstubAllEnvs();
        if (root) {
            rmSync(root, { recursive: true, force: true });
            root = '';
        }
    });

    function setupPortal() {
        root = mkdtempSync(join(tmpdir(), 'ww-version-'));
        const wwHash = initGit(root);
        writeFileSync(
            join(root, 'package.json'),
            JSON.stringify({ name: 'ww', version: '0.2.3', dependencies: {} }, null, 2),
        );
        const sdkRoot = join(root, 'framework_sdk_cli');
        mkdirSync(sdkRoot, { recursive: true });
        const sdkHash = initGit(sdkRoot);
        writeFileSync(
            join(sdkRoot, 'package.json'),
            JSON.stringify({ name: 'framework_sdk_cli', version: '0.1.0' }, null, 2),
        );
        writeFileSync(
            join(root, 'package.json'),
            JSON.stringify(
                {
                    name: 'ww',
                    version: '0.2.3',
                    dependencies: { framework_sdk_cli: 'file:./framework_sdk_cli' },
                },
                null,
                2,
            ),
        );
        registerPortalVersion({
            portalPackageRoot: root,
            dependencies: [
                {
                    dependencyName: 'framework_sdk_cli',
                    label: 'framework_sdk_cli',
                    gitRoot: sdkRoot,
                },
            ],
        });
        return { wwHash, sdkHash };
    }

    it('collectPortalVersionInfo reads package.json versions and git hashes', () => {
        const { wwHash, sdkHash } = setupPortal();
        const info = collectPortalVersionInfo({ portalPackageRoot: root, dependencies: [] });
        expect(info.version).toBe('0.2.3');
        expect(info.gitShortHash).toBe(wwHash);
        const full = collectPortalVersionInfo({
            portalPackageRoot: root,
            dependencies: [
                {
                    dependencyName: 'framework_sdk_cli',
                    label: 'framework_sdk_cli',
                    gitRoot: join(root, 'framework_sdk_cli'),
                },
            ],
        });
        expect(full.dependencies[0]?.version).toBe('0.1.0');
        expect(full.dependencies[0]?.gitShortHash).toBe(sdkHash);
        expect(full.dependencies[0]?.installPath).toBeTruthy();
    });

    it('terminal output omits installPath', () => {
        setupPortal();
        const info = collectPortalVersionInfo({
            portalPackageRoot: root,
            dependencies: [{ dependencyName: 'framework_sdk_cli', label: 'framework_sdk_cli' }],
        });
        const text = formatPortalVersionTerminal(info);
        expect(text).toContain('ww 0.2.3');
        expect(text).toContain('framework_sdk_cli 0.1.0');
        expect(text).toContain(`node ${process.versions.node}`);
        expect(text).not.toContain('installPath');
        expect(text).not.toContain(root);
    });

    it('ww version --json is envelope without ANSI', async () => {
        setupPortal();
        const io = captureIo();
        const result = await runPortal({
            portal: 'ww',
            argv: ['version', '--json'],
            noExit: true,
            stdout: io.stdout,
            stderr: io.stderr,
        });
        expect(result.ok).toBe(true);
        expect(io.stdoutChunks).toEqual([`${JSON.stringify(result)}\n`]);
        expect(io.stderrChunks.join('')).toBe('');
        const esc = String.fromCharCode(27);
        expect(io.stdoutChunks.join('').includes(`${esc}[`)).toBe(false);
        const data = result.data as {
            installPath?: string;
            dependencies: Array<{ installPath?: string }>;
        };
        expect(data.installPath).toBeTruthy();
        expect(data.dependencies[0]?.installPath).toBeTruthy();
    });

    it('aliases --version and -v match ww version', async () => {
        setupPortal();
        const base = await runPortal({
            portal: 'ww',
            argv: ['version', '--json'],
            noExit: true,
            stdout: { write: () => true } as unknown as NodeJS.WritableStream,
            stderr: { write: () => true } as unknown as NodeJS.WritableStream,
        });
        for (const argv of [
            ['--version', '--json'],
            ['-v', '--json'],
        ] as const) {
            const result = await runPortal({
                portal: 'ww',
                argv: [...argv],
                noExit: true,
                stdout: { write: () => true } as unknown as NodeJS.WritableStream,
                stderr: { write: () => true } as unknown as NodeJS.WritableStream,
            });
            expect(result.data).toEqual(base.data);
        }
    });

    it('does not perform network I/O', async () => {
        setupPortal();
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
        const io = captureIo();
        await runPortal({
            portal: 'ww',
            argv: ['version'],
            noExit: true,
            stdout: io.stdout,
            stderr: io.stderr,
        });
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });
});
