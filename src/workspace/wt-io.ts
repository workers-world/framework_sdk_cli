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

export function wtWriteStdout(ctx: PortalContext, text: string): void {
    if (wtJsonMode(ctx)) {
        return;
    }
    wtStdout(ctx).write(text);
}

export function wtWriteStderr(ctx: PortalContext, text: string): void {
    const raw = text.endsWith('\n') ? text.slice(0, -1) : text;
    const suffix = text.endsWith('\n') ? '\n' : '\n';
    const stream = wtStderr(ctx);
    const color = shouldColorStream(stream, { json: wtJsonMode(ctx) });
    stream.write(`${colorizeLogLine(raw, color)}${suffix}`);
}
