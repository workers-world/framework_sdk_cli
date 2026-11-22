import { describe, expect, it } from 'vitest';
import { parseArgLine } from '../../src/workspace/parse-arg-line.js';

/** parseArgLine：未闭合引号必须显式报错，不得静默吞掉行尾参数 */
describe('parseArgLine 未闭合引号', () => {
    it('双引号未闭合 → 抛带行内容的错误', () => {
        expect(() => parseArgLine('--exclude "scripts')).toThrow(/引号未闭合/);
        expect(() => parseArgLine('--exclude "scripts')).toThrow(/--exclude "scripts/);
    });

    it('单引号未闭合 → 同样抛错', () => {
        expect(() => parseArgLine("--exclude 'cpt1")).toThrow(/引号未闭合/);
    });

    it('引号在词中开始也算未闭合', () => {
        expect(() => parseArgLine('run --jobs "4 --dry-run')).toThrow(/引号未闭合/);
    });

    it('正常配对引号不受影响', () => {
        expect(parseArgLine('--exclude "scripts cpt1" run')).toEqual([
            '--exclude',
            'scripts cpt1',
            'run',
        ]);
        expect(parseArgLine("a 'b c' d")).toEqual(['a', 'b c', 'd']);
    });

    it('空行 / 空白行仍返回空数组', () => {
        expect(parseArgLine('')).toEqual([]);
        expect(parseArgLine('   ')).toEqual([]);
    });
});
