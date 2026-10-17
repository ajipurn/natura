import { NumberTicker } from "@/components/number-ticker";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  House,
  Megaphone,
  MessageCircle,
  Phone,
  PiggyBank,
  Pin,
  ShieldCheck,
  Star,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api, call } from "@/client/api";
import { useAuth } from "@/client/auth";
import { BarChart } from "@/components/bar-chart";
import { GuardChip } from "@/components/guard-chip";
import { QueryState } from "@/components/query-state";
import { SegmentedControl } from "@/components/toggle-group";
import {
  Button,
  Card,
  PageTitle,
  buttonClass,
  cx,
} from "@/components/ui";
import {
  addDays,
  daysInMonth,
  formatDateLong,
  formatDateShort,
  formatMonth,
  shiftMonth,
} from "@/lib/dates";
import { formatRupiah, phoneDigits, whatsappNumber } from "@/lib/format";
import { DAY_NAMES, NIGHT_OF, slotHouseLabel } from "@/lib/schedule";
import type { CashPublic } from "@/server/kas";
import { HouseStatus } from "./house-status";
import { useMyHouse } from "./my-house";
import { DEFAULT_LOGO_URL } from "@/lib/branding";
import { petugasPath } from "@/lib/app-paths";

const accessQuery = {
  queryKey: ["warga", "akses"],
  queryFn: () => call(api.warga.akses.$get()),
};

const quickLinkClass = "flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-card px-2 py-3 text-sm font-medium shadow-sm ring-1 ring-line/60 transition-[background-color,scale] hover:bg-primary/5 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 motion-reduce:transition-none motion-reduce:active:scale-100";

/** Beranda app; login dijaga oleh router app dan API. */
export function BerandaPage() {
  const access = useQuery(accessQuery);
  const user = useAuth().data?.user;
  return (
    <main>
      <PageTitle title="Beranda" />
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-line/60">
            <img src={access.data?.logoUrl ?? DEFAULT_LOGO_URL} alt="" className="size-8 object-contain" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight [overflow-wrap:anywhere]">
              {access.data?.communityName || "Cluster Natura"}
            </p>
          </div>
        </div>
        <Link to={petugasPath("/akun")} aria-label={`Buka akun ${user?.name ?? "saya"}`} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4">
          {Array.from(user?.name.trim() ?? "")[0]?.toLocaleUpperCase("id-ID")}
        </Link>
      </header>
      <div className="mb-5 mt-7">
        <p className="mb-1 text-sm text-muted">Halo, {user?.name.split(" ")[0] ?? "tetangga"}.</p>
        <h1 className="text-3xl font-bold tracking-tight">Beranda</h1>
      </div>
      <div>
        <WargaContent />
      </div>
    </main>
  );
}

