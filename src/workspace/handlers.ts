import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { ProcessEnvelope } from '../envelope/index.js';
import { EXIT } from '../envelope/index.js';
import type { PortalContext } from '../portal/types.js';
import { catalogIds, findTool, WORKSPACE_CATALOG, type WorkspaceTool } from './catalog.js';
import { workspaceExtraRootStarts } from './config.js';
import { runWorkspaceTool } from './exec-script.js';
import {
    findWtExtension,
    invokeWtExtension,
    wtExtensionIds,
    wtPortalExtensions,
} from './extensions.js';
import { takePortalFlags } from './flags.js';
import { parseArgLine } from './parse-arg-line.js';
import { requireWorkspaceRoot, resolveWorkspaceRoot } from './root.js';
import { sideEffectsForScriptExit } from './script-side-effects.js';
import {
    loadSkipFile,
    normalizeRepoName,
    SkipFileParseError,
    saveSkipFile,
    skipFilePath,
    uniqueRepos,
} from './skip-file.js';
import { skipUsageText, usageText } from './usage.js';
import { runJsonData, wtErr, wtOk } from './wt-envelope.js';
import { wtWriteStderr, wtWriteStdout } from './wt-io.js';
import { prepareStdinForChildScript } from './wt-stdin.js';

function rootOpts() {
    return { extraStarts: workspaceExtraRootStarts() };
}

function rootOrEnvelope(ctx: PortalContext, sub: string): string | ProcessEnvelope {
    try {
        return requireWorkspaceRoot(rootOpts());
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return wtErr(ctx, sub, EXIT.UNKNOWN, { code: 'NO_WORKSPACE_ROOT', message });
    }
}

function scriptPath(root: string, tool: WorkspaceTool): string {
    return join(root, tool.script);
}

function printHelpTool(ctx: PortalContext, tool: WorkspaceTool): void {
    const lines = [
        `${tool.id} — ${tool.title}`,
        tool.summary,
        `script: ${tool.script}`,
        'examples:',
        ...tool.examples.map((ex) => `  ${ex}`),
    ];
    wtWriteStdout(ctx, `${lines.join('\n')}\n`);
}

function usageEnvelope(ctx: PortalContext, sub: string, exitCode: number): ProcessEnvelope {
    const root = resolveWorkspaceRoot(rootOpts());
    const text = usageText(root ? skipFilePath(root) : skipFilePath('.'));
    wtWriteStdout(ctx, `${text}\n`);
    if (exitCode === 0) {
        return wtOk(ctx, sub, { help: text }, EXIT.OK);
    }
    return wtErr(ctx, sub, EXIT.USAGE, { code: 'USAGE', message: text }, { help: text });
}

function skipUsageEnvelope(ctx: PortalContext, sub: string, exitCode: number): ProcessEnvelope {
    const root = resolveWorkspaceRoot(rootOpts());
    const text = skipUsageText(root ? skipFilePath(root) : skipFilePath('.'));
    wtWriteStdout(ctx, `${text}\n`);
    if (exitCode === 0) {
        return wtOk(ctx, sub, { help: text }, EXIT.OK);
    }
    return wtErr(ctx, sub, EXIT.USAGE, { code: 'USAGE', message: text }, { help: text });
}

function cmdListHuman(ctx: PortalContext, root: string): void {
    wtWriteStdout(ctx, 'workspace-tools catalog\n\n');
    for (const t of WORKSPACE_CATALOG) {
        const missing = existsSync(scriptPath(root, t)) ? '' : '  [MISSING]';
        wtWriteStdout(ctx, `  ${t.id.padEnd(12)} ${t.title}${missing}\n`);
        wtWriteStdout(ctx, `               ${t.summary}\n`);
    }
    for (const e of wtPortalExtensions()) {
        wtWriteStdout(ctx, `  ${e.id.padEnd(12)} ${e.title}  [portal]\n`);
        wtWriteStdout(ctx, `               ${e.summary}\n`);
    }
    wtWriteStdout(ctx, '\nrun: ww wt <id> | ww wt run <id> [--] [args...]\n');
}

