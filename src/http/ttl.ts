const MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function parseTtlToMs(
    raw: string | undefined,
): { ok: true; ms: number } | { ok: false; error: string } {
    const v = (raw ?? '30d').trim();
    if (v === '0') {
        return { ok: false, error: 'ttl 0 is not allowed on device login' };
    }
    const m = /^(\d+)(s|m|h|d)$/i.exec(v);
    if (!m?.[1] || !m[2]) {
        return { ok: false, error: 'ttl must be like 7d, 30d, 12h' };
    }
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const mult =
        unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    const ms = n * mult;
    if (!Number.isFinite(ms) || ms <= 0) {
        return { ok: false, error: 'ttl must be positive' };
    }
    if (ms > MAX_TTL_MS) {
        return { ok: false, error: 'ttl exceeds 90d' };
    }
    return { ok: true, ms };
}
