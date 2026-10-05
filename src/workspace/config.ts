let configuredExtraRootStarts: string[] = [];

export function setWorkspaceExtraRootStarts(starts: string[]): void {
    configuredExtraRootStarts = starts;
}

export function workspaceExtraRootStarts(): string[] {
    return configuredExtraRootStarts;
}