export async function handleWtList(argv: string[], ctx: PortalContext): Promise<ProcessEnvelope> {
    const rootRes = rootOrEnvelope(ctx, 'list');
    if (typeof rootRes !== 'string') {
        return rootRes;
    }
    const root = rootRes;
    const { json } = takePortalFlags(argv);
    if (json || ctx.json) {
        const payload = [
            ...WORKSPACE_CATALOG.map(({ id, title, summary, script, examples }) => ({
                id,
                title,
                summary,
                script,
                examples,
            })),
            ...wtPortalExtensions().map((e) => ({
                id: e.id,
                title: e.title,
                summary: e.summary,
                kind: 'portal' as const,
                examples: e.examples ?? [],
            })),
        ];
        return wtOk(ctx, 'list', payload);
    }
    cmdListHuman(ctx, root);
    return wtOk(ctx, 'list', { printed: true });
}

export async function handleWtHelp(argv: string[], ctx: PortalContext): Promise<ProcessEnvelope> {
    const id = argv[0];
    if (!id || id === '--json') {
        return usageEnvelope(ctx, 'help', EXIT.OK);
    }
    if (id === 'skip') {
        return skipUsageEnvelope(ctx, 'help skip', EXIT.OK);
    }
    const ext = findWtExtension(id);
    if (ext) {
        return invokeWtExtension(ext, ['--help', ...argv.slice(1)], ctx);
    }
    const tool = findTool(id);
    if (!tool) {
        wtWriteStderr(ctx, `未知工具: ${id}\n`);
        wtWriteStderr(ctx, `可用: ${[...catalogIds(), ...wtExtensionIds(), 'skip'].join(', ')}\n`);
        return wtErr(ctx, 'help', EXIT.USAGE, { code: 'UNKNOWN_TOOL', message: `未知工具: ${id}` });
    }
    printHelpTool(ctx, tool);
    return wtOk(ctx, `help ${id}`, { id: tool.id, help: `${tool.id} — ${tool.title}` });
}

async function executeTool(
    ctx: PortalContext,
    sub: string,
    tool: WorkspaceTool,
    args: string[],
    portalJson: boolean,
): Promise<ProcessEnvelope> {
    const rootRes = rootOrEnvelope(ctx, sub);
    if (typeof rootRes !== 'string') {
        return rootRes;
    }
    const root = rootRes;

    if (!existsSync(scriptPath(root, tool))) {
        wtWriteStderr(ctx, `error: 脚本不存在: ${tool.script}\n`);
        const data = runJsonData(tool.id, 1, args, []);
        if (portalJson || ctx.json) {
            return wtErr(
                ctx,
                sub,
                1,
                { code: 'SCRIPT_MISSING', message: `error: 脚本不存在: ${tool.script}` },
                data,
            );
        }
        return wtErr(
            ctx,
            sub,
            1,
            { code: 'SCRIPT_MISSING', message: `error: 脚本不存在: ${tool.script}` },
            data,
        );
    }

    const result = await runWorkspaceTool(tool, args, root, {
        json: portalJson || ctx.json,
        io: { stdout: ctx.stdout, stderr: ctx.stderr },
    });
    if (result.spawnError) {
        wtWriteStderr(ctx, `error: 无法启动 ${tool.script}: ${result.spawnError}\n`);
        const data = runJsonData(tool.id, 127, result.argv, result.skip, {
            error: result.spawnError,
        });
        return wtErr(
            ctx,
            sub,
            EXIT.NOT_FOUND,
            { code: 'SPAWN_FAILED', message: result.spawnError },
            data,
        );
    }

    const data = runJsonData(tool.id, result.exitCode, result.argv, result.skip, {
        ...(result.signal ? { signal: result.signal } : {}),
    });
    if (result.exitCode === 0) {
        return wtOk(ctx, sub, portalJson || ctx.json ? data : data, EXIT.OK);
    }
    return wtErr(
        ctx,
        sub,
        result.exitCode,
        { code: 'SCRIPT_FAILED', message: `exit ${result.exitCode}` },
        data,
        sideEffectsForScriptExit(tool.id, result.argv, result.exitCode),
    );
}