function WargaContent() {
  const info = useQuery({
    queryKey: ["warga", "info"],
    queryFn: () => call(api.warga.$get()),
    refetchInterval: 60_000,
  });

  return (
    <QueryState query={info}>
      {({ announcements, schedule, tonight, date, today, contacts, cash }) => {
        const guards = schedule.filter((g) => g.day === tonight);
        return (
          <div className="space-y-7">
            <section aria-label="Ringkasan ronda malam ini" className="relative overflow-hidden rounded-[1.75rem] bg-primary p-5 text-primary-fg shadow-[0_10px_30px_-15px_color-mix(in_srgb,var(--primary)_50%,transparent)] sm:p-6">
              <div aria-hidden className="pointer-events-none absolute -end-8 -top-12 size-48 rounded-full border-[24px] border-current opacity-[0.06]" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Ronda malam ini</h2>
                  <p className="mt-1 text-sm">{formatDateLong(date)}</p>
                </div>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-current/10">
                  <ShieldCheck className="size-6" aria-hidden />
                </span>
              </div>
              <div className="relative mt-6 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  {guards.length > 0 && (
                    <div className="mb-2 flex -space-x-2" aria-hidden>
                      {guards.slice(0, 4).map((g) => <span key={g.id} className="flex size-8 items-center justify-center rounded-full border-2 border-primary bg-primary-fg text-xs font-semibold text-primary">{Array.from(g.name.trim())[0]}</span>)}
                      {guards.length > 4 && <span className="flex size-8 items-center justify-center rounded-full border-2 border-primary bg-primary-fg text-[10px] font-semibold text-primary">+{guards.length - 4}</span>}
                    </div>
                  )}
                  <p className="text-xs">{guards.length > 0 ? `${guards.length} petugas terjadwal` : "Belum ada petugas terjadwal"}</p>
                </div>
                <Link to={petugasPath("/ronda")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-fg px-4 text-sm font-semibold text-primary transition-[opacity,scale] hover:opacity-90 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-primary-fg focus-visible:outline-offset-4 motion-reduce:transition-none motion-reduce:active:scale-100">
                  Lihat ronda <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              </div>
            </section>

            <div className="grid grid-cols-3 gap-3" aria-label="Akses cepat beranda">
              <Link to={petugasPath("/akun/jadwal")} className={quickLinkClass}>
                <span className="flex size-10 items-center justify-center rounded-[0.875rem] bg-primary/10 text-primary"><CalendarDays className="size-5" aria-hidden /></span>
                Jadwal
              </Link>
              <a href="#jimpitan" className={quickLinkClass}>
                <span className="flex size-10 items-center justify-center rounded-[0.875rem] bg-warn-soft text-warn"><Wallet className="size-5" aria-hidden /></span>
                Jimpitan
              </a>
              {contacts.length > 0 ? (
                <a href="#kontak" className={quickLinkClass}>
                  <span className="flex size-10 items-center justify-center rounded-[0.875rem] bg-cadence-monthly-soft text-cadence-monthly"><Phone className="size-5" aria-hidden /></span>
                  Kontak
                </a>
              ) : (
                <Link to={petugasPath("/riwayat")} className={quickLinkClass}>
                  <span className="flex size-10 items-center justify-center rounded-[0.875rem] bg-cadence-monthly-soft text-cadence-monthly"><History className="size-5" aria-hidden /></span>
                  Riwayat
                </Link>
              )}
            </div>

            {announcements.length > 0 && (
              <section aria-label="Pengumuman warga">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight"><Megaphone className="size-4 text-primary" aria-hidden /> Pengumuman</h2>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{announcements.length} pengumuman</span>
                </div>
                <div className="space-y-2.5">
                  {announcements.map((a, i) => (
                    <details key={a.id} open={i === 0} className="group rounded-3xl border border-line/75 bg-card p-4 sm:p-5">
                      <summary className="flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            <span className="font-semibold [overflow-wrap:anywhere]">{a.title}</span>
                            {a.pinned && <Pin className="mt-0.5 size-3.5 shrink-0 text-primary" aria-label="Disematkan" />}
                          </span>
                          <span className="mt-1 block text-xs text-muted">{formatDateLong(toLocalDate(a.createdAt))}</span>
                        </span>
                        <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                      </summary>
                      {a.body && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">{a.body}</p>}
                    </details>
                  ))}
                </div>
              </section>
            )}

            <section aria-label="Jadwal jaga">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold tracking-tight"><ShieldCheck className="size-4 text-primary" aria-hidden /> Jadwal jaga</h2>
              <GuardSchedule schedule={schedule} tonight={tonight} date={date} />
            </section>

            <section id="jimpitan" aria-label="Jimpitan dan kas">
              <MonthRecap today={today}>
                {cash && <CashCard cash={cash} />}
              </MonthRecap>
            </section>

            {contacts.length > 0 && (
              <section id="kontak" aria-label="Kontak pengurus">
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold tracking-tight"><Phone className="size-4 text-primary" aria-hidden /> Kontak pengurus</h2>
                <ul className="divide-y divide-line/70 overflow-hidden rounded-3xl border border-line/75 bg-card">
                  {contacts.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-2 px-4 py-4 sm:gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold [overflow-wrap:anywhere]">{c.name}</p>
                        {/* Boleh turun baris (nomornya tetap utuh): nomor yang terpotong tidak bisa dibaca. */}
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">
                          {c.role && <span className="block">{c.role}</span>}
                          <span className="block tabular-nums">
                            {c.phone}
                          </span>
                        </p>
                      </div>
                      <a
                        href={`tel:${phoneDigits(c.phone)}`}
                        className={cx(buttonClass("secondary", "icon"), "border-transparent bg-bg")}
                        aria-label={`Telepon ${c.name}`}
                      >
                        <Phone className="size-4" />
                      </a>
                      <a
                        href={`https://wa.me/${whatsappNumber(c.phone)}`}
                        target="_blank"
                        rel="noopener"
                        className={cx(buttonClass("secondary", "icon"), "border-transparent bg-primary/10 text-primary")}
                        aria-label={`WhatsApp ${c.name}`}
                      >
                        <MessageCircle className="size-5" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        );
      }}
    </QueryState>
  );
}

type Guard = {
  unassigned?: boolean;
  id: number;
  day: number;
  position: number;
  houseId: number | null;
  name: string;
  block: string;
  number: string;
};

/** "2026-10-05" → "5 Okt" */
const dayMonth = (isoDate: string) => formatDateShort(isoDate).split(", ")[1];
const listFormat = new Intl.ListFormat("id", { type: "conjunction" });

/**
 * Jadwal jaga per malam: pilih malamnya, mulai dari malam ini. Kalau warga sudah memilih rumahnya
 * (di Status per rumah), malam dan chip rumahnya ditandai bintang.
 */
function GuardSchedule({
  schedule,
  tonight,
  date,
}: {
  schedule: Guard[];
  tonight: number;
  date: string;
}) {
  const [offset, setOffset] = useState(0);
  const [myHouse] = useMyHouse();
  const day = (tonight + offset) % 7;
  const guards = schedule
    .filter((s) => s.day === day)
    .sort((a, b) => a.position - b.position);
  const isMine = (g: Guard) => myHouse !== null && g.houseId === myHouse;
  const myGuard = schedule.find(isMine);
  // Malam jaga rumah saya, urut mulai malam ini.
  const myDays = [0, 1, 2, 3, 4, 5, 6]
    .map((i) => (tonight + i) % 7)
    .filter((d) => schedule.some((s) => s.day === d && isMine(s)));

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto scroll-px-2 border-b border-line p-2">
        <SegmentedControl
          aria-label="Pilih malam"
          value={String(offset)}
          onValueChange={(v) => setOffset(Number(v))}
          options={[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const d = (tonight + i) % 7;
            return {
              value: String(i),
              label: (
                <>
                  <span className="flex items-center justify-center gap-0.5 text-[11px] font-medium">
                    <span className="opacity-80">
                      {i === 0 ? "Malam ini" : dayMonth(addDays(date, i))}
                    </span>
                    {/* Di baris tanggal, bukan di pojok: tab di HP sempit, bintang di pojok menimpa teks. */}
                    {myDays.includes(d) && (
                      <Star
                        className="size-2.5 shrink-0 fill-current text-primary group-data-pressed:text-primary-fg"
                        role="img"
                        aria-label="rumah saya jaga"
                      />
                    )}
                  </span>
                  <span className="block">{DAY_NAMES[d]}</span>
                </>
              ),
              className:
                "group min-w-14 shrink-0 text-center leading-tight sm:min-w-0",
            };
          })}
          // Tanpa garis tepi: menyatu dengan kepala kartu. Di HP bisa digeser, di layar lebar 7 kolom.
          className="min-w-max gap-1 border-transparent sm:grid sm:min-w-0 sm:grid-cols-7"
        />
      </div>
      <div className="p-4">
        <p className="text-sm">
          <span className="font-semibold">
            {DAY_NAMES[day]}, {dayMonth(addDays(date, offset))}
          </span>
          <span className="text-muted"> · malam {NIGHT_OF[day]}</span>
        </p>
        {guards.length === 0 ? (
          <p className="mt-3 text-muted">
            Belum ada penjaga di jadwal{" "}
            {offset === 0 ? "malam ini" : "malam itu"}.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {/* Warna jadwal admin tidak dipakai di sini: warga tidak tahu artinya. */}
            {guards.map((g) => (
              <GuardChip
                key={g.id}
                name={g.name}
                house={slotHouseLabel(g)}
                color={null}
                showColorMeaning={false}
                unassigned={g.unassigned}
                mine={isMine(g)}
              />
            ))}
          </ul>
        )}
        {myGuard && (
          <p className="mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-sm text-muted">
            <Star
              className="size-4 shrink-0 fill-current text-primary"
              aria-hidden
            />
            <span>
              Giliran jaga rumah saya ({slotHouseLabel(myGuard)}):{" "}
              <span className="font-medium text-fg">
                {listFormat.format(myDays.map((d) => DAY_NAMES[d]))}
              </span>
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}

/** Rekap jimpitan per bulan, lalu `children` (kas), lalu status per rumah. */
function MonthRecap({
  today,
  children,
}: {
  today: string;
  children?: ReactNode;
}) {
  const thisMonth = today.slice(0, 7);
  const [selectedMonth, setMonth] = useState<string | null>(null);
  const month = selectedMonth ?? thisMonth;
  const recap = useQuery({
    queryKey: ["warga", "rekap", month],
    queryFn: () => call(api.warga.rekap.$get({ query: { bulan: month } })),
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  });

  const through =
    recap.data?.perNight.at(-1)?.date ?? recap.data?.through ?? today;

  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight"><Wallet className="size-4 text-primary" aria-hidden /> Jimpitan bulanan</h2>
      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Bulan sebelumnya"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <p className="text-sm font-semibold">{formatMonth(month)}</p>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => {
              const next = shiftMonth(month, 1);
              setMonth(next === thisMonth ? null : next);
            }}
            disabled={month >= thisMonth}
            aria-label="Bulan berikutnya"
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
        <QueryState
          query={recap}
          loading={<p className="py-8 text-center text-muted">Memuat…</p>}
        >
          {(data) =>
            data.nights === 0 && data.total === 0 ? (
              <div className="pb-1 pt-4 text-center text-sm text-muted">
                {month === thisMonth ? (
                  <>
                    <p>
                      Malam pertama bulan ini mulai dihitung pukul 20.00 WIB
                      tanggal 1.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => setMonth(shiftMonth(month, -1))}
                    >
                      Lihat {formatMonth(shiftMonth(month, -1))}
                    </Button>
                  </>
                ) : (
                  <p>Tidak ada ronda tercatat di bulan ini.</p>
                )}
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 sm:items-end">
                  <div className="min-w-0">
                    <p className="text-xs text-muted">Total jimpitan</p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-primary tabular-nums">
                      <NumberTicker value={formatRupiah(data.total)} />
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <dt className="text-xs text-muted">Malam berjalan</dt>
                      <dd className="mt-1 text-base font-semibold leading-tight tabular-nums sm:text-lg">
                        <NumberTicker value={data.nights} />
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-muted">Rata-rata / malam</dt>
                      <dd className="mt-1 text-base font-semibold leading-tight tabular-nums sm:text-lg">
                        <NumberTicker value={formatRupiah(data.average)} />
                      </dd>
                    </div>
                  </dl>
                </div>
                <BarChart
                  className="mt-5"
                  caption={`Jimpitan per malam, ${formatMonth(month)}`}
                  bars={daysInMonth(month)
                    .filter((date) => date <= data.through)
                    .map((date) => {
                      const night = data.perNight.find((n) => n.date === date);
                      return {
                        key: date,
                        label: String(Number(date.slice(8))),
                        value: night?.total ?? 0,
                        highlight: date === data.through,
                        title: night
                          ? `${formatDateShort(date)}: hasil ronda ${formatRupiah(night.total)}`
                          : `${formatDateShort(date)}: tidak ada catatan ronda`,
                      };
                    })}
                />
                <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
                  Grafik dan rata-rata: hasil ronda. Total bulan juga mencakup
                  pembayaran periode dan rapel.
                </p>
              </>
            )
          }
        </QueryState>
      </Card>
      {children}
      {recap.data && (
        <details className="group/houses rounded-3xl border border-line/75 bg-card p-4 sm:p-5">
          <summary className="flex min-h-12 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><House className="size-5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Status per rumah</span>
              <span className="mt-0.5 block text-xs text-muted">{recap.data.perHouse.length} rumah · {formatMonth(month)}</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open/houses:rotate-180 motion-reduce:transition-none" aria-hidden />
          </summary>
          <div className="pt-5">
            <HouseStatus
              embedded
              perHouse={recap.data.perHouse.map((h) => ({
                ...h,
                paymentPeriod: recap.data.paymentPeriods.find(
                  (p) =>
                    h.status === "active" &&
                    p.houseId === h.id &&
                    p.cadence !== "daily" &&
                    p.start <= through &&
                    p.end >= through,
                ),
              }))}
              month={recap.data.month}
              nights={recap.data.nights}
              through={through}
            />
          </div>
        </details>
      )}
    </div>
  );
}

