/** 去掉末尾 `/`，不用 `/\/+$/` 以免 ReDoS。 */
export function stripTrailingSlashes(s: string): string {
    let end = s.length;
    while (end > 0 && s[end - 1] === '/') {
        end -= 1;
    }
    return end === s.length ? s : s.slice(0, end);
}
