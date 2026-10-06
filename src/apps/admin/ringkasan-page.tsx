import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarDays,
  KeyRound,
  Map as MapIcon,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { BarChart } from "@/components/bar-chart";
import { GuardChip } from "@/components/guard-chip";
import { QueryState } from "@/components/query-state";
import { Card, PageHeader, cx } from "@/components/ui";
import { formatDateLong, formatDateShort, formatMonth } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { dayLabel, scheduleDay } from "@/lib/schedule";
import { dashboardQuery } from "./queries";

export function RingkasanPage() {
  const query = useQuery(dashboardQuery);

  return (
    <QueryState query={query}>
      {(d) => {
        const t = d.tonight;
        const progress = t.expected ? Math.round((t.checked / t.expected) * 100) : 0;
        const todo = todoItems(d.todo, d.date);
        return (
          <>
            <PageHeader title="Ringkasan" subtitle={`Jimpitan ${d.communityName} · ${formatDateLong(d.date)}`} />

            {todo.length > 0 && (
              <Card className="mb-4 border-warn/40">
                <p className="flex items-center gap-2 font-semibold">
                  <TriangleAlert className="size-5 text-warn" /> Perlu perhatian
                </p>
                <ul className="mt-2 space-y-1.5">
                  {todo.map((item) => (
                    <li key={item.to}>
                      <Link to={item.to} className="flex items-center gap-2 text-sm hover:underline">
                        <item.icon className="size-4 text-primary" /> {item.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Malam ini terkumpul" value={formatRupiah(t.total)} hint={`${t.filled} rumah ada isinya`} />
              <StatCard
                label="Rumah dicek"
                value={`${t.checked}/${t.expected}`}
                hint={t.unchecked ? `${t.unchecked} belum dicek` : "Semua sudah dicek"}
              />
              <StatCard
                label={`Total ${formatMonth(d.month)}`}
                value={formatRupiah(d.monthSummary.total)}
                hint={`${d.monthSummary.nights} malam ronda`}
              />
              <StatCard
                label="Saldo kas"
                value={formatRupiah(d.cash.balance)}
                hint={d.cash.undeposited ? `${d.cash.undeposited} malam belum disetor` : "Semua malam sudah disetor"}
                to="/admin/kas"
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
              <Card>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-semibold">Ronda malam ini</h2>
                  <Link to={`/admin/riwayat/${d.date}`} className="text-sm font-semibold text-primary">
                    Detail
                  </Link>
                </div>
                <div
                  className="mt-3 h-3 overflow-hidden rounded-full bg-idle-soft"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  aria-label="Progres ronda malam ini"
                >
                  <div className="h-full rounded-full bg-filled transition-all" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <Dot className="bg-filled" label={`Ada ${t.filled}`} />
                  <Dot className="bg-empty" label={`Kosong ${t.empty}`} />
                  <Dot className="border border-line bg-card" label={`Belum ${t.unchecked}`} />
                  {t.vacant > 0 && <Dot className="border border-dashed border-muted" label={`Mudik ${t.vacant}`} />}
                </div>
                <p className="mt-3 text-sm text-muted">
                  {t.collectors.length ? `Petugas yang mencatat: ${t.collectors.join(", ")}` : "Belum ada catatan malam ini."}
                </p>
              </Card>

              <Card>
                <h2 className="flex items-center gap-2 font-semibold">
                  <ShieldCheck className="size-5 text-primary" /> Jaga malam ini
                </h2>
                <p className="text-xs text-muted">{dayLabel(scheduleDay(d.date))}</p>
                {t.guards.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">Tidak ada jadwal.</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {t.guards.map((g) => (
                      <GuardChip key={g.id} name={g.name} house={g.label} color={g.color} />
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
              <Card>
                <h2 className="flex items-center gap-2 font-semibold">
                  <TrendingUp className="size-5 text-primary" /> 30 malam terakhir
                </h2>
                {d.trend.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">Belum ada catatan ronda.</p>
                ) : (
                  <BarChart
                    className="mt-4"
                    caption="Jimpitan terkumpul per malam, 30 malam terakhir"
                    bars={d.trend.map((n) => ({
                      key: n.date,
                      label: formatDateShort(n.date).split(" ").slice(0, 2).join(" "),
                      value: n.total,
                      highlight: n.date === d.date,
                      title: `${formatDateShort(n.date)}: ${formatRupiah(n.total)} · ${n.filled} ada, ${n.empty} kosong`,
                    }))}
                  />
                )}
              </Card>

              <Card>
                <h2 className="font-semibold">Sering kosong bulan ini</h2>
                {d.oftenEmpty.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">Tidak ada rumah yang kosong. 👍</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line">
                    {d.oftenEmpty.map((h) => (
                      <li key={h.id} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="font-semibold">{h.label}</span>
                        <span className="text-empty">
                          {h.empty}× dari {h.nights} malam
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to="/admin/rekap" className="mt-3 inline-block text-sm font-semibold text-primary">
                  Rekap lengkap
                </Link>
              </Card>
            </div>

          </>
        );
      }}
    </QueryState>
  );
}

function todoItems(
  todo: {
    pendingRequests: number;
    offDuty: number;
    undeposited: number;
    planMissing: number;
    noSchedule: boolean;
    noWargaCode: boolean;
    onlyOneUser: boolean;
  },
  date: string,
): { to: string; text: string; icon: LucideIcon }[] {
  const items: { to: string; text: string; icon: LucideIcon }[] = [];
  if (todo.offDuty > 0) {
    items.push({
      to: `/admin/riwayat/${date}?tab=log`,
      icon: ShieldAlert,
      text: `${todo.offDuty} catatan malam ini oleh petugas yang tidak dijadwalkan`,
    });
  }
  if (todo.undeposited > 0) {
    items.push({ to: "/admin/kas", icon: Wallet, text: `${todo.undeposited} malam belum dicatat setorannya ke bendahara` });
  }
  if (todo.pendingRequests > 0) {
    items.push({ to: "/admin/jadwal", icon: CalendarClock, text: `${todo.pendingRequests} permintaan ubah jadwal menunggu keputusan` });
  }
  if (todo.planMissing > 0) {
    items.push({ to: "/admin/rumah?tampilan=denah", icon: MapIcon, text: `Daftarkan ${todo.planMissing} rumah dari denah` });
  }
  if (todo.onlyOneUser) items.push({ to: "/admin/petugas", icon: Users, text: "Tambahkan petugas ronda" });
  if (todo.noSchedule) items.push({ to: "/admin/jadwal", icon: CalendarDays, text: "Impor jadwal ronda" });
  if (todo.noWargaCode) items.push({ to: "/admin/info", icon: KeyRound, text: "Buka halaman warga (buat kode warga)" });
  return items;
}

function StatCard({ label, value, hint, to }: { label: string; value: string; hint?: string; to?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </>
  );
  return to ? (
    <Link to={to} className="rounded-2xl border border-line bg-card p-4 hover:border-primary/40">
      {body}
    </Link>
  ) : (
    <Card>{body}</Card>
  );
}

function Dot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx("inline-block size-3 rounded", className)} />
      {label}
    </span>
  );
}
