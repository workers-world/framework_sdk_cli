import type { ManifestSideEffects } from './manifest.js';

export interface ReservedCommandMeta {
    name: string;
    summary: string;
    sideEffects: ManifestSideEffects;
    mutating: boolean;
}

export const RESERVED_PORTAL_COMMANDS: ReservedCommandMeta[] = [
    { name: 'list', summary: '列出门户工具与命令', sideEffects: 'none', mutating: false },
    { name: 'help', summary: '帮助（门户或某工具）', sideEffects: 'none', mutating: false },
    { name: 'search', summary: '按意图搜索命令', sideEffects: 'none', mutating: false },
    { name: 'schema', summary: '输出命令 schema（Agent）', sideEffects: 'none', mutating: false },
    { name: 'doctor', summary: '健康检查与修复建议', sideEffects: 'none', mutating: false },
    { name: 'update', summary: '更新 ww / SDK 并重链', sideEffects: 'remote', mutating: true },
    { name: 'version', summary: '版本与诊断信息', sideEffects: 'none', mutating: false },
    { name: 'install', summary: '安装 ~/.local/bin/ww 软链', sideEffects: 'local', mutating: true },
    { name: 'uninstall', summary: '移除 ww 软链', sideEffects: 'local', mutating: true },
];

export function reservedToolsForList(): Array<{
    id: string;
    title: string;
    summary: string;
    commands: Array<{
        name: string;
        summary: string;
        sideEffects: ManifestSideEffects;
        mutating: boolean;
        confirmRequired: boolean;
    }>;
}> {
    const portal = {
        id: '_portal',
        title: '门户',
        summary: '保留动词',
        commands: RESERVED_PORTAL_COMMANDS.map((c) => ({
            name: c.name,
            summary: c.summary,
            sideEffects: c.sideEffects,
            mutating: c.mutating,
            confirmRequired: c.mutating,
        })),
    };
    return [portal];
}
