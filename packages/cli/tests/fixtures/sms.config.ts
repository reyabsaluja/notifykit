import { channel, defineNotifyKitConfig, fakeSmsProvider } from "./_helpers.js";

const sms = channel.sms();

export default defineNotifyKitConfig({
  notifications: [
    {
      id: "login_code",
      payload: {
        code: "string",
      },
      channels: [
        sms({
          body: "Your login code is {{code}}",
        }),
      ],
      rateLimit: { max: 5, windowMs: 60_000 },
    },
  ],
  providers: {
    sms: fakeSmsProvider(),
  },
});
