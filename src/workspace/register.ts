import { registerTool } from '../portal/registry.js';
import type { PortalContext, ToolRegistration } from '../portal/types.js';
import {
    handleWtDirectRun,
    handleWtHelp,
    handleWtInteractive,
    handleWtList,
    handleWtRun,
    handleWtSkip,
} from './handlers.js';
import { scriptIds, WORKSPACE_SCRIPTS } from './scripts.js';

export interface RegisterWorkspaceToolsOptions {
    /** 传给 resolveWorkspaceRoot 的额外 walk 起点（如 ww 安装目录） */
    extraRootStarts?: string[];
}

import { setWorkspaceExtraRootStarts } from './config.js';

/**
 * 在 ww 门户注册 `wt` 工作区工具（WW-126）。
 * ww 启动时调用：`registerWorkspaceTools()`（在 runPortal 之前）。
 */
export function registerWorkspaceTools(opts: RegisterWorkspaceToolsOptions = {}): void {
    setWorkspaceExtraRootStarts(opts.extraRootStarts ?? []);
    const directCommands = WORKSPACE_SCRIPTS.map((s) => ({
        name: s.id,
        summary: s.summary,
        handler: (argv: string[], ctx: PortalContext) => handleWtDirectRun(s.id, argv, ctx),
    }));

    const tool: ToolRegistration = {
        id: 'wt',
        title: '工作区工具',
        summary: 'cloudflare_work 批量脚本（pull/push/bump-sdk/remote/cloc）',
        keywords: ['workspace', 'git', 'bulk', 'cloudflare_work', 'pull', 'push'],
        defaultHandler: handleWtInteractive,
        commands: [
            {
                name: 'list',
                summary: '列出可用工具与 workspace 根',
                handler: handleWtList,
            },
            {
                name: 'help',
                summary: '用法说明',
                handler: handleWtHelp,
            },
            {
                name: 'run',
                summary: `运行工具 (${scriptIds().join(', ')})`,
                handler: handleWtRun,
            },
            {
                name: 'skip',
                summary: '管理 .ww-workspace-skip.json',
                handler: handleWtSkip,
            },
            ...directCommands,
        ],
    };
    registerTool(tool);
}
