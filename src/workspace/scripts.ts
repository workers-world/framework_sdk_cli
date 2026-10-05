/** cloudflare_work 工作区 bash 脚本（由 wt / ww wt 调用）。 */

export interface WorkspaceScript {
    /** 子命令 id：pull / push / … */
    id: string;
    /** 仓库根目录下的脚本文件名 */
    file: string;
    summary: string;
}

export const WORKSPACE_SCRIPTS: WorkspaceScript[] = [
    { id: 'pull', file: 'bulk-pull-repos.sh', summary: '批量 git pull' },
    { id: 'push', file: 'bulk-push-repos.sh', summary: '批量 git push' },
    { id: 'bump-sdk', file: 'bump-sdk-consumers.sh', summary: 'bump SDK 消费者版本' },
    { id: 'remote', file: 'git-remote-protocol.sh', summary: '切换 git remote 协议' },
    { id: 'cloc', file: 'cloc-repos.sh', summary: '统计各仓代码行数' },
];

export function scriptById(id: string): WorkspaceScript | undefined {
    return WORKSPACE_SCRIPTS.find((s) => s.id === id);
}

export function scriptIds(): string[] {
    return WORKSPACE_SCRIPTS.map((s) => s.id);
}
