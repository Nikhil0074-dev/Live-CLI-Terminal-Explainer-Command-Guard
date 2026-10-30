import type { Analysis } from "../types";
export interface Preview {
    title: string;
    lines: string[];
    truncated: boolean;
    note: string;
}
/**
 * Build a read-only preview for commands where one is reliable: rm, find ... -delete, git clean.
 * Nothing is modified; commands run without a shell.
 */
export declare function buildPreview(analysis: Analysis, cwd: string, home: string): Promise<Preview | null>;
