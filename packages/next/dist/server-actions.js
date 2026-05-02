function normalizeIdentity(value) {
    if (typeof value === "string") {
        return { recipientId: value };
    }
    return value;
}
export function createServerActions(options) {
    const { notifykit, identify } = options;
    async function resolveIdentity() {
        return normalizeIdentity(await identify());
    }
    return {
        async getPreferences() {
            const { recipientId, ...scope } = await resolveIdentity();
            return notifykit.preferences.list(recipientId, scope);
        },
        async updatePreference(input) {
            const { recipientId, ...scope } = await resolveIdentity();
            return notifykit.preferences.update({
                ...input,
                recipientId,
                ...scope,
            });
        },
        inbox: {
            async list(filter) {
                const { recipientId, ...scope } = await resolveIdentity();
                return notifykit.inbox.list(recipientId, scope, filter);
            },
            async unreadCount() {
                const { recipientId, ...scope } = await resolveIdentity();
                return notifykit.inbox.unreadCount(recipientId, scope);
            },
            async markRead(inboxItemId) {
                const { recipientId, ...scope } = await resolveIdentity();
                return notifykit.inbox.markReadForRecipient(inboxItemId, recipientId, scope);
            },
            async markAllRead() {
                const { recipientId, ...scope } = await resolveIdentity();
                return notifykit.inbox.markAllRead(recipientId, scope);
            },
            async archive(inboxItemId) {
                const { recipientId, ...scope } = await resolveIdentity();
                return notifykit.inbox.archiveForRecipient(inboxItemId, recipientId, scope);
            },
            async unarchive(inboxItemId) {
                const { recipientId, ...scope } = await resolveIdentity();
                return notifykit.inbox.unarchiveForRecipient(inboxItemId, recipientId, scope);
            },
            async deleteItem(inboxItemId) {
                const { recipientId, ...scope } = await resolveIdentity();
                return notifykit.inbox.deleteForRecipient(inboxItemId, recipientId, scope);
            },
        },
    };
}
//# sourceMappingURL=server-actions.js.map