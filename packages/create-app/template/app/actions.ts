"use server";

import { revalidatePath } from "next/cache";
import { ensureDemoUser } from "../lib/notifykit";
import { setCurrentUserId } from "../lib/session";

export async function signInAsDemoUser() {
  await ensureDemoUser();
  await setCurrentUserId("demo_user");
  revalidatePath("/");
}
