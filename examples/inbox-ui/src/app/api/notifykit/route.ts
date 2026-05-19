import { createRouteHandler } from "@notifykitjs/next";
import { notify } from "@/lib/notify";
import { seed } from "@/lib/seed";

// Dev-only: module-level flag resets on serverless cold starts — do not use in production
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
