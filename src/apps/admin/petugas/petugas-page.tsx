import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Lock, Search, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader, buttonClass, cx, inputClass } from "@/components/ui";
import { DAY_NAMES, dayLabel } from "@/lib/schedule";
import { usersQuery } from "../queries";
import { PetugasDialog, type Petugas } from "./petugas-dialog";

type Filter = "semua" | "petugas" | "admin" | "nonaktif" | "tanpa-jadwal";

const FILTERS: { value: Filter; label: string; match: (u: Petugas) => boolean }[] = [
  { value: "semua", label: "Semua", match: (u) => u.active },
  { value: "petugas", label: "Petugas", match: (u) => u.active && u.role === "petugas" },
  { value: "admin", label: "Admin", match: (u) => u.active && u.role === "admin" },
  { value: "tanpa-jadwal", label: "Belum dijadwalkan", match: (u) => u.active && u.days.length === 0 },
  { value: "nonaktif", label: "Nonaktif", match: (u) => !u.active },
];

export function PetugasPage() {
  const query = useQuery(usersQuery);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");
  const [editing, setEditing] = useState<number | "baru" | null>(null);

  return (
    <QueryState query={query}>
      {({ users, me }) => {
        const counts = Object.fromEntries(FILTERS.map((f) => [f.value, users.filter(f.match).length])) as Record<Filter, number>;
        const editingUser = typeof editing === "number" ? users.find((u) => u.id === editing) : undefined;
        return (
          <>
            <PageHeader
              title="Petugas ronda"
              subtitle={`${counts.semua} aktif · ${counts.admin} admin${counts["tanpa-jadwal"] ? ` · ${counts["tanpa-jadwal"]} belum dijadwalkan` : ""}`}
              action={
                <button type="button" onClick={() => setEditing("baru")} className={buttonClass("primary", "sm")}>
                  <UserPlus className="size-4" /> Tambah
                </button>
              }
            />

            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative block lg:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama atau rumah…"
                  aria-label="Cari petugas"
                  className={cx(inputClass, "pl-10")}
                />
              </label>
              <div role="tablist" aria-label="Saring petugas" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.value}
                    onClick={() => setFilter(f.value)}
                    className={cx(
                      "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium",
                      filter === f.value ? "border-primary bg-primary text-primary-fg" : "border-line bg-card text-muted hover:text-fg",
                    )}
                  >
                    {f.label} <span className="opacity-70">{counts[f.value]}</span>
                  </button>
                ))}
              </div>
            </div>

            <PetugasList
              users={users}
              meId={me.id}
              filter={filter}
              search={search}
              onOpen={(id) => setEditing(id)}
            />

            <PetugasDialog
              open={editing !== null && (editing === "baru" || Boolean(editingUser))}
              onClose={() => setEditing(null)}
              petugas={editingUser}
              isSelf={editingUser?.id === me.id}
            />
          </>
        );
      }}
    </QueryState>
  );
}

function PetugasList({
  users,
  meId,
  filter,
  search,
  onOpen,
}: {
  users: Petugas[];
  meId: number;
  filter: Filter;
  search: string;
  onOpen: (id: number) => void;
}) {
  const shown = useMemo(() => {
    const match = FILTERS.find((f) => f.value === filter)!.match;
    const q = search.trim().toLowerCase().replace(/\s+/g, "");
    return users.filter(
      (u) => match(u) && (!q || u.name.toLowerCase().replace(/\s+/g, "").includes(q) || u.house?.toLowerCase().replace("-", "").includes(q.replace("-", ""))),
    );
  }, [users, filter, search]);

  if (shown.length === 0) {
    return <Card className="text-center text-muted">{search ? "Tidak ada petugas yang cocok." : "Belum ada petugas di sini."}</Card>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="hidden grid-cols-[minmax(0,2fr)_6rem_minmax(0,2fr)_6rem_2rem] gap-3 border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted lg:grid">
        <span>Nama</span>
        <span>Rumah</span>
        <span>Jaga malam</span>
        <span>Peran</span>
        <span />
      </div>
      <ul className="divide-y divide-line">
        {shown.map((u) => {
          return (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onOpen(u.id)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 text-left hover:bg-idle-soft/60 lg:grid-cols-[minmax(0,2fr)_6rem_minmax(0,2fr)_6rem_2rem]"
              >
                <span className={cx("flex min-w-0 items-center gap-2 font-semibold", !u.active && "text-muted line-through")}>
                  <span className="truncate">{u.name}</span>
                  {u.id === meId && <span className="shrink-0 font-normal text-muted">(kamu)</span>}
                  {u.locked && <Lock className="size-4 shrink-0 text-empty" aria-label="terkunci" />}
                </span>
                <span className="text-sm text-muted lg:order-none lg:text-fg max-lg:col-start-1 max-lg:row-start-2">
                  {u.house ?? <span className="text-muted">—</span>}
                  <span className="lg:hidden">{u.days.length ? ` · ${u.days.map((d) => DAY_NAMES[d]).join(", ")}` : " · belum dijadwalkan"}</span>
                </span>
                <span className="hidden flex-wrap gap-1 lg:flex">
                  {u.days.length ? (
                    u.days.map((d) => (
                      <span key={d} title={dayLabel(d)} className="rounded-full bg-idle-soft px-2 py-0.5 text-xs font-medium">
                        {DAY_NAMES[d]}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted">—</span>
                  )}
                </span>
                <span className="max-lg:col-start-2 max-lg:row-span-2 max-lg:row-start-1 max-lg:flex max-lg:items-center max-lg:gap-2">
                  <span
                    className={cx(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      u.role === "admin" ? "bg-primary/15 text-primary" : "bg-idle-soft text-muted",
                    )}
                  >
                    {u.role === "admin" ? "Admin" : "Petugas"}
                  </span>
                  <ChevronRight className="size-5 text-muted lg:hidden" />
                </span>
                <ChevronRight className="hidden size-5 text-muted lg:block" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
