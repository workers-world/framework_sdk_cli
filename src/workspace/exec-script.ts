import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { colorizeLogLine, shouldColorStream } from '../cli/color.js';
import type { WorkspaceTool } from './catalog.js';
import { applySkipArgs } from './skip-apply.js';

export interface RunToolResult {
    exitCode: number;
    argv: string[];
    skip: string[];
    scriptPath: string;
    signal?: string;
    spawnError?: string;
}

function createLineWriter(
    stream: NodeJS.WritableStream,
    color: boolean,
): {
    write: (chunk: string) => void;
    flush: () => void;
} {
    let pending = '';
    return {
        write(chunk: string) {
            pending += chunk;
            const parts = pending.split('\n');
            pending = parts.pop() ?? '';
            for (const line of parts) {
                stream.write(`${colorizeLogLine(line, color)}\n`);
            }
        },
        flush() {
            if (pending.length > 0) {
                stream.write(colorizeLogLine(pending, color));
                pending = '';
            }
        },
    };
}

export async function runWorkspaceTool(
    tool: WorkspaceTool,
    args: string[],
    workspaceRoot: string,
    opts: {
        json: boolean;
        io?: { stdout?: NodeJS.WritableStream; stderr?: NodeJS.WritableStream };
    },
): Promise<RunToolResult> {
    const scriptPath = join(workspaceRoot, tool.script);
    if (!existsSync(scriptPath)) {
        return {
            exitCode: 1,
            argv: args,
            skip: [],
            scriptPath,
        };
    }

    const jsonMode = opts.json;
    const interactive = !jsonMode && Boolean(process.stdin.isTTY);
    const portalStdout = opts.io?.stdout ?? process.stdout;
    const portalStderr = opts.io?.stderr ?? process.stderr;

    /** --json / 非 TTY：脚本输出无着色写到 stderr，stdout 留给信封 */
    const scriptOutStream = jsonMode ? portalStderr : portalStdout;
    const scriptErrStream = jsonMode ? portalStderr : portalStderr;

    const applied = applySkipArgs(
        workspaceRoot,
        tool,
        args,
        (line) => {
            const color = shouldColorStream(scriptErrStream, { json: jsonMode });
            scriptErrStream.write(`${colorizeLogLine(line, color)}\n`);
        },
        (line) => {
            const color = shouldColorStream(scriptErrStream, { json: jsonMode });
            scriptErrStream.write(`${colorizeLogLine(line, color)}\n`);
        },
    );
    const runArgs = applied.args;

    const env = { ...process.env };
    if (jsonMode) {
        env.NO_COLOR = '1';
    }

    const isNode = tool.script.endsWith('.mjs') || tool.script.endsWith('.js');
    const isShell = tool.script.endsWith('.sh');
    let cmd: string;
    let cmdArgs: string[];
    if (isNode) {
        cmd = process.execPath;
        cmdArgs = [scriptPath, ...runArgs];
    } else if (isShell) {
        cmd = 'bash';
        cmdArgs = [scriptPath, ...runArgs];
    } else {
        cmd = scriptPath;
        cmdArgs = runArgs;
    }

    const colorOut = shouldColorStream(scriptOutStream, { json: jsonMode });
    const colorErr = shouldColorStream(scriptErrStream, { json: jsonMode });

    return new Promise((resolve) => {
        const outWriter = createLineWriter(scriptOutStream, colorOut);
        const errWriter = createLineWriter(scriptErrStream, colorErr);
        const child = spawn(cmd, cmdArgs, {
            cwd: workspaceRoot,
            env,
            stdio: [interactive ? 'inherit' : 'ignore', 'pipe', 'pipe'],
            shell: false,
        });
        child.stdout.on('data', (c: Buffer) => outWriter.write(c.toString('utf8')));
        child.stderr.on('data', (c: Buffer) => errWriter.write(c.toString('utf8')));
        child.on('error', (spawnErr) => {
            resolve({
                exitCode: 127,
                argv: runArgs,
                skip: applied.skip,
                scriptPath,
                spawnError: spawnErr.message,
            });
        });
        child.on('close', (code, signal) => {
            outWriter.flush();
            errWriter.flush();
            resolve({
                exitCode: signal ? 1 : (code ?? 1),
                argv: runArgs,
                skip: applied.skip,
                scriptPath,
                ...(signal ? { signal } : {}),
            });
        });
    });
}
