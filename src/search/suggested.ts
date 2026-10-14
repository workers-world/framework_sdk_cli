/** Agent-oriented one-liner to try after search (no secrets in argv). */
export function suggestedCommandLine(
    portal: string,
    toolId: string,
    command: string,
    mutating?: boolean,
): string {
    const base = `${portal} ${toolId}${command ? ` ${command}` : ''}`.trim();
    return mutating ? `${base} --confirm --json` : `${base} --json`;
}
