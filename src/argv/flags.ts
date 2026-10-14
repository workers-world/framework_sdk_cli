/**
 * argv / 守闸 flag：禁止交互 y/N 当唯一闸；写操作须显式 --confirm。
 */
export function hasConfirmFlag(argv: string[]): boolean {
    return argv.includes('--confirm');
}

/** wt 写操作：`--confirm` 与 `--apply` 等价（对齐门户 Gate A 词汇） */
export function hasWriteConfirmFlag(argv: string[]): boolean {
    return argv.includes('--confirm') || argv.includes('--apply');
}

/** 将门户 `--confirm` 映射为脚本侧的 `--apply`（不重复插入） */
export function mapConfirmToApplyArgv(argv: string[]): string[] {
    if (!argv.includes('--confirm')) {
        return argv;
    }
    if (argv.includes('--apply')) {
        return argv.filter((a) => a !== '--confirm');
    }
    return argv.map((a) => (a === '--confirm' ? '--apply' : a));
}

export function hasJsonFlag(argv: string[]): boolean {
    return argv.includes('--json');
}

export function stripFlags(argv: string[], flags: string[] = ['--confirm', '--json']): string[] {
    const set = new Set(flags);
    return argv.filter((a) => !set.has(a));
}

export function parseNamedArgs(argv: string[]): {
    flags: Set<string>;
    named: Record<string, string>;
    positional: string[];
} {
    const flags = new Set<string>();
    const named: Record<string, string> = {};
    const positional: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a == null) {
            continue;
        }
        if (a === '--') {
            positional.push(...argv.slice(i + 1));
            break;
        }
        if (a.startsWith('--')) {
            const eq = a.indexOf('=');
            if (eq > 2) {
                named[a.slice(2, eq)] = a.slice(eq + 1);
                continue;
            }
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next != null && !next.startsWith('-')) {
                named[key] = next;
                i++;
            } else {
                flags.add(key);
            }
            continue;
        }
        if (a.startsWith('-') && a.length === 2) {
            flags.add(a.slice(1));
            continue;
        }
        positional.push(a);
    }
    return { flags, named, positional };
}