function validateRemote(
    tool: WorkspaceTool,
    rest: string[],
    ctx: PortalContext,
    sub: string,
): ProcessEnvelope | null {
    if (tool.id === 'remote' && rest.length === 0) {
        wtWriteStderr(ctx, 'remote 需要位置参数：ssh | https | cursor | github\n');
        printHelpTool(ctx, tool);
        return wtErr(ctx, sub, EXIT.USAGE, {
            code: 'USAGE',
            message: 'remote 需要位置参数：ssh | https | cursor | github',
        });
    }
    return null;
}

export async function handleWtRun(argv: string[], ctx: PortalContext): Promise<ProcessEnvelope> {
    const id = argv[0];
    if (!id) {
        wtWriteStderr(ctx, 'run 需要 <id>\n');
        return usageEnvelope(ctx, 'run', EXIT.USAGE);
    }
    const ext = findWtExtension(id);
    if (ext) {
        return invokeWtExtension(ext, argv.slice(1), ctx);
    }
    const tool = findTool(id);
    if (!tool) {
        wtWriteStderr(ctx, `未知工具: ${id}\n`);
        wtWriteStderr(ctx, `可用: ${[...catalogIds(), ...wtExtensionIds()].join(', ')}\n`);
        return wtErr(ctx, 'run', EXIT.USAGE, { code: 'UNKNOWN_TOOL', message: `未知工具: ${id}` });
    }
    const { json, rest } = takePortalFlags(argv.slice(1));
    const remoteErr = validateRemote(tool, rest, ctx, 'run');
    if (remoteErr) {
        return remoteErr;
    }
    return executeTool(ctx, 'run', tool, rest, json);
}

export async function handleWtDirectRun(
    toolId: string,
    argv: string[],
    ctx: PortalContext,
): Promise<ProcessEnvelope> {
    const ext = findWtExtension(toolId);
    if (ext) {
        return invokeWtExtension(ext, argv, ctx);
    }
    const tool = findTool(toolId);
    if (!tool) {
        wtWriteStderr(ctx, `未知工具: ${toolId}\n`);
        return wtErr(ctx, toolId, EXIT.USAGE, {
            code: 'UNKNOWN_TOOL',
            message: `未知工具: ${toolId}`,
        });
    }
    const { json, rest } = takePortalFlags(argv);
    const remoteErr = validateRemote(tool, rest, ctx, toolId);
    if (remoteErr) {
        return remoteErr;
    }
    return executeTool(ctx, toolId, tool, rest, json);
}

