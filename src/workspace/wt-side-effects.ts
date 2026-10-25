import type { CommandSideEffects } from '../portal/types.js';

const REMOTE_MUTATING = new Set([
    'pull',
    'push',
    'bump-sdk',
    'here-push',
    'remote',
    'squash-bumps',
]);

export function wtCatalogSideEffects(toolId: string): {
    sideEffects: CommandSideEffects;
    confirmFlag?: '--confirm' | '--apply';
    mutating: boolean;
} {
    if (toolId === 'remote') {
        return { sideEffects: 'remote', confirmFlag: '--apply', mutating: true };
    }
    if (REMOTE_MUTATING.has(toolId)) {
        return { sideEffects: 'remote', confirmFlag: '--confirm', mutating: true };
    }
    return { sideEffects: 'none', mutating: false };
}
