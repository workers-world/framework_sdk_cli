/** ANSI 分级着色（WW-126 / WW-105）；只加颜色，不改文字。 */

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';

export function shouldColorStream(
    stream: NodeJS.WritableStream,
    opts?: { json?: boolean; forceColor?: boolean },
): boolean {
    if (opts?.json) {
        return false;
    }
    if (process.env.NO_COLOR != null && process.env.NO_COLOR !== '') {
        return false;
    }
    if (opts?.forceColor || process.env.FORCE_COLOR != null) {
        return true;
    }
    const tty = (stream as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
    return Boolean(tty);
}

function levelForLine(line: string): 'error' | 'warn' | 'ok' | 'debug' | 'info' {
    const t = line.trimStart();
    const upper = t.toUpperCase();
    if (/\bFAIL\b/.test(upper) || /\bERROR\b/.test(upper) || upper.startsWith('ERROR:')) {
        return 'error';
    }
    if (/\bSKIP\b/.test(upper) || /\bWARN\b/.test(upper) || upper.startsWith('WARN:')) {
        return 'warn';
    }
    if (/\bOK\b/.test(upper)) {
        return 'ok';
    }
    if (/\bDEBUG\b/.test(upper) || upper.startsWith('debug:')) {
        return 'debug';
    }
    if (t.includes('未知工具')) {
        return 'error';
    }
    return 'info';
}

export function colorizeLogLine(line: string, enableColor: boolean): string {
    if (!enableColor) {
        return line;
    }
    switch (levelForLine(line)) {
        case 'error':
            return `${RED}${line}${RESET}`;
        case 'warn':
            return `${YELLOW}${line}${RESET}`;
        case 'ok':
            return `${GREEN}${line}${RESET}`;
        case 'debug':
            return `${GRAY}${line}${RESET}`;
        default:
            return line;
    }
}

export function colorizeStatusLine(
    line: string,
    stream: NodeJS.WritableStream,
    json: boolean,
): string {
    const enable = shouldColorStream(stream, { json });
    if (!enable) {
        return line;
    }
    if (line.endsWith(': ok')) {
        return `${GREEN}${line}${RESET}`;
    }
    if (/: [^:]+: /.test(line)) {
        return `${RED}${line}${RESET}`;
    }
    return line;
}
