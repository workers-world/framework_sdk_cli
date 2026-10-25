import { hasJsonFlag, parseNamedArgs } from '../argv/index.js';
import {
    checksHaveFailure,
    discoverIssueChecks,
    formatDoctorHuman,
    runChecks,
} from '../check/index.js';
import { passiveNotify } from '../check/passive.js';
import {
    EXIT,
    errorEnvelope,
    okEnvelope,
    type ProcessEnvelope,
    writeEnvelope,
} from '../envelope/index.js';
import { ensureDotEnvLoaded } from '../http/load-dotenv.js';
import { DEFAULT_SEARCH_LIMIT, searchTools } from '../search/index.js';
import { buildCommandHelp, commandSchema } from './command-meta.js';
import { getPortalChecks } from './discover-registry.js';
import { getExtraChecks, getPortalHooks, getPortalUpdateHandler } from './hooks.js';
import {
    clearRegisteredTools,
    getRegisteredTool,
    listRegisteredTools,
    registerTool,
} from './registry.js';
import { reservedToolsForList } from './reserved-meta.js';
import type { PortalContext } from './types.js';
import { isPortalVersionArgv, runPortalVersionCommand } from './version-info.js';

export { clearRegisteredTools, listRegisteredTools, registerTool };

function agentNotice(): string {
    return 'Agent: write ops need --confirm after user approval; prefer --json; never put tokens in argv.';
}

function discoveryBanner(): string {
    return 'Discover: ww search "<intent>" [--limit N] [--json] → ww list --json → ww help <tool> (one help; avoid chaining --help on subcommands).';
}

