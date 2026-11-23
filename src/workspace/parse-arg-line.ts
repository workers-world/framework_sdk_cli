/** 与 workspace-tools.mjs parseArgLine 一致；不支持反斜杠转义（引号内无转义语义，成对引号即闭合）。 */
export function parseArgLine(line: string): string[] {
    const s = line.trim();
    if (!s) {
        return [];
    }
    const out: string[] = [];
    let cur = '';
    let quote: string | null = null;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (quote) {
            if (ch === quote) {
                quote = null;
            } else {
                cur += ch;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (/\s/.test(ch)) {
            if (cur) {
                out.push(cur);
                cur = '';
            }
            continue;
        }
        cur += ch;
    }
    if (quote) {
        // 未闭合引号此前会静默吞掉行尾（含后续参数）；必须显式报错，由调用层按 USAGE 展示
        throw new Error(`error: 附加参数引号未闭合: ${s}`);
    }
    if (cur) {
        out.push(cur);
    }
    return out;
}
