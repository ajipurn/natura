import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { hasAnyUser } from "@/server/queries";

export default async function Home() {
  // Status database berubah setelah setup; jangan di-prerender saat build.
  await connection();
  if (!(await hasAnyUser())) redirect("/setup");
  redirect((await getCurrentUser()) ? "/ronda" : "/login");
}
