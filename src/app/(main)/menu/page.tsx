import { ChevronRight, Home, LogOut, Settings, Smartphone, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { logoutAction } from "@/app/login/actions";
import { ChangePinForm } from "./change-pin-form";

export const metadata: Metadata = { title: "Menu" };

const ADMIN_LINKS = [
  { href: "/admin/rumah", label: "Data rumah & cetak QR", icon: Home },
  { href: "/admin/petugas", label: "Petugas ronda", icon: Users },
  { href: "/admin/pengaturan", label: "Pengaturan", icon: Settings },
];

export default async function MenuPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title={user.name} subtitle={user.role === "admin" ? "Admin" : "Petugas ronda"} />

      {user.role === "admin" && (
        <>
          <SectionTitle>Admin</SectionTitle>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
            {ADMIN_LINKS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-3 px-4 py-3.5 active:bg-idle-soft">
                  <Icon className="size-5 text-primary" />
                  <span className="flex-1 font-medium">{label}</span>
                  <ChevronRight className="size-5 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>Pasang di layar utama</SectionTitle>
      <Card className="flex gap-3 text-sm">
        <Smartphone className="size-5 shrink-0 text-primary" />
        <p>
          Supaya terasa seperti aplikasi dan bisa dibuka offline: buka menu browser lalu pilih{" "}
          <strong>Tambahkan ke layar utama</strong> (Chrome) atau <strong>Bagikan → Tambah ke Layar Utama</strong>{" "}
          (Safari).
        </p>
      </Card>

      <SectionTitle>Ganti PIN</SectionTitle>
      <Card>
        <ChangePinForm />
      </Card>

      <form action={logoutAction} className="mt-6">
        <SubmitButton variant="danger" className="w-full" pendingText="Keluar…">
          <LogOut className="size-5" /> Keluar
        </SubmitButton>
      </form>
    </>
  );
}
