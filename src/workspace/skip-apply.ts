import type { WorkspaceTool } from './catalog.js';
import { skipsFor } from './skip-file.js';

export interface AppliedSkipArgs {
    args: string[];
    skip: string[];
    noSkip: boolean;
}

export function applySkipArgs(
    workspaceRoot: string,
    tool: WorkspaceTool,
    args: string[],
    logWarn: (line: string) => void,
    logSkip: (line: string) => void,
): AppliedSkipArgs {
    const noSkip = args.includes('--no-skip');
    const rest = args.filter((a) => a !== '--no-skip');
    const skip = skipsFor(workspaceRoot, tool.id);
    if (noSkip || skip.length === 0) {
        return { args: rest, skip: noSkip ? [] : skip, noSkip };
    }
    if (!tool.excludeFlag) {
        logWarn(`warn: ${tool.id} 不支持 --exclude，跳过名单未生效（${skip.join(' ')}）`);
        return { args: rest, skip, noSkip };
    }
    const extra: string[] = [];
    for (const name of skip) {
        extra.push(tool.excludeFlag, name);
    }
    logSkip(`skip[${tool.id}]: ${skip.join(' ')}`);
    return { args: [...extra, ...rest], skip, noSkip };
}
