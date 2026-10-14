import type { SearchMatch, ToolRegistration } from '../portal/types.js';
import { suggestedCommandLine } from './suggested.js';

const DEFAULT_SEARCH_LIMIT = 5;

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

/** 意图加权：如 “create github issue” 应优先 pgreq issue 而非 pgreq create */
function intentBoost(query: string, cmdName: string, mutating?: boolean): number {
    const tokens = tokenize(query);
    const q = query.toLowerCase();
    let boost = 0;

    const wantsIssue = tokens.includes('issue') || /\bissues?\b/.test(q);
    const wantsGithub = tokens.includes('github') || q.includes('github');

    if (wantsIssue && cmdName === 'issue') {
        boost += 12;
    }
    if (wantsIssue && cmdName === 'create') {
        boost -= 10;
    }
    if (wantsGithub && cmdName === 'issue' && mutating) {
        boost += 6;
    }
    if (tokens.includes('create') && wantsIssue && cmdName === 'issue') {
        boost += 8;
    }
    return boost;
}

/**
 * 门户级 search（对齐 cf cli search）：对各业务登记的 summary/命令打分。
 * 业务只提供描述；引擎在 SDK。
 */
export function searchTools(
    query: string,
    tools: ToolRegistration[],
    limit = DEFAULT_SEARCH_LIMIT,
    portal = 'ww',
): SearchMatch[] {
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
                toolScore +
                scoreText(`${toolBlob} ${cmd.name} ${cmd.summary}`, tokens) * 2 +
                intentBoost(query, cmd.name, cmd.mutating);
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
                suggested: suggestedCommandLine(portal, tool.id, cmd.name, cmd.mutating),
            });
        }
        if (tool.commands.length === 0 && toolScore > 0) {
            matches.push({
                toolId: tool.id,
                command: '',
                title: tool.id,
                summary: tool.summary,
                score: toolScore,
                suggested: suggestedCommandLine(portal, tool.id, '', false),
            });
        }
    }
    return matches
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, limit);
}

export { DEFAULT_SEARCH_LIMIT };
