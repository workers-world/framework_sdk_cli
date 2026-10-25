import type { DiscoverIssue } from '../portal/discover.js';
import type { SelfCheck } from './types.js';

let discoverIssues: DiscoverIssue[] = [];

export function setDiscoverIssues(issues: DiscoverIssue[]): void {
    discoverIssues = [...issues];
}

export function clearDiscoverIssues(): void {
    discoverIssues = [];
}

export function discoverIssueChecks(): SelfCheck[] {
    return discoverIssues.map((issue) => ({
        id: `discover.${issue.code}.${issue.toolPath}`,
        title: `工具加载 ${issue.toolPath}`,
        cost: 'local',
        run() {
            return {
                status: 'fail',
                message: issue.message,
                fix: { command: 'ww doctor', sideEffects: 'none' },
            };
        },
    }));
}
