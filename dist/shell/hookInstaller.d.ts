import type { SupportedShell } from "./shellDetector";
export declare const BEGIN_MARK = "# >>> live-cli-guard >>>";
export declare const END_MARK = "# <<< live-cli-guard <<<";
export declare function defaultRcFile(shell: SupportedShell, home: string): string;
export declare function integrationScript(shell: SupportedShell): string;
export declare function hookBlock(shell: SupportedShell, nodePath: string, cliPath: string): string;
export declare function hasHook(rcText: string): boolean;
export declare function removeHookBlock(rcText: string): string;
export interface InstallResult {
    changed: boolean;
    rcFile: string;
    backup?: string;
}
export declare function installHook(shell: SupportedShell, rcFile: string, nodePath: string, cliPath: string): InstallResult;
export declare function uninstallHook(rcFile: string): InstallResult;
