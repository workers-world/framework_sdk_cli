import { describe, expect, it } from 'vitest';
import type { PortalContext } from '../../src/portal/types.js';
import { wtWriteStdout } from '../../src/workspace/wt-io.js';

function captureIo() {
    const chunks: string[] = [];
    const stream = {
        isTTY: true,
        write: (chunk: string | Uint8Array) => {
            chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
            return true;
        },
    } as unknown as NodeJS.WritableStream;
    return { stream, text: () => chunks.join('') };
}

describe('wtWriteStdout coloring', () => {
    it('TTY 下 OK 前缀绿色', () => {
        const prevNo = process.env.NO_COLOR;
        const prevForce = process.env.FORCE_COLOR;
        delete process.env.NO_COLOR;
        process.env.FORCE_COLOR = '1';
        const out = captureIo();
        const ctx: PortalContext = { json: false, portal: 'ww', stdout: out.stream };
        wtWriteStdout(ctx, 'OK framework_sdk_cli: pushed dev_00_01_00 → origin/dev_00_01_00\n');
        expect(out.text()).toContain('\x1b[32mOK\x1b[0m');
        expect(out.text()).toContain('framework_sdk_cli: pushed');
        process.env.NO_COLOR = prevNo;
        process.env.FORCE_COLOR = prevForce;
    });

    it('--json 不写 stdout 人读行', () => {
        const out = captureIo();
        const ctx: PortalContext = { json: true, portal: 'ww', stdout: out.stream };
        wtWriteStdout(ctx, 'OK skip\n');
        expect(out.text()).toBe('');
    });
});
