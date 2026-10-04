import type { SearchMatch, ToolRegistration } from '../portal/types.js';

function tokenize(q: string): string[] {
    return q
        .toLowerCase()
        .split(/[\s,/|._-]+/)
        .map((t) => t.trim())
        .filter(Boolean);
}

function scoreText(hay: string, tokens: string[]): number {
    const h = hay.toLowerCase();
    let score = 0;
    for (const t of tokens) {
        if (h === t) {
            score += 5;
        } else if (h.startsWith(t)) {
            score += 3;
        } else if (h.includes(t)) {
            score += 1;
        }
    }
    return score;
}

/**
 * 门户级 search（对齐 cf cli search）：对各业务登记的 summary/命令打分。
 * 业务只提供描述；引擎在 SDK。
 */
export function searchTools(query: string, tools: ToolRegistration[], limit = 10): SearchMatch[] {
    const tokens = tokenize(query);
    if (tokens.length === 0) {
        return [];
    }
    const matches: SearchMatch[] = [];
    for (const tool of tools) {
        const toolBlob = [tool.id, tool.title, tool.summary, ...(tool.keywords ?? [])].join(' ');
        const toolScore = scoreText(toolBlob, tokens);
        for (const cmd of tool.commands) {
            const score =
                toolScore + scoreText(`${toolBlob} ${cmd.name} ${cmd.summary}`, tokens) * 2;
            if (score <= 0) {
                continue;
            }
            matches.push({
                toolId: tool.id,
                command: cmd.name,
                title: `${tool.id} ${cmd.name}`,
                summary: cmd.summary || tool.summary,
                score,
                mutating: cmd.mutating,
            });
        }
        if (tool.commands.length === 0 && toolScore > 0) {
            matches.push({
                toolId: tool.id,
                command: '',
                title: tool.id,
                summary: tool.summary,
                score: toolScore,
            });
        }
    }
    return matches
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, limit);
}
