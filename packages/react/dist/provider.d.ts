import { type ReactNode } from "react";
import { type CreateNotifyKitClientOptions, type NotifyKitClient } from "./client.js";
export type NotifyKitProviderProps = {
    client?: NotifyKitClient;
    options?: CreateNotifyKitClientOptions;
    children: ReactNode;
};
export declare function NotifyKitProvider({ client, options, children, }: NotifyKitProviderProps): import("react/jsx-runtime").JSX.Element;
export declare function useNotifyKitClient(): NotifyKitClient;
//# sourceMappingURL=provider.d.ts.map