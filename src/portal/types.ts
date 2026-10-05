import type { ProcessEnvelope } from '../envelope/index.js';

export type CommandHandler = (
    argv: string[],
    ctx: PortalContext,
) => Promise<ProcessEnvelope> | ProcessEnvelope;

export interface PortalContext {
    json: boolean;
    /** 门户名，如 ww */
    portal: string;
    /** 当前业务 id，如 pgreq */
    toolId?: string;
    /** runPortal 注入（测试 / 嵌入） */
    stdout?: NodeJS.WritableStream;
    stderr?: NodeJS.WritableStream;
}

export interface ToolCommand {
    name: string;
    summary: string;
    /** 写操作须 --confirm；发现索引用 */
    mutating?: boolean;
    handler: CommandHandler;
}

export interface ToolRegistration {
    id: string;
    title: string;
    summary: string;
    /** 额外关键词供 search */
    keywords?: string[];
    commands: ToolCommand[];
    /** `ww <tool>` 无子命令时调用（替代默认 help），如 wt 交互菜单 */
    defaultHandler?: CommandHandler;
}

export interface SearchMatch {
    toolId: string;
    command: string;
    title: string;
    summary: string;
    score: number;
    mutating?: boolean;
}
