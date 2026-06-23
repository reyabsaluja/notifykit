import { channel, defineNotifyKitConfig } from "./_helpers.js";

const email = channel.email();

export default defineNotifyKitConfig({
  notifications: [
    {
      id: "provider_fails",
      payload: {
        msg: "string",
      },
      channels: [
        email({
          subject: "{{msg}}",
          body: "{{msg}}",
        }),
      ],
    },
  ],
  providers: {
    email: {
      id: "always-fails",
      async send() {
        throw new Error("provider unavailable");
      },
    },
  },
  retry: {
    maxAttempts: 1,
    delayMs: () => 0,
  },
});
