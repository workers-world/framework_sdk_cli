import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    collectUnpushedBumpChainFromHead,
    gitCommitIsOnUpstream,
    planSquashForRepo,
} from '../../src/workspace/git-bump.js';

const dirs: string[] = [];

function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), 'ww-git-bump-'));
    dirs.push(d);
    return d;
}

function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function commitFile(cwd: string, subject: string): string {
    writeFileSync(join(cwd, `f-${Math.random().toString(36).slice(2)}.txt`), subject);
    execFileSync('git', ['add', '.'], { cwd });
    git(cwd, 'commit', '-m', subject);
    return git(cwd, 'rev-parse', 'HEAD');
}

function initRepoWithUpstream(): { work: string; origin: string } {
    const origin = tmp();
    execFileSync('git', ['init', '--bare', '-b', 'dev_00_01_00'], { cwd: origin });
    const work = tmp();
    git(work, 'init', '-b', 'dev_00_01_00');
    git(work, 'config', 'user.email', 't@example.com');
    git(work, 'config', 'user.name', 't');
    // 本机全局 commit.gpgsign=true 会让测试仓的 git commit 走 gpg 签名（慢、易超时），测试内关闭
    git(work, 'config', 'commit.gpgsign', 'false');
    git(work, 'remote', 'add', 'origin', origin);
    commitFile(work, 'init');
    git(work, 'push', '-u', 'origin', 'dev_00_01_00');
    return { work, origin };
}

/** git-bump 三态：merge-base 失败（shallow / 对象缺失等）不得误判「未 push」导致 rewrite 已 push commit */
describe('gitCommitIsOnUpstream 三态', () => {
    afterEach(() => {
        for (const d of dirs.splice(0)) {
            rmSync(d, { recursive: true, force: true });
        }
    });

    it('已 push → on-upstream；未 push → not-on-upstream', () => {
        const { work } = initRepoWithUpstream();
        const pushed = git(work, 'rev-parse', 'HEAD');
        expect(gitCommitIsOnUpstream(work, pushed)).toBe('on-upstream');

        const local = commitFile(work, 'chore(deps): bump framework_sdk_worker to 0.1.0');
        expect(gitCommitIsOnUpstream(work, local)).toBe('not-on-upstream');
    });

    it('shallow clone 中边界外 commit → unverifiable（不误判为未 push）', () => {
        const { work, origin } = initRepoWithUpstream();
        const old = commitFile(work, 'old commit');
        const tip = commitFile(work, 'tip commit');
        git(work, 'push', 'origin', 'dev_00_01_00');

        // depth 1 的 shallow clone 只看得见 tip；old 超出 shallow 边界（对象缺失）。
        // 本地路径 clone 默认走 local transport（--depth 被忽略），须用 file:// 才真正 shallow。
        const shallow = tmp();
        execFileSync(
            'git',
            ['clone', '-q', '--depth', '1', '--branch', 'dev_00_01_00', `file://${origin}`, '.'],
            {
                cwd: shallow,
            },
        );
        git(shallow, 'config', 'user.email', 't@example.com');
        git(shallow, 'config', 'user.name', 't');
        expect(gitCommitIsOnUpstream(shallow, tip)).toBe('on-upstream');
        // old 对象不存在 → merge-base 命令失败（非 exit 1）→ 保守 unverifiable
        expect(gitCommitIsOnUpstream(shallow, old)).toBe('unverifiable');
    });

    it('无法判定时 collect 停链、planSquashForRepo 保守跳过（不 rewrite）', () => {
        // 构造 merge-base 必然失败的仓：upstream ref 指向不存在的对象（模拟 shallow/同步失败）
        const work = tmp();
        git(work, 'init', '-b', 'dev_00_01_00');
        git(work, 'config', 'user.email', 't@example.com');
        git(work, 'config', 'user.name', 't');
        git(work, 'config', 'commit.gpgsign', 'false');
        commitFile(work, 'init');
        commitFile(work, 'chore(deps): bump framework_sdk_worker to 0.1.0');
        commitFile(work, 'chore(deps): bump framework_sdk_worker to 0.2.0');
        mkdirSync(join(work, '.git', 'refs', 'remotes', 'origin'), { recursive: true });
        writeFileSync(
            join(work, '.git', 'refs', 'remotes', 'origin', 'dev_00_01_00'),
            '1111111111111111111111111111111111111111',
        );
        git(work, 'config', 'remote.origin.url', '/tmp/dummy');
        git(work, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');
        git(work, 'config', 'branch.dev_00_01_00.remote', 'origin');
        git(work, 'config', 'branch.dev_00_01_00.merge', 'refs/heads/dev_00_01_00');

        expect(gitCommitIsOnUpstream(work, 'HEAD')).toBe('unverifiable');

        const chain = collectUnpushedBumpChainFromHead(work);
        expect(chain.commits).toHaveLength(0);
        expect(chain.stopReason).toContain('unverifiable');

        const { plan, skipReason } = planSquashForRepo(work, 'broken-upstream');
        expect(plan).toBeNull();
        expect(skipReason).toContain('unverifiable');
    });

    it('正常双 bump 链仍可压（未破坏常规路径）', () => {
        const { work } = initRepoWithUpstream();
        commitFile(work, 'chore(deps): bump framework_sdk_worker to 0.1.0');
        commitFile(work, 'chore(deps): bump framework_sdk_worker to 0.2.0');
        const chain = collectUnpushedBumpChainFromHead(work);
        expect(chain.commits).toHaveLength(2);
        expect(chain.stopReason).toBeUndefined();

        const { plan, skipReason } = planSquashForRepo(work, 'normal');
        expect(skipReason).toBeUndefined();
        expect(plan?.commits).toHaveLength(2);
    });
});
