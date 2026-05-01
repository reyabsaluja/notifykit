export type ScaffoldOptions = {
    /** Target directory (absolute or relative). Must not already exist. */
    targetDir: string;
    /** Name written into the scaffolded package.json. Defaults to the basename of targetDir. */
    projectName?: string;
    /** Override template path. Defaults to the template bundled with this package. */
    templateDir?: string;
};
export type ScaffoldResult = {
    targetDir: string;
    projectName: string;
};
export declare class ScaffoldError extends Error {
    constructor(message: string);
}
export declare function scaffold(options: ScaffoldOptions): Promise<ScaffoldResult>;
export declare function defaultTemplateDir(): string;
export declare function listScaffoldedFiles(root: string): Promise<string[]>;
//# sourceMappingURL=scaffold.d.ts.map