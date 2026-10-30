import type { Readable } from "node:stream";
export type Answer = "yes" | "no" | "explain";
export interface LineReader {
    readLine(): Promise<string | null>;
    close(): void;
}
/** A single reader for a stream, so several prompts can share one stdin without losing buffered input. */
export declare function createLineReader(input: Readable): LineReader;
/**
 * Ask a yes/no question. ONLY "y"/"yes" means yes. Enter, anything else, or end of input means no.
 * "e"/"explain" asks for more detail.
 */
export declare function askConfirmation(reader: LineReader, write: (s: string) => void, question: string): Promise<Answer>;
