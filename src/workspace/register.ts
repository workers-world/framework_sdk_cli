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
import { herePushExtension } from './here-push.js';
import { squashBumpsExtension } from './squash-bumps.js';
import { wtCatalogSideEffects } from './wt-side-effects.js';

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
    const allExtensions = [squashBumpsExtension, herePushExtension, ...(opts.extensions ?? [])];
    setWtPortalExtensions(allExtensions);
    const extIds = allExtensions.map((e) => e.id);
    const directCommands = WORKSPACE_CATALOG.map((s) => {
        const meta = wtCatalogSideEffects(s.id);
        return {
            name: s.id,
            summary: s.summary,
            mutating: meta.mutating,
            sideEffects: meta.sideEffects,
            confirmFlag: meta.confirmFlag,
            handler: (argv: string[], ctx: PortalContext) => handleWtDirectRun(s.id, argv, ctx),
        };
    });
    const extensionCommands = allExtensions.map((ext) => {
        const meta = wtCatalogSideEffects(ext.id);
        return {
            name: ext.id,
            summary: ext.summary,
            mutating: meta.mutating,
            sideEffects: meta.sideEffects,
            confirmFlag: meta.confirmFlag,
            handler: (argv: string[], ctx: PortalContext) => invokeWtExtension(ext, argv, ctx),
        };
    });
    const runIds = [...catalogIds(), ...extIds].join(', ');

    registerTool({
        id: 'wt',
        title: '工作区工具',
        summary:
            'cloudflare_work workspace-tools（pull/push/here-push/bump-sdk/squash-bumps/remote/cloc）',
        keywords: ['workspace', 'git', 'bulk', 'cloudflare_work', 'pull', 'push', 'wt'],
        defaultHandler: handleWtInteractive,
        delegateToolHelpToHelpCommand: true,
        delegateCommandHelpToHandler: true,
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
