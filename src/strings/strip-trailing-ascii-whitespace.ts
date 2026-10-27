/** 去掉末尾 ASCII 空白，不用 `\s` 正则以免 ReDoS。 */
export function stripTrailingAsciiWhitespace(s: string): string {
    let end = s.length;
    while (end > 0) {
        const c = s.charCodeAt(end - 1);
        if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d && c !== 0x0b && c !== 0x0c) {
            break;
        }
        end -= 1;
    }
    return end === s.length ? s : s.slice(0, end);
}
