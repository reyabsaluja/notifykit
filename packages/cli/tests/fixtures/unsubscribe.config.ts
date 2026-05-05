import { channel, defineNotifyKitConfig, fakeEmailProvider } from "./_helpers.js";

const email = channel.email();

export default defineNotifyKitConfig({
  notifications: [
    {
      id: "weekly_digest",
      payload: {
        url: "string",
      },
      channels: [
        email({
          subject: "Weekly digest",
          body: "Read it: {{url}}\n\nUnsubscribe: {{_unsubscribeUrl}}",
        }),
      ],
    },
  ],
  providers: {
    email: fakeEmailProvider(),
  },
  unsubscribe: {
    secret: "0123456789abcdef0123456789abcdef",
    baseUrl: "https://example.com/api/notifykit",
  },
});
