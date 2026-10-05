import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { colorizeLogLine, shouldColorStream } from '../cli/color.js';
import type { PortalContext } from '../portal/types.js';
import { scriptById } from './scripts.js';

export interface ExecScriptResult {
    exitCode: number;
    toolId: string;
    scriptPath: string;
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

export async function execWorkspaceScript(
    toolId: string,
    scriptArgs: string[],
    ctx: PortalContext,
    workspaceRoot: string,
    io?: { stdout?: NodeJS.WritableStream; stderr?: NodeJS.WritableStream },
): Promise<ExecScriptResult> {
    const def = scriptById(toolId);
    if (!def) {
        return { exitCode: 127, toolId, scriptPath: '' };
    }
    const scriptPath = join(workspaceRoot, def.file);
    const discard = { write: () => true } as unknown as NodeJS.WritableStream;
    const out = ctx.json ? discard : (io?.stdout ?? process.stdout);
    const err = ctx.json ? discard : (io?.stderr ?? process.stderr);
    const env = { ...process.env };
    if (ctx.json) {
        env.NO_COLOR = '1';
    }

    const colorOut = shouldColorStream(out, { json: ctx.json });
    const colorErr = shouldColorStream(err, { json: ctx.json });

    const exitCode = await new Promise<number>((resolve, reject) => {
        const outWriter = createLineWriter(out, colorOut);
        const errWriter = createLineWriter(err, colorErr);
        const child = spawn('bash', [scriptPath, ...scriptArgs], {
            cwd: workspaceRoot,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.stdout.on('data', (c: Buffer) => outWriter.write(c.toString('utf8')));
        child.stderr.on('data', (c: Buffer) => errWriter.write(c.toString('utf8')));
        child.on('error', reject);
        child.on('close', (code) => {
            outWriter.flush();
            errWriter.flush();
            resolve(code ?? 1);
        });
    });

    return { exitCode, toolId, scriptPath };
}
