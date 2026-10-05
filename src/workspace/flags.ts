/** 与 workspace-tools.mjs takePortalFlags 一致（--json 门户用，不传给子脚本；-- 丢弃）。 */
export function takePortalFlags(argv: string[]): { json: boolean; rest: string[] } {
    const rest: string[] = [];
    let json = false;
    for (const a of argv) {
        if (a === '--json') {
            json = true;
            continue;
        }
        if (a === '--') {
            continue;
        }
        rest.push(a);
    }
    return { json, rest };
}
