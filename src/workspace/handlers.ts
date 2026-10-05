import { createInterface } from 'node:readline';
import { stripFlags } from '../argv/index.js';
import { EXIT, errorEnvelope, okEnvelope, type ProcessEnvelope } from '../envelope/index.js';
import type { PortalContext } from '../portal/types.js';
import { workspaceExtraRootStarts } from './config.js';
import { execWorkspaceScript } from './exec-script.js';
import { requireWorkspaceRoot, resolveWorkspaceRoot } from './root.js';
import { scriptById, scriptIds, WORKSPACE_SCRIPTS } from './scripts.js';
import { readSkipFile, skipFilePath, WORKSPACE_SKIP_FILENAME, writeSkipFile } from './skip-file.js';

function commandPrefix(ctx: PortalContext, sub: string): string {
    return `${ctx.portal} wt ${sub}`;
}

function rootOpts() {
    return { extraStarts: workspaceExtraRootStarts() };
}

export function workspaceHelpText(): string {
    const ids = scriptIds().join(' | ');
    return [
        '工作区工具（原 wt）',
        '',
        '用法:',
        '  ww wt                     交互菜单（须 TTY）',
        '  ww wt list [--json]',
        '  ww wt help',
        `  ww wt run <工具> [参数…]   工具: ${ids}`,
        `  ww wt ${scriptIds().join(' | ')} [参数…]`,
        '  ww wt skip list|add|remove <路径>',
        '',
        '环境:',
        '  WW_WORKSPACE_ROOT  cloudflare_work 根目录（含 bulk-pull-repos.sh）',
        `  跳过列表文件: ${WORKSPACE_SKIP_FILENAME}`,
    ].join('\n');
}

function envelopeFromScriptExit(
    ctx: PortalContext,
    sub: string,
    toolId: string,
    exitCode: number,
    data: Record<string, unknown>,
): ProcessEnvelope {
    const cmd = commandPrefix(ctx, sub);
    if (exitCode === 0) {
        return okEnvelope(cmd, { toolId, exitCode, ...data });
    }
    const code =
        exitCode === EXIT.NOT_FOUND
            ? 'UNKNOWN_TOOL'
            : exitCode === EXIT.USAGE
              ? 'USAGE'
              : 'SCRIPT_FAILED';
    return errorEnvelope(
        cmd,
        exitCode as (typeof EXIT)[keyof typeof EXIT],
        { code, message: `exit ${exitCode}` },
        { data: { toolId, exitCode, ...data } },
    );
}

export async function handleWtList(_argv: string[], ctx: PortalContext): Promise<ProcessEnvelope> {
    const root = resolveWorkspaceRoot(rootOpts());
    const tools = WORKSPACE_SCRIPTS.map((s) => ({
        id: s.id,
        script: s.file,
        summary: s.summary,
    }));
    return okEnvelope(commandPrefix(ctx, 'list'), {
        workspaceRoot: root ?? null,
        tools,
        skipFile: root ? skipFilePath(root) : null,
    });
}

export async function handleWtHelp(_argv: string[], ctx: PortalContext): Promise<ProcessEnvelope> {
    const text = workspaceHelpText();
    if (!ctx.json) {
        process.stderr.write(`${text}\n`);
    }
    return okEnvelope(commandPrefix(ctx, 'help'), { help: text });
}

async function runToolId(
    toolId: string,
    scriptArgs: string[],
    ctx: PortalContext,
    sub: string,
): Promise<ProcessEnvelope> {
    if (!scriptById(toolId)) {
        const msg = '未知工具';
        if (!ctx.json) {
            process.stderr.write(`${msg}\n`);
        }
        return errorEnvelope(
            commandPrefix(ctx, sub),
            EXIT.NOT_FOUND,
            { code: 'UNKNOWN_TOOL', message: msg },
            { data: { toolId, known: scriptIds() } },
        );
    }
    let root: string;
    try {
        root = requireWorkspaceRoot(rootOpts());
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return errorEnvelope(commandPrefix(ctx, sub), EXIT.UNKNOWN, {
            code: 'NO_WORKSPACE_ROOT',
            message,
        });
    }
    const result = await execWorkspaceScript(toolId, scriptArgs, ctx, root);
    return envelopeFromScriptExit(ctx, sub, toolId, result.exitCode, {
        scriptPath: result.scriptPath,
    });
}