function helpText(toolId?: string): string {
    const lines = [
        agentNotice(),
        discoveryBanner(),
        '',
        'Usage:',
        '  ww version [--json]  (aliases: ww --version, ww -v)',
        '  ww list [--json]',
        '  ww help [tool]',
        '  ww search "<query>" [--limit N] [--json]',
        '  ww schema <tool> <command> [--json]',
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
function commandSideEffects(c: { mutating?: boolean; sideEffects?: string }): string {
    if (c.sideEffects) {
        return c.sideEffects;
    }
    return c.mutating ? 'remote' : 'none';
}

function allDoctorChecks(): import('../check/types.js').SelfCheck[] {
    return [...getPortalChecks(), ...getExtraChecks(), ...discoverIssueChecks()];
}

export async function runPortal(opts: RunPortalOptions = {}): Promise<ProcessEnvelope> {
    ensureDotEnvLoaded();
    const portal = opts.portal ?? 'ww';
    const argv = opts.argv ?? process.argv.slice(2);
    const stdoutStream = opts.stdout ?? process.stdout;
    const stderrStream = opts.stderr ?? process.stderr;
    const json =
        hasJsonFlag(argv) || !(stdoutStream as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
    const { positional } = parseNamedArgs(argv);
    const ctx: PortalContext = {
        json,
        portal,
        stdout: opts.stdout,
        stderr: opts.stderr,
    };

    const prerun = getPortalHooks().prerun;
    if (prerun) {
        await prerun({ argv, portal });
    } else {
        await passiveNotify({
            argv,
            checks: allDoctorChecks(),
            ctx: { env: process.env, json, portalRoot: undefined },
            stdout: stdoutStream,
            stderr: stderrStream,
        });
    }

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
            commands: t.commands.map((c) => {
                const se = commandSideEffects(c);
                const mutating = se !== 'none';
                return {
                    name: c.name,
                    summary: c.summary,
                    sideEffects: se,
                    mutating,
                    confirmRequired: mutating,
                    ...(c.confirmFlag ? { confirmFlag: c.confirmFlag } : {}),
                    ...(c.usage ? { usage: c.usage } : {}),
                    ...(c.flags?.length ? { flags: c.flags } : {}),
                };
            }),
        }));
        return finish(
            okEnvelope(`${portal} list`, {
                tools,
                reserved: reservedToolsForList(),
            }),
            opts,
            json,
        );
    }

    if (head === 'doctor') {
        const tail = argv.slice(argv.indexOf('doctor') + 1);
        const tailParsed = parseNamedArgs(tail);
        if (tailParsed.flags.has('list-checks')) {
            const ids = allDoctorChecks().map((c) => c.id);
            return finish(okEnvelope(`${portal} doctor`, { checks: ids }), opts, json);
        }
        const filterIds = tailParsed.positional.length > 0 ? tailParsed.positional : undefined;
        const items = await runChecks(
            allDoctorChecks(),
            {
                env: process.env,
                json,
            },
            { ids: filterIds },
        );
        const fail = checksHaveFailure(items);
        const exitCode = fail ? EXIT.DOCTOR : EXIT.OK;
        if (!json) {
            formatDoctorHuman(items, stderrStream, json);
        }
        const env = fail
            ? errorEnvelope(
                  `${portal} doctor`,
                  exitCode,
                  { code: 'DOCTOR_FAILED', message: 'one or more checks failed' },
                  { data: { checks: items } },
              )
            : okEnvelope(`${portal} doctor`, { checks: items });
        return finish(env, opts, json);
    }

    if (head === 'update') {
        const handler = getPortalUpdateHandler();
        if (!handler) {
            return finish(
                errorEnvelope(`${portal} update`, EXIT.USAGE, {
                    code: 'UPDATE_NOT_CONFIGURED',
                    message:
                        'portal update handler not registered; use ww update via bin bootstrap',
                }),
                opts,
                json,
            );
        }
        const tail = argv.slice(argv.indexOf('update') + 1);
        const result = await handler(tail, ctx);
        return finish(result, opts, json);
    }

    if (head === 'schema') {
        const toolId = positional[1];
        const cmdName = positional[2];
        if (!toolId || !cmdName) {
            return finish(
                errorEnvelope(`${portal} schema`, EXIT.USAGE, {
                    code: 'USAGE',
                    message: `usage: ${portal} schema <tool> <command> [--json]`,
                }),
                opts,
                json,
            );
        }
        const schemaTool = getRegisteredTool(toolId);
        if (!schemaTool) {
            return finish(
                errorEnvelope(`${portal} schema`, EXIT.USAGE, {
                    code: 'UNKNOWN_TOOL',
                    message: `unknown tool "${toolId}"`,
                }),
                opts,
                json,
            );
        }
        const schemaCmd = schemaTool.commands.find((c) => c.name === cmdName);
        if (!schemaCmd) {
            return finish(
                errorEnvelope(`${portal} schema`, EXIT.USAGE, {
                    code: 'UNKNOWN_COMMAND',
                    message: `unknown command "${cmdName}"`,
                }),
                opts,
                json,
            );
        }
        return finish(
            okEnvelope(
                `${portal} schema ${toolId} ${cmdName}`,
                commandSchema(schemaTool, schemaCmd),
            ),
            opts,
            json,
        );
    }

    if (head === 'search') {
        const searchTail = argv.slice(argv.indexOf('search') + 1);
        const parsed = parseNamedArgs(searchTail);
        const query = parsed.positional.join(' ').trim();
        const limitRaw = parsed.named.limit;
        let limit = DEFAULT_SEARCH_LIMIT;
        if (limitRaw != null && limitRaw !== '') {
            const n = Number.parseInt(limitRaw, 10);
            if (!Number.isFinite(n) || n < 1) {
                return finish(
                    errorEnvelope(`${portal} search`, EXIT.USAGE, {
                        code: 'USAGE',
                        message: 'usage: ww search "<query>" [--limit N]',
                    }),
                    opts,
                    json,
                );
            }
            limit = n;
        }
        if (!query) {
            return finish(
                errorEnvelope(`${portal} search`, EXIT.USAGE, {
                    code: 'USAGE',
                    message: 'usage: ww search "<query>" [--limit N]',
                }),
                opts,
                json,
            );
        }
        const matches = searchTools(query, listRegisteredTools(), limit, portal);
        return finish(okEnvelope(`${portal} search`, { query, limit, matches }), opts, json);
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
    const toolHelpDelegates = Boolean(tool.delegateToolHelpToHelpCommand && toolHelpCmd);

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

    if (toolHelpFlag && !tCmd && toolHelpDelegates && toolHelpCmd) {
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
        if (toolHelpDelegates && toolHelpCmd) {
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
    const restParsed = parseNamedArgs(rest);
    const cmdHelpFlag =
        rest.some((a) => a === '--help' || a === '-h') ||
        restParsed.flags.has('help') ||
        restParsed.flags.has('h');

    if (cmdHelpFlag) {
        if (tool.delegateCommandHelpToHandler) {
            const result = await cmd.handler(rest, { ...ctx, toolId: tool.id });
            return finish(result, opts, json);
        }
        const { help, flags } = buildCommandHelp(portal, tool, cmd);
        const payload = { help, flags, ...commandSchema(tool, cmd) };
        if (!json) {
            (opts.stderr ?? process.stderr).write(`${help}\n`);
            const result = okEnvelope(`${portal} help ${tool.id} ${cmd.name}`, payload);
            if (!opts.noExit) {
                process.exit(EXIT.OK);
            }
            return result;
        }
        return finish(okEnvelope(`${portal} help ${tool.id} ${cmd.name}`, payload), opts, json);
    }

    const result = await cmd.handler(rest, { ...ctx, toolId: tool.id });
    return finish(result, opts, json);
}
