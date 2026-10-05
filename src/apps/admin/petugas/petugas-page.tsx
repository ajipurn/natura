import { useQuery } from "@tanstack/react-query";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader, SectionTitle, cx } from "@/components/ui";
import { usersQuery } from "../queries";
import { CreateUserForm, EditUserForm } from "./user-forms";

export function PetugasPage() {
  const query = useQuery(usersQuery);

  return (
    <QueryState query={query}>
      {({ users, me }) => {
        // Waktu data diambil; status "terkunci" ikut diperbarui saat data dimuat ulang.
        const now = query.dataUpdatedAt;
        return (
          <>
            <PageHeader title="Petugas ronda" subtitle={`${users.filter((u) => u.active).length} aktif`} />

            <div className="grid gap-4 lg:grid-cols-[22rem_1fr] lg:items-start">
              <Card className="lg:sticky lg:top-6">
                <h2 className="mb-3 font-semibold">Tambah petugas</h2>
                <CreateUserForm />
              </Card>

              <div>
                <SectionTitle>Daftar</SectionTitle>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                  {users.map((u) => (
                    <li key={u.id}>
                      <details className="group px-4 py-3">
                        <summary className="flex cursor-pointer list-none items-center gap-2">
                          <span className={cx("min-w-0 flex-1 truncate font-semibold", !u.active && "text-muted line-through")}>
                            {u.name}
                            {u.id === me.id && <span className="font-normal text-muted"> (kamu)</span>}
                          </span>
                          {u.lockedUntil && new Date(u.lockedUntil).getTime() > now && (
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
                        <EditUserForm user={u} isSelf={u.id === me.id} />
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        );
      }}
    </QueryState>
  );
}
