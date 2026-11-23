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

export type CommandSideEffects = 'none' | 'local' | 'remote';

export interface ToolCommand {
    name: string;
    summary: string;
    /** 写操作须 --confirm；发现索引用 */
    mutating?: boolean;
    sideEffects?: CommandSideEffects;
    confirmFlag?: '--confirm' | '--apply';
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
    /** 顶层披露：一句话用途（Tools 列表/搜索均用；勿塞子命令枚举或 token 细节） */
    summary: string;
    /**
     * 二级披露：仅 `ww help <tool>` 与 `list --json` 显示（顶层 Tools 不印）。
     * 放 token env、写闸等细节，对齐 cf cli「顶层一句话、细节在 --help」。
     */
    detail?: string;
    /** 额外关键词供 search */
    keywords?: string[];
    commands: ToolCommand[];
    /** `ww <tool>` 无子命令时调用（替代默认 help），如 wt 交互菜单 */
    defaultHandler?: CommandHandler;
    /** `help` 子命令接管工具级 --help */
    delegateToolHelpToHelpCommand?: boolean;
    /** 子命令 --help 交给 handler（非通用 schema help） */
    delegateCommandHelpToHandler?: boolean;
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
