import type { CommandFlagSpec, ToolCommand, ToolRegistration } from './types.js';

export type { CommandFlagSpec };

export interface CommandSchema {
    toolId: string;
    command: string;
    summary: string;
    usage?: string;
    confirmRequired: boolean;
    mutating: boolean;
    flags?: CommandFlagSpec[];
}

export function commandSchema(tool: ToolRegistration, cmd: ToolCommand): CommandSchema {
    return {
        toolId: tool.id,
        command: cmd.name,
        summary: cmd.summary,
        usage: cmd.usage,
        confirmRequired: Boolean(cmd.mutating),
        mutating: Boolean(cmd.mutating),
        flags: cmd.flags,
    };
}

export function buildCommandHelp(
    portal: string,
    tool: ToolRegistration,
    cmd: ToolCommand,
): { help: string; flags: CommandFlagSpec[] } {
    const flags = cmd.flags ?? [];
    const usage =
        cmd.usage ?? `${portal} ${tool.id} ${cmd.name}${cmd.mutating ? ' … [--confirm]' : ' …'}`;
    const lines = [`${tool.id} ${cmd.name} — ${cmd.summary}`, '', `Usage: ${usage}`];
    if (flags.length > 0) {
        lines.push('', 'Flags:');
        for (const f of flags) {
            const req = f.required ? ' (required)' : '';
            const kind = f.kind === 'boolean' ? '  [boolean]' : '';
            lines.push(`  --${f.name}${kind}${req}  ${f.description}`);
        }
    }
    if (cmd.mutating) {
        lines.push('', 'Write gate: re-run with --confirm (and --json) after user approval.');
    }
    return { help: lines.join('\n'), flags };
}
