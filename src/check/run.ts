import type { CheckContext, CheckRunItem, SelfCheck } from './types.js';

const DEFAULT_TIMEOUT_MS = 15_000;

export async function runChecks(
    checks: SelfCheck[],
    ctx: CheckContext,
    options?: { ids?: string[]; timeoutMs?: number },
): Promise<CheckRunItem[]> {
    const filter = options?.ids?.length ? new Set(options.ids) : null;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const selected = checks.filter((c) => !filter || filter.has(c.id));

    const results = await Promise.all(
        selected.map(async (check) => {
            try {
                const result = await withTimeout(check.run(ctx), timeoutMs);
                return {
                    id: check.id,
                    title: check.title,
                    status: result.status,
                    message: result.message,
                    fix: result.fix,
                    details: result.details,
                } satisfies CheckRunItem;
            } catch (e) {
                return {
                    id: check.id,
                    title: check.title,
                    status: 'fail' as const,
                    message: e instanceof Error ? e.message : String(e),
                    crashed: true,
                } satisfies CheckRunItem;
            }
        }),
    );
    return results;
}

async function withTimeout<T>(p: Promise<T> | T, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('check timed out')), ms);
    });
    try {
        return await Promise.race([Promise.resolve(p), timeout]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

export function checksHaveFailure(items: CheckRunItem[]): boolean {
    return items.some((c) => c.status === 'fail');
}
