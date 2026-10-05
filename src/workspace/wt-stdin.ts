import type { Interface } from 'node:readline';

/** 交互菜单在 spawn 子脚本前释放 readline 对 stdin 的 raw 模式。 */
export function prepareStdinForChildScript(rl: Interface): void {
    rl.pause();
    const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => void };
    if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(false);
    }
    rl.close();
}
