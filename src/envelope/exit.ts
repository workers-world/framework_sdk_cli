/**
 * CLI 退出码（CLI Agent Spec 子集，够闸 A）。
 * Agent 见 exit 1 禁止盲目重试写操作。
 */
export const EXIT = {
    OK: 0,
    /** 未分类失败；副作用 unknown → 禁止盲目重试建 Issue */
    UNKNOWN: 1,
    /** 用法 / 缺 --confirm / 预览态（未写） */
    USAGE: 2,
    /** 远端 4xx 业务冲突 */
    CONFLICT: 3,
    /** 鉴权 / Access */
    AUTH: 4,
    /** 网络 / 5xx（可重试） */
    RETRYABLE: 5,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export type SideEffects = 'none' | 'complete' | 'partial' | 'unknown';

export function sideEffectsForExit(code: ExitCode): SideEffects {
    if (code === EXIT.OK) {
        return 'complete';
    }
    if (code === EXIT.UNKNOWN) {
        return 'unknown';
    }
    return 'none';
}

export function retryableForExit(code: ExitCode): boolean {
    return code === EXIT.RETRYABLE;
}
