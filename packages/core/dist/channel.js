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
export const channel = {
    inbox: inboxFactory,
    email: emailFactory,
};
//# sourceMappingURL=channel.js.map