import type { SideEffects } from '../envelope/exit.js';

/** 子脚本非零 exit 的 side_effects（bulk 可能已部分写入）。 */
export function sideEffectsForScriptExit(
    toolId: string,
    scriptArgv: string[],
    exitCode: number,
): SideEffects {
    if (exitCode === 0) {
        return 'complete';
    }
    if (toolId === 'cloc') {
        return 'none';
    }
    if (toolId === 'remote' && !scriptArgv.includes('--apply')) {
        return 'none';
    }
    return 'unknown';
}
