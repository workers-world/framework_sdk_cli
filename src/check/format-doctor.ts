import { hintLine } from '../cli/color.js';
import type { CheckRunItem } from './types.js';

function icon(status: CheckRunItem['status'], crashed?: boolean): string {
    if (crashed) {
        return '☠';
    }
    switch (status) {
        case 'ok':
            return '✓';
        case 'warn':
            return '!';
        case 'fail':
            return '✗';
        default:
            return '-';
    }
}

export function formatDoctorHuman(
    items: CheckRunItem[],
    stream: NodeJS.WritableStream,
    json: boolean,
): string {
    const lines: string[] = [];
    for (const item of items) {
        const fix = item.fix?.command ? ` → ${item.fix.command}` : '';
        lines.push(`[${icon(item.status, item.crashed)}] ${item.id}: ${item.message}${fix}`);
    }
    const problems = items.filter((c) => c.status === 'fail' || c.status === 'warn').length;
    if (problems > 0) {
        lines.push(`${problems} 项需要处理`);
    } else {
        lines.push('全部检查通过');
    }
    const text = `${lines.join('\n')}\n`;
    if (!json) {
        stream.write(hintLine(text, stream, { json }));
    }
    return text;
}

export function formatDoctorSummary(items: CheckRunItem[]): {
    problemCount: number;
    failCount: number;
} {
    const failCount = items.filter((c) => c.status === 'fail').length;
    const problemCount = items.filter((c) => c.status === 'fail' || c.status === 'warn').length;
    return { problemCount, failCount };
}