export async function handleWtSkip(argv: string[], ctx: PortalContext): Promise<ProcessEnvelope> {
    const rootRes = rootOrEnvelope(ctx, 'skip');
    if (typeof rootRes !== 'string') {
        return rootRes;
    }
    const root = rootRes;
    const skipPath = skipFilePath(root);

    let data: ReturnType<typeof loadSkipFile>;
    try {
        data = loadSkipFile(root);
    } catch (e) {
        if (e instanceof SkipFileParseError) {
            wtWriteStderr(ctx, `${e.message}\n`);
            return wtErr(ctx, 'skip', EXIT.USAGE, { code: 'SKIP_FILE', message: e.message });
        }
        throw e;
    }

    const { json, rest } = takePortalFlags(argv);
    const portalJson = json || ctx.json;
    const sub = rest[0] || 'list';

    if (sub === '-h' || sub === '--help') {
        return skipUsageEnvelope(ctx, 'skip', EXIT.OK);
    }

    if (sub === 'list') {
        const id = rest[1];
        if (id) {
            if (!findTool(id)) {
                wtWriteStderr(ctx, `未知工具: ${id}\n`);
                return wtErr(ctx, 'skip list', EXIT.USAGE, {
                    code: 'UNKNOWN_TOOL',
                    message: `未知工具: ${id}`,
                });
            }
            const names = data.skip[id] ?? [];
            if (portalJson) {
                return wtOk(ctx, 'skip list', { id, skip: names });
            }
            if (names.length === 0) {
                wtWriteStdout(ctx, `${id}: （空）\n`);
            } else {
                wtWriteStdout(ctx, `${id}: ${names.join(' ')}\n`);
            }
            return wtOk(ctx, 'skip list', { id, skip: names });
        }
        if (portalJson) {
            return wtOk(ctx, 'skip list', data);
        }
        let any = false;
        for (const id2 of catalogIds()) {
            const names = data.skip[id2] ?? [];
            if (names.length === 0) {
                continue;
            }
            any = true;
            wtWriteStdout(ctx, `${id2}: ${names.join(' ')}\n`);
        }
        if (!any) {
            wtWriteStdout(ctx, '跳过名单为空。例: ww wt skip add push scripts cpt1\n');
        }
        wtWriteStdout(ctx, `文件: ${skipPath}\n`);
        return wtOk(ctx, 'skip list', data);
    }

    if (sub === 'add' || sub === 'rm' || sub === 'remove' || sub === 'clear') {
        const id = rest[1];
        if (!id) {
            return skipUsageEnvelope(ctx, 'skip', EXIT.USAGE);
        }
        if (!findTool(id)) {
            wtWriteStderr(ctx, `未知工具: ${id}\n`);
            return wtErr(ctx, 'skip', EXIT.USAGE, {
                code: 'UNKNOWN_TOOL',
                message: `未知工具: ${id}`,
            });
        }
        const cur = new Set(data.skip[id] ?? []);
        if (sub === 'clear') {
            data.skip[id] = [];
        } else {
            const repos = rest.slice(2);
            if (repos.length === 0) {
                return skipUsageEnvelope(ctx, 'skip', EXIT.USAGE);
            }
            for (const r of repos) {
                const n = normalizeRepoName(r);
                if (!n) {
                    continue;
                }
                if (sub === 'add') {
                    cur.add(n);
                } else {
                    cur.delete(n);
                }
            }
            data.skip[id] = uniqueRepos([...cur]);
        }
        if ((data.skip[id] ?? []).length === 0) {
            delete data.skip[id];
        }
        saveSkipFile(root, data);
        const names = data.skip[id] ?? [];
        if (portalJson) {
            return wtOk(ctx, `skip ${sub}`, { ok: true, id, skip: names });
        }
        wtWriteStdout(ctx, names.length ? `${id}: ${names.join(' ')}\n` : `${id}: （空）\n`);
        return wtOk(ctx, `skip ${sub}`, { ok: true, id, skip: names });
    }

    wtWriteStderr(ctx, `未知 skip 子命令: ${sub}\n`);
    return skipUsageEnvelope(ctx, 'skip', EXIT.USAGE);
}

function question(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
    return new Promise((resolveQ) => {
        rl.question(prompt, (answer) => resolveQ(answer));
    });
}

async function interactiveSkip(
    rl: ReturnType<typeof createInterface>,
    ctx: PortalContext,
): Promise<number> {
    process.stdout.write('skip — 按子命令跳过仓（push / pull 名单独立）\n\n');
    await handleWtSkip([], ctx);
    process.stdout.write('\n');
    process.stdout.write('  list [id]           查看名单\n');
    process.stdout.write('  add <id> <repo>...  加入\n');
    process.stdout.write('  rm <id> <repo>...   移除\n');
    process.stdout.write('  clear <id>          清空该子命令\n');
    process.stdout.write('  help                完整说明\n\n');
    const line = (await question(rl, 'skip 子命令（可空=结束；例 add push scripts）: ')).trim();
    if (!line) {
        return 0;
    }
    if (line === 'help' || line === '-h' || line === '--help') {
        skipUsageEnvelope(ctx, 'skip', EXIT.OK);
        return 0;
    }
    const env = await handleWtSkip(parseArgLine(line), ctx);
    return env.meta.exit_code;
}

