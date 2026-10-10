import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Lock, Search, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { usePermission } from "@/client/permissions";
import { QueryState } from "@/components/query-state";
import { ScrollArea } from "@/components/scroll-area";
import { Select } from "@/components/select";
import { ChipGroup } from "@/components/toggle-group";
import { Alert, Button, Card, Input, cx } from "@/components/ui";
import { compareHouses } from "@/lib/houses";
import { ROLE_LABEL, isManager } from "@/lib/permissions";
import { usersQuery } from "../queries";
import { PetugasDialog, type Petugas } from "../petugas/petugas-dialog";

type Filter = "semua" | "pengurus" | "terkunci" | "nonaktif";
const FILTERS: { value: Filter; label: string; match: (user: Petugas) => boolean }[] = [
  { value: "semua", label: "Semua", match: (u) => u.active },
  { value: "pengurus", label: "Pengurus", match: (u) => u.active && isManager(u.role) },
  { value: "terkunci", label: "Terkunci", match: (u) => u.locked },
  { value: "nonaktif", label: "Nonaktif", match: (u) => !u.active },
];
type Sort = "nama" | "rumah";
const SORTS: { value: Sort; label: string }[] = [{ value: "nama", label: "Nama" }, { value: "rumah", label: "Rumah" }];
const ROW_GRID = "sm:grid-cols-[minmax(0,1fr)_6rem_7rem_1.25rem]";

const byName = (a: Petugas, b: Petugas) => a.name.localeCompare(b.name, "id");
const houseRef = (label: string) => {
  const [block, number = ""] = label.split("-");
  return { block, number };
};
const byHouse = (a: Petugas, b: Petugas) => (a.house && b.house
  ? compareHouses(houseRef(a.house), houseRef(b.house))
  : a.house ? -1 : b.house ? 1 : 0) || byName(a, b);

export function AccountsPanel() {
  const canEdit = usePermission("accounts", true);
  const query = useQuery(usersQuery);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");
  const [sort, setSort] = useState<Sort>("nama");
  const creating = params.has("buat") || params.has("warga");
  const editingId = Number(params.get("akun")) || null;
  const open = (id: number | "baru") => setParams((previous) => {
    const next = new URLSearchParams(previous);
    next.set("tab", "akun");
    next.delete("warga"); next.delete("akun"); next.delete("buat");
    next.set(id === "baru" ? "buat" : "akun", String(id === "baru" ? 1 : id));
    return next;
  });
  const close = () => setParams((previous) => {
    const next = new URLSearchParams(previous);
    next.delete("warga"); next.delete("akun"); next.delete("buat");
    return next;
  }, { replace: true });

  return <QueryState query={query}>{({ users, me }) => {
    const counts = Object.fromEntries(FILTERS.map((f) => [f.value, users.filter(f.match).length])) as Record<Filter, number>;
    const filters = FILTERS.filter((f) => f.value === "semua" || f.value === filter || counts[f.value] > 0);
    const q = search.trim().toLocaleLowerCase("id").replace(/[\s-]/g, "");
    const shown = users.filter((user) => FILTERS.find((f) => f.value === filter)!.match(user)
      && (!q || [user.name, user.house ?? ""].some((text) => text.toLocaleLowerCase("id").replace(/[\s-]/g, "").includes(q))))
      .sort(sort === "rumah" ? byHouse : byName);
    const editingUser = users.find((user) => user.id === editingId);
    return <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{counts.semua} akun aktif · {counts.pengurus} pengurus</p>
        {canEdit && <Button onClick={() => open("baru")} size="sm"><UserPlus className="size-4" aria-hidden /> Buat akun</Button>}
      </div>
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative block lg:w-72 lg:shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" value={search} onValueChange={setSearch} placeholder="Cari nama atau rumah…" aria-label="Cari akun" className="pl-10" />
        </label>
        <ScrollArea className="-mx-4 min-w-0 flex-1 overflow-x-auto lg:mx-0">
          <ChipGroup aria-label="Saring akun" value={filter} onValueChange={setFilter}
            options={filters.map((f) => ({ value: f.value, label: f.label, count: counts[f.value] }))} className="w-max min-w-full px-4 lg:px-0" />
        </ScrollArea>
      </div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 text-sm">
        <p className="text-muted"><span className="font-semibold text-fg">{shown.length}</span> akun</p>
        <div className="w-48"><Select label="Urutkan" value={sort} onValueChange={setSort} options={SORTS} className="h-9" /></div>
      </div>
      {shown.length ? <div className="overflow-hidden rounded-2xl border border-line bg-card">
        <div className={cx("hidden items-center gap-3 border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted sm:grid", ROW_GRID)} aria-hidden>
          <span>Nama</span><span>Rumah</span><span>Status</span><span />
        </div>
        <ul className="divide-y divide-line">{shown.map((user) => <AccountRow key={user.id} user={user} isMe={user.id === me.id} onOpen={canEdit ? () => open(user.id) : undefined} />)}</ul>
      </div> : <Card className="py-10 text-center">
        <Users className="mx-auto size-10 text-muted" aria-hidden />
        <p className="mt-2 font-semibold">{search ? "Tidak ada akun yang cocok" : "Belum ada akun di sini"}</p>
        <p className="mt-1 text-sm text-muted">{search ? "Coba nama lain, atau kode rumah seperti AD8." : "Coba saringan lain."}</p>
      </Card>}
      {canEdit && editingId && !editingUser && <Alert>Akun tidak ditemukan. <Button variant="ghost" size="sm" onClick={close}>Tutup</Button></Alert>}
      {canEdit && <PetugasDialog key={creating ? "baru" : editingId} open={creating || Boolean(editingUser)} onClose={close}
        initialResidentId={Number(params.get("warga")) || undefined} petugas={creating ? undefined : editingUser} isSelf={editingUser?.id === me.id} />}
    </>;
  }}</QueryState>;
}

function AccountRow({ user, isMe, onOpen }: { user: Petugas; isMe: boolean; onOpen?: () => void }) {
  const status = user.locked ? "Terkunci" : user.active ? "Aktif" : "Nonaktif";
  const content = <>
    <span className="min-w-0">
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className={cx("break-words font-semibold", !user.active && "text-muted")}>{user.name}</span>
        {isMe && <span className="text-sm text-muted">(kamu)</span>}
        <span className="inline-flex shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">{ROLE_LABEL[user.role]}</span>
      </span>
      <span className="mt-0.5 block text-sm text-muted sm:hidden">{user.house ?? "Tanpa rumah"} · {status}</span>
    </span>
    <span className="hidden text-sm sm:block">{user.house ?? <span className="text-muted">—</span>}</span>
    <span className={cx("hidden items-center gap-1 text-sm sm:flex", user.locked ? "text-empty" : user.active ? "text-primary" : "text-muted")}>
      {user.locked && <Lock className="size-3" aria-hidden />}{status}
    </span>
    {onOpen ? <ChevronRight className="size-5 justify-self-end text-muted" aria-hidden /> : <span />}
  </>;
  const className = cx("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left", ROW_GRID);
  return <li>{onOpen
    ? <Button variant="plain" onClick={onOpen} aria-label={`Atur akun ${user.name}`} className={cx(className, "hover:bg-idle-soft/60 focus-visible:bg-idle-soft/60 focus-visible:outline-none")}>{content}</Button>
    : <div className={className}>{content}</div>}
  </li>;
}
