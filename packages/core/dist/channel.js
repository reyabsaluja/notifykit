function inboxFactory() {
    return (input) => ({
        type: "inbox",
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl,
    });
}
function emailFactory() {
    return (input) => ({
        type: "email",
        subject: input.subject,
        body: input.body,
    });
}
function webhookFactory() {
    return (input) => ({
        type: "webhook",
        url: input.url,
        headers: input.headers,
    });
}
export const channel = {
    inbox: inboxFactory,
    email: emailFactory,
    webhook: webhookFactory,
};
//# sourceMappingURL=channel.js.map