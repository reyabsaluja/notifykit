"use server";

import { revalidatePath } from "next/cache";
import { ensureDemoUser, notify } from "../lib/notifykit";
import { getCurrentUserId, setCurrentUserId } from "../lib/session";

export async function signInAsDemoUser() {
  await ensureDemoUser();
  await setCurrentUserId("demo_user");
  revalidatePath("/");
}

export async function sendDemoNotification(formData: FormData) {
  await ensureDemoUser();
  const userId = (await getCurrentUserId()) ?? "demo_user";
  const actorName = String(formData.get("actorName") ?? "Rey");
  const postTitle = String(formData.get("postTitle") ?? "Launch Plan");

  await notify.send({
    recipientId: userId,
    notificationId: "comment_mentioned",
    payload: {
      actorName,
      postTitle,
      postUrl: "/posts/42",
    },
  });

  revalidatePath("/");
}
