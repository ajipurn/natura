import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { RondaApp } from "./ronda-app";

export const metadata: Metadata = { title: "Ronda" };

// Data diambil di HP lewat /api/ronda supaya halaman ini tetap jalan saat offline.
export default async function RondaPage() {
  const user = await requireUser();
  return <RondaApp isAdmin={user.role === "admin"} />;
}
