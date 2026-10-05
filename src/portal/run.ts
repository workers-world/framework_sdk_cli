import { hasJsonFlag, parseNamedArgs } from '../argv/index.js';
import {
    EXIT,
    errorEnvelope,
    okEnvelope,
    type ProcessEnvelope,
    writeEnvelope,
} from '../envelope/index.js';
import { ensureDotEnvLoaded } from '../http/load-dotenv.js';
import { searchTools } from '../search/index.js';
import {
    clearRegisteredTools,
    getRegisteredTool,
    listRegisteredTools,
    registerTool,
} from './registry.js';
import type { PortalContext } from './types.js';
import { isPortalVersionArgv, runPortalVersionCommand } from './version-info.js';

export { clearRegisteredTools, listRegisteredTools, registerTool };

function agentNotice(): string {
    return 'Agent: write ops need --confirm after user approval; prefer --json; never put tokens in argv.';
}

function helpText(toolId?: string): string {
    const lines = [
        agentNotice(),
        '',
        'Usage:',
        '  ww version [--json]  (aliases: ww --version, ww -v)',
        '  ww list [--json]',
        '  ww help [tool]',
        '  ww search "<query>" [--json]',
        '  ww <tool> <command> …',
        '',
    ];
    if (toolId) {
        const tool = getRegisteredTool(toolId);
        if (!tool) {
            lines.push(`Unknown tool: ${toolId}`);
            lines.push(
                'Registered:',
                ...listRegisteredTools().map((t) => `  ${t.id}  ${t.summary}`),
            );
            return lines.join('\n');
        }
        lines.push(`${tool.id} — ${tool.title}`, tool.summary, '', 'Commands:');
        for (const c of tool.commands) {
            const flag = c.mutating ? '  [--confirm]' : '';
            lines.push(`  ww ${tool.id} ${c.name}${flag}  ${c.summary}`);
        }
        return lines.join('\n');
    }
    lines.push('Tools:');
    for (const t of listRegisteredTools()) {
        lines.push(`  ${t.id.padEnd(12)} ${t.summary}`);
    }
    if (listRegisteredTools().length === 0) {
        lines.push('  (none registered)');
    }
    return lines.join('\n');
}