export async function handleWtInteractive(
    _argv: string[],
    ctx: PortalContext,
): Promise<ProcessEnvelope> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        wtWriteStderr(ctx, '非 TTY：请用 list / run / help（避免交互挂起）\n');
        return usageEnvelope(ctx, '', EXIT.USAGE);
    }
    if (ctx.json) {
        wtWriteStderr(ctx, '非 TTY：请用 list / run / help（避免交互挂起）\n');
        return usageEnvelope(ctx, '', EXIT.USAGE);
    }

    process.stdout.write('workspace-tools — 选择工具\n\n');
    const extensions = wtPortalExtensions();
    WORKSPACE_CATALOG.forEach((t, i) => {
        process.stdout.write(`  ${i + 1}. ${t.id.padEnd(10)} ${t.title} — ${t.summary}\n`);
    });
    extensions.forEach((e, j) => {
        const num = WORKSPACE_CATALOG.length + j + 1;
        process.stdout.write(`  ${num}. ${e.id.padEnd(10)} ${e.title} — ${e.summary}\n`);
    });
    const skipNum = WORKSPACE_CATALOG.length + extensions.length + 1;
    process.stdout.write(
        `  ${skipNum}. ${'skip'.padEnd(10)} 按子命令跳过仓 — ww wt skip list/add/rm/clear\n`,
    );
    process.stdout.write('  q. 退出\n\n');

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const pick = (await question(rl, '编号或 id: ')).trim();
        if (!pick || pick === 'q' || pick === 'quit') {
            return wtOk(ctx, 'menu', { cancelled: true });
        }
        const skipPicked = pick === 'skip' || (/^\d+$/.test(pick) && Number(pick) === skipNum);
        if (skipPicked) {
            const code = await interactiveSkip(rl, ctx);
            if (code === 0) {
                return wtOk(ctx, 'menu', { exitCode: code });
            }
            return wtErr(ctx, 'menu', code, { code: 'MENU', message: `exit ${code}` });
        }
        const extPick =
            /^\d+$/.test(pick) &&
            Number(pick) > WORKSPACE_CATALOG.length &&
            Number(pick) <= WORKSPACE_CATALOG.length + extensions.length
                ? extensions[Number(pick) - WORKSPACE_CATALOG.length - 1]
                : findWtExtension(pick);
        if (extPick) {
            const argLine = await question(rl, '附加参数（可空）: ');
            const args = parseArgLine(argLine);
            prepareStdinForChildScript(rl);
            return invokeWtExtension(extPick, args, ctx);
        }
        let tool: WorkspaceTool | undefined;
        if (/^\d+$/.test(pick)) {
            tool = WORKSPACE_CATALOG[Number(pick) - 1];
        } else {
            tool = findTool(pick);
        }
        if (!tool) {
            wtWriteStderr(ctx, '未知选择\n');
            return wtErr(ctx, 'menu', EXIT.USAGE, { code: 'UNKNOWN_CHOICE', message: '未知选择' });
        }
        printHelpTool(ctx, tool);
        const argLine = await question(rl, '附加参数（可空；remote 须带 mode 如 cursor）: ');
        const args = parseArgLine(argLine);
        if (tool.id === 'remote' && args.length === 0) {
            wtWriteStderr(ctx, 'remote 需要位置参数：ssh | https | cursor | github\n');
            wtWriteStderr(ctx, 'examples:\n');
            for (const ex of tool.examples) {
                wtWriteStderr(ctx, `  ${ex}\n`);
            }
            return wtErr(ctx, 'menu', EXIT.USAGE, {
                code: 'USAGE',
                message: 'remote 需要位置参数：ssh | https | cursor | github',
            });
        }
        process.stdout.write(`\n→ ${tool.script} ${args.join(' ')}\n\n`);
        prepareStdinForChildScript(rl);
        const env = await executeTool(ctx, 'menu', tool, args, false);
        return env;
    } finally {
        try {
            rl.close();
        } catch {
            /* already closed before child script */
        }
    }
}
