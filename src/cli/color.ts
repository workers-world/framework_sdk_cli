/** ANSI 分级着色（WW-126 / WW-105）；只加颜色，不改文字。 */

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';

function forceColorDecision(): boolean | undefined {
    const fc = process.env.FORCE_COLOR;
    if (fc == null || fc === '') {
        return undefined;
    }
    if (fc === '0' || fc === 'false') {
        return false;
    }
    return true;
}

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
    const forced = opts?.forceColor ?? forceColorDecision();
    if (forced === false) {
        return false;
    }
    if (forced === true) {
        return true;
    }
    const tty = (stream as NodeJS.WriteStream & { isTTY?: boolean }).isTTY;
    return Boolean(tty);
}

function levelForLine(line: string): 'error' | 'warn' | 'ok' | 'debug' | 'info' {
    const t = line.trimStart();

    if (t.startsWith('错误:')) {
        return 'error';
    }
    if (/^error:/i.test(t)) {
        return 'error';
    }
    if (/^warn:/i.test(t)) {
        return 'warn';
    }

    if (/^summary:/i.test(t)) {
        const failMatch = t.match(/\bFAIL\s+(\d+)/i);
        if (failMatch && Number(failMatch[1]) > 0) {
            return 'error';
        }
        return 'info';
    }

    if (/^FAIL\b/.test(t)) {
        return 'error';
    }
    if (/^SKIP\b/.test(t)) {
        return 'warn';
    }
    if (/^OK\b/.test(t)) {
        return 'ok';
    }
    if (/^WARN\b/.test(t)) {
        return 'warn';
    }
    if (/^DEBUG\b/.test(t) || /^debug:/i.test(t)) {
        return 'debug';
    }
    if (t === '未知工具' || t.startsWith('未知工具:') || t === '未知选择') {
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
