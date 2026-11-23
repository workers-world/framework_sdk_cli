import { describe, expect, it } from 'vitest';
import { takePortalFlags } from '../../src/workspace/flags.js';

/** takePortalFlags：`--` 之后参数原样透传（`--json` 不再被门户吞），`--` 本身消费掉 */
describe('takePortalFlags `--` semantics', () => {
    it('无 `--`：剥 --json', () => {
        expect(takePortalFlags(['--json', 'run', 'x'])).toEqual({ json: true, rest: ['run', 'x'] });
    });

    it('`--` 后 --json 透传给脚本，不再剥', () => {
        expect(takePortalFlags(['run', '--', '--json', 'x'])).toEqual({
            json: false,
            rest: ['run', '--json', 'x'],
        });
    });

    it('`--` 前的 --json 仍识别为门户 json', () => {
        expect(takePortalFlags(['--json', 'run', '--', '--json'])).toEqual({
            json: true,
            rest: ['run', '--json'],
        });
    });

    it('裸 `--`：之后无参数', () => {
        expect(takePortalFlags(['run', '--'])).toEqual({ json: false, rest: ['run'] });
        expect(takePortalFlags(['--'])).toEqual({ json: false, rest: [] });
    });
});
