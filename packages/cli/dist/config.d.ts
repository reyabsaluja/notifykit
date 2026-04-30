import type { EmailProvider, NotificationDefinition, PayloadSchema } from "notifykit";
export type NotifyKitConfig = {
    notifications: readonly NotificationDefinition<string, PayloadSchema>[];
    providers?: {
        email?: EmailProvider;
    };
};
export declare function defineConfig(config: NotifyKitConfig): NotifyKitConfig;
export declare function loadConfig(cwd: string, explicitPath?: string): Promise<{
    config: NotifyKitConfig;
    path: string;
}>;
export declare class ConfigError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=config.d.ts.map