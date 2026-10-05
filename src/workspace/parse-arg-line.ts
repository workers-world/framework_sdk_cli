/** 与 workspace-tools.mjs parseArgLine 一致。 */
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
    if (cur) {
        out.push(cur);
    }
    return out;
}
