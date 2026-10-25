import { homedir } from 'node:os';
import { join } from 'node:path';

/** WW_CACHE_DIR → $XDG_CACHE_HOME/ww → ~/.cache/ww */
export function wwCacheDir(env: NodeJS.ProcessEnv = process.env): string {
    if (env.WW_CACHE_DIR?.trim()) {
        return env.WW_CACHE_DIR.trim();
    }
    const xdg = env.XDG_CACHE_HOME?.trim();
    if (xdg) {
        return join(xdg, 'ww');
    }
    const home = env.HOME?.trim() || homedir();
    return join(home, '.cache', 'ww');
}

export function wwUpdateCacheFile(env: NodeJS.ProcessEnv = process.env): string {
    return join(wwCacheDir(env), 'update-check.json');
}
