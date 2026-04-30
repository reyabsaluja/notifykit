export type ServeOptions = {
    cwd: string;
    config?: string;
    port: number;
    devUser: string;
    basePath?: string;
};
export declare function runServe(options: ServeOptions): Promise<number>;
//# sourceMappingURL=serve.d.ts.map