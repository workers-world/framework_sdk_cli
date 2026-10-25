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

export interface CommandFlagSpec {
    name: string;
    description: string;
    kind?: 'option' | 'boolean';
    required?: boolean;
}

export interface ToolCommand {
    name: string;
    summary: string;
    /** 写操作须 --confirm；发现索引用 */
    mutating?: boolean;
    /** 覆盖 schema confirmRequired（默认 = mutating）；staging-write 可 mutating=true + confirmRequired=false */
    confirmRequired?: boolean;
    /** 用法行（`ww <tool> <cmd> --help` / schema） */
    usage?: string;
    flags?: CommandFlagSpec[];
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
    /** 建议下一步完整命令（含 --json；写操作含 --confirm） */
    suggested?: string;
}
