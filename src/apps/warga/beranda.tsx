import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Phone,
  PiggyBank,
  Pin,
  ScanLine,
  ShieldCheck,
  Star,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { api, call, errorMessage } from "@/client/api";
import { useAuth } from "@/client/auth";
import { invalidate } from "@/client/query";
import { BarChart } from "@/components/bar-chart";
import { GuardChip } from "@/components/guard-chip";
import { ErrorCard, LoadingCards, QueryState } from "@/components/query-state";
import { ThemeButton } from "@/components/theme-toggle";
import { SegmentedControl } from "@/components/toggle-group";
import { Alert, Button, Card, Input, PageTitle, SectionTitle, buttonClass, cx } from "@/components/ui";
import { addDays, daysInMonth, formatDateLong, formatDateShort, formatMonth, shiftMonth } from "@/lib/dates";
import { formatRupiah, phoneDigits, whatsappNumber } from "@/lib/format";
import { DAY_NAMES, NIGHT_OF, slotHouseLabel } from "@/lib/schedule";
import type { CashPublic } from "@/server/kas";
import { HouseStatus } from "./house-status";
import { useMyHouse } from "./my-house";

const accessQuery = { queryKey: ["warga", "akses"], queryFn: () => call(api.warga.akses.$get()) };

/** Halaman informasi untuk warga, dibuka dengan kode dari pengurus. */
export function BerandaPage() {
  const access = useQuery(accessQuery);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6">
      <PageTitle title="Info warga" />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {access.data?.logoUrl && (
            <img src={access.data.logoUrl} alt="" className="size-14 shrink-0 rounded-xl object-contain" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">
              Jimpitan{access.data?.communityName ? ` ${access.data.communityName}` : ""}
            </p>
            <h1 className="text-3xl font-bold tracking-tight">Info warga</h1>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 sm:shrink-0">
          <ThemeButton />
          <AppLinks />
        </div>
      </header>
      <div className="mt-5">
        {access.isError ? (
          <ErrorCard message={errorMessage(access.error)} onRetry={() => void access.refetch()} />
        ) : !access.data ? (
          <LoadingCards />
        ) : access.data.access ? (
          <WargaContent />
        ) : access.data.enabled ? (
          <CodeForm />
        ) : (
          <Card className="text-center">
            <KeyRound className="mx-auto size-10 text-muted" />
            <p className="mt-2 font-semibold">Halaman warga belum dibuka</p>
            <p className="mt-1 text-sm text-muted">Pengurus belum membuat kode warga.</p>
          </Card>
        )}
      </div>
    </main>
  );
}

/**
 * Akses app petugas selalu tersedia; pengurus yang sudah masuk juga bisa membuka dashboard.
 */
function AppLinks() {
  const user = useAuth().data?.user;
  return (
    <>
      <a href="/petugas/" className={buttonClass("secondary", "sm")}>
        <ScanLine className="size-4" aria-hidden /> App petugas
      </a>
      {user?.role === "admin" && (
        <a href="/admin/" title={`Masuk sebagai ${user.name}`} className={buttonClass("secondary", "sm")}>
          <LayoutDashboard className="size-4" aria-hidden /> Dashboard
        </a>
      )}
    </>
  );
}

function CodeForm() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get("kode") ?? "");
  const tried = useRef(false);
  const enter = useMutation({
    mutationFn: (value: string) => call(api.warga.masuk.$post({ json: { code: value } })),
    onSuccess: () => invalidate(["warga"]),
  });

  // Link dari grup WA (…/?kode=XXXX) langsung dicoba sekali, lalu kodenya dihapus dari alamat.
  useEffect(() => {
    const fromLink = params.get("kode");
    if (!fromLink || tried.current) return;
    tried.current = true;
    enter.mutate(fromLink);
    setParams({}, { replace: true });
  }, [params, setParams, enter]);

  function submit(e: FormEvent) {
    e.preventDefault();
    enter.mutate(code);
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <p className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-5 text-primary" /> Masukkan kode warga
        </p>
        <p className="text-sm text-muted">Kodenya dibagikan pengurus di grup warga.</p>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
          maxLength={16}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Kode warga"
          placeholder="Contoh: K7MP2XQ9"
          className="text-center font-mono text-xl tracking-[0.3em]"
        />
        {enter.isError && <Alert>{enter.error.message}</Alert>}
        <Button type="submit" disabled={enter.isPending} className="w-full">
          {enter.isPending ? "Memeriksa…" : "Buka info warga"}
        </Button>
      </form>
    </Card>
  );
}

