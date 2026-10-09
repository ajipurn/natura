import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronRight,
  Lock,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { QueryState } from "@/components/query-state";
import { ScrollArea } from "@/components/scroll-area";
import { Select } from "@/components/select";
import { ChipGroup } from "@/components/toggle-group";
import { Button, Card, Input, PageHeader, cx } from "@/components/ui";
import { daysBetween, formatDateShort, rondaDate } from "@/lib/dates";
import { compareHouses } from "@/lib/houses";
import { DAY_NAMES, DAY_SHORT, dayLabel, scheduleDay } from "@/lib/schedule";
import { usersQuery } from "../queries";
import { PetugasDialog, type Petugas } from "./petugas-dialog";
import { adminPath } from "@/lib/app-paths";
import { ROLE_LABEL, isManager } from "@/lib/permissions";

type Filter = "semua" | "admin" | "tanpa-jadwal" | "terkunci" | "nonaktif";

const FILTERS: {
  value: Filter;
  label: string;
  match: (u: Petugas) => boolean;
}[] = [
  { value: "semua", label: "Semua", match: (u) => u.active },
  {
    value: "admin",
    label: "Pengurus",
    match: (u) => u.active && isManager(u.role),
  },
  {
    value: "tanpa-jadwal",
    label: "Belum dijadwalkan",
    match: (u) => u.active && u.days.length === 0,
  },
  { value: "terkunci", label: "Terkunci", match: (u) => u.locked },
  { value: "nonaktif", label: "Nonaktif", match: (u) => !u.active },
];

type Sort = "nama" | "rumah" | "malam" | "terakhir";

const SORTS: { value: Sort; label: string }[] = [
  { value: "nama", label: "Nama" },
  { value: "rumah", label: "Rumah" },
  { value: "malam", label: "Malam jaga" },
  { value: "terakhir", label: "Lama tidak mencatat" },
];

const byName = (a: Petugas, b: Petugas) => a.name.localeCompare(b.name, "id");
const houseRef = (house: string) => {
  const [block, number = ""] = house.split("-");
  return { block, number };
};

const COMPARE: Record<Sort, (a: Petugas, b: Petugas) => number> = {
  nama: byName,
  // Tanpa rumah / tanpa jadwal di belakang.
  rumah: (a, b) =>
    (a.house && b.house
      ? compareHouses(houseRef(a.house), houseRef(b.house))
      : a.house
        ? -1
        : b.house
          ? 1
          : 0) || byName(a, b),
  malam: (a, b) => (a.days[0] ?? 7) - (b.days[0] ?? 7) || byName(a, b),
  // Belum pernah mencatat dulu, lalu yang paling lama.
  terakhir: (a, b) =>
    (a.lastRecordedAt ?? "").localeCompare(b.lastRecordedAt ?? "") ||
    byName(a, b),
};

export function PetugasPage() {
  const [params, setParams] = useSearchParams();
  const query = useQuery(usersQuery);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");
  const [night, setNight] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>("nama");
  const [editing, setEditing] = useState<number | "baru" | null>(() =>
    params.has("warga") ? "baru" : null,
  );
  const today = rondaDate(new Date());

  return (
    <QueryState query={query}>
      {({ users, me }) => {
        const counts = Object.fromEntries(
          FILTERS.map((f) => [f.value, users.filter(f.match).length]),
        ) as Record<Filter, number>;
        const editingUser =
          typeof editing === "number"
            ? users.find((u) => u.id === editing)
            : undefined;
        // Saringan yang kosong tidak ditampilkan, kecuali yang sedang dipilih.
        const filters = FILTERS.filter(
          (f) =>
            f.value === "semua" || f.value === filter || counts[f.value] > 0,
        );
        return (
          <>
            <PageHeader
              title="Akun & akses"
              subtitle={`${counts.semua} akun aktif · ${counts.admin} pengurus`}
              action={
                <Button onClick={() => setEditing("baru")} size="sm">
                  <UserPlus className="size-4" /> Buat akun
                </Button>
              }
            />

            {/* <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ROLES.map((value) => <Card key={value} className="px-3 py-3"><p className="text-sm font-semibold">{ROLE_LABEL[value]}</p><p className="mt-1 text-xs text-muted">{ROLE_HINT[value]}</p></Card>)}</div> */}
            <NightSummary
              users={users.filter((u) => u.active)}
              today={today}
              selected={night}
              onSelect={setNight}
            />

            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative block lg:w-72 lg:shrink-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama atau rumah…"
                  aria-label="Cari akun"
                  className="pl-10"
                />
              </label>
              <ScrollArea className="-mx-4 min-w-0 flex-1 overflow-x-auto lg:mx-0">
                <ChipGroup
                  aria-label="Saring akun"
                  value={filter}
                  onValueChange={setFilter}
                  options={filters.map((f) => ({
                    value: f.value,
                    label: f.label,
                    count: counts[f.value],
                  }))}
                  className="w-max min-w-full px-4 lg:px-0"
                />
              </ScrollArea>
            </div>

            <PetugasList
              users={users}
              meId={me.id}
              today={today}
              filter={filter}
              night={night}
              search={search}
              sort={sort}
              onSort={setSort}
              onClearNight={() => setNight(null)}
              onOpen={(id) => setEditing(id)}
            />

            <PetugasDialog
              open={
                editing !== null && (editing === "baru" || Boolean(editingUser))
              }
              onClose={() => {
                setEditing(null);
                if (params.has("warga")) setParams({}, { replace: true });
              }}
              initialResidentId={Number(params.get("warga")) || undefined}
              petugas={editingUser}
              isSelf={editingUser?.id === me.id}
            />
          </>
        );
      }}
    </QueryState>
  );
}

