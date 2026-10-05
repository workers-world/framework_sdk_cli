import { registerTool } from '../portal/registry.js';
import type { PortalContext } from '../portal/types.js';
import { catalogIds, WORKSPACE_CATALOG } from './catalog.js';
import { setWorkspaceExtraRootStarts } from './config.js';
import type { WtPortalExtension } from './extensions.js';
import { invokeWtExtension, setWtPortalExtensions } from './extensions.js';
import {
    handleWtDirectRun,
    handleWtHelp,
    handleWtInteractive,
    handleWtList,
    handleWtRun,
    handleWtSkip,
} from './handlers.js';

export interface RegisterWorkspaceToolsOptions {
    /** 传给 resolveWorkspaceRoot 的额外 walk 起点（如 ww 安装目录） */
    extraRootStarts?: string[];
    /** 门户扩展（list/help/run/菜单/direct 子命令），如 ww wt bench */
    extensions?: WtPortalExtension[];
}

/**
 * 在 ww 门户注册 `wt` 工作区工具（WW-126）。
 * ww 启动时调用：`registerWorkspaceTools()`（在 runPortal 之前）。
 */
export function registerWorkspaceTools(opts: RegisterWorkspaceToolsOptions = {}): void {
    setWorkspaceExtraRootStarts(opts.extraRootStarts ?? []);
    setWtPortalExtensions(opts.extensions ?? []);
    const extIds = (opts.extensions ?? []).map((e) => e.id);
    const mutatingToolIds = new Set(['pull', 'push', 'bump-sdk']);
    const directCommands = WORKSPACE_CATALOG.map((s) => ({
        name: s.id,
        summary: s.summary,
        mutating: mutatingToolIds.has(s.id),
        handler: (argv: string[], ctx: PortalContext) => handleWtDirectRun(s.id, argv, ctx),
    }));
    const extensionCommands = (opts.extensions ?? []).map((ext) => ({
        name: ext.id,
        summary: ext.summary,
        handler: (argv: string[], ctx: PortalContext) => invokeWtExtension(ext, argv, ctx),
    }));
    const runIds = [...catalogIds(), ...extIds].join(', ');

    registerTool({
        id: 'wt',
        title: '工作区工具',
        summary: 'cloudflare_work workspace-tools（pull/push/bump-sdk/remote/cloc）',
        keywords: ['workspace', 'git', 'bulk', 'cloudflare_work', 'pull', 'push', 'wt'],
        defaultHandler: handleWtInteractive,
        commands: [
            { name: 'list', summary: '列出工具 catalog', handler: handleWtList },
            { name: 'help', summary: '门户或某工具说明', handler: handleWtHelp },
            {
                name: 'run',
                summary: `执行工具（${runIds}）`,
                handler: handleWtRun,
            },
            { name: 'skip', summary: '按子命令跳过仓', handler: handleWtSkip },
            ...extensionCommands,
            ...directCommands,
        ],
    });
}
