import { setDiscoverIssues } from '../check/portal-checks.js';
import type { SelfCheck } from '../check/types.js';
import type { DiscoverIssue } from './discover.js';

let portalChecks: SelfCheck[] = [];

export function registerPortalChecks(checks: SelfCheck[]): void {
    portalChecks = [...checks];
}

export function clearPortalChecks(): void {
    portalChecks = [];
}

export function getPortalChecks(): SelfCheck[] {
    return portalChecks;
}

export function recordDiscoverIssues(skipped: DiscoverIssue[]): void {
    setDiscoverIssues(skipped);
}
