"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminPassword, adminToken } from "@/lib/adminAuth";

export type LoginState = { error?: string } | undefined;

const safeNext = (next: string) => (next.startsWith("/") && !next.startsWith("//") ? next : "/admin");

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = adminPassword();
  const next = safeNext(String(formData.get("next") ?? "/admin"));
  if (!password) redirect(next);
  if (String(formData.get("password") ?? "") !== password) return { error: "Nesprávné heslo." };
  (await cookies()).set(ADMIN_COOKIE, await adminToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  redirect(next);
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/");
}
