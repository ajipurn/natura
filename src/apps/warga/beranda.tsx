import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LogIn,
  Megaphone,
  MessageCircle,
  Phone,
  Pin,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { api, call, errorMessage } from "@/client/api";
import { invalidate } from "@/client/query";
import { BarChart } from "@/components/bar-chart";
import { Collapsible } from "@/components/collapsible";
import { ErrorCard, LoadingCards, QueryState } from "@/components/query-state";
import { Alert, Card, PageTitle, SectionTitle, buttonClass, cx, inputClass } from "@/components/ui";
import { formatDateLong, formatDateShort, formatMonth, shiftMonth } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { groupByBlock, houseLabel } from "@/lib/houses";
import { dayLabel } from "@/lib/schedule";

const accessQuery = { queryKey: ["warga", "akses"], queryFn: () => call(api.warga.akses.$get()) };

/** Halaman informasi untuk warga, dibuka dengan kode dari pengurus. */
export function BerandaPage() {
  const access = useQuery(accessQuery);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6">
      <PageTitle title="Info warga" />
      <p className="text-sm font-medium text-primary">
        Jimpitan{access.data?.communityName ? ` ${access.data.communityName}` : ""}
      </p>
      <h1 className="text-3xl font-bold tracking-tight">Info warga</h1>
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
      <p className="mt-10 text-center">
        <a href="/petugas/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted">
          <LogIn className="size-4" /> Masuk petugas / pengurus
        </a>
      </p>
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
        const guards = schedule.filter((s) => s.day === tonight);
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
                <ShieldCheck className="size-4" /> Jaga malam ini
              </span>
            </SectionTitle>
            <Card>
              <p className="text-sm text-muted">
                {dayLabel(tonight)} · {formatDateShort(date)}
              </p>
              {guards.length === 0 ? (
                <p className="mt-2 text-muted">Belum ada jadwal untuk malam ini.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {guards.map((g) => (
                    <li key={g.position} className="rounded-full bg-idle-soft px-2.5 py-1 text-sm">
                      {g.name && <span className="font-medium">{g.name} </span>}
                      <span className={g.name ? "text-muted" : "font-medium"}>{houseLabel(g)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {schedule.length > 0 && (
              <Collapsible
                title={
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="size-5 text-primary" /> Jadwal seminggu
                  </span>
                }
              >
                <div className="mt-3 space-y-3">
                  {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
                    const day = (tonight + offset) % 7;
                    const list = schedule.filter((s) => s.day === day);
                    return (
                      <div key={day}>
                        <p className={cx("text-sm font-semibold", day === tonight && "text-primary")}>
                          {dayLabel(day)} {day === tonight && "· malam ini"}
                        </p>
                        <p className="text-sm text-muted">
                          {list.length ? list.map((s) => (s.name ? `${s.name} (${houseLabel(s)})` : houseLabel(s))).join(", ") : "—"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Collapsible>
            )}

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
                  className="mt-4"
                  caption={`Jimpitan per malam, ${formatMonth(month)}`}
                  bars={data.perNight.map((n) => ({
                    key: n.date,
                    label: String(Number(n.date.slice(8))),
                    value: n.total,
                    title: `${formatDateShort(n.date)}: ${formatRupiah(n.total)} dari ${n.filled} rumah`,
                  }))}
                />
              </>
            )
          }
        </QueryState>
      </Card>
      {recap.data && recap.data.nights > 0 && <HouseStatus perHouse={recap.data.perHouse} />}
    </>
  );
}

function HouseStatus({
  perHouse,
}: {
  perHouse: { id: number; block: string; number: string; status: "active" | "vacant"; filled: number; empty: number }[];
}) {
  return (
    <Collapsible className="mt-3" title={<span>Status per rumah</span>}>
      <p className="mt-2 text-sm text-muted">
        Berapa malam wadah jimpitan ada isinya, dari malam-malam rumah itu dicek petugas.
      </p>
      <div className="mt-3 space-y-4">
        {groupByBlock(perHouse).map(([block, list]) => (
          <section key={block}>
            <h3 className="mb-1.5 text-sm font-semibold">Blok {block}</h3>
            <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
              {list.map((h) => {
                // Malam yang rumah ini tidak dicek tidak dihitung, supaya tidak terlihat seperti kosong.
                const checked = h.filled + h.empty;
                const ratio = checked ? h.filled / checked : null;
                const text =
                  h.status === "vacant" ? "mudik" : checked ? `${h.filled}/${checked}` : "–";
                return (
                  <li
                    key={h.id}
                    className={cx(
                      "rounded-lg border px-1 py-1.5 text-center",
                      h.status === "vacant" || ratio === null
                        ? "border-dashed border-line text-muted"
                        : ratio >= 0.8
                          ? "border-filled/40 bg-filled-soft text-filled"
                          : ratio >= 0.5
                            ? "border-warn/40 bg-warn-soft text-warn"
                            : "border-empty/40 bg-empty-soft text-empty",
                    )}
                    title={
                      checked
                        ? `${houseLabel(h)}: ada isinya ${h.filled} dari ${checked} malam dicek`
                        : `${houseLabel(h)}: belum dicek bulan ini`
                    }
                  >
                    <span className="block text-sm font-bold">{h.number}</span>
                    <span className="block text-[11px]">{text}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <Legend />
    </Collapsible>
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
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
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
