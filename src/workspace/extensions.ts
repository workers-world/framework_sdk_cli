import type { ProcessEnvelope } from '../envelope/index.js';
import type { CommandHandler, PortalContext } from '../portal/types.js';
import { catalogIds } from './catalog.js';
import { takePortalFlags } from './flags.js';

/** ww 侧注册的 wt 门户扩展（如 bench）：出现在 list/help/run/菜单，不走 workspace bash 脚本。 */
export interface WtPortalExtension {
    id: string;
    title: string;
    summary: string;
    examples?: string[];
    handler: CommandHandler;
}

const WT_RESERVED_SUBCOMMANDS = ['list', 'help', 'run', 'skip'] as const;

let portalExtensions: WtPortalExtension[] = [];

/** 注册前校验：不得与 catalog id 或 wt 保留子命令冲突。 */
export function assertValidWtPortalExtensions(extensions: WtPortalExtension[]): void {
    const catalog = new Set(catalogIds());
    const seen = new Set<string>();
    for (const ext of extensions) {
        if (seen.has(ext.id)) {
            throw new Error(`wt portal extension id 重复: "${ext.id}"`);
        }
        seen.add(ext.id);
        if ((WT_RESERVED_SUBCOMMANDS as readonly string[]).includes(ext.id)) {
            throw new Error(
                `wt portal extension id "${ext.id}" 与保留子命令冲突（${WT_RESERVED_SUBCOMMANDS.join(', ')}）`,
            );
        }
        if (catalog.has(ext.id)) {
            throw new Error(
                `wt portal extension id "${ext.id}" 与工作区 catalog 工具 id 冲突（${catalogIds().join(', ')}）`,
            );
        }
    }
}

export function setWtPortalExtensions(ext: WtPortalExtension[]): void {
    assertValidWtPortalExtensions(ext);
    portalExtensions = ext;
}

export function withPortalJson(ctx: PortalContext, portalJson: boolean): PortalContext {
    return portalJson || ctx.json ? { ...ctx, json: true } : ctx;
}

/** 解析 --json 并写入 ctx，同时把 --json 留在 argv 末尾供扩展 handler 识别。 */
export function invokeWtExtension(
    ext: WtPortalExtension,
    argv: string[],
    ctx: PortalContext,
): Promise<ProcessEnvelope> | ProcessEnvelope {
    const { json, rest } = takePortalFlags(argv);
    const childCtx = withPortalJson(ctx, json);
    const childArgv = json ? [...rest, '--json'] : rest;
    return ext.handler(childArgv, childCtx);
}

export function wtPortalExtensions(): WtPortalExtension[] {
    return portalExtensions;
}

export function findWtExtension(id: string): WtPortalExtension | undefined {
    return portalExtensions.find((e) => e.id === id);
}

export function wtExtensionIds(): string[] {
    return portalExtensions.map((e) => e.id);
}
