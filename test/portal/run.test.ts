import { afterEach, describe, expect, it } from 'vitest';
import { okEnvelope } from '../../src/envelope/index.js';
import {
    clearPortalVersionRegistration,
    clearRegisteredTools,
    listRegisteredTools,
    registerTool,
    runPortal,
} from '../../src/portal/index.js';
import { searchTools } from '../../src/search/index.js';

afterEach(() => {
    clearRegisteredTools();
    clearPortalVersionRegistration();
});

describe('registerTool / search / list', () => {
    it('lists registered tools', async () => {
        registerTool({
            id: 'pgreq',
            title: '规划闸 A',
            summary: 'PGREQ → GitHub Issue',
            keywords: ['planning', 'issue'],
            commands: [
                {
                    name: 'create',
                    summary: '创建 PGREQ',
                    handler: async () => okEnvelope('ww pgreq create', { id: 'PGREQ1' }),
                },
                {
                    name: 'issue',
                    summary: '闸 A 建 Issue',
                    mutating: true,
                    handler: async () => okEnvelope('ww pgreq issue', {}),
                },
            ],
        });
        expect(listRegisteredTools()).toHaveLength(1);
        const result = await runPortal({
            argv: ['list', '--json'],
            noExit: true,
            stdout: { write: () => true } as unknown as NodeJS.WritableStream,
            stderr: { write: () => true } as unknown as NodeJS.WritableStream,
        });
        expect(result.ok).toBe(true);
        const data = result.data as { tools: Array<{ id: string }> };
        expect(data.tools[0]?.id).toBe('pgreq');
    });

    it('search ranks pgreq issue', () => {
        registerTool({
            id: 'pgreq',
            title: '规划闸 A',
            summary: 'PGREQ 暂存 → GitHub Issue（无 agent-needed）',
            keywords: ['github', 'issue', 'planning'],
            commands: [
                {
                    name: 'issue',
                    summary: '闸 A 建 GitHub Issue（须 --confirm）',
                    mutating: true,
                    handler: async () => okEnvelope('x', {}),
                },
            ],
        });
        const matches = searchTools('github issue confirm', listRegisteredTools());
        expect(matches[0]?.toolId).toBe('pgreq');
        expect(matches[0]?.command).toBe('issue');
    });

    it('search via runPortal', async () => {
        registerTool({
            id: 'pgreq',
            title: '规划',
            summary: 'planning',
            commands: [
                {
                    name: 'create',
                    summary: 'create requirement',
                    handler: async () => okEnvelope('x', {}),
                },
            ],
        });
        const result = await runPortal({
            argv: ['search', 'create', 'requirement', '--json'],
            noExit: true,
            stdout: { write: () => true } as unknown as NodeJS.WritableStream,
            stderr: { write: () => true } as unknown as NodeJS.WritableStream,
        });
        expect(result.ok).toBe(true);
        const data = result.data as { matches: Array<{ toolId: string }> };
        expect(data.matches.some((m) => m.toolId === 'pgreq')).toBe(true);
    });
});