/** Kas jimpitan dari pengurus: saldo, jumlah bulan ini, dan rincian selain setoran (tanpa nama pencatat). */
function CashCard({ cash }: { cash: CashPublic }) {
  const monthName = formatMonth(cash.month).split(" ")[0];
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted"><PiggyBank className="size-4 text-primary" aria-hidden /> Saldo kas sekarang</p>
          <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
            <NumberTicker value={formatRupiah(cash.balance)} />
          </p>
        </div>
        <span className="rounded-full bg-idle-soft px-3 py-1 text-xs font-medium text-muted">
          {formatMonth(cash.month)}
        </span>
      </div>
      <details className="group/cash mt-3 border-t border-line/70 pt-1">
        <summary className="flex min-h-11 items-center justify-between gap-3 rounded-lg text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
          Lihat rincian kas
          <ChevronDown className="size-4 shrink-0 transition-transform group-open/cash:rotate-180 motion-reduce:transition-none" aria-hidden />
        </summary>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 pt-3 sm:grid-cols-3">
          <Stat
            label={`Setoran ${monthName}`}
            value={formatRupiah(cash.deposits)}
          />
          <Stat
            label="Pembayaran langsung"
            value={formatRupiah(cash.directPayments)}
          />
          <Stat
            label="Iuran lingkungan"
            value={formatRupiah(cash.duesIncome)}
          />
          <Stat label="Pemasukan lain" value={formatRupiah(cash.income)} />
          <Stat label="Pengeluaran" value={formatRupiah(cash.expenses)} />
        </div>
        {cash.entries.length > 0 && (
          <ul
            aria-label={`Rincian ${formatMonth(cash.month)}`}
            className="mt-4 divide-y divide-line border-t border-line"
          >
            {cash.entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block [overflow-wrap:anywhere]">{e.description}</span>
                  <span className="block text-xs text-muted">
                    {formatDateShort(e.date)}
                  </span>
                </span>
                <span
                  className={cx(
                    "shrink-0 font-semibold tabular-nums",
                    e.direction === "out" ? "text-empty" : "text-filled",
                  )}
                >
                  {e.direction === "out" ? "−" : "+"}
                  <NumberTicker value={formatRupiah(e.amount)} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-bold leading-tight tabular-nums"><NumberTicker value={value} /></p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

function toLocalDate(at: string | Date) {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
