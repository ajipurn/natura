import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  KeyRound,
  LogIn,
  Megaphone,
  MessageCircle,
  Phone,
  Pin,
  Search,
  ShieldCheck,
  Star,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { api, call, errorMessage } from "@/client/api";
import { invalidate } from "@/client/query";
import { BarChart } from "@/components/bar-chart";
import { GuardChip } from "@/components/guard-chip";
import { ErrorCard, LoadingCards, QueryState } from "@/components/query-state";
import { Alert, Card, PageTitle, SectionTitle, buttonClass, cx, inputClass } from "@/components/ui";
import { addDays, daysInMonth, formatDateLong, formatDateShort, formatMonth, shiftMonth } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { groupByBlock, houseLabel, searchHouses } from "@/lib/houses";
import type { GuardColor } from "@/lib/guard-color";
import { DAY_NAMES, dayLabel, slotHouseLabel } from "@/lib/schedule";
import { HouseHistoryDialog } from "./house-history";
import { houseMonthText, useMyHouse } from "./my-house";

const accessQuery = { queryKey: ["warga", "akses"], queryFn: () => call(api.warga.akses.$get()) };

/** Halaman informasi untuk warga, dibuka dengan kode dari pengurus. */
export function BerandaPage() {
  const access = useQuery(accessQuery);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6">
      <PageTitle title="Info warga" />
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">
            Jimpitan{access.data?.communityName ? ` ${access.data.communityName}` : ""}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Info warga</h1>
        </div>
        {/* Untuk petugas dan pengurus; warga cukup memakai kode. */}
        <a
          href="/petugas/"
          aria-label="Masuk petugas / pengurus"
          title="Masuk petugas / pengurus"
          className={cx(buttonClass("secondary", "sm"), "mt-1 shrink-0")}
        >
          <LogIn className="size-4" /> Masuk
        </a>
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
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
          maxLength={16}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Kode warga"
          placeholder="Contoh: K7MP2XQ9"
          className={cx(inputClass, "text-center font-mono text-xl tracking-[0.3em]")}
        />
        {enter.isError && <Alert>{enter.error.message}</Alert>}
        <button type="submit" disabled={enter.isPending} className={cx(buttonClass("primary"), "w-full")}>
          {enter.isPending ? "Memeriksa…" : "Buka info warga"}
        </button>
      </form>
    </Card>
  );
}