/** Jumlah petugas aktif tiap malam; ketuk satu malam untuk menyaring daftar. */
function NightSummary({
  users,
  today,
  selected,
  onSelect,
}: {
  users: Petugas[];
  today: string;
  selected: number | null;
  onSelect: (day: number | null) => void;
}) {
  const counts = DAY_NAMES.map(
    (_, day) => users.filter((u) => u.days.includes(day)).length,
  );
  const most = Math.max(1, ...counts);
  const tonight = scheduleDay(today);
  return (
    <section aria-labelledby="jaga-per-malam" className="mb-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 id="jaga-per-malam" className="text-sm font-semibold">
          Jaga per malam{" "}
          <span className="font-normal text-muted">
            · malam ini {DAY_NAMES[tonight]}
          </span>
        </h2>
        <Link
          to={adminPath("/jadwal")}
          className="flex items-center gap-1 text-sm font-semibold text-primary"
        >
          <CalendarDays className="size-4" /> Jadwal ronda
        </Link>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_NAMES.map((name, day) => {
          const on = selected === day;
          return (
            <Button
              key={day}
              variant="plain"
              aria-pressed={on}
              aria-label={`${dayLabel(day)}: ${counts[day]} petugas${day === tonight ? ", malam ini" : ""}`}
              onClick={() => onSelect(on ? null : day)}
              className={cx(
                "rounded-xl border px-1 pb-2 pt-1.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                on
                  ? "border-primary bg-primary text-primary-fg"
                  : day === tonight
                    ? "border-primary/50 bg-primary/5 hover:border-primary"
                    : "border-line bg-card hover:border-primary/50",
              )}
            >
              <span
                className={cx(
                  "block text-xs",
                  day === tonight ? "font-semibold" : "font-medium",
                  !on && (day === tonight ? "text-primary" : "text-muted"),
                )}
              >
                <span className="sm:hidden">{DAY_SHORT[day]}</span>
                <span className="max-sm:hidden">{name}</span>
              </span>
              <span className="block text-xl font-bold tabular-nums leading-tight">
                {counts[day]}
              </span>
              <span
                className={cx(
                  "mx-auto mt-1 block h-1 w-3/4 overflow-hidden rounded-full",
                  on ? "bg-primary-fg/30" : "bg-idle-soft",
                )}
              >
                <span
                  className={cx(
                    "block h-full rounded-full",
                    on ? "bg-primary-fg" : "bg-primary",
                  )}
                  style={{ width: `${(counts[day] / most) * 100}%` }}
                />
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}

/** "Malam ini", "Kemarin", "3 malam lalu", "Sab, 26 Sep"; null = belum pernah. */
function lastRecorded(
  at: string | null,
  today: string,
): { label: string; recent: boolean } {
  if (!at) return { label: "Belum pernah", recent: false };
  const date = rondaDate(new Date(at));
  const ago = daysBetween(date, today);
  if (ago <= 0) return { label: "Malam ini", recent: true };
  if (ago === 1) return { label: "Kemarin", recent: true };
  if (ago < 7) return { label: `${ago} malam lalu`, recent: true };
  return { label: formatDateShort(date), recent: false };
}

const ROW_GRID = "lg:grid-cols-[minmax(0,1fr)_5.5rem_12rem_9rem_1.25rem]";

function PetugasList({
  users,
  meId,
  today,
  filter,
  night,
  search,
  sort,
  onSort,
  onClearNight,
  onOpen,
}: {
  users: Petugas[];
  meId: number;
  today: string;
  filter: Filter;
  night: number | null;
  search: string;
  sort: Sort;
  onSort: (sort: Sort) => void;
  onClearNight: () => void;
  onOpen: (id: number) => void;
}) {
  const shown = useMemo(() => {
    const match = FILTERS.find((f) => f.value === filter)!.match;
    const q = search.trim().toLowerCase().replace(/\s+/g, "");
    return users
      .filter(
        (u) =>
          match(u) &&
          (night === null || u.days.includes(night)) &&
          (!q ||
            u.name.toLowerCase().replace(/\s+/g, "").includes(q) ||
            u.house
              ?.toLowerCase()
              .replace("-", "")
              .includes(q.replace("-", ""))),
      )
      .sort(COMPARE[sort]);
  }, [users, filter, night, search, sort]);
  const tonight = scheduleDay(today);

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
        <p className="text-muted">
          <span className="font-semibold text-fg">{shown.length}</span> akun
          {night !== null && (
            <>
              {` jaga ${dayLabel(night)} · `}
              <Button
                variant="plain"
                onClick={onClearNight}
                className="font-semibold text-primary"
              >
                Semua malam
              </Button>
            </>
          )}
        </p>
        <label className="flex items-center gap-2">
          <span className="text-muted">Urutkan</span>
          <Select
            aria-label="Urutkan"
            value={sort}
            onValueChange={onSort}
            options={SORTS}
            className="h-9 w-48"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <Card className="py-10 text-center">
          <Users className="mx-auto size-10 text-muted" />
          <p className="mt-2 font-semibold">
            {search ? "Tidak ada akun yang cocok" : "Belum ada akun di sini"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {search
              ? "Coba nama lain, atau kode rumah seperti AD8."
              : night !== null
                ? `Belum ada yang jaga ${dayLabel(night)}.`
                : "Coba saringan lain."}
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          <div
            className={cx(
              "hidden items-center gap-3 border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted lg:grid",
              ROW_GRID,
            )}
          >
            <span>Nama</span>
            <span>Rumah</span>
            <span className="flex gap-1">
              {DAY_NAMES.map((name, day) => (
                <span
                  key={day}
                  title={dayLabel(day)}
                  className={cx(
                    "w-6 text-center",
                    day === tonight && "text-primary",
                  )}
                >
                  {name[0]}
                </span>
              ))}
            </span>
            <span>Terakhir mencatat</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {shown.map((u) => (
              <PetugasRow
                key={u.id}
                user={u}
                isMe={u.id === meId}
                today={today}
                onOpen={() => onOpen(u.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function PetugasRow({
  user: u,
  isMe,
  today,
  onOpen,
}: {
  user: Petugas;
  isMe: boolean;
  today: string;
  onOpen: () => void;
}) {
  const last = lastRecorded(u.lastRecordedAt, today);
  const nights = u.days.length
    ? `Jaga ${u.days.map((d) => DAY_NAMES[d]).join(", ")}`
    : "Belum dijadwalkan";
  return (
    <li>
      <Button
        variant="plain"
        onClick={onOpen}
        className={cx(
          "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:bg-idle-soft/60 focus-visible:bg-idle-soft/60 focus-visible:outline-none",
          ROW_GRID,
        )}
      >
        <span className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span
              className={cx(
                "truncate font-semibold",
                !u.active && "text-muted",
              )}
            >
              {u.name}
            </span>
            {isMe && <span className="text-sm text-muted">(kamu)</span>}
            <Badge className="bg-primary/15 text-primary">
              {ROLE_LABEL[u.role]}
            </Badge>
            {u.locked && (
              <Badge className="bg-empty-soft text-empty">
                <Lock className="size-3" aria-hidden /> Terkunci
              </Badge>
            )}
            {!u.active && (
              <Badge className="bg-idle-soft text-muted">Nonaktif</Badge>
            )}
          </span>
          {/* HP: rumah, malam jaga, dan terakhir mencatat di bawah nama. */}
          <span className="mt-0.5 block truncate text-sm text-muted lg:hidden">
            {u.house ?? "Tanpa rumah"} ·{" "}
            <span className={cx(!u.days.length && u.active && "text-warn")}>
              {nights}
            </span>
          </span>
          <span className="block text-xs text-muted lg:hidden">
            {u.lastRecordedAt
              ? `Terakhir mencatat ${last.label.toLowerCase()}`
              : "Belum pernah mencatat"}
          </span>
        </span>
        <span className="hidden text-sm lg:block">
          {u.house ?? <span className="text-muted">—</span>}
        </span>
        <span className="hidden lg:block">
          {u.days.length ? (
            <span
              role="img"
              aria-label={nights}
              title={nights}
              className="flex gap-1"
            >
              {DAY_NAMES.map((name, day) => (
                <span
                  key={day}
                  className={cx(
                    "flex size-6 items-center justify-center rounded-md text-[11px] font-semibold",
                    u.days.includes(day)
                      ? "bg-primary text-primary-fg"
                      : "bg-idle-soft/70 text-transparent",
                  )}
                >
                  {name[0]}
                </span>
              ))}
            </span>
          ) : (
            <span
              className={cx("text-sm", u.active ? "text-warn" : "text-muted")}
            >
              Belum dijadwalkan
            </span>
          )}
        </span>
        <span
          className={cx(
            "hidden text-sm lg:block",
            last.recent ? "text-fg" : "text-muted",
          )}
        >
          {last.label}
        </span>
        <ChevronRight className="size-5 text-muted" aria-hidden />
      </Button>
    </li>
  );
}

function Badge({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}
