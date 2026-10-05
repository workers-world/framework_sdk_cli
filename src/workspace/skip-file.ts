import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 新跳过列表文件名（不读旧 `.wt-skip.json`）。 */
export const WORKSPACE_SKIP_FILENAME = '.ww-workspace-skip.json';

export interface WorkspaceSkipFile {
    version: 1;
    /** 相对工作区根的路径，或仓目录名 */
    repos: string[];
}

export function skipFilePath(workspaceRoot: string): string {
    return join(workspaceRoot, WORKSPACE_SKIP_FILENAME);
}

export function readSkipFile(workspaceRoot: string): WorkspaceSkipFile {
    const path = skipFilePath(workspaceRoot);
    try {
        const raw = readFileSync(path, 'utf8');
        const parsed = JSON.parse(raw) as WorkspaceSkipFile;
        if (parsed?.version !== 1 || !Array.isArray(parsed.repos)) {
            throw new Error('invalid skip file shape');
        }
        return { version: 1, repos: [...parsed.repos] };
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            return { version: 1, repos: [] };
        }
        throw err;
    }
}

export function writeSkipFile(workspaceRoot: string, data: WorkspaceSkipFile): void {
    const path = skipFilePath(workspaceRoot);
    const body = `${JSON.stringify({ version: 1, repos: data.repos }, null, 2)}\n`;
    writeFileSync(path, body, 'utf8');
}