function nearestToolIds(input: string, limit = 5): string[] {
    const q = input.toLowerCase();
    return listRegisteredTools()
        .map((t) => ({
            id: t.id,
            score:
                (t.id.includes(q) ? 3 : 0) +
                (t.title.toLowerCase().includes(q) ? 2 : 0) +
                (t.summary.toLowerCase().includes(q) ? 1 : 0),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.id);
}

export interface RunPortalOptions {
    portal?: string;
    argv?: string[];
    stdout?: NodeJS.WritableStream;
    stderr?: NodeJS.WritableStream;
    /** 若 true，不 process.exit（测试用） */
    noExit?: boolean;
}

function finish(result: ProcessEnvelope, opts: RunPortalOptions, json: boolean): ProcessEnvelope {
    writeEnvelope(result, {
        json,
        stdout: opts.stdout,
        stderr: opts.stderr,
    });
    if (!opts.noExit) {
        process.exit(result.meta.exit_code);
    }
    return result;
}

/**
 * 门户入口：ww list / help / search / <tool> <cmd>。
 * 非 TTY 或 --json：只打进程信封到 stdout。
 */
export async function runPortal(opts: RunPortalOptions = {}): Promise<ProcessEnvelope> {
    ensureDotEnvLoaded();
    const portal = opts.portal ?? 'ww';
    const argv = opts.argv ?? process.argv.slice(2);
    const json = hasJsonFlag(argv) || !process.stdout.isTTY;
    const { positional } = parseNamedArgs(argv);
    const ctx: PortalContext = {
        json,
        portal,
        stdout: opts.stdout,
        stderr: opts.stderr,
    };

    const head = positional[0];

    if (isPortalVersionArgv(argv) || isPortalVersionArgv(positional)) {
        const result = await runPortalVersionCommand(portal, ctx);
        return finish(result, opts, json);
    }

    if (!head || head === 'help' || head === '--help' || head === '-h') {
        const toolId = head === 'help' ? positional[1] : undefined;
        const text = helpText(toolId);
        if (!json) {
            (opts.stderr ?? process.stderr).write(`${text}\n`);
            const result = okEnvelope(`${portal} help`, { help: text });
            if (!opts.noExit) {
                process.exit(EXIT.OK);
            }
            return result;
        }
        return finish(okEnvelope(`${portal} help`, { help: text }), opts, json);
    }

    if (head === 'list') {
        const tools = listRegisteredTools().map((t) => ({
            id: t.id,
            title: t.title,
            summary: t.summary,
            commands: t.commands.map((c) => ({
                name: c.name,
                summary: c.summary,
                mutating: Boolean(c.mutating),
            })),
        }));
        return finish(okEnvelope(`${portal} list`, { tools }), opts, json);
    }

    if (head === 'search') {
        const query = positional.slice(1).join(' ').trim();
        if (!query) {
            return finish(
                errorEnvelope(`${portal} search`, EXIT.USAGE, {
                    code: 'USAGE',
                    message: 'usage: ww search "<query>"',
                }),
                opts,
                json,
            );
        }
        const matches = searchTools(query, listRegisteredTools());
        return finish(okEnvelope(`${portal} search`, { query, matches }), opts, json);
    }

    if (head === 'install' || head === 'uninstall') {
        return finish(
            errorEnvelope(`${portal} ${head}`, EXIT.USAGE, {
                code: 'USE_BIN_INSTALL',
                message: `use the portal bin script: ww ${head} (symlink to ~/.local/bin/ww)`,
            }),
            opts,
            json,
        );
    }

    const tool = getRegisteredTool(head);
    if (!tool) {
        const near = nearestToolIds(head);
        return finish(
            errorEnvelope(
                `${portal}`,
                EXIT.USAGE,
                {
                    code: 'UNKNOWN_TOOL',
                    message: `unknown tool "${head}"${near.length ? `; did you mean: ${near.join(', ')}` : ''}`,
                },
                { data: { nearest: near } },
            ),
            opts,
            json,
        );
    }

    const toolTail = argv.slice(argv.indexOf(head) + 1);
    const toolParsed = parseNamedArgs(toolTail);
    const tCmd = toolParsed.positional[0];
    const toolHelpFlag =
        toolTail.some((a) => a === '--help' || a === '-h') ||
        toolParsed.flags.has('help') ||
        toolParsed.flags.has('h');

    const toolHelpCmd = tool.commands.find((c) => c.name === 'help');
    const wtPortalHelp = tool.id === 'wt' && toolHelpCmd;

    const finishGenericToolHelp = (): ProcessEnvelope => {
        const text = helpText(tool.id);
        if (!json) {
            (opts.stderr ?? process.stderr).write(`${text}\n`);
            const result = okEnvelope(`${portal} help ${tool.id}`, { help: text });
            if (!opts.noExit) {
                process.exit(EXIT.OK);
            }
            return result;
        }
        return finish(okEnvelope(`${portal} help ${tool.id}`, { help: text }), opts, json);
    };

    if (toolHelpFlag && !tCmd && wtPortalHelp) {
        const result = await toolHelpCmd.handler([], { ...ctx, toolId: tool.id });
        return finish(result, opts, json);
    }

    if (!tCmd) {
        if (tool.defaultHandler && !toolHelpFlag) {
            const result = await tool.defaultHandler(toolTail, { ...ctx, toolId: tool.id });
            return finish(result, opts, json);
        }
        return finishGenericToolHelp();
    }

    if (tCmd === 'help' || tCmd === '--help' || tCmd === '-h') {
        if (wtPortalHelp) {
            const helpArgs = tCmd === 'help' ? toolParsed.positional.slice(1) : [];
            const result = await toolHelpCmd.handler(helpArgs, { ...ctx, toolId: tool.id });
            return finish(result, opts, json);
        }
        return finishGenericToolHelp();
    }

    const cmd = tool.commands.find((c) => c.name === tCmd);
    if (!cmd) {
        const names = tool.commands.map((c) => c.name);
        return finish(
            errorEnvelope(
                `${portal} ${tool.id}`,
                EXIT.USAGE,
                {
                    code: 'UNKNOWN_COMMAND',
                    message: `unknown command "${tCmd}"; try: ${names.join(', ')}`,
                },
                { data: { commands: names } },
            ),
            opts,
            json,
        );
    }

    const cmdIdx = toolTail.indexOf(tCmd);
    const rest = cmdIdx >= 0 ? toolTail.slice(cmdIdx + 1) : [];
    const result = await cmd.handler(rest, { ...ctx, toolId: tool.id });
    return finish(result, opts, json);
}
