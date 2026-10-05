import { catalogIds, WORKSPACE_CATALOG } from './catalog.js';
import { wtExtensionIds, wtPortalExtensions } from './extensions.js';

/** 门户 usage（WW-126：ww wt 前缀；无 install / __WT_JSON__ / .wt-skip.json） */
export function usageText(_skipFileDisplayPath: string): string {
    const toolIds = [...catalogIds(), ...wtExtensionIds()];
    const extLines = wtPortalExtensions().map((e) => `  ${e.id.padEnd(16)} ${e.summary}`);
    return [
        '用法: ww wt [<command>] [options]',
        '',
        '  (无参 + TTY)     交互菜单',
        '  list [--json]    列出工具',
        '  help [id]        门户或某工具说明',
        '  run <id> [--json] [--] [args...]   执行工具（参数透传）',
        '  pull|push|…      等同 run <id>',
        '  skip …           按子命令跳过仓（ww wt skip --help）',
        ...(extLines.length ? ['', ...extLines] : []),
        '',
        `工具 id: ${toolIds.join(', ')}`,
        '',
        'run 时自动把 skip[id] 转成 --exclude；一次忽略名单加 --no-skip。',
        'Agent: ww wt list --json；ww wt skip list --json；ww wt run <id> --json 输出 ww 进程信封。',
        '发版请用 agent-release-kit（npm run dev:orchestration / release-coord.mjs）。',
    ].join('\n');
}

export function skipUsageText(skipFileDisplayPath: string): string {
    const excludeIds = WORKSPACE_CATALOG.filter((t) => t.excludeFlag).map((t) => t.id);
    const noExcludeIds = WORKSPACE_CATALOG.filter((t) => !t.excludeFlag).map((t) => t.id);
    return [
        'ww wt skip — 按子命令跳过仓（不是「只处理名单里的仓」）',
        '',
        '用法:',
        '  ww wt skip                         列出全部非空名单（同 skip list）',
        '  ww wt skip list [id] [--json]      看全部，或只看某个子命令',
        '  ww wt skip add <id> <repo>...      加入该子命令的跳过名单',
        '  ww wt skip rm <id> <repo>...       从该子命令名单移除（remove 同义）',
        '  ww wt skip clear <id>              清空该子命令名单',
        '  ww wt skip --help                  本说明（ww wt help skip 相同）',
        '  ww wt                              交互菜单末项 skip',
        '',
        '语义:',
        '  名单按工具 id 分开：push 跳过 scripts 不影响 pull。',
        '  ww wt push / ww wt run push 会把 skip.push 转成 --exclude <仓>（可重复）。',
        '  本次忽略名单：ww wt push --no-skip',
        `  已支持 --exclude 的 id: ${excludeIds.join(', ')}`,
        noExcludeIds.length
            ? `  不支持 --exclude（名单可存但 run 会 warn 不生效）: ${noExcludeIds.join(', ')}`
            : '',
        '',
        '仓名:',
        '  用 workspace 一级目录名（scripts、cpt1、sch1）。',
        '  可写路径，只取最后一段：ww wt skip add push ./scripts/',
        '  meta 根仓写 meta-root 或 .',
        '',
        '文件:',
        `  ${skipFileDisplayPath}`,
        '  gitignore，本机名单',
        '  格式: { "skip": { "push": ["scripts"], "pull": [] } }',
        '',
        '例子:',
        '  ww wt skip add push scripts cpt1 worker-support-action',
        '  ww wt skip add pull cloudflare-docs',
        '  ww wt skip list',
        '  ww wt skip list push --json',
        '  ww wt skip rm push scripts',
        '  ww wt skip clear pull',
        '  ww wt push                  # stderr: skip[push]: cpt1 scripts …',
        '  ww wt push --no-skip        # 仍处理名单里的仓',
        '',
        'Agent: ww wt skip list --json；run --json 信封 data 含 skip 数组。',
    ].join('\n');
}
