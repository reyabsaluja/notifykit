"use client";
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useInbox } from "./hooks.js";
export function NotificationBell({ render }) {
    const { unreadCount } = useInbox();
    if (render)
        return _jsx(_Fragment, { children: render({ unreadCount }) });
    return (_jsx("span", { "aria-label": `${unreadCount} unread notifications`, children: unreadCount > 0 ? `(${unreadCount})` : "" }));
}
export function Inbox({ renderItem, emptyState }) {
    const { items, status, markRead } = useInbox();
    if (status === "loading" && items.length === 0) {
        return _jsx("div", { children: "Loading\u2026" });
    }
    if (status === "error") {
        return _jsx("div", { children: "Failed to load inbox." });
    }
    if (items.length === 0) {
        return _jsx(_Fragment, { children: emptyState ?? _jsx("div", { children: "Nothing here yet." }) });
    }
    return (_jsx("ul", { children: items.map((item) => (_jsx("li", { "data-read": item.readAt ? "true" : "false", children: renderItem ? (renderItem({ item, markRead })) : (_jsx(DefaultInboxRow, { item: item, markRead: markRead })) }, item.id))) }));
}
function DefaultInboxRow({ item, markRead, }) {
    return (_jsxs("div", { children: [_jsx("strong", { children: item.title }), item.body ? _jsx("div", { children: item.body }) : null, item.actionUrl ? (_jsx("a", { href: item.actionUrl, children: "Open" })) : null, !item.readAt ? (_jsx("button", { type: "button", onClick: () => void markRead(item.id), children: "Mark read" })) : null] }));
}
//# sourceMappingURL=components.js.map