export async function handleWtRun(argv: string[], ctx: PortalContext): Promise<ProcessEnvelope> {
    const rest = stripFlags(argv);
    const toolId = rest[0];
    if (!toolId) {
        return errorEnvelope(commandPrefix(ctx, 'run'), EXIT.USAGE, {
            code: 'USAGE',
            message: `usage: ww wt run <工具> [参数…]  工具: ${scriptIds().join(', ')}`,
        });
    }
    return runToolId(toolId, rest.slice(1), ctx, 'run');
}

export async function handleWtDirectRun(
    toolId: string,
    argv: string[],
    ctx: PortalContext,
): Promise<ProcessEnvelope> {
    return runToolId(toolId, stripFlags(argv), ctx, toolId);
}

export async function handleWtSkip(argv: string[], ctx: PortalContext): Promise<ProcessEnvelope> {
    const rest = stripFlags(argv);
    const sub = rest[0];
    if (!sub || sub === 'help' || sub === '--help') {
        return errorEnvelope(commandPrefix(ctx, 'skip'), EXIT.USAGE, {
            code: 'USAGE',
            message: 'usage: ww wt skip list|add|remove <路径>',
        });
    }
    let root: string;
    try {
        root = requireWorkspaceRoot(rootOpts());
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return errorEnvelope(commandPrefix(ctx, 'skip'), EXIT.UNKNOWN, {
            code: 'NO_WORKSPACE_ROOT',
            message,
        });
    }
    const file = readSkipFile(root);
    if (sub === 'list') {
        return okEnvelope(commandPrefix(ctx, 'skip list'), {
            path: skipFilePath(root),
            repos: file.repos,
        });
    }
    const pathArg = rest[1];
    if (!pathArg) {
        return errorEnvelope(commandPrefix(ctx, 'skip'), EXIT.USAGE, {
            code: 'USAGE',
            message: `usage: ww wt skip ${sub} <路径>`,
        });
    }
    if (sub === 'add') {
        if (!file.repos.includes(pathArg)) {
            file.repos.push(pathArg);
            writeSkipFile(root, file);
        }
        return okEnvelope(commandPrefix(ctx, 'skip add'), {
            path: skipFilePath(root),
            repos: file.repos,
        });
    }
    if (sub === 'remove') {
        file.repos = file.repos.filter((p) => p !== pathArg);
        writeSkipFile(root, file);
        return okEnvelope(commandPrefix(ctx, 'skip remove'), {
            path: skipFilePath(root),
            repos: file.repos,
        });
    }
    return errorEnvelope(commandPrefix(ctx, 'skip'), EXIT.USAGE, {
        code: 'USAGE',
        message: 'usage: ww wt skip list|add|remove <路径>',
    });
}

export async function handleWtInteractive(
    _argv: string[],
    ctx: PortalContext,
): Promise<ProcessEnvelope> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        const msg = '交互菜单需要 TTY';
        if (!ctx.json) {
            process.stderr.write(`${msg}\n`);
        }
        return errorEnvelope(commandPrefix(ctx, ''), EXIT.USAGE, {
            code: 'NO_TTY',
            message: msg,
        });
    }
    if (ctx.json) {
        return errorEnvelope(commandPrefix(ctx, ''), EXIT.USAGE, {
            code: 'USAGE',
            message: 'usage: ww wt <command>；交互菜单不支持 --json',
        });
    }
    const lines = [
        '工作区工具 — 选择要运行的命令:',
        ...WORKSPACE_SCRIPTS.map((s, i) => `  ${i + 1}) ${s.id} — ${s.summary}`),
        '  q) 退出',
        '',
        '编号> ',
    ];
    process.stderr.write(lines.slice(0, -1).join('\n'));
    process.stderr.write('\n编号> ');

    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    const answer = await new Promise<string>((resolve) => {
        rl.question('', (a) => {
            rl.close();
            resolve(a.trim());
        });
    });
    if (answer === '' || answer.toLowerCase() === 'q') {
        return okEnvelope(commandPrefix(ctx, 'menu'), { cancelled: true });
    }
    const num = Number.parseInt(answer, 10);
    let toolId: string | undefined;
    if (Number.isFinite(num) && num >= 1 && num <= WORKSPACE_SCRIPTS.length) {
        toolId = WORKSPACE_SCRIPTS[num - 1]?.id;
    } else {
        toolId = scriptById(answer)?.id ?? answer;
    }
    if (!toolId || !scriptById(toolId)) {
        const msg = '未知工具';
        process.stderr.write(`${msg}\n`);
        return errorEnvelope(commandPrefix(ctx, 'menu'), EXIT.NOT_FOUND, {
            code: 'UNKNOWN_TOOL',
            message: msg,
        });
    }
    return runToolId(toolId, [], ctx, 'menu');
}
