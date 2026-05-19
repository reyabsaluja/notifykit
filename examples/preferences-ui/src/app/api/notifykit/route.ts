import { createRouteHandler } from "@notifykitjs/next";
import { notify } from "@/lib/notify";

let seeded = false;

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: async () => {
    if (!seeded) {
      await notify.upsertRecipient({
        id: "user_1",
        email: "jane@example.com",
        phone: "+15551234567",
        name: "Jane",
      });
      seeded = true;
    }
    return "user_1";
  },
});
