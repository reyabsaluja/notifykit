import { channel, defineNotifyKitConfig } from "./_helpers.js";

const inbox = channel.inbox();

export default defineNotifyKitConfig({
  notifications: [
    {
      id: "welcome",
      payload: { name: "string" },
      // typo: "nmae" is not in the payload
      channels: [inbox({ title: "Hello, {{nmae}}" })],
    },
  ],
});
