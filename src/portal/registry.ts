import type { ToolRegistration } from './types.js';

const registry = new Map<string, ToolRegistration>();

export function registerTool(tool: ToolRegistration): void {
    if (!tool.id.trim()) {
        throw new Error('registerTool: id required');
    }
    registry.set(tool.id, tool);
}

export function listRegisteredTools(): ToolRegistration[] {
    return [...registry.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function clearRegisteredTools(): void {
    registry.clear();
}

export function getRegisteredTool(id: string): ToolRegistration | undefined {
    return registry.get(id);
}
