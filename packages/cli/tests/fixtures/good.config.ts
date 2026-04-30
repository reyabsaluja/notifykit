import { channel, defineNotifyKitConfig } from "./_helpers.js";

const inbox = channel.inbox();
const email = channel.email();

export default defineNotifyKitConfig({
  notifications: [
    {
      id: "comment_mentioned",
      payload: {
        actorName: "string",
        postTitle: "string",
        postUrl: "string",
      },
      channels: [
        inbox({
          title: "{{actorName}} mentioned you",
          body: "In {{postTitle}}",
          actionUrl: "{{postUrl}}",
        }),
        email({
          subject: "{{actorName}} mentioned you in {{postTitle}}",
          body: "Open {{postUrl}} to reply.",
        }),
      ],
    },
  ],
});
