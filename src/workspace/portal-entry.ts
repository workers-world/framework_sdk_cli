import type { RegisterWorkspaceToolsOptions } from './register.js';
import { registerWorkspaceTools } from './register.js';
import { createWtChecks } from './wt-checks.js';
import { wtToolManifest } from './wt-manifest.js';

export const manifest = wtToolManifest;

export function register(opts: RegisterWorkspaceToolsOptions = {}): void {
    registerWorkspaceTools(opts);
}

export const checks = createWtChecks();
