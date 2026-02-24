"use server";

import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function googleSignIn() {
  const url = await signIn("google", {
    redirect: false,
    redirectTo: "/",
  });
  redirect(url);
}
