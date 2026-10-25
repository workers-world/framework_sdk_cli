import { colorizeLogLine, shouldColorStream } from '../cli/color.js';
import type { PortalContext } from '../portal/types.js';

export function wtJsonMode(ctx: PortalContext): boolean {
    return ctx.json;
}

function wtStdout(ctx: PortalContext): NodeJS.WritableStream {
    return ctx.stdout ?? process.stdout;
}

function wtStderr(ctx: PortalContext): NodeJS.WritableStream {
    return ctx.stderr ?? process.stderr;
}

/** 按行着色写入（OK→绿 / FAIL→红 / SKIP·WARN→黄），与脚本转发、stderr 一致。 */
function writeColoredLines(
    stream: NodeJS.WritableStream,
    text: string,
    enableColor: boolean,
): void {
    const endsWithNl = text.endsWith('\n');
    const body = endsWithNl ? text.slice(0, -1) : text;
    if (body.length === 0) {
        if (endsWithNl) {
            stream.write('\n');
        }
        return;
    }
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const last = i === lines.length - 1;
        const nl = !last || endsWithNl ? '\n' : '';
        stream.write(`${colorizeLogLine(lines[i] ?? '', enableColor)}${nl}`);
    }
}

export function wtWriteStdout(ctx: PortalContext, text: string): void {
    if (wtJsonMode(ctx)) {
        return;
    }
    const stream = wtStdout(ctx);
    writeColoredLines(stream, text, shouldColorStream(stream, { json: false }));
}

export function wtWriteStderr(ctx: PortalContext, text: string): void {
    const stream = wtStderr(ctx);
    writeColoredLines(stream, text, shouldColorStream(stream, { json: wtJsonMode(ctx) }));
}
