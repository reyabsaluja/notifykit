import type { InboxItem } from "notifykit";
import type { ReactNode } from "react";
export type NotificationBellProps = {
    /** Custom renderer. Default shows a plain "(N)" badge. */
    render?: (props: {
        unreadCount: number;
    }) => ReactNode;
};
export declare function NotificationBell({ render }: NotificationBellProps): import("react/jsx-runtime").JSX.Element;
export type InboxProps = {
    /** Custom renderer for a single item. Default shows title + body. */
    renderItem?: (props: {
        item: InboxItem;
        markRead: (id: string) => Promise<InboxItem | null>;
    }) => ReactNode;
    emptyState?: ReactNode;
};
export declare function Inbox({ renderItem, emptyState }: InboxProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=components.d.ts.map