function WargaContent() {
  const info = useQuery({ queryKey: ["warga", "info"], queryFn: () => call(api.warga.$get()) });

  return (
    <QueryState query={info}>
      {({ announcements, schedule, tonight, date, contacts, cash }) => {
        return (
          <div className="space-y-2">
            {announcements.length > 0 && (
              <>
                <SectionTitle>
                  <span className="inline-flex items-center gap-1.5">
                    <Megaphone className="size-4" /> Pengumuman
                  </span>
                </SectionTitle>
                <div className="space-y-3">
                  {announcements.map((a) => (
                    <Card key={a.id} className={cx(a.pinned && "border-primary/50")}>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold">{a.title}</h3>
                        {a.pinned && <Pin className="size-4 shrink-0 text-primary" aria-label="Disematkan" />}
                      </div>
                      <p className="text-xs text-muted">{formatDateLong(toLocalDate(a.createdAt))}</p>
                      {a.body && <p className="mt-2 whitespace-pre-line text-sm">{a.body}</p>}
                    </Card>
                  ))}
                </div>
              </>
            )}

            <SectionTitle>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4" /> Jadwal jaga
              </span>
            </SectionTitle>
            <GuardSchedule schedule={schedule} tonight={tonight} date={date} />

            <MonthRecap today={date}>{cash && <CashCard cash={cash} />}</MonthRecap>

            {contacts.length > 0 && (
              <>
                <SectionTitle>
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-4" /> Kontak pengurus
                  </span>
                </SectionTitle>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{c.name}</p>
                        {/* Boleh turun baris (nomornya tetap utuh): nomor yang terpotong tidak bisa dibaca. */}
                        <p className="text-sm text-muted">
                          {c.role ? `${c.role} · ` : ""}
                          <span className="whitespace-nowrap tabular-nums">{c.phone}</span>
                        </p>
                      </div>
                      <a href={`tel:${phoneDigits(c.phone)}`} className={buttonClass("secondary", "sm")} aria-label={`Telepon ${c.name}`}>
                        <Phone className="size-4" />
                      </a>
                      <a
                        href={`https://wa.me/${whatsappNumber(c.phone)}`}
                        target="_blank"
                        rel="noopener"
                        className={buttonClass("secondary", "sm")}
                        aria-label={`WhatsApp ${c.name}`}
                      >
                        <MessageCircle className="size-4" /> WA
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        );
      }}
    </QueryState>
  );
}

type Guard = { id: number; day: number; position: number; houseId: number | null; name: string; block: string; number: string };

/** "2026-10-05" → "5 Okt" */
const dayMonth = (isoDate: string) => formatDateShort(isoDate).split(", ")[1];
const listFormat = new Intl.ListFormat("id", { type: "conjunction" });

/**
 * Jadwal jaga per malam: pilih malamnya, mulai dari malam ini. Kalau warga sudah memilih rumahnya
 * (di Status per rumah), malam dan chip rumahnya ditandai bintang.
 */
function GuardSchedule({ schedule, tonight, date }: { schedule: Guard[]; tonight: number; date: string }) {
  const [offset, setOffset] = useState(0);
  const [myHouse] = useMyHouse();
  const day = (tonight + offset) % 7;
  const guards = schedule.filter((s) => s.day === day).sort((a, b) => a.position - b.position);
  const isMine = (g: Guard) => myHouse !== null && g.houseId === myHouse;
  const myGuard = schedule.find(isMine);
  // Malam jaga rumah saya, urut mulai malam ini.
  const myDays = [0, 1, 2, 3, 4, 5, 6].map((i) => (tonight + i) % 7).filter((d) => schedule.some((s) => s.day === d && isMine(s)));

  return (
    <Card className="p-0">
      <div className="overflow-x-auto border-b border-line p-2">
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
                    <span className="opacity-80">{i === 0 ? "Malam ini" : dayMonth(addDays(date, i))}</span>
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
              className: "group h-auto min-w-14 shrink-0 py-1.5 text-center leading-tight sm:min-w-0",
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
          <p className="mt-3 text-muted">Belum ada penjaga di jadwal {offset === 0 ? "malam ini" : "malam itu"}.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {/* Warna jadwal admin tidak dipakai di sini: warga tidak tahu artinya. */}
            {guards.map((g) => (
              <GuardChip key={g.id} name={g.name} house={slotHouseLabel(g)} color={null} mine={isMine(g)} />
            ))}
          </ul>
        )}
        {myGuard && (
          <p className="mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-sm text-muted">
            <Star className="size-4 shrink-0 fill-current text-primary" aria-hidden />
            <span>
              Giliran jaga rumah saya ({slotHouseLabel(myGuard)}):{" "}
              <span className="font-medium text-fg">{listFormat.format(myDays.map((d) => DAY_NAMES[d]))}</span>
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}

/** Rekap jimpitan per bulan, lalu `children` (kas), lalu status per rumah. */
function MonthRecap({ today, children }: { today: string; children?: ReactNode }) {
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const recap = useQuery({
    queryKey: ["warga", "rekap", month],
    queryFn: () => call(api.warga.rekap.$get({ query: { bulan: month } })),
    placeholderData: (previous) => previous,
  });

  const dataMonth = recap.data?.month ?? month;
  const through = dataMonth === thisMonth ? (recap.data?.today ?? today) : daysInMonth(dataMonth).at(-1)!;

  return (
    <>
      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <Wallet className="size-4" /> Jimpitan bulanan
        </span>
      </SectionTitle>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <Button variant="secondary" size="icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Bulan sebelumnya">
            <ChevronLeft className="size-5" />
          </Button>
          <p className="font-semibold">{formatMonth(month)}</p>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= thisMonth}
            aria-label="Bulan berikutnya"
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
        <QueryState query={recap} loading={<p className="py-8 text-center text-muted">Memuat…</p>}>
          {(data) =>
            data.nights === 0 && data.total === 0 ? (
              <div className="pb-1 pt-4 text-center text-sm text-muted">
                {month === thisMonth ? (
                  <>
                    <p>Belum ada ronda tercatat bulan ini. Rekapnya muncul setelah petugas mencatat malam pertama.</p>
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setMonth(shiftMonth(month, -1))}>
                      Lihat {formatMonth(shiftMonth(month, -1))}
                    </Button>
                  </>
                ) : (
                  <p>Tidak ada ronda tercatat di bulan ini.</p>
                )}
              </div>
            ) : (
              <>
                <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                  <div><p className="text-xs text-muted">Total jimpitan</p><p className="mt-1 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{formatRupiah(data.total)}</p></div>
                  <div className="flex gap-6 text-right"><Stat label="Malam berjalan" value={String(data.nights)} /><Stat label="Rata-rata ronda/malam" value={formatRupiah(data.average)} /></div>
                </div>
                <BarChart
                  className="mt-5"
                  caption={`Jimpitan per malam, ${formatMonth(month)}`}
                  bars={daysInMonth(month)
                    .filter((date) => date <= data.today)
                    .map((date) => {
                      const night = data.perNight.find((n) => n.date === date);
                      return {
                        key: date,
                        label: String(Number(date.slice(8))),
                        value: night?.total ?? 0,
                        highlight: date === data.today,
                        title: night
                          ? `${formatDateShort(date)}: hasil ronda ${formatRupiah(night.total)}`
                          : `${formatDateShort(date)}: tidak ada catatan ronda`,
                      };
                    })}
                />
                <p className="mt-3 border-t border-line pt-3 text-xs text-muted">Grafik: uang yang diambil saat ronda. Total bulan juga mencakup pembayaran mingguan dan bulanan.</p>
              </>
            )
          }
        </QueryState>
      </Card>
      {children}
      {recap.data && (recap.data.nights > 0 || recap.data.total > 0 || recap.data.paymentPeriods.length > 0) && <HouseStatus perHouse={recap.data.perHouse.map((h) => ({ ...h, paymentPeriod: recap.data.paymentPeriods.find((p) => h.status === "active" && p.houseId === h.id && p.cadence !== "daily" && p.start <= through && p.end >= through) }))} month={recap.data.month} nights={recap.data.nights} through={through} />}
    </>
  );
}

/** Kas jimpitan dari pengurus: saldo, jumlah bulan ini, dan rincian selain setoran (tanpa nama pencatat). */
function CashCard({ cash }: { cash: CashPublic }) {
  const monthName = formatMonth(cash.month).split(" ")[0];
  return (
    <>
      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <PiggyBank className="size-4" /> Kas jimpitan
        </span>
      </SectionTitle>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs text-muted">Saldo kas sekarang</p><p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{formatRupiah(cash.balance)}</p></div><span className="rounded-full bg-idle-soft px-3 py-1 text-xs font-medium text-muted">{formatMonth(cash.month)}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-4 sm:grid-cols-4">
          <Stat label={`Setoran ${monthName}`} value={formatRupiah(cash.deposits)} />
          <Stat label="Pembayaran langsung" value={formatRupiah(cash.directPayments)} />
          <Stat label="Pemasukan lain" value={formatRupiah(cash.income)} />
          <Stat label="Pengeluaran" value={formatRupiah(cash.expenses)} />
        </div>
        {cash.entries.length > 0 && (
          <ul aria-label={`Rincian ${formatMonth(cash.month)}`} className="mt-4 divide-y divide-line border-t border-line">
            {cash.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{e.description}</span>
                  <span className="block text-xs text-muted">{formatDateShort(e.date)}</span>
                </span>
                <span className={cx("shrink-0 font-semibold tabular-nums", e.direction === "out" ? "text-empty" : "text-filled")}>
                  {e.direction === "out" ? "−" : "+"}
                  {formatRupiah(e.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-bold leading-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

function toLocalDate(at: string | Date) {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
