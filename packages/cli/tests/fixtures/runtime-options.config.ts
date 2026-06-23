import { channel, defineNotifyKitConfig, fakeEmailProvider } from "./_helpers.js";

const inbox = channel.inbox();

export default defineNotifyKitConfig({
  notifications: [
    {
      id: "runtime_options",
      payload: {
        message: "string",
      },
      channels: [
        inbox({
          title: "{{message}}",
        }),
      ],
    },
  ],
  providers: {
    email: fakeEmailProvider(),
  },
  retry: {
    maxAttempts: 0,
  },
  idempotencyKeyTtlMs: 0,
  timelineRetentionMs: Number.NaN,
});
