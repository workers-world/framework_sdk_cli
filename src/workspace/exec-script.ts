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

    const discard = { write: () => true } as unknown as NodeJS.WritableStream;
    const out = opts.json ? discard : (opts.io?.stdout ?? process.stdout);
    const err = opts.json ? discard : (opts.io?.stderr ?? process.stderr);

    const applied = applySkipArgs(
        workspaceRoot,
        tool,
        args,
        (line) =>
            err.write(`${colorizeLogLine(line, shouldColorStream(err, { json: opts.json }))}\n`),
        (line) =>
            err.write(`${colorizeLogLine(line, shouldColorStream(err, { json: opts.json }))}\n`),
    );
    const runArgs = applied.args;

    const env = { ...process.env };
    if (opts.json) {
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

    const colorOut = shouldColorStream(out, { json: opts.json });
    const colorErr = shouldColorStream(err, { json: opts.json });

    return new Promise((resolve) => {
        const child = spawn(cmd, cmdArgs, {
            cwd: workspaceRoot,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
        });
        const outWriter = createLineWriter(out, colorOut);
        const errWriter = createLineWriter(err, colorErr);
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
