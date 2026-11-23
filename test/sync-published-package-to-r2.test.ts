import { describe, expect, it } from 'vitest';
import {
    registryPackageVersion,
    resolveSyncTarget,
    scopeRegistryPackageName,
} from '../.github/scripts/sync-published-package-to-r2.mjs';

describe('scopeRegistryPackageName', () => {
    it('keeps an already scoped name', () => {
        expect(scopeRegistryPackageName('@workers-world/framework_sdk_cli', 'workers-world')).toBe(
            '@workers-world/framework_sdk_cli',
        );
    });

    it('scopes an unscoped registry_package name with namespace', () => {
        expect(scopeRegistryPackageName('framework_sdk_cli', 'workers-world')).toBe(
            '@workers-world/framework_sdk_cli',
        );
    });
});

describe('registryPackageVersion', () => {
    it('prefers package_version.version over package_version.name', () => {
        expect(registryPackageVersion('0.2.11', 'other')).toBe('0.2.11');
    });

    it('falls back to package_version.name when version is empty', () => {
        expect(registryPackageVersion('', '0.2.11')).toBe('0.2.11');
    });
});

describe('resolveSyncTarget', () => {
    it('uses workflow_dispatch inputs', () => {
        expect(
            resolveSyncTarget({
                eventName: 'workflow_dispatch',
                inputPackageName: '@workers-world/framework_sdk_cli',
                inputPackageVersion: '0.2.11',
            }),
        ).toEqual({
            skip: false,
            name: '@workers-world/framework_sdk_cli',
            version: '0.2.11',
            onMissing: 'fail',
            reason: '',
        });
    });

    it('reads scoped registry_package coordinates from package_version', () => {
        expect(
            resolveSyncTarget({
                eventName: 'registry_package',
                registryPackageName: '@workers-world/framework_sdk_cli',
                registryPackageNamespace: 'workers-world',
                registryPackageVersion: '0.2.11',
            }),
        ).toMatchObject({
            skip: false,
            name: '@workers-world/framework_sdk_cli',
            version: '0.2.11',
            onMissing: 'fail',
        });
    });

    it('scopes an unscoped registry_package name', () => {
        expect(
            resolveSyncTarget({
                eventName: 'registry_package',
                registryPackageName: 'framework_sdk_cli',
                registryPackageNamespace: 'workers-world',
                registryPackageVersionName: '0.2.11',
            }),
        ).toMatchObject({
            skip: false,
            name: '@workers-world/framework_sdk_cli',
            version: '0.2.11',
        });
    });

    it('skips registry_package events for other packages', () => {
        const target = resolveSyncTarget({
            eventName: 'registry_package',
            registryPackageName: 'ww',
            registryPackageNamespace: 'workers-world',
            registryPackageVersion: '1.0.0',
        });
        expect(target.skip).toBe(true);
        expect(target.name).toBe('@workers-world/ww');
    });

    it('syncs the master package.json version after a successful publish job', () => {
        expect(
            resolveSyncTarget({
                eventName: 'workflow_run',
                publishJobSucceeded: true,
                packageJsonVersion: '0.2.11',
            }),
        ).toEqual({
            skip: false,
            name: '@workers-world/framework_sdk_cli',
            version: '0.2.11',
            onMissing: 'skip',
            reason: '',
        });
    });

    it('skips workflow_run when the publish job did not succeed', () => {
        const target = resolveSyncTarget({
            eventName: 'workflow_run',
            publishJobSucceeded: false,
            packageJsonVersion: '0.2.11',
        });
        expect(target.skip).toBe(true);
        expect(target.version).toBe('');
    });
});