function WargaContent() {
  const info = useQuery({ queryKey: ["warga", "info"], queryFn: () => call(api.warga.$get()) });

  return (
    <QueryState query={info}>
      {({ announcements, schedule, tonight, date, contacts }) => {
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

            <MonthRecap today={date} />

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
                        <p className="truncate text-sm text-muted">{c.role ? `${c.role} · ` : ""}{c.phone}</p>
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
                        <MessageCircle className="size-4" />
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

type Guard = { id: number; day: number; position: number; name: string | null; block: string; number: string; color: GuardColor | null };

/** Jadwal jaga per malam: pilih malamnya, mulai dari malam ini; warna chip sama dengan tabel jadwal. */
function GuardSchedule({ schedule, tonight, date }: { schedule: Guard[]; tonight: number; date: string }) {
  const [offset, setOffset] = useState(0);
  const day = (tonight + offset) % 7;
  const guards = schedule.filter((s) => s.day === day).sort((a, b) => a.position - b.position);

  return (
    <Card className="p-0">
      <div role="tablist" aria-label="Pilih malam" className="flex gap-1 overflow-x-auto border-b border-line p-2 sm:grid sm:grid-cols-7">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const d = (tonight + i) % 7;
          const count = schedule.filter((s) => s.day === d).length;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={offset === i}
              onClick={() => setOffset(i)}
              className={cx(
                "flex min-w-14 shrink-0 flex-col items-center rounded-xl px-2.5 py-1.5 leading-tight sm:min-w-0",
                offset === i ? "bg-primary text-primary-fg" : "text-fg hover:bg-idle-soft",
              )}
            >
              <span className="text-[11px] font-medium opacity-80">{i === 0 ? "Malam ini" : formatDateShort(addDays(date, i)).split(", ")[1]}</span>
              <span className="text-sm font-semibold">{DAY_NAMES[d]}</span>
              <span className={cx("text-[11px]", offset === i ? "opacity-80" : "text-muted")}>{count} org</span>
            </button>
          );
        })}
      </div>
      <div className="p-4">
        <p className="text-sm text-muted">
          <span className="font-semibold text-fg">{dayLabel(day)}</span> · {formatDateShort(addDays(date, offset))}
        </p>
        {guards.length === 0 ? (
          <p className="mt-3 text-muted">Belum ada jadwal untuk malam ini.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {guards.map((g) => (
              <GuardChip key={g.id} name={g.name} house={slotHouseLabel(g)} color={g.color} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function MonthRecap({ today }: { today: string }) {
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const recap = useQuery({
    queryKey: ["warga", "rekap", month],
    queryFn: () => call(api.warga.rekap.$get({ query: { bulan: month } })),
    placeholderData: (previous) => previous,
  });

  return (
    <>
      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <Wallet className="size-4" /> Jimpitan bulanan
        </span>
      </SectionTitle>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="flex size-10 items-center justify-center rounded-lg border border-line"
            aria-label="Bulan sebelumnya"
          >
            <ChevronLeft className="size-5" />
          </button>
          <p className="font-semibold">{formatMonth(month)}</p>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= thisMonth}
            className="flex size-10 items-center justify-center rounded-lg border border-line disabled:opacity-40"
            aria-label="Bulan berikutnya"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        <QueryState query={recap} loading={<p className="py-8 text-center text-muted">Memuat…</p>}>
          {(data) =>
            data.nights === 0 ? (
              <p className="py-6 text-center text-muted">Belum ada ronda di bulan ini.</p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Stat label="Terkumpul" value={formatRupiah(data.total)} />
                  <Stat label="Malam ronda" value={String(data.nights)} />
                  <Stat label="Rata-rata/malam" value={formatRupiah(data.average)} />
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
                          ? `${formatDateShort(date)}: ${formatRupiah(night.total)} dari ${night.filled} rumah`
                          : `${formatDateShort(date)}: tidak ada catatan ronda`,
                      };
                    })}
                />
                <p className="mt-1 text-center text-xs text-muted">Jimpitan per malam (tanggal)</p>
              </>
            )
          }
        </QueryState>
      </Card>
      {recap.data && recap.data.nights > 0 && <HouseStatus perHouse={recap.data.perHouse} month={recap.data.month} />}
    </>
  );
}

type HouseRow = { id: number; block: string; number: string; status: "active" | "vacant"; filled: number; empty: number };

/** Status tiap rumah bulan ini, tanpa nama warga. Ketuk rumah untuk melihat riwayatnya. */
function HouseStatus({ perHouse, month }: { perHouse: HouseRow[]; month: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<HouseRow | null>(null);
  const [myHouse, setMyHouse] = useMyHouse();
  const mine = perHouse.find((h) => h.id === myHouse);
  const shown = query.trim() ? searchHouses(perHouse, query, perHouse.length) : perHouse;

  return (
    <>
      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <Home className="size-4" /> Status per rumah
        </span>
      </SectionTitle>
      <Card className="space-y-4">
        <p className="text-sm text-muted">
          Berapa malam wadah jimpitan ada isinya di {formatMonth(month)}, dari malam-malam rumah itu dicek petugas. Ketuk
          rumah untuk melihat riwayatnya.
        </p>
        {mine && (
          <button
            type="button"
            onClick={() => setOpen(mine)}
            className="flex w-full items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5 text-left"
          >
            <Star className="size-5 shrink-0 fill-current text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Rumah saya · {houseLabel(mine)}</span>
              <span className="block text-sm text-muted">{houseMonthText(mine)}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-primary">Riwayat</span>
          </button>
        )}
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari rumah, mis. AD3"
            aria-label="Cari rumah"
            className={cx(inputClass, "pl-10")}
          />
        </label>
        {shown.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Tidak ada rumah yang cocok.</p>
        ) : (
          <div className="space-y-4">
            {groupByBlock(shown).map(([block, list]) => (
              <section key={block} aria-label={`Blok ${block}`}>
                <h3 className="mb-1.5 text-sm font-semibold">Blok {block}</h3>
                <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                  {list.map((h) => {
                    // Malam yang rumah ini tidak dicek tidak dihitung, supaya tidak terlihat seperti kosong.
                    const checked = h.filled + h.empty;
                    const ratio = checked ? h.filled / checked : null;
                    return (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => setOpen(h)}
                          aria-label={`${houseLabel(h)}: ${houseMonthText(h)}. Lihat riwayat`}
                          className={cx(
                            "relative w-full rounded-lg border px-1 py-1.5 text-center transition active:scale-95",
                            h.status === "vacant" || ratio === null
                              ? "border-dashed border-line text-muted hover:border-muted"
                              : ratio >= 0.8
                                ? "border-filled/40 bg-filled-soft text-filled hover:border-filled"
                                : ratio >= 0.5
                                  ? "border-warn/40 bg-warn-soft text-warn hover:border-warn"
                                  : "border-empty/40 bg-empty-soft text-empty hover:border-empty",
                            h.id === myHouse && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                          )}
                        >
                          <span className="block text-sm font-bold">{h.number}</span>
                          <span className="block text-[11px]">
                            {h.status === "vacant" ? "mudik" : checked ? `${h.filled}/${checked}` : "–"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
        <Legend />
      </Card>
      <HouseHistoryDialog
        houseId={open?.id ?? null}
        label={open ? houseLabel(open) : ""}
        onClose={() => setOpen(null)}
        myHouse={myHouse}
        onMyHouse={setMyHouse}
      />
    </>
  );
}

function Legend() {
  const items: [string, ReactNode][] = [
    ["bg-filled-soft border-filled/40", "≥ 80% ada isinya"],
    ["bg-warn-soft border-warn/40", "50–79%"],
    ["bg-empty-soft border-empty/40", "< 50%"],
    ["border-dashed border-line", "belum dicek"],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([cls, label]) => (
        <span key={cls} className="flex items-center gap-1.5">
          <span className={cx("inline-block size-3 rounded border", cls)} />
          {label}
        </span>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

/** "0812-3456 7890" → "081234567890" */
function phoneDigits(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

/** Nomor untuk wa.me: tanpa + dan 0 di depan diganti 62. */
function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}

function toLocalDate(at: string | Date) {
  return new Date(at).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
