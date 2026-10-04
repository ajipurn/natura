import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { hasAnyUser } from "@/server/queries";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Mulai" };

export default async function SetupPage() {
  await connection();
  if (await hasAnyUser()) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Selamat datang 👋</h1>
      <p className="mt-2 text-muted">
        Atur lingkunganmu dan buat akun admin pertama. Setelah ini kamu bisa menambah data rumah dan petugas ronda.
      </p>
      <SetupForm />
    </main>
  );
}
