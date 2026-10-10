import { usePermission } from "@/client/permissions";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarDays,
  ChevronRight,
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
import { Card, PageHeader } from "@/components/ui";
import { formatDateLong, formatDateShort, formatMonth } from "@/lib/dates";
import { formatAmountShort, formatRupiah } from "@/lib/format";
import { dayLabel, scheduleDay } from "@/lib/schedule";
import { dashboardQuery } from "./queries";
import { TonightCard } from "./tonight-card";
import { HouseWatchCard } from "./house-watch-card";
import { adminPath } from "@/lib/app-paths";

export function RingkasanPage() {
  const query = useQuery(dashboardQuery);
  const canFinance = usePermission("finance");
  const canSchedule = usePermission("schedule", true);
  const canHouse = usePermission("houses", true);
  const canAccounts = usePermission("accounts", true);
  const canInfo = usePermission("info", true);

  return (
    <QueryState query={query}>
      {(d) => {
        const t = d.tonight;
        const todo = todoItems(d.todo, d.date).filter((item) => {
          if (item.to.includes("/kas")) return canFinance;
          if (item.to.includes("/jadwal")) return canSchedule;
          if (item.to.includes("/rumah")) return canHouse;
          if (item.to.includes("/petugas")) return canAccounts;
          if (item.to.includes("/info")) return canInfo;
          return true;
        });
        return (
          <>
            <PageHeader title="Ringkasan" subtitle={`${d.communityName} · ${formatDateLong(d.date)}`} />

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
              <StatCard label="Uang hasil ronda" value={formatRupiah(t.total)} hint={t.collectedHouses ? `Diambil dari ${t.collectedHouses} rumah malam ini` : "Belum ada uang yang diambil malam ini"} />
              <StatCard
                label="Progres ronda harian"
                value={t.daily.expected ? `${t.daily.checked}/${t.daily.expected}` : "—"}
                hint={!t.daily.expected ? "Tidak ada rumah harian" : t.daily.unchecked ? `${t.daily.unchecked} rumah belum dicek` : "Semua rumah harian sudah dicek"}
              />
              <StatCard
                label={`Total ${formatMonth(d.month)}`}
                value={formatRupiah(d.monthSummary.total)}
                hint={`${d.monthSummary.nights} malam ronda + pembayaran periode diterima bulan ini`}
              />
              <StatCard
                label="Saldo kas"
                value={formatRupiah(d.cash.balance)}
                hint={d.cash.undeposited ? `${d.cash.undeposited} malam belum disetor` : "Semua malam sudah disetor"}
                to={canFinance ? adminPath("/kas") : undefined}
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Link to={adminPath("/rekap")} className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 transition-colors hover:border-primary/40">
                <Wallet className="size-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1"><p className="text-xs text-muted">Pembayaran periode diterima hari ini</p><p className="mt-0.5 text-sm font-semibold tabular-nums">{formatRupiah(d.paymentOverview.receivedToday)}</p></div>
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
              <Link to={adminPath("/rekap")} className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 transition-colors hover:border-primary/40">
                <CalendarClock className="size-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1"><p className="text-xs text-muted">Belum bayar periode berjalan</p><p className="mt-0.5 text-sm font-semibold tabular-nums">{d.paymentOverview.unpaidHouses} rumah · {formatRupiah(d.paymentOverview.unpaidAmount)}</p></div>
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
              <TonightCard tonight={t} date={d.date} />

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

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              <Card className="min-w-0">
                <h2 className="flex items-center gap-2 font-semibold">
                  <TrendingUp className="size-5 text-primary" /> 30 malam terakhir
                </h2>
                {d.trend.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">Belum ada catatan ronda.</p>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-muted">Jimpitan per malam · {d.trend.length} malam tercatat</p>
                    <BarChart
                      className="mt-5"
                      size="lg"
                      formatValue={(value) => `Rp ${formatAmountShort(value)}`}
                      labelEvery={Math.ceil(d.trend.length / 6)}
                      caption="Jimpitan terkumpul per malam, 30 malam terakhir"
                      bars={d.trend.map((n) => ({
                        key: n.date,
                        label: formatDateShort(n.date).split(", ")[1],
                        value: n.total,
                        highlight: n.date === d.date,
                        title: `${formatDateShort(n.date)}: ${formatRupiah(n.total)} · ${n.filled} ada, ${n.empty} kosong`,
                      }))}
                    />
                  </>
                )}
              </Card>

              <HouseWatchCard houses={d.oftenEmpty} month={d.month} today={d.date} />
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
    onlyOneUser: boolean;
    unpaidPayments: number;
  },
  date: string,
): { to: string; text: string; icon: LucideIcon }[] {
  const items: { to: string; text: string; icon: LucideIcon }[] = [];
  if (todo.offDuty > 0) {
    items.push({
      to: adminPath(`/riwayat/${date}?tab=log`),
      icon: ShieldAlert,
      text: `${todo.offDuty} catatan malam ini oleh petugas yang tidak dijadwalkan`,
    });
  }
  if (todo.undeposited > 0) {
    items.push({ to: adminPath("/kas"), icon: Wallet, text: `${todo.undeposited} malam belum dicatat setorannya ke bendahara` });
  }
  if (todo.pendingRequests > 0) {
    items.push({ to: adminPath("/jadwal"), icon: CalendarClock, text: `${todo.pendingRequests} permintaan ubah jadwal menunggu keputusan` });
  }
  if (todo.planMissing > 0) {
    items.push({ to: adminPath("/rumah?tampilan=denah"), icon: MapIcon, text: `Daftarkan ${todo.planMissing} rumah dari denah` });
  }
  if (todo.onlyOneUser) items.push({ to: adminPath("/petugas"), icon: Users, text: "Tambahkan petugas ronda" });
  if (todo.noSchedule) items.push({ to: adminPath("/jadwal"), icon: CalendarDays, text: "Impor jadwal ronda" });
  return items;
}

function StatCard({ label, value, hint, to }: { label: string; value: string; hint?: string; to?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
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
