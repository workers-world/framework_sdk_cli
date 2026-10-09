/** Bump commit 主题白名单（WW-159）；已 push 的 bot lock 刷新不在此列时不参与 squash/amend。 */

const DEPS_BUMP = /^chore\(deps\): bump .+/;
const CI_ACTIONS_BUMP = /^chore\(ci\): bump worker-actions .+/;
/** 仅本地未 push 时可与 bump 连续段一起压；已 push 的 CI bot commit 不得 rewrite。 */
const LOCAL_LOCK_REFRESH = /^CI action 自动刷新 package-lock/;

export type BumpMessageKind = 'deps' | 'ci-actions' | 'lock-refresh';

export function bumpMessageKind(subject: string): BumpMessageKind | null {
    const s = subject.trim();
    if (DEPS_BUMP.test(s)) {
        return 'deps';
    }
    if (CI_ACTIONS_BUMP.test(s)) {
        return 'ci-actions';
    }
    if (LOCAL_LOCK_REFRESH.test(s)) {
        return 'lock-refresh';
    }
    return null;
}

export function isBumpCommitSubject(subject: string): boolean {
    return bumpMessageKind(subject) !== null;
}

/** 从 chore(deps): bump framework_sdk_worker to 0.1.2 提取摘要片段 */
export function parseDepsBumpSubject(subject: string): { sdk: string; version: string } | null {
    const m = subject.trim().match(/^chore\(deps\): bump (\S+) to (\S+)$/);
    if (!m) {
        return null;
    }
    return { sdk: m[1], version: m[2] };
}

export function parseActionsBumpSubject(subject: string): { tag: string } | null {
    const m = subject.trim().match(/^chore\(ci\): bump worker-actions bundle to (\S+)$/);
    if (!m) {
        return null;
    }
    return { tag: m[1] };
}

export function composeSquashCommitMessage(subjects: string[]): string {
    if (subjects.length === 0) {
        return 'chore(deps): bump (squashed)';
    }
    const deps = subjects
        .map(parseDepsBumpSubject)
        .filter((x): x is NonNullable<typeof x> => x !== null);
    const actions = subjects
        .map(parseActionsBumpSubject)
        .filter((x): x is NonNullable<typeof x> => x !== null);
    const lockOnly =
        subjects.length > 0 && subjects.every((s) => bumpMessageKind(s) === 'lock-refresh');

    if (lockOnly) {
        return subjects[0]?.trim() ?? 'chore(deps): bump (squashed)';
    }

    const sdkParts = [...new Map(deps.map((d) => [d.sdk, d.version])).entries()].map(
        ([sdk, ver]) => `${sdk}@${ver}`,
    );
    const lastAction = actions.at(-1);
    const actionTag = lastAction?.tag ?? null;

    if (sdkParts.length && actionTag) {
        const short = sdkParts
            .map((p) => (p.split('@')[0] ?? p).replace(/^framework_sdk_/, ''))
            .join('/');
        return `chore(deps): bump framework_sdk_${short} + worker-actions`;
    }
    if (sdkParts.length === 1) {
        const part = sdkParts[0] ?? '';
        const [sdk, ver] = part.split('@');
        return `chore(deps): bump ${sdk} to ${ver}`;
    }
    if (sdkParts.length > 1) {
        const names = sdkParts.map((p) => p.split('@')[0]).join(', ');
        const vers = [...new Set(sdkParts.map((p) => p.split('@')[1]))];
        const verSuffix = vers.length === 1 ? ` to ${vers[0]}` : '';
        return `chore(deps): bump ${names}${verSuffix}`;
    }
    if (actionTag) {
        return `chore(ci): bump worker-actions bundle to ${actionTag}`;
    }
    return subjects[0]?.trim() ?? 'chore(deps): bump (squashed)';
}

/** 同一次 bump 多包写入后的 commit 主题 */
export function composeMultiDepsBumpMessage(
    entries: Array<{ sdk: string; version: string }>,
): string {
    if (entries.length === 0) {
        return 'chore(deps): bump';
    }
    if (entries.length === 1) {
        const e = entries[0];
        return `chore(deps): bump ${e.sdk} to ${e.version}`;
    }
    const uniq = [...new Map(entries.map((e) => [e.sdk, e.version])).entries()];
    const first = uniq[0];
    const sameVer = first ? uniq.every(([, v]) => v === first[1]) : false;
    if (sameVer && first) {
        return `chore(deps): bump ${uniq.map(([s]) => s).join(', ')} to ${first[1]}`;
    }
    return composeSquashCommitMessage(
        uniq.map(([sdk, version]) => `chore(deps): bump ${sdk} to ${version}`),
    );
}
