import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { safeNextPath } from "@/server/form";
import { getSettings, hasAnyUser, listLoginUsers } from "@/server/queries";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : null, "/ronda");

  if (!(await hasAnyUser())) redirect("/setup");
  if (await getCurrentUser()) redirect(nextPath);

  const [loginUsers, settings] = await Promise.all([listLoginUsers(), getSettings()]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <p className="text-sm font-medium text-primary">Jimpitan {settings.communityName}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Masuk petugas</h1>
      <LoginForm users={loginUsers} next={nextPath} />
    </main>
  );
}
