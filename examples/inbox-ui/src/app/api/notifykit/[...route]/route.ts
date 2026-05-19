import { createRouteHandler } from "@notifykitjs/next";
import { notify } from "@/lib/notify";
import { seed } from "@/lib/seed";

// Dev-only: concurrent requests may race past this check — harmless since seed() uses upsert
let seeded = false;

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: async () => {
    if (!seeded) {
      await seed();
      seeded = true;
    }
    return "user_1";
  },
});
