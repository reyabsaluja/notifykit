import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo } from "react";
import { createNotifyKitClient, } from "./client.js";
const NotifyKitContext = createContext(null);
export function NotifyKitProvider({ client, options, children, }) {
    const resolved = useMemo(() => client ?? createNotifyKitClient(options), 
    // If the consumer passes a client, it's their responsibility to stabilize it.
    // Otherwise, we build one once per provider mount using the options snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client]);
    return (_jsx(NotifyKitContext.Provider, { value: resolved, children: children }));
}
export function useNotifyKitClient() {
    const client = useContext(NotifyKitContext);
    if (!client) {
        throw new Error("useNotifyKitClient: must be used inside <NotifyKitProvider>.");
    }
    return client;
}
//# sourceMappingURL=provider.js.map