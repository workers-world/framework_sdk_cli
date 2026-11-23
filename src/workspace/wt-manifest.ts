import type { ToolManifest } from '../portal/manifest.js';
import { WORKSPACE_CATALOG } from './catalog.js';

function catalogCommands(): ToolManifest['commands'] {
    const portalMeta = [
        {
            name: 'list',
            summary: '列出工具 catalog',
            examples: ['ww wt list'],
            sideEffects: 'none' as const,
        },
        {
            name: 'help',
            summary: '门户或某工具说明',
            examples: ['ww wt help pull'],
            sideEffects: 'none' as const,
        },
        {
            name: 'run',
            summary: '执行 catalog 工具',
            examples: ['ww wt run pull --dry-run'],
            sideEffects: 'none' as const,
        },
        {
            name: 'skip',
            summary: '按子命令跳过仓',
            examples: ['ww wt skip add push scripts'],
            sideEffects: 'local' as const,
            confirmFlag: '--confirm' as const,
        },
    ];
    const direct = WORKSPACE_CATALOG.map((t) => {
        const se =
            t.id === 'remote'
                ? { sideEffects: 'remote' as const, confirmFlag: '--apply' as const }
                : ['pull', 'push', 'bump-sdk'].includes(t.id)
                  ? { sideEffects: 'remote' as const, confirmFlag: '--confirm' as const }
                  : { sideEffects: 'none' as const };
        return {
            name: t.id,
            summary: t.summary,
            examples: t.examples.length ? t.examples : [`ww wt ${t.id}`],
            ...se,
        };
    });
    return [...portalMeta, ...direct];
}

export const wtToolManifest: ToolManifest = {
    apiVersion: 'ww.tool/v1',
    id: 'wt',
    title: '工作区工具',
    // 顶层披露一句话；子命令目录走 ww wt list / 生成文档 docs/ww-wt-reference.md
    summary: 'cloudflare_work 工作区各仓批量操作与 SDK pin 升级',
    keywords: ['workspace', 'git', 'bulk', 'cloudflare_work', 'pull', 'push', 'wt'],
    version: '1.0.0',
    sdkRange: '^0.2.0',
    delegateToolHelpToHelpCommand: true,
    delegateCommandHelpToHandler: true,
    commands: catalogCommands(),
};
