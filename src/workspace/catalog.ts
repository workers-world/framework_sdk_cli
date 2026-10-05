/** 与 cloudflare_work workspace-tools.mjs CATALOG 对齐（WW-126）。 */

export interface WorkspaceTool {
    id: string;
    title: string;
    script: string;
    summary: string;
    examples: string[];
    passthrough: boolean;
    excludeFlag?: string;
    group?: string;
}

export const WORKSPACE_CATALOG: WorkspaceTool[] = [
    {
        id: 'pull',
        title: '批量拉取',
        script: 'bulk-pull-repos.sh',
        summary: '并发 fetch/merge 各仓当前分支上游（无 upstream 时对齐 origin/<分支>）',
        examples: [
            'wt pull',
            'wt pull --dry-run',
            'wt run pull --jobs 4 --keep-remote',
            'wt skip --help',
            'wt skip add pull cloudflare-docs',
        ],
        passthrough: true,
        excludeFlag: '--exclude',
    },
    {
        id: 'push',
        title: '批量推送',
        script: 'bulk-push-repos.sh',
        summary: '并发 push；新轨 merge 前一档 origin/dev_* 后 push -u',
        examples: [
            'wt push',
            'wt push --dry-run',
            'wt run push --jobs 4 --exclude graft',
            'wt skip add push scripts cpt1',
        ],
        passthrough: true,
        excludeFlag: '--exclude',
    },
    {
        id: 'bump-sdk',
        title: '升 SDK 消费方',
        script: 'bump-sdk-consumers.sh',
        summary: '升 framework_sdk_worker（及显式指定的包）；可选 --actions 升 worker-actions pin',
        examples: [
            'wt bump-sdk',
            'wt bump-sdk --actions',
            'wt bump-sdk 0.26.0 --check',
            'wt skip add bump-sdk mok1',
        ],
        passthrough: true,
        excludeFlag: '--exclude',
    },
    {
        id: 'remote',
        title: '切换 git remote',
        script: 'git-remote-protocol.sh',
        summary: 'ssh | https | cursor | github；默认 dry-run，写入须 --apply',
        examples: [
            'wt remote cursor',
            'wt remote cursor --apply --yes',
            'wt remote github --apply --yes',
        ],
        passthrough: true,
    },
    {
        id: 'cloc',
        title: '各仓行数',
        script: 'cloc-repos.sh',
        summary: 'cloc 扫描 workspace 独立 git 仓并汇总',
        examples: ['wt cloc', 'wt cloc --csv cloc-repos.csv'],
        passthrough: true,
        excludeFlag: '--exclude',
    },
];

export function findTool(id: string): WorkspaceTool | undefined {
    return WORKSPACE_CATALOG.find((t) => t.id === id);
}

export function catalogIds(): string[] {
    return WORKSPACE_CATALOG.map((t) => t.id);
}
