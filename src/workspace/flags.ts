/** 与 workspace-tools.mjs takePortalFlags 一致（--json 门户用，不传给子脚本）。 */
export function takePortalFlags(argv: string[]): { json: boolean; rest: string[] } {
    const rest: string[] = [];
    let json = false;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--') {
            // 标准 `--` 语义：其后参数原样透传（--json 不再被门户吞），`--` 本身消费掉
            rest.push(...argv.slice(i + 1));
            break;
        }
        if (a === '--json') {
            json = true;
            continue;
        }
        rest.push(a);
    }
    return { json, rest };
}
