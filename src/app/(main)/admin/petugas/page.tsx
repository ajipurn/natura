import type { Metadata } from "next";
import { Card, PageHeader, SectionTitle, cx } from "@/components/ui";
import { requireAdmin } from "@/server/auth";
import { listUsers } from "@/server/queries";
import { CreateUserForm, EditUserForm } from "./user-forms";

export const metadata: Metadata = { title: "Petugas" };

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const users = await listUsers();
  const now = new Date();

  return (
    <>
      <PageHeader title="Petugas ronda" subtitle={`${users.filter((u) => u.active).length} aktif`} />

      <Card>
        <h2 className="mb-3 font-semibold">Tambah petugas</h2>
        <CreateUserForm />
      </Card>

      <SectionTitle>Daftar</SectionTitle>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {users.map((u) => (
          <li key={u.id}>
            <details className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center gap-2">
                <span className={cx("min-w-0 flex-1 truncate font-semibold", !u.active && "text-muted line-through")}>
                  {u.name}
                  {u.id === admin.id && <span className="font-normal text-muted"> (kamu)</span>}
                </span>
                {u.lockedUntil && u.lockedUntil > now && (
                  <span className="rounded-full bg-empty-soft px-2 py-0.5 text-xs text-empty">terkunci</span>
                )}
                <span
                  className={cx(
                    "rounded-full px-2 py-0.5 text-xs",
                    u.role === "admin" ? "bg-primary/15 text-primary" : "bg-idle-soft text-muted",
                  )}
                >
                  {u.role === "admin" ? "Admin" : "Petugas"}
                </span>
                <span className="text-sm font-semibold text-muted group-open:hidden">Ubah</span>
                <span className="hidden text-sm font-semibold text-muted group-open:inline">Tutup</span>
              </summary>
              <EditUserForm user={u} isSelf={u.id === admin.id} />
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
