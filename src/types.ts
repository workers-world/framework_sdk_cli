import type { ProcessEnvelope } from './envelope.js';

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
}

export interface SearchMatch {
    toolId: string;
    command: string;
    title: string;
    summary: string;
    score: number;
    mutating?: boolean;
}
